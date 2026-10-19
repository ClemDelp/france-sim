/**
 * Le passé récent (2017–2024), pour situer la partie : INSEE (comptes nationaux base 2020, pauvreté),
 * Eurostat (chômage), BCE (taux de l'OAT à 10 ans). Valeurs en fractions.
 */
export const HISTORY: Record<string, { year: number; value: number }[]> = (() => {
  const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]
  const series: Record<string, number[]> = {
    debtRatio: [0.988, 0.985, 0.982, 1.149, 1.128, 1.114, 1.095, 1.126],
    deficitRatio: [0.034, 0.023, 0.024, 0.089, 0.066, 0.047, 0.054, 0.058],
    growth: [0.021, 0.016, 0.02, -0.074, 0.069, 0.027, 0.016, 0.015],
    unemployment: [0.094, 0.091, 0.085, 0.081, 0.079, 0.073, 0.074, 0.074],
    inflation: [0.01, 0.018, 0.011, 0.005, 0.016, 0.052, 0.049, 0.02],
    rate: [0.0081, 0.0078, 0.0013, -0.0014, 0.0001, 0.017, 0.0299, 0.0297],
    poverty: [0.141, 0.148, 0.146, 0.139, 0.145, 0.144, 0.154, 0.154],
  }
  return Object.fromEntries(Object.entries(series).map(([k, values]) => [k, values.map((value, i) => ({ year: years[i], value }))]))
})()
