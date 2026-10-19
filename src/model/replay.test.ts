import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './params'
import { OBSERVED, REPLAY_END, REPLAY_IDS, REPLAY_START, replay, replayErrors } from './replay'

/**
 * Le test de vérité : le modèle, parti de 2000 avec les décisions réellement prises et le monde tel qu'il a été,
 * doit retrouver les grandes lignes de 2000–2024. Si vous changez un paramètre, ce test vous dit si le passé
 * est mieux ou moins bien reproduit.
 */
describe('rejouer 2000–2024', () => {
  const states = replay()
  const errors = replayErrors(states)

  it('les fichiers de 2000 et des décisions ne citent que des paramètres et des leviers qui existent', () => {
    expect(REPLAY_IDS.data.filter((id) => !(id in DEFAULTS))).toEqual([])
    expect(states[0].year).toBe(REPLAY_START)
    expect(states.at(-1)?.year).toBe(REPLAY_END)
    expect(OBSERVED.length).toBe(REPLAY_END - REPLAY_START + 1)
  })

  it('les comptes bouclent chaque année', () => {
    for (const s of states) {
      expect(Math.abs(s.closure), String(s.year)).toBeLessThan(0.5)
    }
  })

  it('reproduit les grandes lignes de l’histoire', () => {
    console.log(Object.entries(errors).map(([k, v]) => `${k}: écart moyen ${(v.mae * 100).toFixed(1)} pt, biais ${(v.bias * 100).toFixed(1)} pt`).join('\n'))
    expect(errors.growth.mae).toBeLessThan(0.02)
    expect(errors.unemployment.mae).toBeLessThan(0.02)
    expect(errors.inflation.mae).toBeLessThan(0.015)
    expect(errors.deficitRatio.mae).toBeLessThan(0.02)
    expect(errors.rate.mae).toBeLessThan(0.01)
    expect(errors.poverty.mae).toBeLessThan(0.02)
    // La dette de 2024 à 15 points près, et la montée de la dette sur la période.
    expect(Math.abs(errors.debtRatio.last)).toBeLessThan(0.15)
    expect(states.at(-1)!.debtRatio - states[0].debtRatio).toBeGreaterThan(0.4)
  })

  it('retrouve les grandes crises : récession en 2009 et en 2020, inflation en 2022', () => {
    const at = (y: number) => states.find((s) => s.year === y)!
    expect(at(2020).growth).toBeLessThan(-0.03)
    expect(at(2021).growth).toBeGreaterThan(0.03)
    expect(at(2009).growth).toBeLessThan(at(2007).growth)
    expect(at(2022).inflation).toBeGreaterThan(0.04)
  })

  it('aucune crise de la dette ni fin de partie : la France n’en a pas connu', () => {
    expect(states.some((s) => s.debtCrisis || s.ending)).toBe(false)
  })
})
