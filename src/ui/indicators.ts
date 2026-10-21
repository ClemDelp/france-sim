import type { YearState } from '../model/types'
import { num, pct, pts, signed } from './format'

/** Les chiffres clés suivis tout au long de la partie. */
export type Kpi = {
  id: string
  label: string
  value: (s: YearState) => number
  show: (v: number) => string
  delta: (d: number) => string
  goodWhenUp: boolean
  /** Série historique 2017–2024, quand elle existe. */
  history?: string
  hint: string
  /** Format des graduations quand `show` donne un mot (calme, tendu…). */
  axis?: (v: number) => string
  /** La variable correspondante dans le graphe du modèle. */
  node: string
}

export const KPIS: Kpi[] = [
  { id: 'gdp', label: 'Croissance', value: (s) => s.growth, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: true, history: 'growth', hint: 'Progression de la richesse produite en volume, hors hausse des prix.', node: 'gdp' },
  { id: 'unemployment', label: 'Chômage', value: (s) => s.unemployment, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: false, history: 'unemployment', hint: 'Part des actifs qui cherchent un emploi.', node: 'unemployment' },
  { id: 'inflation', label: 'Inflation', value: (s) => s.inflation, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: false, history: 'inflation', hint: 'Hausse des prix sur un an. Peut monter sans croissance : choc pétrolier, droits de douane, TVA.', node: 'inflation' },
  { id: 'deficit', label: 'Déficit', value: (s) => s.deficit / s.gdp, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: false, history: 'deficitRatio', hint: 'Ce que l’État et la Sécu dépensent de plus que leurs recettes, en % du PIB.', node: 'deficit' },
  { id: 'debt', label: 'Dette', value: (s) => s.debtRatio, show: (v) => pct(v, 0), delta: (d) => pts(d), goodWhenUp: false, history: 'debtRatio', hint: 'Somme des déficits passés, en % du PIB.', node: 'debt' },
  { id: 'rate', label: 'Taux 10 ans', value: (s) => s.rate, show: (v) => pct(v, 2), delta: (d) => pts(d, 2), goodWhenUp: false, history: 'rate', hint: 'Le prix auquel la France emprunte : il dépend de la BCE et de la confiance des prêteurs.', node: 'rate' },
  { id: 'poverty', label: 'Pauvreté', value: (s) => s.poverty, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: false, history: 'poverty', hint: 'Part de la population sous 60 % du niveau de vie médian.', node: 'poverty' },
  { id: 'gini', label: 'Inégalités', value: (s) => s.gini, show: (v) => num(v, 3), delta: (d) => signed(d, 3), goodWhenUp: false, hint: 'Indice de Gini des niveaux de vie : 0 = égalité parfaite, 1 = une seule personne a tout.', node: 'gini' },
  { id: 'life', label: 'Espérance de vie', value: (s) => s.lifeExpectancy, show: (v) => `${num(v, 1)} ans`, delta: (d) => `${signed(d, 1)} an`, goodWhenUp: true, hint: 'À la naissance. Écart de 13 ans entre les 5 % les plus riches et les 5 % les plus pauvres (hommes).', node: 'lifeExpectancy' },
  { id: 'climate', label: 'Réchauffement mondial', value: (s) => s.temperature, show: (v) => `+${num(v, 2)} °C`, delta: (d) => `${signed(d, 2)} °C`, goodWhenUp: false, hint: 'Réchauffement de la planète depuis l’ère préindustrielle. Il dépend des émissions du monde entier.', node: 'temperature' },
  { id: 'emissions', label: 'Émissions françaises', value: (s) => s.frenchEmissions, show: (v) => `${num(v, 0)} Mt`, delta: (d) => `${signed(d, 0)} Mt`, goodWhenUp: false, axis: (v) => num(v, 0), hint: 'Gaz à effet de serre émis en France chaque année (millions de tonnes de CO2). Objectif 2030 : 270 Mt.', node: 'frenchEmissions' },
  { id: 'social', label: 'Climat social', value: (s) => s.discontent, show: (v) => (v >= 1 ? 'explosif' : v >= 0.6 ? 'tendu' : v < -0.1 ? 'serein' : 'calme'), delta: (d) => signed(d, 2), goodWhenUp: false, axis: (v) => num(v, 2), hint: 'Mécontentement accumulé : baisse du niveau de vie, impôts, chômage, inflation, pauvreté, austérité. À 1, le pays se soulève et la partie est perdue.', node: 'discontent' },
  { id: 'stress', label: 'Tension sur la dette', value: (s) => s.marketStress, show: (v) => (v >= 1 ? 'crise' : v >= 0.7 ? 'tendue' : 'calme'), delta: (d) => signed(d, 2), goodWhenUp: false, axis: (v) => num(v, 2), hint: 'Ce que regardent les prêteurs : niveau de la dette et écart à l’effort qui la stabiliserait. À 1, crise de la dette.', node: 'marketStress' },
]
