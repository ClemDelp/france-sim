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
  'premier-mandat': { 2026: { vat: 0.265 }, 2027: { foodSecurity: 80, unemploymentReplacement: 0.49 }, 2028: { foodSecurity: 160, minima: 10, unemploymentReplacement: 0.32, productionTaxes: 165 }, 2029: { foodSecurity: 240, minima: 25, savingsToFirms: 0.13 }, 2030: { csg: 0.098, minima: 35, firmAid: 25, unemploymentReplacement: 0.49 }, 2031: { minima: 50, smicBoost: 0.08, csg: 0.112, unemploymentReplacement: 0.57 } },
  ormuz: { 2026: { smicBoost: -0.08, productionTaxes: 245, vat: 0.165, unemploymentReplacement: 0.49 }, 2027: { foodSecurity: 80 } },
  electrique: { 2026: { nuclearShare: 0.75, electrification: 0.0375, firmAid: 25, investment: 90 }, 2027: { electrification: 0.065, corporateTax: 0.38 }, 2028: { foodSecurity: 80, tariffChinaEV: 0.7 }, 2029: { tariffChinaEV: 0.85 }, 2030: { tariffChinaEV: 1 } },
  climat: { 2026: { vat: 0.265 }, 2027: { adaptation: 16, electrification: 0.0225 }, 2028: { electrification: 0.05, firmAid: 25, adaptation: 29 }, 2029: { electrification: 0.0775 }, 2030: { foodSecurity: 80, nuclearShare: 0.82 }, 2031: { adaptation: 36, foodSecurity: 160, netMigration: 80 }, 2032: { unemploymentReplacement: 0.4 } },
  retraites: { 2026: { csg: 0.118, productionTaxes: 245 }, 2027: { foodSecurity: 80, unemploymentReplacement: 0.49 }, 2028: { unemploymentReplacement: 0.32, minima: 35, regulation: 0.5 }, 2029: { minima: 50, foodSecurity: 160, netMigration: 80 }, 2030: { foodSecurity: 240, netMigration: 10, pensionIndexation: 0.6 }, 2031: { minima: 65 } },
  marches: { 2026: { health: 170, firmAid: 25, investment: 90, corporateTax: 0.32 }, 2027: { foodSecurity: 80 }, 2028: { publicOwnership: 0, foodSecurity: 120 }, 2029: { foodSecurity: 200, education: 180 }, 2030: { foodSecurity: 240, prevention: 9 } },
  pauvrete: { 2026: { firmAid: 25, foodSecurity: 80, minima: 35 }, 2027: { csg: 0.118, minima: 50 }, 2028: { foodSecurity: 160, minima: 60, smicBoost: 0.08, csg: 0.132 }, 2029: { minima: 75, foodSecurity: 240, smicBoost: 0.25, pensionIndexation: 0.6 }, 2030: { regulation: 0.95, pensionIndexation: 0.2 }, 2031: { unemploymentReplacement: 0.65 } },
  'crise-2008': { 2026: { smicBoost: -0.08, inheritanceTax: 0.23, foodSecurity: 80 }, 2027: { foodSecurity: 160, savingsToFirms: 0.13, productionTaxes: 215 }, 2028: { publicOwnership: 0, unemploymentReplacement: 0.4 }, 2029: { csg: 0.118 }, 2030: { firmAid: 25, productionTaxes: 240 }, 2031: { foodSecurity: 240, savingsToFirms: 0.2 }, 2032: { savingsToFirms: 0.33, firmAid: 0, developmentAid: 5 } },
  'grand-chelem': { 2026: { electrification: 0.0375, minima: 35, health: 170 }, 2027: { firmAid: 25, investment: 90, defence: 40 }, 2028: { foodSecurity: 80, incomeTaxTop: 0.065 }, 2029: { minima: 70, firmAid: 0 }, 2030: { foodSecurity: 160, minima: 80, smicBoost: 0.08 }, 2031: { foodSecurity: 240, csg: 0.098 } },
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
