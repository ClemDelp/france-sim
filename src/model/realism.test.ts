import { describe, expect, it } from 'vitest'
import { simulate } from './sim'

/** Les délais du monde réel : ce qu'aucune décision ne peut accélérer (audit de cohérence). */
describe('les délais du monde réel', () => {
  it('relancer le nucléaire : pas de nouveau réacteur avant 2038 (Penly), puis la part monte', () => {
    const states = simulate({ decisions: [{ year: 2026, patch: { nuclearShare: 0.85 } }], events: [], until: 2045 })
    const at = (y: number) => states.find((s) => s.year === y)!.nuclearShare
    expect(at(2035)).toBeLessThanOrEqual(0.72 + 1e-9)
    expect(at(2045)).toBeGreaterThan(0.75)
  })
})
