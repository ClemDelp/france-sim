import { OBSERVED, type Observed } from '../model/replay'

/**
 * Le passé récent, pour situer la partie sur les petites courbes : lu dans modele/historique.csv
 * (INSEE, AFT, Eurostat ; valeurs en fractions). On n'en garde que les dernières années.
 */
const FROM = 2017
const KEYS: (keyof Omit<Observed, 'year'>)[] = ['debtRatio', 'deficitRatio', 'growth', 'unemployment', 'inflation', 'rate', 'poverty']

export const HISTORY: Record<string, { year: number; value: number }[]> = Object.fromEntries(
  KEYS.map((k) => [k, OBSERVED.filter((o) => o.year >= FROM).map((o) => ({ year: o.year, value: o[k] }))]),
)
