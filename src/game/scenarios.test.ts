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

/** Les stratégies de référence : par année d'application, jouables avec le capital politique disponible. */
export const REFERENCE: Record<string, Plan> = {}

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
    expect(s.discontent, `${where} : colère`).toBeGreaterThanOrEqual(0)
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

    it.runIf(!!plan)('la stratégie de référence : photo de fin de partie', () => {
      expect({ étoiles: played!.evaluation!.stars, ...photo(played!.states) }).toMatchSnapshot()
    })
  })

SCENARIOS.forEach(describeScenario)
