import type { Ending, YearState } from '../model/types'
import { num } from '../ui/format'

/** Vos ministres : chacun regarde son domaine et vous le dit franchement. */
export const ADVISORS = {
  budget: { avatar: '💼', name: 'Claire', role: 'Ministre des Comptes publics' },
  travail: { avatar: '🏭', name: 'Karim', role: 'Ministre du Travail' },
  social: { avatar: '🤝', name: 'Inès', role: 'Ministre des Solidarités' },
  energie: { avatar: '⚡', name: 'Hugo', role: 'Ministre de la Transition' },
  interieur: { avatar: '🛡️', name: 'Paul', role: 'Ministre de l’Intérieur' },
} as const

export type AdvisorId = keyof typeof ADVISORS
export type Advice = { who: AdvisorId; mood: 'warn' | 'good' | 'info'; text: string }

/** Ce que changerait la décision en préparation, l'an prochain. */
export type Preview = { deficit: number; unemployment: number; poverty: number; discontent: number; ending: Ending | null; inflation: number }

const bn = (v: number) => `${num(Math.abs(v), 0)} Md€`

/** Les réactions à une décision en préparation (jusqu'à trois, les plus importantes d'abord). */
export function adviseDraft(p: Preview): Advice[] {
  const out: (Advice & { weight: number })[] = []
  if (p.ending) {
    out.push({ who: 'interieur', mood: 'warn', weight: 10000, text: 'Si vous faites ça, nous ne tiendrons pas l’année. Je ne réponds plus de rien.' })
  } else if (p.discontent >= 0.6) {
    out.push({ who: 'interieur', mood: 'warn', weight: 500, text: `Les préfets me remontent une colère inquiétante (climat social à ${num(p.discontent, 2)}). Attention à la rue.` })
  }
  if (p.deficit > 15) {
    out.push({ who: 'budget', mood: 'warn', weight: 20 + p.deficit / 5, text: `Ça creuse le déficit de ${bn(p.deficit)} dès l’an prochain. Qui paie ? Les prêteurs nous regardent.` })
  } else if (p.deficit < -15) {
    out.push({ who: 'budget', mood: 'good', weight: 15 + -p.deficit / 5, text: `Excellent pour les comptes : ${bn(p.deficit)} de déficit en moins.` })
  }
  if (p.unemployment > 0.002) {
    out.push({ who: 'travail', mood: 'warn', weight: 15 + p.unemployment * 2000, text: `Je crains ${num(p.unemployment * 100, 1)} point de chômage en plus. Les entreprises vont freiner.` })
  } else if (p.unemployment < -0.002) {
    out.push({ who: 'travail', mood: 'good', weight: 15 + -p.unemployment * 2000, text: `Bonne nouvelle pour l’emploi : ${num(-p.unemployment * 100, 1)} point de chômage en moins.` })
  }
  if (p.poverty > 0.002) {
    out.push({ who: 'social', mood: 'warn', weight: 15 + p.poverty * 2000, text: `Ce sont les plus modestes qui vont trinquer : la pauvreté monte de ${num(p.poverty * 100, 1)} point.` })
  } else if (p.poverty < -0.002) {
    out.push({ who: 'social', mood: 'good', weight: 15 + -p.poverty * 2000, text: `Merci : la pauvreté recule de ${num(-p.poverty * 100, 1)} point. Des centaines de milliers de personnes respirent.` })
  }
  if (p.inflation > 0.005) {
    out.push({ who: 'energie', mood: 'warn', weight: 10 + p.inflation * 1000, text: `Les prix vont grimper (${num(p.inflation * 100, 1)} point d’inflation en plus).` })
  }
  if (!out.length) {
    out.push({ who: 'budget', mood: 'info', weight: 0, text: 'Effet modeste l’an prochain. Les vraies conséquences se verront peut-être dans quelques années.' })
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 3)
}

/** Les alertes sur la situation du pays, quand rien n'est en préparation. */
export function adviseState(s: YearState, popularity: number, yearsToElection: number): Advice[] {
  const out: Advice[] = []
  if (s.marketStress >= 0.7) {
    out.push({ who: 'budget', mood: 'warn', text: `Les marchés s’inquiètent (tension ${num(s.marketStress, 2)} : la crise éclate à 1). Il faut un signal sur le déficit.` })
  }
  if (s.discontent >= 0.5) {
    out.push({ who: 'interieur', mood: 'warn', text: 'Grèves, blocages : la colère monte. Une mesure de plus et ça peut basculer.' })
  }
  if (yearsToElection <= 1 && popularity < 45) {
    out.push({ who: 'interieur', mood: 'warn', text: `L’élection approche et vous n’êtes qu’à ${popularity} % d’opinions favorables. Il faut 40 % pour l’emporter.` })
  }
  if (s.unemployment > 0.09) {
    out.push({ who: 'travail', mood: 'warn', text: `${num(s.unemployment * 100, 1)} % de chômage : les plans sociaux se multiplient.` })
  }
  if (s.inflation > 0.04) {
    out.push({ who: 'social', mood: 'warn', text: `L’inflation à ${num(s.inflation * 100, 1)} % mange le budget des familles modestes.` })
  }
  if (s.oil > 100) {
    out.push({ who: 'energie', mood: 'info', text: `Le baril est à ${num(s.oil, 0)} $. Chaque point d’électrification nous rend moins vulnérables.` })
  }
  if (!out.length) {
    out.push({ who: 'budget', mood: 'info', text: 'Le pays tient. Bougez un levier : nous vous dirons ce que nous en pensons avant que vous avanciez.' })
  }
  return out.slice(0, 2)
}
