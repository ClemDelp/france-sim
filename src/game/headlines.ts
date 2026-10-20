import type { EventDef, YearState } from '../model/types'
import { WORLD_NOTES } from '../model/world'
import { num } from '../ui/format'
import { electionAt, isElectionYear } from './score'

export type Headline = { year: number; kicker: string; title: string; subtitle: string; tone: 'good' | 'bad' | 'neutral' }

const p1 = (v: number) => `${num(v * 100, 1)} %`

/** La une du journal : l'événement le plus marquant de l'année, comme le titrerait la presse. */
const KICKER: Record<EventDef['category'], string> = { climat: 'Climat', economie: 'Économie', monde: 'Monde', societe: 'Société', technologie: 'Sciences et techniques' }

export function headline(s: YearState, prev: YearState | undefined, elections: boolean, events: EventDef[] = []): Headline {
  const year = s.year
  const h = (kicker: string, title: string, subtitle: string, tone: Headline['tone']): Headline => ({ year, kicker, title, subtitle, tone })
  if (!prev) {
    return h('Politique', 'Nouveau gouvernement : la France attend des résultats', `Chômage à ${p1(s.unemployment)}, déficit à ${p1(s.deficit / s.gdp)} du PIB, dette à ${num(s.debtRatio * 100, 0)} %.`, 'neutral')
  }
  if (s.ending === 'effondrement') {
    return h('Climat', 'Le pays ne fait plus face', `Dégâts climatiques : ${p1(s.climateDamage)} de la richesse détruite cette année. Les secours sont débordés.`, 'bad')
  }
  if (s.ending === 'revolte') {
    return h('Crise politique', 'Le pays dans la rue, le gouvernement tombe', 'Grèves générales et blocages : la colère a eu raison du pouvoir.', 'bad')
  }
  if (s.ending === 'faillite') {
    return h('Finances', 'L’État ne peut plus payer', 'Plus aucun prêteur n’accepte de financer la France à un prix supportable.', 'bad')
  }
  if (s.ending === 'hyperinflation') {
    return h('Économie', 'Les prix deviennent fous', `Inflation à ${p1(s.inflation)} : l’épargne fond, les salaires décrochent.`, 'bad')
  }
  if (s.ending === 'depression') {
    return h('Économie', 'La France plonge dans la dépression', `Un actif sur cinq sans emploi (${p1(s.unemployment)}).`, 'bad')
  }
  if (s.debtCrisis) {
    return h('Marchés', 'Crise de la dette : les taux s’envolent', `La France emprunte à ${p1(s.rate)} sur 10 ans. Bruxelles et Francfort sont en alerte.`, 'bad')
  }
  if (elections && isElectionYear(year)) {
    const e = electionAt(s)
    return e.won
      ? h('Présidentielle', `Réélu avec ${num(e.vote, 1)} % des voix`, `Les Français vous renouvellent leur confiance pour cinq ans.`, 'good')
      : h('Présidentielle', `Battu : ${num(e.vote, 1)} % seulement`, 'Les Français ont choisi l’alternance.', 'bad')
  }
  if (events.length) {
    const e = events[0]
    const good = ['climate-deal', 'green-tech', 'world-cup', 'medical-breakthrough', 'china-boom', 'oil-glut', 'ai-boom'].includes(e.id)
    return h(`${e.icon} ${KICKER[e.category]}`, e.label, e.summary + (events[1] ? ` Et aussi : ${events[1].label.toLowerCase()}.` : ''), good ? 'good' : 'bad')
  }
  if (s.migrationIrregular > 110 && prev.migrationIrregular <= 110) {
    return h('Société', `${num(s.migrationIrregular, 0)} 000 arrivées irrégulières : l’accueil déborde`, 'Guerres et sécheresses jettent des millions de personnes sur les routes ; l’Europe se divise.', 'bad')
  }
  for (const threshold of [1.5, 2, 2.5, 3]) {
    if (s.temperature >= threshold && prev.temperature < threshold) {
      return h('Climat', `La planète franchit +${num(threshold, 1)} °C`, threshold === 1.5 ? 'L’objectif le plus ambitieux de l’accord de Paris est hors d’atteinte.' : 'Les scientifiques alertent : chaque dixième de degré compte.', 'bad')
    }
  }
  if (s.growth < -0.01) {
    return h('Conjoncture', `Récession : l’économie recule de ${num(-s.growth * 100, 1)} %`, `Le chômage atteint ${p1(s.unemployment)}.`, 'bad')
  }
  if (s.unemployment - prev.unemployment > 0.008) {
    return h('Emploi', `Le chômage bondit à ${p1(s.unemployment)}`, `${num((s.unemployment - prev.unemployment) * s.laborForce * 1000, 0)} 000 chômeurs de plus en un an.`, 'bad')
  }
  if (s.inflation > 0.04) {
    return h('Pouvoir d’achat', `Les prix flambent : ${p1(s.inflation)} sur un an`, 'Carburant, alimentation, loyers : les familles serrent les dents.', 'bad')
  }
  if (s.discontent > 0.6 && prev.discontent <= 0.6) {
    return h('Société', 'La colère gronde dans le pays', 'Manifestations et grèves se multiplient.', 'bad')
  }
  if (s.deficit < 0 && prev.deficit >= 0) {
    return h('Finances', 'Historique : les comptes publics en excédent', 'Une première depuis 1974.', 'good')
  }
  if (s.unemployment < 0.05 && prev.unemployment >= 0.05) {
    return h('Emploi', 'Le plein emploi est atteint', `Chômage à ${p1(s.unemployment)} : les entreprises s’arrachent les candidats.`, 'good')
  }
  if (s.unemployment - prev.unemployment < -0.005) {
    return h('Emploi', `Le chômage recule à ${p1(s.unemployment)}`, 'Les embauches repartent.', 'good')
  }
  if (s.poverty - prev.poverty < -0.004) {
    return h('Société', `La pauvreté recule à ${p1(s.poverty)}`, `${num((prev.poverty - s.poverty) * s.population * 1000, 0)} 000 personnes sortent de la pauvreté.`, 'good')
  }
  if (s.poverty - prev.poverty > 0.004) {
    return h('Société', `La pauvreté progresse à ${p1(s.poverty)}`, 'Les associations tirent la sonnette d’alarme.', 'bad')
  }
  if (WORLD_NOTES[year] && year > 2024) {
    return h('Monde', WORLD_NOTES[year], `Le baril à ${num(s.oil, 0)} $.`, 'neutral')
  }
  if (s.growth > 0.02) {
    return h('Conjoncture', `Croissance solide : +${num(s.growth * 100, 1)} %`, 'Les carnets de commandes se remplissent.', 'good')
  }
  return h('Conjoncture', `Croissance de ${num(s.growth * 100, 1)} %, une année sans surprise`, `Chômage ${p1(s.unemployment)}, inflation ${p1(s.inflation)}, dette ${num(s.debtRatio * 100, 0)} % du PIB.`, 'neutral')
}
