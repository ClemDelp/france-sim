import { describe, expect, it } from 'vitest'
import { simulate } from '../model/sim'
import { CANDIDATES, candidateById, MEASURES } from '../game/candidates'
import { buildDeck, CRISES, programmeOf, PROGRAMME_SIZE } from './cards'
import {
  ALERT_AT,
  BOT,
  budgetCost,
  buy,
  canBuy,
  canPlay,
  cardCost,
  contextOf,
  discard,
  DISCARD_GAIN,
  keptPromises,
  LAWS_PER_YEAR,
  marginLeft,
  newGame,
  outcomeOf,
  pass,
  play,
  respond,
  resolveYear,
  scoreOf,
  sell,
  type Game,
  type Player,
} from './engine'
import { CONTEXTS } from './contexts'
import { playAiYear } from './ai'
import { CRITERIA, health } from './health'
import { cardImpact, explainChain, leverChanges, startNodes } from './why'

const as = (id: string): Player => {
  const c = candidateById(id)!
  return { candidate: c, name: c.name, emblem: c.emblem, color: c.color }
}

/** Une partie jouée par deux IA jusqu'au bout. */
function auto(g0: Game): Game {
  let g = g0
  while (!g.outcome) {
    g = resolveYear(playAiYear(g))
  }
  return g
}

/** Les deux joueurs passent : l'année est prête à se jouer. */
const bothPass = (g: Game): Game => (g.turn ? pass(pass(g, g.turn), g.turn === 'player' ? 'ai' : 'player') : g)

/** Une partie où les deux mains et les énergies sont données (pour tester une règle). */
const rich = (g: Game, player: Game['seats']['player']['hand'], ai: Game['seats']['ai']['hand'] = []): Game => ({
  ...g,
  seats: { player: { ...g.seats.player, energy: 20, hand: [...player, ...g.seats.player.hand] }, ai: { ...g.seats.ai, energy: 20, hand: [...ai, ...g.seats.ai.hand] } },
})

describe('le duel des présidents', () => {
  it('se joue jusqu’au bout, et la même graine donne la même partie', () => {
    const a = auto(newGame(as('melenchon'), BOT, { seed: 11, years: 5 }))
    const b = auto(newGame(as('melenchon'), BOT, { seed: 11, years: 5 }))
    expect(a.outcome).not.toBeNull()
    expect(a.outcome).toEqual(b.outcome)
    expect(a.reports.length).toBeGreaterThan(0)
  })

  it('chaque programme a cinq promesses, et celles des deux joueurs sont dans le haut de la pioche commune', () => {
    for (const c of CANDIDATES) {
      const mine = programmeOf(c, 3, 'joueur')
      const theirs = programmeOf(null, 3, 'ia')
      expect(mine).toHaveLength(PROGRAMME_SIZE)
      const deck = buildDeck([mine, theirs], 3)
      const keys = new Set([...mine, ...theirs].map((p) => p.key))
      expect(deck.slice(0, 22).filter((d) => d.kind === 'mesure' && keys.has(d.pledge.key))).toHaveLength(2 * PROGRAMME_SIZE)
    }
  })

  it('on peut jeter une carte (+1 ⚡), la vendre au marché, et l’adversaire peut l’acheter : le vendeur touche le prix', () => {
    let g = newGame(as('melenchon'), BOT, { seed: 8, years: 5 })
    expect(g.turn).toBe('player')
    const [a, b] = g.seats.player.hand
    const energy = g.seats.player.energy
    g = discard(g, 'player', a.uid)
    expect(g.seats.player.energy).toBe(energy + DISCARD_GAIN)
    expect(g.discard.map((c) => c.uid)).toContain(a.uid)
    g = sell(g, 'player', b.uid)
    expect(g.market.map((l) => l.card.uid)).toEqual([b.uid])
    expect(canBuy(g, 'player', b.uid)).not.toBeNull()
    const price = g.market[0].price
    g = { ...g, seats: { ...g.seats, ai: { ...g.seats.ai, energy: 20 } } }
    // On n'achète que pendant son tour.
    expect(canBuy(g, 'ai', b.uid)).not.toBeNull()
    g = buy(pass(g, 'player'), 'ai', b.uid)
    expect(g.seats.ai.hand.map((c) => c.uid)).toContain(b.uid)
    expect(g.seats.player.bonus).toBe(price)
    expect(g.market).toHaveLength(0)
  })

  it('une crise posée frappe la France d’en face, sauf si elle la pare sur-le-champ avec une cellule de crise', () => {
    const base = newGame(as('attal'), BOT, { seed: 5, years: 5 })
    const crisis = { kind: 'crise' as const, crisis: 'financial-crisis' as const, uid: 'test-krach' }
    const shield = { kind: 'action' as const, action: 'cellule' as const, uid: 'test-cellule' }
    const g = play(rich(base, [crisis], [shield]), 'player', crisis)
    expect(g.pending?.card.uid).toBe(crisis.uid)
    // Tant que la cible n'a pas répondu, personne ne joue.
    expect(canPlay(g, 'ai', g.seats.ai.hand.find((c) => c.kind === 'mesure')!)).toContain('crise')
    // La cellule de crise ne se pose pas d'avance : elle répond à une crise.
    expect(canPlay(respond(g, 'ai', false), 'ai', shield)).toContain('réponse')
    const hit = resolveYear(bothPass(respond(g, 'ai', false)))
    expect(hit.reports[0].sides.ai.received).toEqual(['financial-crisis'])
    expect(hit.seats.ai.events.some((e) => e.id === 'financial-crisis')).toBe(true)
    expect(scoreOf(hit.seats.ai)).toBeLessThan(scoreOf(resolveYear(bothPass(rich(base, [crisis], [shield]))).seats.ai))
    const parriedNow = respond(g, 'ai', true)
    expect(parriedNow.seats.ai.hand.some((c) => c.uid === shield.uid)).toBe(false)
    expect(parriedNow.turn).toBe('ai')
    const parried = resolveYear(bothPass(parriedNow))
    expect(parried.reports[0].sides.ai.parried).toEqual(['financial-crisis'])
    expect(parried.seats.ai.events.some((e) => e.id === 'financial-crisis')).toBe(false)
  })

  it('chacun son tour : une carte à la fois, l’année se joue quand les deux passent de suite, et l’ouverture alterne', () => {
    let g = newGame(as('melenchon'), BOT, { seed: 3, years: 5 })
    expect(g.turn).toBe('player')
    const card = g.seats.ai.hand[0]
    expect(canPlay(g, 'ai', card)).toBe('Ce n’est pas votre tour')
    g = pass(g, 'player')
    expect(g.turn).toBe('ai')
    // L'adversaire joue après votre passe : vous pouvez rejouer.
    const sondage = { kind: 'action' as const, action: 'sondage' as const, uid: 'test-sondage' }
    g = play(rich(g, [], [sondage]), 'ai', sondage)
    expect(g.turn).toBe('player')
    expect(g.passes).toBe(0)
    g = pass(pass(g, 'player'), 'ai')
    expect(g.turn).toBeNull()
    g = resolveYear(g)
    expect(g.year).toBe(2029)
    expect(g.turn).toBe('ai')
  })

  it('pas plus de deux lois par an, et on pioche trois cartes par an', () => {
    const g0 = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const laws = g0.seats.player.programme.slice(0, LAWS_PER_YEAR + 1).map((pledge, i) => ({ kind: 'mesure' as const, pledge, uid: `test-loi-${i}` }))
    let g = rich(g0, laws)
    for (const law of laws.slice(0, LAWS_PER_YEAR)) {
      g = pass(play(g, 'player', law), 'ai')
    }
    expect(canPlay(g, 'player', laws[LAWS_PER_YEAR])).toContain('lois')
    const hand = g.seats.player.hand.length
    g = resolveYear(bothPass(g))
    expect(g.seats.player.hand.length).toBe(Math.min(8, hand + 3 + (contextOf(g).draw ?? 0)))
  })

  it('la conjoncture est la même pour les deux : son événement frappe les deux France, et elle change le prix des cartes', () => {
    const g = newGame(as('attal'), BOT, { seed: 9, years: 5 })
    const ctx = contextOf(g)
    if (ctx.event) {
      expect(g.seats.player.events).toContainEqual({ year: 2028, id: ctx.event })
      expect(g.seats.ai.events).toContainEqual({ year: 2028, id: ctx.event })
    }
    // Une guerre aux portes de l'Europe : les crises coûtent un point de plus.
    const war: Game = { ...g, contexts: ['war-europe', ...g.contexts.slice(1)] }
    const crisis = { kind: 'crise' as const, crisis: 'recession' as const, uid: 'test-recession' }
    expect(cardCost(war, 'player', crisis)).toBe(CRISES.recession.cost + CONTEXTS['war-europe'].crisis!)
    // Toutes les conjonctures existent dans le modèle.
    expect(Object.values(CONTEXTS).every((c) => !c.event || c.event.length > 0)).toBe(true)
  })

  it('le budget : une mesure coûteuse entame la marge, la dépasser coûte de l’énergie l’an prochain, et alerte les marchés', () => {
    const g0 = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const pledge = (id: string) => ({ key: `test-${id}`, measure: MEASURES[id], amount: null, quote: '', source: '' })
    const defence = { kind: 'mesure' as const, pledge: pledge('defence-35'), uid: 'test-defense' }
    const savings = { kind: 'mesure' as const, pledge: pledge('savings'), uid: 'test-economies' }
    expect(budgetCost(g0, 'player', defence)).toBeGreaterThan(ALERT_AT)
    expect(budgetCost(g0, 'player', savings)).toBeLessThan(0)
    const g = play(rich(g0, [defence, savings]), 'player', defence)
    expect(marginLeft(g.seats.player)).toBeLessThan(g.seats.player.margin)
    const after = resolveYear(bothPass(g))
    expect(after.reports[0].sides.player.alert).toBe(true)
    expect(after.reports[0].sides.player.malus).toBeGreaterThan(0)
    expect(after.seats.player.events).toContainEqual({ year: 2028, id: 'eu-procedure' })
    // Les économies, elles, redonnent de la marge.
    expect(marginLeft(play(rich(g0, [savings]), 'player', savings).seats.player)).toBeGreaterThan(g0.seats.player.margin)
  })

  it('une promesse jouée devient une décision, compte comme tenue et rapporte de l’énergie', () => {
    let g = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const smic = g.seats.player.programme.find((p) => p.measure!.id === 'smic-up')!
    const card = { kind: 'mesure' as const, pledge: smic, uid: 'test-smic' }
    g = play(rich(g, [card]), 'player', card)
    expect(canPlay(g, 'player', card)).not.toBeNull()
    g = resolveYear(bothPass(g))
    expect(g.seats.player.decisions.at(-1)!.patch.smicBoost).toBeGreaterThan(0)
    expect(keptPromises(g.seats.player, 2028).map((p) => p.key)).toContain(smic.key)
    expect(g.reports[0].sides.player.kept).toHaveLength(1)
  })

  it('la note de santé suit les fichiers du modèle et récompense un pays en meilleure santé', () => {
    expect(CRITERIA.reduce((a, c) => a + c.weight, 0)).toBe(100)
    const start = simulate({ decisions: [], events: [], until: 2027 }).at(-1)!
    expect(health(start, start)).toBeGreaterThan(20)
    expect(health({ ...start, unemployment: 0.04 }, start)).toBeGreaterThan(health(start, start))
    expect(health({ ...start, debtRatio: 1.6 }, start)).toBeLessThan(health(start, start))
  })

  it('un pays qui fait faillite ou se révolte perd tout de suite, même en cours de mandat', () => {
    const g = newGame(as('melenchon'), BOT, { seed: 4, years: 5 })
    const fall = (ending: 'faillite' | 'revolte'): Game => ({ ...g, seats: { ...g.seats, ai: { ...g.seats.ai, states: [...g.seats.ai.states.slice(0, -1), { ...g.seats.ai.states.at(-1)!, ending }] } } })
    expect(outcomeOf(fall('faillite'))).toMatchObject({ winner: 'player' })
    expect(outcomeOf(fall('revolte'))!.reason).toContain('se révolte')
    expect(outcomeOf(g)).toBeNull()
  })
})

describe('pourquoi une carte fait ce qu’elle fait', () => {
  it('la hausse du SMIC : le modèle dit ce qu’elle change, et le graphe dit par où passe le chômage', () => {
    const g = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const smic = g.seats.player.programme.find((p) => p.measure!.id === 'smic-up')!
    const card = { kind: 'mesure' as const, pledge: smic, uid: 'test-smic' }
    expect(leverChanges(g, 'player', card).map((l) => l.key)).toEqual(['smicBoost'])
    const impact = cardImpact(g, 'player', card)!
    const unemployment = impact.indicators.find((i) => i.node === 'unemployment')!
    expect(unemployment.delta).toBeGreaterThan(0)
    // La note se décompose critère par critère : la somme redonne (à l'arrondi près) l'effet annoncé.
    expect(Math.abs(impact.parts.reduce((a, p) => a + p.delta, 0) - impact.health)).toBeLessThan(1.5)
    const chain = explainChain(startNodes(g, 'player', card), 'unemployment')!
    expect(chain[0]).toMatchObject({ from: 'smicBoost', fromUp: true })
    expect(chain.at(-1)).toMatchObject({ to: 'unemployment', toUp: true })
  })

  it('une crise s’explique sur la France d’en face, depuis les variables du monde qu’elle touche', () => {
    const g = newGame(as('attal'), BOT, { seed: 2, years: 5 })
    const card = { kind: 'crise' as const, crisis: 'ormuz' as const, uid: 'test-ormuz' }
    const impact = cardImpact(g, 'player', card)!
    expect(impact.target).toBe('ai')
    expect(impact.health).toBeLessThan(0)
    expect(startNodes(g, 'player', card).map((n) => n.node)).toContain('oil')
    expect(explainChain(startNodes(g, 'player', card), 'inflation')).not.toBeNull()
  })
})

describe('le prix des crises suit leur gravité dans le modèle', () => {
  it('plus une crise fait perdre de points de note sur trois ans, plus elle coûte cher', () => {
    const base = simulate({ decisions: [], events: [], until: 2030 })
    const start = base.find((s) => s.year === 2027)!
    const damage = (id: string) => {
      const s = simulate({ decisions: [], events: [{ year: 2028, id }], until: 2030 })
      return [2028, 2029, 2030].reduce((a, y) => a + health(base.find((x) => x.year === y)!, start) - health(s.find((x) => x.year === y)!, start), 0)
    }
    const order = ['financial-crisis', 'ormuz', 'recession', 'general-strike'] as const
    const damages = order.map(damage)
    expect(damages).toEqual([...damages].sort((a, b) => b - a))
    expect(order.map((id) => CRISES[id].cost)).toEqual([...order.map((id) => CRISES[id].cost)].sort((a, b) => b - a))
  })
})
