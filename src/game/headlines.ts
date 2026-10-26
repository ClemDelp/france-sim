import type { EventDef, YearState } from '../model/types'
import { WORLD_NOTES } from '../model/world'
import { num } from '../ui/format'
import type { Art } from '../ui/game/illustrations'
import { majorityOf, MAJORITY_LABEL, type Politics } from './parliament'
import { electionAt, isElectionYear } from './score'

export type Headline = { year: number; kicker: string; title: string; subtitle: string; tone: 'good' | 'bad' | 'neutral'; art: Art }

const p1 = (v: number) => `${num(v * 100, 1)} %`

/** La une du journal : l'événement le plus marquant de l'année, comme le titrerait la presse. */
const KICKER: Record<EventDef['category'], string> = { climat: 'Climat', economie: 'Économie', monde: 'Monde', societe: 'Société', technologie: 'Sciences et techniques' }

/** Le dessin de la une, selon l'événement (ou, à défaut, sa rubrique). */
const EVENT_ART: Record<string, Art> = {
  heatwave: 'canicule',
  drought: 'canicule',
  wildfires: 'feu',
  floods: 'tempete',
  storm: 'tempete',
  'climate-refugees': 'exode',
  mediterranean: 'exode',
  'climate-deal': 'eolienne',
  'green-tech': 'eolienne',
  'financial-crisis': 'krach',
  recession: 'krach',
  'ecb-hike': 'krach',
  'eu-procedure': 'europe',
  'eu-support': 'europe',
  ormuz: 'petrole',
  'oil-glut': 'petrole',
  'trade-war': 'conteneurs',
  'us-retaliation': 'conteneurs',
  'china-boom': 'conteneurs',
  cyberattack: 'ordi',
  'ai-boom': 'ordi',
  pandemic: 'sante',
  'medical-breakthrough': 'sante',
  'general-strike': 'manif',
  scandal: 'hemicycle',
  'world-cup': 'foot',
}
const CATEGORY_ART: Record<EventDef['category'], Art> = { climat: 'canicule', economie: 'krach', monde: 'globe', societe: 'manif', technologie: 'ordi' }

export function headline(s: YearState, prev: YearState | undefined, elections: boolean, events: EventDef[] = []): Headline {
  const year = s.year
  const h = (kicker: string, title: string, subtitle: string, tone: Headline['tone'], art: Art): Headline => ({ year, kicker, title, subtitle, tone, art })
  if (!prev) {
    return h('Politique', 'Nouveau gouvernement : la France attend des résultats', `Chômage à ${p1(s.unemployment)}, déficit à ${p1(s.deficit / s.gdp)} du PIB, dette à ${num(s.debtRatio * 100, 0)} %.`, 'neutral', 'hemicycle')
  }
  if (s.ending === 'effondrement') {
    return h('Climat', 'Le pays ne fait plus face', `Dégâts climatiques : ${p1(s.climateDamage)} de la richesse détruite cette année. Les secours sont débordés.`, 'bad', 'tempete')
  }
  if (s.ending === 'revolte') {
    return h('Crise politique', 'Le pays dans la rue, le gouvernement tombe', 'Grèves générales et blocages : la colère a eu raison du pouvoir.', 'bad', 'manif')
  }
  if (s.ending === 'faillite') {
    return h('Finances', 'L’État ne peut plus payer', 'Plus aucun prêteur n’accepte de financer la France à un prix supportable.', 'bad', 'krach')
  }
  if (s.ending === 'hyperinflation') {
    return h('Économie', 'Les prix deviennent fous', `Inflation à ${p1(s.inflation)} : l’épargne fond, les salaires décrochent.`, 'bad', 'caddie')
  }
  if (s.ending === 'depression') {
    return h('Économie', 'La France plonge dans la dépression', `Un actif sur cinq sans emploi (${p1(s.unemployment)}).`, 'bad', 'chomage')
  }
  if (s.debtCrisis) {
    return h('Marchés', 'Crise de la dette : les taux s’envolent', `La France emprunte à ${p1(s.rate)} sur 10 ans. Bruxelles et Francfort sont en alerte.`, 'bad', 'krach')
  }
  if (elections && isElectionYear(year)) {
    const e = electionAt(s)
    return e.won
      ? h('Présidentielle', `Réélu avec ${num(e.vote, 1)} % des voix`, `Les Français vous renouvellent leur confiance pour cinq ans.`, 'good', 'urne')
      : h('Présidentielle', `Battu : ${num(e.vote, 1)} % seulement`, 'Les Français ont choisi l’alternance.', 'bad', 'urne')
  }
  if (events.length) {
    const e = events[0]
    const good = ['climate-deal', 'green-tech', 'world-cup', 'medical-breakthrough', 'china-boom', 'oil-glut', 'ai-boom'].includes(e.id)
    return h(`${e.icon} ${KICKER[e.category]}`, e.label, e.summary, good ? 'good' : 'bad', EVENT_ART[e.id] ?? CATEGORY_ART[e.category])
  }
  if (s.migrationIrregular > 110 && prev.migrationIrregular <= 110) {
    return h('Société', `${num(s.migrationIrregular, 0)} 000 arrivées irrégulières : l’accueil déborde`, 'Guerres et sécheresses jettent des millions de personnes sur les routes ; l’Europe se divise.', 'bad', 'exode')
  }
  for (const threshold of [1.5, 2, 2.5, 3]) {
    if (s.temperature >= threshold && prev.temperature < threshold) {
      return h('Climat', `La planète franchit +${num(threshold, 1)} °C`, threshold === 1.5 ? 'L’objectif le plus ambitieux de l’accord de Paris est hors d’atteinte.' : 'Les scientifiques alertent : chaque dixième de degré compte.', 'bad', 'canicule')
    }
  }
  if (s.growth < -0.01) {
    return h('Conjoncture', `Récession : l’économie recule de ${num(-s.growth * 100, 1)} %`, `Le chômage atteint ${p1(s.unemployment)}.`, 'bad', 'krach')
  }
  if (s.unemployment - prev.unemployment > 0.008) {
    return h('Emploi', `Le chômage bondit à ${p1(s.unemployment)}`, `${num((s.unemployment - prev.unemployment) * s.laborForce * 1000, 0)} 000 chômeurs de plus en un an.`, 'bad', 'chomage')
  }
  if (s.inflation > 0.04) {
    return h('Pouvoir d’achat', `Les prix flambent : ${p1(s.inflation)} sur un an`, 'Carburant, alimentation, loyers : les familles serrent les dents.', 'bad', 'caddie')
  }
  if (s.discontent > 0.6 && prev.discontent <= 0.6) {
    return h('Société', 'La colère gronde dans le pays', 'Manifestations et grèves se multiplient.', 'bad', 'manif')
  }
  if (s.deficit < 0 && prev.deficit >= 0) {
    return h('Finances', 'Historique : les comptes publics en excédent', 'Une première depuis 1974.', 'good', 'hemicycle')
  }
  if (s.unemployment < 0.05 && prev.unemployment >= 0.05) {
    return h('Emploi', 'Le plein emploi est atteint', `Chômage à ${p1(s.unemployment)} : les entreprises s’arrachent les candidats.`, 'good', 'usine')
  }
  if (s.unemployment - prev.unemployment < -0.005) {
    return h('Emploi', `Le chômage recule à ${p1(s.unemployment)}`, 'Les embauches repartent.', 'good', 'usine')
  }
  if (s.poverty - prev.poverty < -0.004) {
    return h('Société', `La pauvreté recule à ${p1(s.poverty)}`, `${num((prev.poverty - s.poverty) * s.population * 1000, 0)} 000 personnes sortent de la pauvreté.`, 'good', 'caddie')
  }
  if (s.poverty - prev.poverty > 0.004) {
    return h('Société', `La pauvreté progresse à ${p1(s.poverty)}`, 'Les associations tirent la sonnette d’alarme.', 'bad', 'caddie')
  }
  if (WORLD_NOTES[year] && year > 2024) {
    return h('Monde', WORLD_NOTES[year], `Le baril à ${num(s.oil, 0)} $.`, 'neutral', 'globe')
  }
  if (s.growth > 0.02) {
    return h('Conjoncture', `Croissance solide : +${num(s.growth * 100, 1)} %`, 'Les carnets de commandes se remplissent.', 'good', 'usine')
  }
  return h('Conjoncture', `Croissance de ${num(s.growth * 100, 1)} %, une année sans surprise`, `Chômage ${p1(s.unemployment)}, inflation ${p1(s.inflation)}, dette ${num(s.debtRatio * 100, 0)} % du PIB.`, 'neutral', 'hemicycle')
}

/** La colonne « En bref » : les autres événements de l'année, puis les chiffres qui comptent et leur sens. */
export type Brief = { label: string; value: string; trend: 'up' | 'down' | 'flat'; good: boolean | null }

export function briefs(s: YearState, prev: YearState | undefined, events: EventDef[]): Brief[] {
  const trend = (now: number, before: number | undefined, eps: number): Brief['trend'] => (before === undefined || Math.abs(now - before) < eps ? 'flat' : now > before ? 'up' : 'down')
  const figure = (label: string, now: number, before: number | undefined, show: string, goodWhenUp: boolean, eps = 0.0005): Brief => {
    const t = trend(now, before, eps)
    return { label, value: show, trend: t, good: t === 'flat' ? null : (t === 'up') === goodWhenUp }
  }
  return [
    ...events.slice(1, 3).map((e) => ({ label: `${e.icon} ${e.label}`, value: '', trend: 'flat' as const, good: null })),
    figure('Chômage', s.unemployment, prev?.unemployment, p1(s.unemployment), false),
    figure('Prix', s.inflation, prev?.inflation, `${p1(s.inflation)} sur un an`, false),
    figure('Croissance', s.growth, prev?.growth, p1(s.growth), true),
    figure('Dette', s.debtRatio, prev?.debtRatio, `${num(s.debtRatio * 100, 0)} % du PIB`, false, 0.005),
    figure('Baril', s.oil, prev?.oil, `${num(s.oil, 0)} $`, false, 1),
  ]
}

/** Le dessin du jour : deux personnages commentent l'actualité (le premier sujet brûlant trouvé). */
export function cartoon(s: YearState, start: YearState): { them: string; you: string } {
  const quips: [boolean, string, string][] = [
    [s.debtCrisis || s.marketStress > 0.7, 'Il faut rassurer les marchés, Monsieur le Président !', 'Je leur ai fait livrer des fleurs.'],
    [s.discontent > 0.6, 'Ils sont des millions dans la rue !', 'Parfait, ça leur fait faire du sport.'],
    [s.inflation > 0.04, 'Le caddie coûte un bras.', 'Proposez-leur de payer en trois fois.'],
    [s.unemployment > 0.09, 'Le chômage explose !', 'Qu’ils traversent la rue. Il paraît qu’en face, il y a une autre file d’attente.'],
    [s.temperature > 1.9 || s.climateDamage > 0.01, 'Il fait 46 °C à Paris…', 'Excellente nouvelle pour le tourisme balnéaire.'],
    [s.evasion > 0.05, 'Les grandes fortunes partent en Belgique.', 'On dit que les frites y sont meilleures.'],
    [s.debtRatio > 1.35, 'La dette atteint des records !', 'Un cadeau pour nos petits-enfants. Ils adorent les surprises.'],
    [s.deficit / s.gdp < 0.02, 'Les comptes sont presque à l’équilibre !', 'Chut ! Si Bruxelles l’apprend, ils vont croire qu’on est malades.'],
    [s.growth > 0.02, 'La croissance repart !', 'Notez la date : ça n’arrive pas souvent.'],
    [s.poverty < start.poverty - 0.01, 'La pauvreté recule.', 'Ne le dites pas trop fort, les sondages vont croire à une erreur.'],
  ]
  const hit = quips.find(([when]) => when)
  return hit ? { them: hit[1], you: hit[2] } : { them: 'Alors, comment va le pays ?', you: 'Il tourne. Lentement, mais il tourne.' }
}

/** La une quand la politique fait l'actualité : censure, 49.3, référendum, dissolution, législatives. */
export function politicsHeadline(p: Politics, year: number): Headline | null {
  const h = (kicker: string, title: string, subtitle: string, tone: Headline['tone'], art: Art): Headline => ({ year, kicker, title, subtitle, tone, art })
  const m = majorityOf(p.seats)
  if (p.censured.includes(year)) {
    return h('Assemblée nationale', 'Censure ! Le gouvernement est renversé', 'Le 49.3 de trop : la motion de censure est adoptée, la réforme est rejetée. Un nouveau gouvernement est nommé.', 'bad', 'hemicycle')
  }
  const vote = p.referendums.find((r) => r.year === year)
  if (vote) {
    return vote.won
      ? h('Référendum', `Le oui l’emporte avec ${num(vote.yes, 1)} %`, 'Les Français approuvent les réformes du gouvernement : elles s’appliquent dès cette année.', 'good', 'urne')
      : h('Référendum', `Le non l’emporte avec ${num(100 - vote.yes, 1)} %`, 'Désaveu pour le président : les réformes sont rejetées, et son autorité en sort affaiblie.', 'bad', 'urne')
  }
  if (p.dissolutions.includes(year)) {
    return h('Dissolution', `${MAJORITY_LABEL[m]} : ${p.seats} sièges pour le camp présidentiel`, m === 'absolue' ? 'Le pari du président est gagné : il a les mains libres.' : m === 'cohabitation' ? 'Le pari a échoué : l’opposition contrôle l’Assemblée.' : 'Pas de majorité claire : il faudra négocier chaque texte.', m === 'cohabitation' ? 'bad' : m === 'absolue' ? 'good' : 'neutral', 'urne')
  }
  if (p.forced.includes(year)) {
    return h('Assemblée nationale', '49.3 : le gouvernement passe en force', 'La motion de censure échoue de peu. L’opposition dénonce un « déni de démocratie ».', 'neutral', 'hemicycle')
  }
  return null
}
