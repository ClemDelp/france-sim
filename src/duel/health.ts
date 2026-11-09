import noteCsv from '../../modele/note-pays.csv?raw'
import { parseCsv, parseNumber } from '../model/params'
import type { YearState } from '../model/types'

/**
 * La note de santé d'un pays (sur 100) : chaque critère est noté de 0 (« mauvais ») à 100 (« bon »), puis pondéré.
 * Les critères, leurs poids et leurs bornes sont dans modele/note-pays.csv : modifiables et discutables comme le reste du modèle.
 */

export type Criterion = { id: string; label: string; weight: number; bad: number; good: number; explanation: string }

export const CRITERIA: Criterion[] = parseCsv(noteCsv).map((r) => ({
  id: r.id,
  label: r.libelle,
  weight: parseNumber(r.poids),
  bad: parseNumber(r.mauvais),
  good: parseNumber(r.bon),
  explanation: r.explication,
}))

/** La valeur de chaque critère, dans l'unité de modele/note-pays.csv. */
const VALUE: Record<string, (s: YearState, start: YearState) => number> = {
  chomage: (s) => s.unemployment,
  // Le revenu médian du modèle est déjà corrigé des prix ; on le ramène à une progression par an.
  'pouvoir-achat': (s, start) => (s.year > start.year ? Math.pow(s.medianIncome / start.medianIncome, 1 / (s.year - start.year)) - 1 : 0),
  croissance: (s) => s.growth,
  inflation: (s) => Math.abs(s.inflation - 0.02),
  dette: (s) => s.debtRatio,
  deficit: (s) => s.deficit / s.gdp,
  pauvrete: (s) => s.poverty,
  colere: (s) => s.discontent,
  climat: (s, start) => s.frenchEmissions / start.frenchEmissions - 1,
}

export type HealthPart = Criterion & { value: number; points: number }

export function healthParts(s: YearState, start: YearState): HealthPart[] {
  const total = CRITERIA.reduce((a, c) => a + c.weight, 0)
  return CRITERIA.map((c) => {
    const value = VALUE[c.id]?.(s, start) ?? 0
    const share = Math.min(1, Math.max(0, (value - c.bad) / (c.good - c.bad)))
    return { ...c, value, points: (share * c.weight * 100) / total }
  })
}

/** La note sur 100 (arrondie). */
export const health = (s: YearState, start: YearState) => Math.round(healthParts(s, start).reduce((a, p) => a + p.points, 0))
