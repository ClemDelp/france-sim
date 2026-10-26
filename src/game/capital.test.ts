import { describe, expect, it } from 'vitest'
import { BASE_POLICY } from '../model/calibration'
import type { PolicyKey } from '../model/types'
import { LEVER_GROUPS } from '../ui/levers'
import { reformCost } from './capital'

const lever = (key: PolicyKey) => LEVER_GROUPS.flatMap((g) => g.levers).find((l) => l.key === key)!
const cost = (key: PolicyKey, to: number) => reformCost(lever(key), BASE_POLICY[key] as number, to)

describe('le coût politique suit la difficulté réelle des réformes (audit de cohérence)', () => {
  it('trois points de TVA ou une taxe carbone à 100 €/t ne passent pas pour un seul point (gilets jaunes, 2018)', () => {
    expect(cost('vat', BASE_POLICY.vat + 0.03)).toBeGreaterThanOrEqual(3)
    expect(cost('carbonTax', 100)).toBeGreaterThanOrEqual(3)
  })

  it('les droits de succession, le plus impopulaire des impôts (81 à 87 % contre une hausse), coûtent cher à relever', () => {
    expect(cost('inheritanceTax', BASE_POLICY.inheritanceTax + 0.1)).toBeGreaterThanOrEqual(2)
  })

  it('la planche à billets, interdite par les traités (article 123 du TFUE), est hors de portée d’une année ordinaire', () => {
    expect(cost('monetization', 0.2)).toBeGreaterThanOrEqual(8)
  })

  it('dans le sens populaire, une réforme passe plus facilement : baisser l’âge de départ coûte moins que le relever', () => {
    expect(cost('retirementAge', 62)).toBeLessThan(cost('retirementAge', 66))
    expect(cost('pensionIndexation', 1.2)).toBeLessThanOrEqual(cost('pensionIndexation', 0.8))
  })

  it('un gel complet des pensions n’est pas plus difficile qu’un recul de l’âge de départ', () => {
    expect(cost('pensionIndexation', 0)).toBeLessThanOrEqual(cost('retirementAge', 66))
  })
})
