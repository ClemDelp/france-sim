import type { YearState } from '../model/types'
import { num, pct, pts, signed } from './format'

/**
 * La valeur d'une variable du graphe dans la partie en cours, pour relier le « cerveau » à ce qui se passe :
 * on voit quelles causes ont vraiment bougé par rapport à « si on n'avait rien changé ».
 */
type Kind = 'ratio' | 'amount' | 'level'
type NodeValue = { get: (s: YearState) => number; kind: Kind; show?: (v: number) => string }

const real = (f: (s: YearState) => number) => (s: YearState) => f(s) / s.priceLevel
const total = (r: Record<string, number>) => Object.values(r).reduce((a, v) => a + v, 0)

const VALUES: Record<string, NodeValue> = {
  gdp: { get: (s) => s.gdpReal, kind: 'amount', show: (v) => `${num(v, 0)} Md€ de 2025` },
  unemployment: { get: (s) => s.unemployment, kind: 'ratio' },
  inflation: { get: (s) => s.inflation, kind: 'ratio' },
  deficit: { get: (s) => s.deficit / s.gdp, kind: 'ratio' },
  debt: { get: (s) => s.debtRatio, kind: 'ratio' },
  rate: { get: (s) => s.rate, kind: 'ratio' },
  riskPremium: { get: (s) => s.riskPremium, kind: 'ratio' },
  effectiveRate: { get: (s) => s.effectiveRate, kind: 'ratio' },
  poverty: { get: (s) => s.poverty, kind: 'ratio' },
  gini: { get: (s) => s.gini, kind: 'level', show: (v) => num(v, 3) },
  lifeExpectancy: { get: (s) => s.lifeExpectancy, kind: 'level', show: (v) => `${num(v, 1)} ans` },
  lifeGap: { get: (s) => s.lifeGap, kind: 'level', show: (v) => `${num(v, 1)} ans` },
  population: { get: (s) => s.population, kind: 'level', show: (v) => `${num(v, 1)} M` },
  workingAge: { get: (s) => s.workingAge, kind: 'level', show: (v) => `${num(v, 1)} M` },
  retirees: { get: (s) => s.retirees, kind: 'level', show: (v) => `${num(v, 1)} M` },
  laborForce: { get: (s) => s.laborForce, kind: 'level', show: (v) => `${num(v, 1)} M` },
  oil: { get: (s) => s.oil, kind: 'level', show: (v) => `${num(v, 0)} $` },
  fossilShare: { get: (s) => s.fossilShare, kind: 'ratio' },
  electricityPrice: { get: (s) => s.electricityPrice * 100, kind: 'level', show: (v) => `indice ${num(v, 0)}` },
  energyPrice: { get: (s) => s.energyPrice * 100, kind: 'level', show: (v) => `indice ${num(v, 0)}` },
  wages: { get: real((s) => s.avgWage), kind: 'amount', show: (v) => `${num(v, 1)} k€ / an` },
  productivity: { get: (s) => s.productivity, kind: 'amount', show: (v) => `${num(v, 1)} k€ / actif` },
  consumption: { get: real((s) => s.consumption), kind: 'amount' },
  privateInvestment: { get: real((s) => s.investment), kind: 'amount' },
  housing: { get: real((s) => s.housing), kind: 'amount' },
  publicDemand: { get: real((s) => s.publicSpendingGoods), kind: 'amount' },
  exports: { get: real((s) => s.exports), kind: 'amount' },
  imports: { get: real((s) => s.imports), kind: 'amount' },
  energyImports: { get: real((s) => s.energyImports), kind: 'amount' },
  taxes: { get: real((s) => s.revenue), kind: 'amount' },
  spending: { get: real((s) => s.spending), kind: 'amount' },
  interest: { get: real((s) => s.interest), kind: 'amount' },
  pensions: { get: real((s) => s.budget.Retraites ?? 0), kind: 'amount' },
  socialBenefits: { get: real((s) => s.budget['Chômage, famille, minima'] ?? 0), kind: 'amount' },
  profits: { get: real((s) => s.profits), kind: 'amount' },
  currentAccount: { get: (s) => s.currentAccount / s.gdp, kind: 'ratio' },
  disposableIncome: { get: real((s) => total(s.disposable)), kind: 'amount' },
  lowIncome: { get: (s) => s.disposablePerCapita.g1 / 12, kind: 'amount', show: (v) => `${num(v, 0)} € / mois` },
  sme: { get: real((s) => s.firms.pme.investment), kind: 'amount' },
  midcaps: { get: real((s) => s.firms.eti.investment), kind: 'amount' },
  largeFirms: { get: real((s) => s.firms.ge.investment), kind: 'amount' },
  marketStress: { get: (s) => s.marketStress, kind: 'level', show: (v) => `indice ${num(v, 2)}` },
  rescue: { get: (s) => s.rescueEffort * 100, kind: 'level', show: (v) => (v > 0 ? `${num(v, 1)} pt de PIB d’économies` : 'aucun') },
  evasion: { get: (s) => s.evasion, kind: 'ratio' },
  discontent: { get: (s) => s.discontent, kind: 'level', show: (v) => `indice ${num(v, 2)}` },
  savings: { get: real((s) => total(s.wealth)), kind: 'amount' },
  bankCapital: { get: real((s) => s.bankCapital), kind: 'amount' },
  creditCrunch: { get: (s) => s.creditCrunch, kind: 'ratio' },
}

export type NodeReading = { now: string; delta: string | null; moved: boolean }

/** La valeur d'une variable cette année, et son écart avec la même France sans les décisions du joueur. */
export function readNode(id: string, s: YearState, b: YearState | null): NodeReading | null {
  const v = VALUES[id]
  if (!v) {
    return null
  }
  const a = v.get(s)
  const o = b ? v.get(b) : a
  const now = v.show ? v.show(a) : v.kind === 'ratio' ? pct(a) : `${num(a, 0)} Md€`
  if (v.kind === 'amount') {
    const d = o ? a / o - 1 : 0
    return { now, delta: b ? `${signed(d * 100, 1)} %` : null, moved: Math.abs(d) > 0.002 }
  }
  if (v.kind === 'ratio') {
    return { now, delta: b ? pts(a - o) : null, moved: Math.abs(a - o) > 0.0005 }
  }
  const d = a - o
  return { now, delta: b ? signed(d, 2) : null, moved: Math.abs(d) > 0.005 * Math.max(1, Math.abs(o)) }
}
