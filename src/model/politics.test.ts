import { describe, expect, it } from 'vitest'
import { BASE_POLICY } from './calibration'
import { simulate } from './sim'

/** Ce qu'un acte politique (un événement décidé par le joueur) change en 2027, toutes choses égales par ailleurs. */
const effect = (id: string, angry: boolean) => {
  // Un pays mis en colère d'abord (TVA bien plus lourde en 2026), ou laissé calme.
  const decisions = angry ? [{ year: 2026, patch: { vat: BASE_POLICY.vat + 0.05 } }] : []
  const without = simulate({ decisions, events: [], until: 2027 }).at(-1)!
  const withAct = simulate({ decisions, events: [{ year: 2027, id }], until: 2027 }).at(-1)!
  return { anger: withAct.discontent - without.discontent, rate: withAct.rate - without.rate, before: without.discontent }
}

describe('les actes politiques passent par le modèle', () => {
  it('un 49.3 fâche, et bien davantage un pays déjà en colère (retraites 2023 contre budget 2022)', () => {
    const calm = effect('force-493', false)
    const angry = effect('force-493', true)
    expect(angry.before).toBeGreaterThan(calm.before + 0.1)
    expect(calm.anger).toBeGreaterThan(0)
    expect(angry.anger).toBeGreaterThan(calm.anger * 1.5)
  })

  it('une dissolution ou une censure fait monter le taux (juin 2024 : environ +0,3 point d’écart avec l’Allemagne)', () => {
    for (const id of ['dissolution', 'censure']) {
      const { rate } = effect(id, false)
      expect(rate).toBeGreaterThan(0.001)
      expect(rate).toBeLessThan(0.006)
    }
  })
})
