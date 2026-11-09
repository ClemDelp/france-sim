import { describe, expect, it } from 'vitest'
import { EVENTS, isMajorShock, rollEvents } from '../model/events'
import { simulate } from '../model/sim'
import { evaluate, SCENARIOS } from './scenarios'
import { electionAt, isElectionYear, nextElection, voteShare } from './score'

describe('les scénarios', () => {
  // Chaque scénario est rejoué en détail (stratégie de référence, photo de fin de partie) dans scenarios.test.ts.
  it('en cours de partie, un objectif « toujours » raté reste raté', () => {
    const sc = SCENARIOS.find((s) => s.id === 'ormuz')!
    const r = evaluate(sc, simulate({ decisions: [], events: sc.events, until: 2027 }))
    expect(r.finished).toBe(false)
    expect(r.results[0].status).toBe('ko')
  })
})

describe('les élections', () => {
  it('une élection tous les cinq ans à partir de 2027', () => {
    expect([2026, 2027, 2031, 2032].map(isElectionYear)).toEqual([false, true, false, true])
    expect(nextElection(2025)).toBe(2027)
    expect(nextElection(2028)).toBe(2032)
    expect(voteShare(40)).toBe(50)
  })

  it('à 40 % de popularité on perd, au-delà on gagne (comme le disent les textes du jeu)', () => {
    const at = (discontent: number) => electionAt({ ...simulate({ decisions: [], events: [], until: 2025 })[0], discontent })
    expect(at(22 / 55).popularity).toBe(40)
    expect(at(22 / 55).won).toBe(false)
    expect(at(21 / 55).won).toBe(true)
  })
})

describe('pourquoi un événement arrive', () => {
  it('chaque probabilité se lit comme une somme de raisons, et suit l’état du monde', async () => {
    const { EVENTS, chanceOf } = await import('../model/events')
    const s = simulate({ decisions: [], events: [], until: 2060 })
    const heat = EVENTS.find((e) => e.id === 'heatwave')!
    const early = heat.chance(s[1], s[0])
    const late = heat.chance(s.at(-1)!, s[0])
    expect(chanceOf(late)).toBeGreaterThan(chanceOf(early))
    expect(late.factors.some((f) => f.label.includes('planète'))).toBe(true)
    const aided = simulate({ decisions: [{ year: 2026, patch: { developmentAid: 50 } }], events: [], until: 2040 })
    const sahel = EVENTS.find((e) => e.id === 'sahel-war')!
    expect(chanceOf(sahel.chance(aided.at(-1)!, aided[0]))).toBeLessThan(chanceOf(sahel.chance(s[15], s[0])))
  })
})

describe('le hasard reste équitable', () => {
  const start = simulate({ decisions: [], events: [], until: 2025 })[0]
  const majors = EVENTS.filter(isMajorShock).map((e) => e.id)

  it('les chocs majeurs sont bien reconnus', () => {
    expect(majors).toEqual(expect.arrayContaining(['financial-crisis', 'recession', 'pandemic', 'ormuz', 'war-europe']))
  })

  it('pas de choc majeur tiré au sort la première année, et jamais plus d’un par an', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const first = rollEvents(seed, 2026, start, start, [])
      expect(first.filter((e) => majors.includes(e.id)), `graine ${seed}`).toEqual([])
      const later = rollEvents(seed, 2031, start, start, [])
      expect(later.filter((e) => majors.includes(e.id)).length, `graine ${seed}`).toBeLessThanOrEqual(1)
    }
  })

  it('un choc imposé par le scénario cette année-là bloque les autres chocs majeurs', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const fired = rollEvents(seed, 2031, start, start, [{ year: 2031, id: 'ormuz' }])
      expect(fired.filter((e) => majors.includes(e.id)), `graine ${seed}`).toEqual([])
    }
  })
})
