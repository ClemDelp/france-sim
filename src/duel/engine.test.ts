import { describe, expect, it } from 'vitest'
import { simulate } from '../model/sim'
import { CANDIDATES, candidateById } from '../game/candidates'
import { buildDeck, CRISES, programmeOf, PROGRAMME_SIZE } from './cards'
import { BOT, buy, canBuy, canPlay, discard, DISCARD_GAIN, keptPromises, sell, newGame, outcomeOf, play, resolveYear, scoreOf, takeBack, type Game, type Player } from './engine'
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
    g = resolveYear(playAiYear(playAiYear(g, 'player'), 'ai'))
  }
  return g
}

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
    g = buy(g, 'ai', b.uid)
    expect(g.seats.ai.hand.map((c) => c.uid)).toContain(b.uid)
    expect(g.seats.player.bonus).toBe(price)
    expect(g.market).toHaveLength(0)
  })

  it('une crise envoyée frappe la France d’en face, sauf si elle a une cellule de crise', () => {
    const base = newGame(as('attal'), BOT, { seed: 5, years: 5 })
    const crisis = { kind: 'crise' as const, crisis: 'financial-crisis' as const, uid: 'test-krach' }
    const shield = { kind: 'action' as const, action: 'cellule' as const, uid: 'test-cellule' }
    const rich = (g: Game): Game => ({ ...g, seats: { ...g.seats, player: { ...g.seats.player, energy: 20, hand: [crisis, ...g.seats.player.hand] }, ai: { ...g.seats.ai, energy: 20, hand: [shield, ...g.seats.ai.hand] } } })
    const hit = resolveYear(play(rich(base), 'player', crisis))
    expect(hit.reports[0].sides.ai.received).toEqual(['financial-crisis'])
    expect(hit.seats.ai.events.some((e) => e.id === 'financial-crisis')).toBe(true)
    expect(scoreOf(hit.seats.ai)).toBeLessThan(scoreOf(resolveYear(rich(base)).seats.ai))
    const parried = resolveYear(play(play(rich(base), 'ai', shield), 'player', crisis))
    expect(parried.reports[0].sides.ai.parried).toEqual(['financial-crisis'])
    expect(parried.seats.ai.events.some((e) => e.id === 'financial-crisis')).toBe(false)
  })

  it('une promesse jouée devient une décision, compte comme tenue et rapporte de l’énergie', () => {
    let g = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const smic = g.seats.player.programme.find((p) => p.measure!.id === 'smic-up')!
    const card = { kind: 'mesure' as const, pledge: smic, uid: 'test-smic' }
    g = { ...g, seats: { ...g.seats, player: { ...g.seats.player, energy: 20, hand: [card, ...g.seats.player.hand] } } }
    g = play(g, 'player', card)
    expect(canPlay(g, 'player', card)).not.toBeNull()
    // On peut reprendre une carte avant de jouer l'année : l'énergie revient.
    expect(takeBack(g, 'player', card.uid).seats.player.energy).toBe(20)
    g = resolveYear(g)
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
