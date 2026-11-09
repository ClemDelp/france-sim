import { describe, expect, it } from 'vitest'
import { simulate } from '../model/sim'
import { CANDIDATES, candidateById } from '../game/candidates'
import { buildDeck, CRISES, programmeOf, PROGRAMME_SIZE } from './cards'
import { BOT, canPlay, keptPromises, newGame, outcomeOf, play, resolveYear, scoreOf, takeBack, type Game, type Player } from './engine'
import { playAiYear } from './ai'
import { CRITERIA, health } from './health'

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

  it('chaque programme a cinq promesses, et elles sont toutes dans le haut du paquet', () => {
    for (const c of [...CANDIDATES, null]) {
      const programme = programmeOf(c, 3, 'x')
      expect(programme).toHaveLength(PROGRAMME_SIZE)
      const deck = buildDeck(programme, 3, 'x')
      const firstPromises = deck.slice(0, 11).filter((d) => d.kind === 'mesure' && d.promise)
      expect(firstPromises).toHaveLength(PROGRAMME_SIZE)
    }
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
    expect(CRISES['financial-crisis'].cost).toBeGreaterThan(CRISES['general-strike'].cost)
  })

  it('une promesse jouée devient une décision, compte comme tenue et rapporte de l’énergie', () => {
    let g = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const smic = g.seats.player.programme.find((p) => p.measure!.id === 'smic-up')!
    const card = { kind: 'mesure' as const, pledge: smic, promise: true, uid: 'test-smic' }
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
