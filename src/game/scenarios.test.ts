import { describe, expect, it } from 'vitest'
import type { YearState } from '../model/types'
import { SCENARIOS, type Scenario } from './scenarios'
import { popularity } from './score'
import { playSession, type Plan } from './session'

/**
 * Les scénarios, en dur : chaque scénario est rejoué comme dans le jeu (capital politique, élections, fins de partie),
 * sans rien faire et avec une stratégie de référence jouable par un humain. On vérifie :
 * - que le modèle reste sain chaque année (pas de valeur absurde, comptabilité bouclée) ;
 * - que le scénario reste un défi (ne rien faire ne suffit pas) et reste gagnable (la stratégie de référence gagne) ;
 * - et on garde une photo des résultats clés : si une modification du modèle fait bouger un scénario, le test le montre.
 *   Après avoir vérifié que le changement est voulu : `npx vitest -u` met la photo à jour.
 */

/** Les stratégies de référence : par année d'application, jouables avec le capital politique disponible.
 * Trouvées par le joueur automatique (playBot, src/game/bot.ts) : elles prouvent qu'un scénario reste gagnable,
 * pas qu'elles sont la meilleure politique. */
export const REFERENCE: Record<string, Plan> = {
  'premier-mandat': { 2026: { firmAid: 25, defence: 40, minima: 15 }, 2027: { netMigration: -30, firmAid: 0 }, 2028: { minima: 50, developmentAid: 5, nuclearShare: 0.75 }, 2029: { savingsToFirms: 0.13, foodSecurity: 40, smicBoost: -0.08 }, 2030: { minima: 60, foodSecurity: 120, publicOwnership: 0 }, 2031: { foodSecurity: 200, incomeTaxTop: 0.015, minima: 70 } },
  ormuz: { 2026: { smicBoost: -0.08, productionTaxes: 245, vat: 0.185 }, 2027: { firmAid: 50, unemploymentReplacement: 0.65, foodSecurity: 40 } },
  electrique: { 2026: { electrification: 0.0375, vat: 0.265, nuclearShare: 0.82 }, 2027: { firmAid: 25 }, 2028: { carbonTax: 180, minima: 35 }, 2037: { carbonTax: 215 } },
  climat: { 2026: { carbonTax: 180, adaptation: 16, electrification: 0.0225 }, 2027: { carbonTax: 315, prevention: 13 }, 2028: { nuclearShare: 0.82, electrification: 0.035, carbonTax: 380 }, 2029: { adaptation: 19, netMigration: 80, publicOwnership: 0 }, 2030: { adaptation: 32, firmAid: 25 }, 2031: { minima: 35, electrification: 0.0625 }, 2032: { electrification: 0.07 }, 2038: { prevention: 20, incomeTaxTop: 0.015, electrification: 0.0775 }, 2039: { foodSecurity: 20 }, 2042: { foodSecurity: 40, education: 150, prevention: 27 }, 2043: { prevention: 30, corporateTax: 0.12, minima: 70 }, 2044: { prevention: 37, health: 290, minima: 80 }, 2045: { health: 320, prevention: 40, foodSecurity: 120 }, 2046: { foodSecurity: 200, unemploymentReplacement: 0.65, adaptation: 39 }, 2047: { foodSecurity: 240, regulation: 0.95 }, 2048: { smicBoost: 0.17, csg: 0.118, unemploymentReplacement: 0.73 }, 2049: { smicBoost: 0.25 } },
  retraites: { 2026: { netMigration: -30, vat: 0.265 }, 2027: { investment: 90, regulation: 0.5 }, 2028: { minima: 15, regulation: 0.15 }, 2029: { minima: 50, csg: 0.098 }, 2030: { foodSecurity: 80, csg: 0.112 }, 2031: { minima: 65, smicBoost: 0.17, corporateTax: 0.28 }, 2032: { foodSecurity: 100, investment: 70, minima: 80 }, 2033: { foodSecurity: 140, csg: 0.126, firmAid: 25 } },
  marches: { 2026: { vat: 0.265, firmAid: 25, investment: 90 }, 2027: { firmAid: 0 }, 2028: { publicOwnership: 0, minima: 15, corporateTax: 0.22 } },
  pauvrete: { 2026: { firmAid: 25, csg: 0.118, minima: 15 }, 2027: { minima: 50, incomeTaxTop: 0.065 }, 2028: { minima: 65, foodSecurity: 80, smicBoost: 0.08 }, 2029: { foodSecurity: 120, csg: 0.132, minima: 80 }, 2030: { incomeTaxTop: 0.13, foodSecurity: 200, smicBoost: 0.16 }, 2031: { foodSecurity: 240, smicBoost: 0.33, savingsToFirms: 0.07 }, 2032: { regulation: 0.75, savingsToFirms: 0.2 } },
  'crise-2008': { 2026: { productionTaxes: 245, firmAid: 25, inheritanceTax: 0.4 }, 2027: { foodSecurity: 80, smicBoost: -0.08, savingsToFirms: 0.07 }, 2028: { vat: 0.265, publicOwnership: 0.05, netMigration: 80 }, 2029: { savingsToFirms: 0.14, corporateTax: 0.18 }, 2030: { savingsToFirms: 0.27 }, 2031: { minima: 35, foodSecurity: 120 }, 2032: { corporateTax: 0.05, inheritanceTax: 0.32 } },
  'grand-chelem': { 2026: { electrification: 0.0375, vat: 0.265, investment: 90 }, 2027: { firmAid: 25 }, 2028: { minima: 35, csg: 0.118 }, 2029: { minima: 50, smicBoost: 0.17 }, 2030: { csg: 0.132, minima: 65, foodSecurity: 20 }, 2031: { retirementAge: 65.25, minima: 80, foodSecurity: 60 }, 2032: { foodSecurity: 140, firmAid: 0, smicBoost: 0.34 }, 2033: { csg: 0.138 } },
}

/** Toutes les valeurs numériques d'un état, à la recherche d'un NaN ou d'un infini. */
function nonFinite(value: unknown, path = ''): string[] {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? [] : [path]
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => nonFinite(v, `${path}.${k}`))
  }
  return []
}

/** Le modèle reste dans le domaine du plausible, chaque année. */
function expectSane(states: YearState[], label: string) {
  for (const s of states) {
    const where = `${label} ${s.year}`
    expect(nonFinite(s), where).toEqual([])
    expect(Math.abs(s.closure), `${where} : bouclage comptable`).toBeLessThan(0.5)
    expect(s.unemployment, `${where} : chômage`).toBeGreaterThanOrEqual(0.015)
    expect(s.unemployment, `${where} : chômage`).toBeLessThanOrEqual(0.45)
    expect(s.inflation, `${where} : inflation`).toBeGreaterThanOrEqual(-0.03)
    expect(s.inflation, `${where} : inflation`).toBeLessThanOrEqual(0.4)
    expect(s.debtRatio, `${where} : dette`).toBeGreaterThan(0)
    expect(s.debtRatio, `${where} : dette`).toBeLessThan(4)
    expect(s.poverty, `${where} : pauvreté`).toBeGreaterThan(0.02)
    expect(s.poverty, `${where} : pauvreté`).toBeLessThan(0.5)
    expect(s.lifeExpectancy, `${where} : espérance de vie`).toBeGreaterThan(70)
    expect(s.lifeExpectancy, `${where} : espérance de vie`).toBeLessThan(95)
    expect(s.population, `${where} : population`).toBeGreaterThan(55)
    expect(s.discontent, `${where} : colère`).toBeGreaterThanOrEqual(-0.5)
  }
}

/** La photo d'une fin de partie, arrondie à une précision qui a du sens (au dixième de point pour un taux). */
function photo(states: YearState[]) {
  const s = states.at(-1)!
  const r = (v: number, d: number) => Number(v.toFixed(d))
  return {
    année: s.year,
    croissance: r(s.growth * 100, 1),
    chômage: r(s.unemployment * 100, 1),
    inflation: r(s.inflation * 100, 1),
    déficit: r((s.deficit / s.gdp) * 100, 1),
    dette: r(s.debtRatio * 100, 0),
    taux10ans: r(s.rate * 100, 1),
    pauvreté: r(s.poverty * 100, 1),
    espéranceDeVie: r(s.lifeExpectancy, 1),
    température: r(s.temperature, 2),
    émissions: r(s.frenchEmissions, 0),
    partFossile: r(s.fossilShare * 100, 0),
    colère: r(s.discontent, 2),
    popularité: popularity(s),
  }
}

const describeScenario = (sc: Scenario) =>
  describe(`scénario « ${sc.title} »`, () => {
    const idle = playSession({ scenario: sc, plan: {} })
    const plan = REFERENCE[sc.id]
    const played = plan ? playSession({ scenario: sc, plan }) : null

    it('sans rien faire : le modèle reste sain, et ça ne suffit pas pour trois étoiles', () => {
      expectSane(idle.states, 'sans rien faire')
      expect(idle.evaluation!.stars).toBeLessThan(3)
    })

    it('sans rien faire : photo de fin de partie', () => {
      expect({ étoiles: idle.evaluation!.stars, perdu: idle.lost, ...photo(idle.states) }).toMatchSnapshot()
    })

    it.runIf(!!plan)('la stratégie de référence est jouable (capital politique) et gagne', () => {
      expectSane(played!.states, 'référence')
      expect(played!.overBudget).toEqual([])
      expect(played!.lost).toBeNull()
      expect(played!.evaluation!.stars).toBeGreaterThan(idle.evaluation!.stars)
      expect(played!.evaluation!.stars).toBeGreaterThanOrEqual(2)
    })

    it.runIf(!!plan)('la stratégie de référence : photo de fin de partie, et combien de parties elle gagne face au hasard', () => {
      // Six tirages au sort fixes : si l'équilibre du hasard ou du modèle change, le nombre de parties gagnées bouge.
      const luck = [1, 2, 3, 4, 5, 6].map((seed) => playSession({ scenario: sc, plan: plan!, seed }))
      const wins = luck.filter((g) => !g.lost && g.evaluation!.stars >= 2).length
      expect(wins, 'la stratégie de référence doit gagner au moins la moitié des parties tirées au sort').toBeGreaterThanOrEqual(3)
      expect({ étoiles: played!.evaluation!.stars, tiragesGagnés: `${wins} / 6`, ...photo(played!.states) }).toMatchSnapshot()
    })
  })

SCENARIOS.forEach(describeScenario)
