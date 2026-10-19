import type { YearState } from '../model/types'
import type { Focus } from './missions'
import { num, pct, pts, signed } from './format'

export type Line = { label: string; now: string; delta: string; tone: 'good' | 'bad' | 'flat' }

const tone = (d: number, goodWhenUp: boolean, eps: number): Line['tone'] => (Math.abs(d) < eps ? 'flat' : d > 0 === goodWhenUp ? 'good' : 'bad')

/** Un indicateur du verdict : sa valeur avec la décision, et l'écart avec « si on n'avait rien fait ». */
export function focusLine(f: Focus, s: YearState, b: YearState): Line {
  switch (f) {
    case 'gdp': {
      const d = s.gdpReal / b.gdpReal - 1
      return { label: 'Richesse produite (PIB)', now: `${num(s.gdp, 0)} Md€`, delta: `${signed(d * 100, 1)} %`, tone: tone(d, true, 0.001) }
    }
    case 'unemployment':
      return { label: 'Chômage', now: pct(s.unemployment), delta: pts(s.unemployment - b.unemployment), tone: tone(s.unemployment - b.unemployment, false, 0.0005) }
    case 'inflation':
      return { label: 'Inflation', now: pct(s.inflation), delta: pts(s.inflation - b.inflation), tone: tone(s.inflation - b.inflation, false, 0.0005) }
    case 'deficit': {
      const d = s.deficit / s.gdp - b.deficit / b.gdp
      return { label: 'Déficit public', now: pct(s.deficit / s.gdp), delta: pts(d), tone: tone(d, false, 0.0005) }
    }
    case 'debt': {
      const d = s.debtRatio - b.debtRatio
      return { label: 'Dette publique', now: pct(s.debtRatio, 0), delta: pts(d, 1), tone: tone(d, false, 0.002) }
    }
    case 'rate':
      return { label: 'Taux d’emprunt de l’État', now: pct(s.rate, 2), delta: pts(s.rate - b.rate, 2), tone: tone(s.rate - b.rate, false, 0.0005) }
    case 'poverty': {
      const people = (s.poverty - b.poverty) * s.population
      return { label: 'Pauvreté', now: pct(s.poverty), delta: `${pts(s.poverty - b.poverty)} (${signed(people, 2).replace('.', ',')} million)`, tone: tone(s.poverty - b.poverty, false, 0.0005) }
    }
    case 'gini':
      return { label: 'Inégalités (indice de Gini)', now: num(s.gini, 3), delta: signed(s.gini - b.gini, 3), tone: tone(s.gini - b.gini, false, 0.0005) }
    case 'poor': {
      const d = s.disposablePerCapita.g1 / b.disposablePerCapita.g1 - 1
      return { label: 'Revenu des 20 % les plus modestes', now: `${num(s.disposablePerCapita.g1 / 12, 0)} € / mois`, delta: `${signed(d * 100, 1)} %`, tone: tone(d, true, 0.001) }
    }
    case 'rich': {
      const d = s.disposablePerCapita.g5 / b.disposablePerCapita.g5 - 1
      return { label: 'Revenu des 10 % les plus riches', now: `${num(s.disposablePerCapita.g5 / 12, 0)} € / mois`, delta: `${signed(d * 100, 1)} %`, tone: 'flat' }
    }
    case 'life':
      return { label: 'Espérance de vie', now: `${num(s.lifeExpectancy, 1)} ans`, delta: `${signed(s.lifeExpectancy - b.lifeExpectancy, 1)} an`, tone: tone(s.lifeExpectancy - b.lifeExpectancy, true, 0.05) }
    case 'energy': {
      const d = s.energyImports - b.energyImports
      return { label: 'Facture pétrole et gaz importés', now: `${num(s.energyImports, 0)} Md€`, delta: `${signed(d, 0)} Md€`, tone: tone(d, false, 0.5) }
    }
    case 'savings': {
      const total = (x: YearState) => Object.values(x.wealth).reduce((a, v) => a + v, 0)
      const d = total(s) / total(b) - 1
      return { label: 'Épargne financière des ménages', now: `${num(total(s), 0)} Md€`, delta: `${signed(d * 100, 1)} %`, tone: tone(d, true, 0.001) }
    }
    case 'retirees': {
      const ratio = s.employment / s.retirees
      const bRatio = b.employment / b.retirees
      return { label: 'Actifs occupés par retraité', now: num(ratio, 2), delta: signed(ratio - bRatio, 2), tone: tone(ratio - bRatio, true, 0.01) }
    }
  }
}

/** Ce qui s'est passé une année, en phrases courtes, à partir des chiffres. */
export function yearStory(s: YearState, prev: YearState | undefined, b: YearState | undefined): string[] {
  const lines = [...s.notes]
  if (!prev) {
    return lines
  }
  if (s.oil - prev.oil > 15) {
    lines.push(`Le pétrole grimpe à ${num(s.oil, 0)} $ le baril : la facture énergétique atteint ${num(s.energyImports, 0)} Md€ et pousse les prix.`)
  }
  if (s.inflation > 0.035) {
    lines.push(`Inflation à ${pct(s.inflation)} : les prix montent plus vite que la plupart des salaires, le pouvoir d’achat recule.`)
  }
  if (s.rate - prev.rate > 0.004) {
    lines.push(`Les prêteurs exigent plus : la France emprunte à ${pct(s.rate, 2)} sur 10 ans (${pts(s.rate - prev.rate, 2)} en un an).`)
  }
  if (s.unemployment - prev.unemployment > 0.004) {
    lines.push(`Le chômage monte à ${pct(s.unemployment)} : ${num((s.unemployment - prev.unemployment) * s.laborForce * 1000, 0)} 000 chômeurs de plus.`)
  }
  if (s.growth < -0.005) {
    lines.push(`Récession : la richesse produite recule de ${num(-s.growth * 100, 1)} %.`)
  }
  if (b && s.debtRatio - b.debtRatio > 0.05) {
    lines.push(`La dette atteint ${pct(s.debtRatio, 0)} du PIB, ${num((s.debtRatio - b.debtRatio) * 100, 0)} points de plus que si l’on n’avait rien changé.`)
  }
  if (s.creditCrunch > 0.05) {
    lines.push('Les banques, fragilisées, rationnent le crédit : les entreprises et les ménages investissent moins.')
  }
  return lines
}
