import { random } from '../model/events'
import { shuffled } from './cards'

/**
 * La conjoncture : chaque année, une carte « contexte » est retournée avant de jouer, la même pour les deux présidents.
 * Elle est réelle : la plupart déclenchent un événement du modèle dans les deux France (récession, hausse des taux…).
 * Elle change aussi la partie : certaines mesures coûtent moins (ou plus) d'énergie, la marge budgétaire bouge,
 * les crises coûtent plus cher, on pioche une carte de plus… La bonne carte n'est donc pas la même d'une année à l'autre.
 */

export type ContextId =
  | 'recession'
  | 'oil-glut'
  | 'ecb-hike'
  | 'europeennes'
  | 'general-strike'
  | 'china-boom'
  | 'war-europe'
  | 'bruxelles'
  | 'world-cup'
  | 'ai-boom'
  | 'eu-support'
  | 'heatwave'

export type ContextDef = {
  name: string
  art: string
  /** Ce qui se passe, et ce que ça change à la partie (en clair, pour la carte). */
  text: string
  rule: string
  /** L'événement du modèle déclenché dans les deux France (ou rien : une conjoncture purement politique). */
  event?: string
  /** Les mesures de ces domaines coûtent `delta` ⚡ de plus (ou de moins). */
  domains?: { names: string[]; delta: number }
  /** Les crises coûtent `crisis` ⚡ de plus. */
  crisis?: number
  /** La marge budgétaire de l'année bouge de tant de Md€. */
  margin?: number
  /** La popularité compte double dans l'énergie de l'année. */
  popularity?: number
  /** Des cartes piochées en plus. */
  draw?: number
}

export const CONTEXTS: Record<ContextId, ContextDef> = {
  recession: {
    name: 'Récession en Europe',
    art: '📉',
    text: 'Les partenaires de la France freinent : la croissance mondiale perd 3,5 points cette année.',
    rule: 'Relancer passe mieux : mesures Économie et Emploi −1 ⚡.',
    event: 'recession',
    domains: { names: ['Économie', 'Emploi'], delta: -1 },
  },
  'oil-glut': {
    name: 'Pétrole bon marché',
    art: '🛢️',
    text: 'Le baril perd 30 $ : les prix baissent, les recettes de TVA sur l’énergie aussi.',
    rule: 'Marge budgétaire +5 Md€, mais le climat n’est plus urgent : mesures Énergie & climat +1 ⚡.',
    event: 'oil-glut',
    margin: 5,
    domains: { names: ['Énergie & climat'], delta: 1 },
  },
  'ecb-hike': {
    name: 'La BCE remonte ses taux',
    art: '🏦',
    text: 'Les taux directeurs prennent 2 points : la dette coûte plus cher à refinancer, pendant trois ans.',
    rule: 'Dépenser devient risqué : marge budgétaire −8 Md€.',
    event: 'ecb-hike',
    margin: -8,
  },
  europeennes: {
    name: 'Élections européennes',
    art: '🗳️',
    text: 'Le pays vote : chaque président est jugé sur sa popularité.',
    rule: 'La popularité compte double dans l’énergie de l’année.',
    popularity: 2,
  },
  'general-strike': {
    name: 'Mouvement social',
    art: '✊',
    text: 'Grèves et manifestations dans tout le pays : la colère monte des deux côtés.',
    rule: 'Les gestes sociaux sont attendus : mesures Social −1 ⚡.',
    event: 'general-strike',
    domains: { names: ['Social'], delta: -1 },
  },
  'china-boom': {
    name: 'La Chine relance',
    art: '🚀',
    text: 'Pékin relance son économie : la croissance mondiale prend 1,5 point.',
    rule: 'Les recettes rentrent : marge budgétaire +10 Md€.',
    event: 'china-boom',
    margin: 10,
  },
  'war-europe': {
    name: 'Guerre aux portes de l’Europe',
    art: '⚔️',
    text: 'Le pétrole bondit de 40 $, les marchés s’inquiètent, l’Europe se serre les coudes.',
    rule: 'Union nationale : crises +1 ⚡, mesures International −1 ⚡.',
    event: 'war-europe',
    crisis: 1,
    domains: { names: ['International'], delta: -1 },
  },
  bruxelles: {
    name: 'Bruxelles surveille',
    art: '🇪🇺',
    text: 'La Commission scrute les budgets : pas de dérapage cette année.',
    rule: 'Marge budgétaire −10 Md€, mais les économies passent mieux : mesures Budget −1 ⚡.',
    margin: -10,
    domains: { names: ['Budget'], delta: -1 },
  },
  'world-cup': {
    name: 'Victoire en Coupe du monde',
    art: '🏆',
    text: 'Le pays fait la fête : la colère retombe des deux côtés.',
    rule: 'Personne n’ose gâcher la fête : crises +1 ⚡.',
    event: 'world-cup',
    crisis: 1,
  },
  'ai-boom': {
    name: 'Révolution de l’IA',
    art: '🤖',
    text: 'L’intelligence artificielle accélère la productivité, et les débats.',
    rule: 'Tout s’accélère : chacun pioche une carte de plus.',
    event: 'ai-boom',
    draw: 1,
  },
  'eu-support': {
    name: 'L’Europe accompagne',
    art: '🤝',
    text: 'Un plan européen soutient l’investissement pendant trois ans.',
    rule: 'Marge budgétaire +8 Md€.',
    event: 'eu-support',
    margin: 8,
  },
  heatwave: {
    name: 'Été caniculaire',
    art: '🥵',
    text: 'Six semaines au-delà de 40 °C : dégâts, hôpitaux saturés.',
    rule: 'Le climat devient urgent : mesures Énergie & climat −1 ⚡.',
    event: 'heatwave',
    domains: { names: ['Énergie & climat'], delta: -1 },
  },
}

/** L'ordre des conjonctures pour une partie (une par an, jamais deux fois la même dans un mandat). */
export function contextDeck(seed: number): ContextId[] {
  const ids = shuffled(Object.keys(CONTEXTS) as ContextId[], seed, 'conjoncture')
  // Une première année plutôt calme : pas de récession ni de guerre d'entrée de jeu.
  const calm = ids.findIndex((id) => !['recession', 'war-europe', 'ecb-hike'].includes(id))
  return [ids[calm], ...ids.filter((_, i) => i !== calm)].concat(shuffled(Object.keys(CONTEXTS) as ContextId[], seed + Math.floor(random(seed, 0, 'bis') * 1000), 'conjoncture-2'))
}
