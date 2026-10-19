import type { Metric } from '../model/robustness'
import type { YearState } from '../model/types'
import type { Focus } from './missions'
import { pts, signed } from './format'

/** Un indicateur testé, et comment afficher un écart. Les montants sont en logarithme : l'écart se lit en %. */
export type RobustMetric = Metric & { show: (d: number) => string }

const ratio = (id: string, label: string, value: (s: YearState) => number): RobustMetric => ({ id, label, value, epsilon: 0.0005, show: (d) => pts(d) })
const level = (id: string, label: string, value: (s: YearState) => number): RobustMetric => ({ id, label, value: (s) => Math.log(Math.max(1e-9, value(s))), epsilon: 0.001, show: (d) => `${signed(d * 100, 1)} %` })
const total = (r: Record<string, number>) => Object.values(r).reduce((a, v) => a + v, 0)

export const FOCUS_METRICS: Record<Focus, RobustMetric> = {
  gdp: level('gdp', 'Richesse produite (PIB)', (s) => s.gdpReal),
  unemployment: ratio('unemployment', 'Chômage', (s) => s.unemployment),
  inflation: ratio('inflation', 'Inflation', (s) => s.inflation),
  deficit: ratio('deficit', 'Déficit public', (s) => s.deficit / s.gdp),
  debt: ratio('debt', 'Dette publique', (s) => s.debtRatio),
  rate: ratio('rate', 'Taux d’emprunt', (s) => s.rate),
  poverty: ratio('poverty', 'Pauvreté', (s) => s.poverty),
  gini: { id: 'gini', label: 'Inégalités (Gini)', value: (s) => s.gini, epsilon: 0.0005, show: (d) => signed(d, 3) },
  poor: level('poor', 'Revenu des 20 % les plus modestes', (s) => s.disposablePerCapita.g1),
  rich: level('rich', 'Revenu des 10 % les plus riches', (s) => s.disposablePerCapita.g5),
  life: { id: 'life', label: 'Espérance de vie', value: (s) => s.lifeExpectancy, epsilon: 0.05, show: (d) => `${signed(d, 1)} an` },
  energy: level('energy', 'Facture pétrole et gaz', (s) => s.energyImports / s.priceLevel),
  savings: level('savings', 'Épargne des ménages', (s) => total(s.wealth) / s.priceLevel),
  retirees: { id: 'retirees', label: 'Actifs occupés par retraité', value: (s) => s.employment / s.retirees, epsilon: 0.01, show: (d) => signed(d, 2) },
}

/** Les indicateurs du bandeau, vus comme indicateurs testables (onglet « Courbes »). */
export const KPI_FOCUS: Record<string, Focus> = {
  gdp: 'gdp',
  unemployment: 'unemployment',
  inflation: 'inflation',
  deficit: 'deficit',
  debt: 'debt',
  rate: 'rate',
  poverty: 'poverty',
  gini: 'gini',
  life: 'life',
}
