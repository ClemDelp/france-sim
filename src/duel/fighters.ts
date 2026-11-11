import { BASE_POLICY } from '../model/calibration'
import { simulate } from '../model/sim'
import type { Policy, YearState } from '../model/types'
import { promiseRemaining, type Candidate } from '../game/candidates'
import { popularity } from '../game/score'
import { programmeOf } from './cards'

/**
 * Les « statistiques » d'un candidat sur l'écran de sélection, comme dans un jeu de combat. Elles viennent du modèle :
 * son programme du duel (toutes ses promesses jouables) appliqué en 2028, puis la France de 2032 comparée à celle sans rien changer.
 * Chaque barre est relative aux autres candidats : le plus fort sur un axe a la barre pleine.
 */

export type StatId = 'social' | 'budget' | 'economie' | 'ecologie' | 'paix'

export const STAT_AXES: { id: StatId; label: string; icon: string; hint: string }[] = [
  { id: 'social', label: 'Social', icon: '🤝', hint: 'Pauvreté et pouvoir d’achat en 2032' },
  { id: 'budget', label: 'Budget', icon: '💶', hint: 'Déficit en 2032' },
  { id: 'economie', label: 'Économie', icon: '🏭', hint: 'Production et chômage en 2032' },
  { id: 'ecologie', label: 'Écologie', icon: '🌱', hint: 'Émissions françaises en 2032' },
  { id: 'paix', label: 'Soutien', icon: '😊', hint: 'Popularité en 2032' },
]

const raw = (s: YearState, base: YearState): Record<StatId, number> => ({
  social: (base.poverty - s.poverty) * 100 + (s.medianIncome / base.medianIncome - 1) * 100,
  budget: (base.deficit / base.gdp - s.deficit / s.gdp) * 100,
  economie: (s.gdpReal / base.gdpReal - 1) * 100 + (base.unemployment - s.unemployment) * 100,
  ecologie: (1 - s.frenchEmissions / base.frenchEmissions) * 100,
  paix: popularity(s) - popularity(base),
})

let cache: Map<string, Record<StatId, number>> | null = null

/** Les barres (de 0 à 1) de chaque candidat, calculées une fois. */
export function fighterStats(candidates: Candidate[]): Map<string, Record<StatId, number>> {
  if (cache) {
    return cache
  }
  const base = simulate({ decisions: [], events: [], until: 2032 }).at(-1)!
  const values = candidates.map((c) => {
    let policy: Policy = { ...BASE_POLICY }
    for (const pledge of programmeOf(c, 0, 'joueur')) {
      policy = { ...policy, ...promiseRemaining(pledge, BASE_POLICY, policy) }
    }
    return { id: c.id, v: raw(simulate({ decisions: [{ year: 2028, patch: policy }], events: [], until: 2032 }).at(-1)!, base) }
  })
  cache = new Map(values.map(({ id }) => [id, {} as Record<StatId, number>]))
  for (const { id: axis } of STAT_AXES) {
    const all = values.map((x) => x.v[axis])
    const lo = Math.min(...all)
    const hi = Math.max(...all)
    for (const { id, v } of values) {
      cache.get(id)![axis] = 0.12 + 0.88 * (hi > lo ? (v[axis] - lo) / (hi - lo) : 0.5)
    }
  }
  return cache
}
