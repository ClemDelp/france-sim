import donnees2000Csv from '../../modele/donnees-2000.csv?raw'
import historiqueCsv from '../../modele/historique.csv?raw'
import politiquesCsv from '../../modele/politiques-2000-2024.csv?raw'
import { BASE_POLICY } from './calibration'
import { DEFAULTS, parseCsv, parseNumber, type Overrides } from './params'
import { simulate, type Scenario } from './sim'
import type { Decision, Policy, YearState } from './types'

/**
 * Rejouer 2000–2024 : le même moteur, parti des chiffres de 2000 (modele/donnees-2000.csv), avec les décisions
 * réellement prises (modele/politiques-2000-2024.csv) et le monde tel qu'il a été (modele/monde.csv).
 * On compare ensuite à ce qui s'est vraiment passé (modele/historique.csv) : c'est le test de vérité du modèle.
 */
export const REPLAY_START = 2000
export const REPLAY_END = 2024

const dataOverrides: Overrides = Object.fromEntries(parseCsv(donnees2000Csv).map((r) => [r.id, parseNumber(r.valeur)]))

const policyRows = parseCsv(politiquesCsv).map((r) => ({ year: parseNumber(r.annee), key: r.levier as keyof Policy, value: parseNumber(r.valeur), note: r.commentaire }))

const reference: Policy = { ...BASE_POLICY, cancelShare: 0, cancelHolder: 'bce' }
for (const r of policyRows.filter((p) => p.year === REPLAY_START)) {
  ;(reference as Record<string, number | string>)[r.key] = r.value
}

/** Les décisions réellement prises après 2000, année par année. */
export const REPLAY_DECISIONS: Decision[] = [...new Set(policyRows.filter((r) => r.year > REPLAY_START).map((r) => r.year))].map((year) => ({
  year,
  patch: Object.fromEntries(policyRows.filter((r) => r.year === year).map((r) => [r.key, r.value])),
}))

/** Ce qui a été décidé, en clair, pour l'afficher à côté des courbes. */
export const REPLAY_NOTES: { year: number; text: string }[] = policyRows.filter((r) => r.year > REPLAY_START && r.note).map((r) => ({ year: r.year, text: r.note }))

export const REPLAY_SCENARIO: Scenario = { reference, params: dataOverrides }

/** Les identifiants des fichiers de 2000 et des décisions, pour vérifier qu'ils existent dans le modèle. */
export const REPLAY_IDS = { data: Object.keys(dataOverrides), levers: [...new Set(policyRows.map((r) => r.key))] }

/** La France rejouée de 2000 à 2024 (on peut essayer d'autres paramètres par-dessus). */
export function replay(params?: Overrides): YearState[] {
  return simulate({ decisions: REPLAY_DECISIONS, events: [], until: REPLAY_END, scenario: REPLAY_SCENARIO, params })
}

export type Observed = { year: number; growth: number; unemployment: number; inflation: number; deficitRatio: number; debtRatio: number; rate: number; poverty: number }

/** Ce qui s'est vraiment passé (INSEE, AFT : ordres de grandeur arrondis). */
export const OBSERVED: Observed[] = parseCsv(historiqueCsv).map((r) => ({
  year: parseNumber(r.annee),
  growth: parseNumber(r.croissance),
  unemployment: parseNumber(r.chomage),
  inflation: parseNumber(r.inflation),
  deficitRatio: parseNumber(r.deficit),
  debtRatio: parseNumber(r.dette),
  rate: parseNumber(r.taux10ans),
  poverty: parseNumber(r.pauvrete),
}))

export type ReplayMetric = { id: keyof Omit<Observed, 'year'>; label: string; model: (s: YearState) => number; points: boolean }

export const REPLAY_METRICS: ReplayMetric[] = [
  { id: 'growth', label: 'Croissance', model: (s) => s.growth, points: true },
  { id: 'unemployment', label: 'Chômage', model: (s) => s.unemployment, points: true },
  { id: 'inflation', label: 'Inflation', model: (s) => s.inflation, points: true },
  { id: 'deficitRatio', label: 'Déficit public', model: (s) => s.deficit / s.gdp, points: true },
  { id: 'debtRatio', label: 'Dette publique', model: (s) => s.debtRatio, points: false },
  { id: 'rate', label: 'Taux à 10 ans', model: (s) => s.rate, points: true },
  { id: 'poverty', label: 'Pauvreté', model: (s) => s.poverty, points: true },
]

/** L'écart moyen (en valeur absolue) et le biais entre le modèle et la réalité, hors année de départ. */
export function replayErrors(states: YearState[]): Record<ReplayMetric['id'], { mae: number; bias: number; last: number }> {
  const out = {} as Record<ReplayMetric['id'], { mae: number; bias: number; last: number }>
  for (const m of REPLAY_METRICS) {
    const pairs = OBSERVED.filter((o) => o.year > REPLAY_START).map((o) => {
      const s = states.find((x) => x.year === o.year)
      return s ? m.model(s) - o[m.id] : 0
    })
    const lastObs = OBSERVED.at(-1)!
    const lastState = states.find((x) => x.year === lastObs.year)
    out[m.id] = {
      mae: pairs.reduce((a, d) => a + Math.abs(d), 0) / pairs.length,
      bias: pairs.reduce((a, d) => a + d, 0) / pairs.length,
      last: lastState ? m.model(lastState) - lastObs[m.id] : 0,
    }
  }
  return out
}

/** Les paramètres des fichiers de 2000 doivent exister dans le modèle. */
export const unknownReplayIds = () => REPLAY_IDS.data.filter((id) => !(id in DEFAULTS))
