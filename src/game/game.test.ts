import { describe, expect, it } from 'vitest'
import { simulate } from '../model/sim'
import type { Decision } from '../model/types'
import { ACHIEVEMENTS } from './achievements'
import { adviseDraft } from './advisors'
import { headline } from './headlines'
import { evaluate, SCENARIOS } from './scenarios'
import { electionAt, isElectionYear, nextElection, voteShare } from './score'
import { parseSave } from './savegame'

/** Pour chaque scénario, une stratégie qui marche : le jeu doit rester gagnable quand le modèle évolue. */
const WINNING: Record<string, Decision[]> = {
  'premier-mandat': [{ year: 2026, patch: { otherServices: 240, firmAid: 55, pensionIndexation: 0.85, firmAidSmeShare: 0.8, minima: 8, education: 170 } }],
  ormuz: [{ year: 2026, patch: { vat: 0.18 } }],
  climat: [{ year: 2026, patch: { carbonTax: 130, electrification: 0.04, adaptation: 16, otherServices: 235, pensionIndexation: 0.85, firmAid: 55 } }],
  electrique: [{ year: 2026, patch: { electrification: 0.04, nuclearShare: 0.75 } }],
  retraites: [{ year: 2026, patch: { retirementAge: 66, pensionIndexation: 0.85, otherServices: 245 } }],
  marches: [{ year: 2026, patch: { otherServices: 230, firmAid: 50, pensionIndexation: 0.75, vat: 0.21 } }],
  pauvrete: [{ year: 2026, patch: { minima: 45, foodSecurity: 60, wealthTax: 0.015, incomeTaxTop: 0.04, smicBoost: 0.05 } }],
  'crise-2008': [
    { year: 2027, patch: { investment: 150, firmAidSmeShare: 0.8 } },
    { year: 2030, patch: { investment: 130, otherServices: 245 } },
  ],
  'grand-chelem': [{ year: 2026, patch: { retirementAge: 66, otherServices: 225, education: 175, investment: 140, firmAidSmeShare: 0.8, minima: 20, pensionIndexation: 0.8, electrification: 0.03 } }],
}

describe('les scénarios', () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s : ne rien faire ne suffit pas, une bonne stratégie rapporte des étoiles', (_, sc) => {
    const idle = evaluate(sc, simulate({ decisions: [], events: sc.events, until: sc.end }))
    const played = simulate({ decisions: WINNING[sc.id], events: sc.events, until: sc.end })
    const result = evaluate(sc, played)
    expect(idle.stars).toBeLessThan(3)
    expect(result.finished).toBe(true)
    expect(result.stars).toBeGreaterThan(idle.stars)
    expect(played.some((s) => s.ending)).toBe(false)
    // La stratégie gagne aussi chaque élection.
    expect(played.filter((s) => isElectionYear(s.year)).every((s) => electionAt(s).won)).toBe(true)
  })

  it('en cours de partie, un objectif « toujours » raté reste raté', () => {
    const sc = SCENARIOS.find((s) => s.id === 'ormuz')!
    const r = evaluate(sc, simulate({ decisions: [], events: sc.events, until: 2027 }))
    expect(r.finished).toBe(false)
    expect(r.results[0].status).toBe('ko')
  })
})

describe('les élections, la presse, les conseillers, les succès', () => {
  it('une élection tous les cinq ans à partir de 2027', () => {
    expect([2026, 2027, 2031, 2032].map(isElectionYear)).toEqual([false, true, false, true])
    expect(nextElection(2025)).toBe(2027)
    expect(nextElection(2028)).toBe(2032)
    expect(voteShare(40)).toBe(50)
  })

  it('tous les impôts au maximum : la une parle de révolte, le ministre de l’Intérieur prévient', () => {
    const s = simulate({ decisions: [{ year: 2026, patch: { vat: 0.3, incomeTaxTop: 0.15, csg: 0.14, corporateTax: 0.4 } }], events: [], until: 2026 })
    expect(headline(s[1], s[0], true).title).toMatch(/gouvernement tombe/)
    expect(adviseDraft({ deficit: -150, unemployment: 0.08, poverty: -0.01, discontent: 1.7, ending: 'revolte', inflation: 0.06, emissions: 0 })[0].who).toBe('interieur')
  })

  it('les succès se déclenchent sur la partie', () => {
    const states = simulate({ decisions: [], events: [], until: 2032 })
    const earned = ACHIEVEMENTS.filter((a) => a.check({ states, elections: true, lost: false, stars: {}, myths: 0, openedModel: false })).map((a) => a.id)
    expect(earned).toContain('reelu')
    expect(earned).not.toContain('chute')
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

describe('la sauvegarde de la partie', () => {
  const game = { v: 1, mode: 'premier-mandat', decisions: [{ year: 2026, patch: { vat: 0.21 } }], events: [{ year: 2027, id: 'heatwave' }], year: 2028, seed: 42, draft: { csg: 0.1 }, handled: [], electionsSeen: [2027], sandbox: false }

  it('se relit telle quelle, et redonne exactement la même France', () => {
    const back = parseSave(JSON.parse(JSON.stringify(game)), 2025, 2075)
    expect(back).toEqual(game)
    const a = simulate({ decisions: game.decisions, events: game.events, until: game.year }).at(-1)!
    const b = simulate({ decisions: back!.decisions, events: back!.events, until: back!.year }).at(-1)!
    expect(b.debtRatio).toBe(a.debtRatio)
  })

  it('ignore une sauvegarde abîmée ou d’une autre version', () => {
    expect(parseSave(null, 2025, 2075)).toBeNull()
    expect(parseSave('n’importe quoi', 2025, 2075)).toBeNull()
    expect(parseSave({ ...game, v: 2 }, 2025, 2075)).toBeNull()
    expect(parseSave({ ...game, mode: 'scenario-supprime' }, 2025, 2075)).toBeNull()
    expect(parseSave({ ...game, events: [{ year: 2027, id: 'evenement-inconnu' }] }, 2025, 2075)).toBeNull()
    expect(parseSave({ ...game, year: 2100 }, 2025, 2075)).toBeNull()
  })
})
