import { describe, expect, it } from 'vitest'
import { candidateById } from '../game/candidates'
import { aiAnswer, nextAiAction } from './ai'
import { newGame, other, pass, play, type Game, type Player } from './engine'
import { GuestMatch, HostMatch, type Link } from './match'
import { actorOf, applyIntent, flip, isCode, isHidden, isIntent, isMessage, newCode, pack, PROTOCOL, unpack, viewFor, type Intent, type Message } from './online'

const as = (id: string): Player => {
  const c = candidateById(id)!
  return { candidate: c, name: c.name, emblem: c.emblem, color: c.color }
}

const game = () => newGame(as('melenchon'), as('le-pen'), { seed: 7, years: 3 })

describe('jouer à deux : ce que chacun voit', () => {
  it('l’invité ne voit ni la main de l’hôte, ni la pioche, ni les conjonctures à venir, ni la graine', () => {
    const g = game()
    const v = viewFor(g, 'ai')
    // Retournée : l'invité est « player ».
    expect(v.seats.player.name).toBe(g.seats.ai.name)
    expect(v.seats.player.hand).toEqual(g.seats.ai.hand)
    expect(v.seats.ai.hand).toHaveLength(g.seats.player.hand.length)
    expect(v.seats.ai.hand.every(isHidden)).toBe(true)
    expect(v.deck).toHaveLength(g.deck.length)
    expect(v.deck.every(isHidden)).toBe(true)
    expect(v.contexts).toEqual(g.contexts.slice(0, 1))
    expect(v.seed).toBe(0)
    const leaked = JSON.stringify(v)
    for (const c of [...g.seats.player.hand, ...g.deck]) {
      expect(leaked).not.toContain(`"${c.uid}"`)
    }
  })

  it('le sondage truqué montre la main de l’adversaire, et seulement à celui qui l’a joué', () => {
    const g = game()
    const peeking: Game = { ...g, seats: { ...g.seats, ai: { ...g.seats.ai, peek: true } } }
    expect(viewFor(peeking, 'ai').seats.ai.hand).toEqual(g.seats.player.hand)
    expect(viewFor(peeking, 'player').seats.ai.hand.every(isHidden)).toBe(true)
  })

  it('retourner une partie échange tout ce qui dépend du camp, et deux fois revient au départ', () => {
    let g = game()
    g = play(g, g.turn!, g.seats[g.turn!].hand[0])
    if (g.pending) {
      g = { ...g, pending: null }
    }
    const f = flip(g)
    expect(f.turn).toBe(g.turn && other(g.turn))
    expect(f.moves[0].side).toBe(other(g.moves[0].side))
    expect(flip(f)).toEqual(g)
  })

  it('une partie passe sur le fil sans rien perdre : les années se recalculent à l’identique', () => {
    let g = game()
    g = pass(pass(g, g.turn!), other(g.turn!))
    const back = unpack(JSON.parse(JSON.stringify(pack(g))))
    expect(back).toEqual(g)
  })

  it('l’hôte applique les intentions avec les règles : une carte qui n’est pas dans la main ne se joue pas', () => {
    const g = game()
    const side = g.turn!
    const foe = other(side)
    expect(applyIntent(g, foe, { kind: 'pass' })).toBe(g)
    expect(applyIntent(g, side, { kind: 'play', uid: g.seats[foe].hand[0].uid })).toBe(g)
    expect(applyIntent(g, side, { kind: 'play', uid: 'inconnue' })).toBe(g)
    expect(applyIntent(g, side, { kind: 'pass' }).turn).toBe(foe)
  })

  it('reconnaît les messages et les intentions valides, refuse le reste', () => {
    expect(isMessage({ t: 'hello', v: PROTOCOL, nick: 'Julie' })).toBe(true)
    expect(isMessage({ t: 'hello', v: 1 })).toBe(false)
    expect(isMessage({ t: 'intent', intent: { kind: 'play', uid: 'carte-1' } })).toBe(true)
    expect(isMessage({ t: 'intent', intent: { kind: 'tricher' } })).toBe(false)
    expect(isMessage('ping')).toBe(false)
    expect(isIntent({ kind: 'respond', answer: null })).toBe(true)
    expect(isIntent({ kind: 'respond', answer: 'veto' })).toBe(false)
    const code = newCode()
    expect(isCode(code)).toBe(true)
    expect(isCode('ABC0OI')).toBe(false)
  })
})

/** Deux bouts reliés par un faux réseau : chaque message passe par du JSON, comme sur le vrai. */
function wire() {
  const host = new HostMatch('ABCDEF', { candidate: 'melenchon', nick: 'Hôte' }, 3)
  host.onChange = () => {}
  const guest = new GuestMatch('Julie')
  const queue: { to: 'host' | 'guest'; m: Message }[] = []
  const toHost: Link = { send: (m) => queue.push({ to: 'host', m: JSON.parse(JSON.stringify(m)) }) }
  const toGuest: Link = { send: (m) => queue.push({ to: 'guest', m: JSON.parse(JSON.stringify(m)) }) }
  host.connect(toGuest)
  guest.connect(toHost)
  const flush = () => {
    for (let guard = 0; queue.length && guard < 1000; guard += 1) {
      const { to, m } = queue.shift()!
      ;(to === 'host' ? host : guest).receive(m)
    }
  }
  return { host, guest, flush }
}

/** Ce que l'IA ferait à la place d'un joueur, en intention. */
function aiIntent(view: Game): Intent | null {
  if (view.pending) {
    return view.pending.from === 'player' ? null : { kind: 'respond', answer: aiAnswer(view, 'player') }
  }
  if (view.turn !== 'player') {
    return null
  }
  const a = nextAiAction(view, 'player')
  return a.kind === 'pass' ? { kind: 'pass' } : { kind: a.kind, uid: a.card!.uid }
}

describe('jouer à deux : une partie entière par le réseau', () => {
  it('l’invité choisit son candidat, la partie se joue jusqu’au bout, et les deux voient le même résultat', () => {
    const { host, guest, flush } = wire()
    flush()
    expect(guest.lobby?.host.candidate).toBe('melenchon')
    // Le même candidat que l'hôte : refusé.
    guest.pick({ candidate: 'melenchon', nick: 'Julie' })
    flush()
    expect(host.game).toBeNull()
    guest.pick({ candidate: 'le-pen', nick: 'Julie' })
    flush()
    expect(host.game).not.toBeNull()
    expect(guest.intro).toBe(true)
    expect(guest.view!.seats.player.candidate?.id).toBe('le-pen')

    for (let guard = 0; guard < 400 && !host.game!.outcome; guard += 1) {
      const g = host.game!
      const actor = actorOf(g)
      if (actor === null) {
        host.resolve()
      } else if (actor === 'player') {
        const intent = aiIntent(g)!
        host.act(intent)
        // Une intention refusée (ne devrait pas arriver) : on passe.
        if (host.game === g) {
          host.act(g.pending ? { kind: 'respond', answer: null } : { kind: 'pass' })
        }
      } else {
        const v = guest.view!
        // L'invité ne voit jamais la main de l'hôte (sauf sondage truqué) ni la pioche.
        expect(v.deck.every(isHidden)).toBe(true)
        expect(v.seats.player.peek || v.seats.ai.hand.every(isHidden)).toBe(true)
        guest.act(aiIntent(v)!)
        flush()
        if (host.game === g) {
          guest.act(g.pending ? { kind: 'respond', answer: null } : { kind: 'pass' })
          flush()
        }
      }
      flush()
    }
    const out = host.game!.outcome
    expect(out).not.toBeNull()
    expect(host.game!.reports).toHaveLength(3)
    // Les deux ont vraiment joué des cartes.
    expect(host.game!.reports.flatMap((r) => r.sides.ai.played).length).toBeGreaterThan(0)
    expect(host.game!.reports.flatMap((r) => r.sides.player.played).length).toBeGreaterThan(0)
    expect(guest.view!.outcome).toEqual(out && { ...out, winner: out.winner === 'nul' ? 'nul' : other(out.winner) })

    // La revanche, demandée par l'invité : une nouvelle partie, les mêmes joueurs.
    guest.rematch()
    flush()
    expect(host.game!.outcome).toBeNull()
    expect(guest.view!.reports).toHaveLength(0)
  }, 180_000)

  it('une autre version du jeu est refusée, et l’hôte reprend sa partie après un rechargement', () => {
    const { host, guest, flush } = wire()
    flush()
    guest.pick({ candidate: null, nick: 'Julie' })
    flush()
    const reloaded = new HostMatch('ABCDEF', host.me, host.years, JSON.parse(JSON.stringify(host.save())))
    expect(reloaded.game).toEqual(host.game)
    expect(reloaded.game!.seats.ai.name).toBe('Julie')

    const old: Message[] = []
    reloaded.connect({ send: (m) => old.push(m) })
    reloaded.receive({ t: 'hello', v: 'v0-vieux', nick: 'Julie' })
    expect(old[0]).toMatchObject({ t: 'refuse' })
  })
})
