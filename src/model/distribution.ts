import { GROUPS, type ByGroup } from './types'

/** Inverse de la loi normale centrée réduite (approximation d'Acklam, précision ≈ 1e-9). */
function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const low = 0.02425
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

const POINTS = 300

export type Distribution = { median: number; poverty: number; gini: number; ratioD9D1: number }

/**
 * Reconstitue la distribution des niveaux de vie : chaque tranche est une loi log-normale de moyenne
 * connue et de dispersion fixe. On en tire le taux de pauvreté (sous 60 % du revenu médian),
 * l'indice de Gini et le rapport entre le 9e et le 1er décile.
 */
export function distribution(mean: ByGroup, share: ByGroup, sigma: ByGroup): Distribution {
  const points: { y: number; w: number }[] = []
  for (const g of GROUPS) {
    const s = sigma[g]
    const mu = Math.log(Math.max(1e-6, mean[g])) - (s * s) / 2
    for (let i = 0; i < POINTS; i += 1) {
      points.push({ y: Math.exp(mu + s * probit((i + 0.5) / POINTS)), w: share[g] / POINTS })
    }
  }
  points.sort((a, b) => a.y - b.y)
  const total = points.reduce((acc, p) => acc + p.w, 0)
  const quantile = (q: number) => {
    let acc = 0
    for (const p of points) {
      acc += p.w
      if (acc >= q * total) {
        return p.y
      }
    }
    return points[points.length - 1].y
  }
  const median = quantile(0.5)
  const poverty = points.filter((p) => p.y < 0.6 * median).reduce((acc, p) => acc + p.w, 0) / total
  // Gini = 1 − 2 × aire sous la courbe de Lorenz.
  const income = points.reduce((acc, p) => acc + p.w * p.y, 0)
  let cumIncome = 0
  let area = 0
  for (const p of points) {
    const before = cumIncome
    cumIncome += p.w * p.y
    area += (p.w / total) * ((before + cumIncome) / 2 / income)
  }
  return { median, poverty, gini: 1 - 2 * area, ratioD9D1: quantile(0.9) / quantile(0.1) }
}
