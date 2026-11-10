import { random } from '../model/events'
import { isPlayable, MEASURES, type Candidate, type Pledge } from '../game/candidates'

/**
 * Les cartes du duel. Trois familles :
 * - les mesures, qui changent les leviers de sa propre France (celles du programme sont des promesses) ;
 * - les crises, qu'on déclenche dans la France de l'adversaire (ce sont les événements du modèle) ;
 * - les cartes d'action : la cellule de crise (une parade), le sondage (piocher).
 * Chaque carte a un emplacement d'illustration (`art`) : un emoji pour l'instant, une image plus tard.
 */

export type CrisisId = 'financial-crisis' | 'recession' | 'trade-war' | 'ormuz' | 'ecb-hike' | 'cyberattack' | 'heatwave' | 'general-strike' | 'scandal' | 'eu-procedure'

export type CardDef =
  | { kind: 'mesure'; pledge: Pledge }
  | { kind: 'crise'; crisis: CrisisId }
  | { kind: 'action'; action: 'cellule' | 'sondage' }

export type Card = CardDef & { uid: string }

/**
 * Les crises qu'on peut envoyer à l'adversaire : leur prix en énergie suit leur gravité dans le modèle
 * (ce qu'elles font perdre à la note sur trois ans : krach ≈ 54 points, choc pétrolier ≈ 28, récession ≈ 12, grève ≈ 1).
 */
export const CRISES: Record<CrisisId, { name: string; art: string; cost: number; text: string }> = {
  'financial-crisis': { name: 'Krach financier', art: '📉', cost: 8, text: 'Les banques vacillent, le crédit se ferme : récession et panique sur la dette pendant deux ans.' },
  recession: { name: 'Récession', art: '🏚️', cost: 4, text: 'La croissance de ses partenaires s’effondre : son PIB recule.' },
  'trade-war': { name: 'Guerre commerciale', art: '🚢', cost: 3, text: 'Des droits de douane frappent ses exportations pendant trois ans.' },
  ormuz: { name: 'Choc pétrolier', art: '🛢️', cost: 6, text: 'Le baril bondit de 88 $ : inflation et pouvoir d’achat en berne.' },
  'ecb-hike': { name: 'Hausse des taux', art: '🏦', cost: 3, text: 'Sa dette coûte de plus en plus cher à refinancer, trois ans de suite.' },
  cyberattack: { name: 'Cyberattaque', art: '💻', cost: 1, text: 'Hôpitaux et administrations paralysés : l’activité recule, la colère monte.' },
  heatwave: { name: 'Canicule', art: '🥵', cost: 1, text: 'Six semaines au-delà de 40 °C : dégâts, hôpitaux saturés.' },
  'general-strike': { name: 'Grève générale', art: '✊', cost: 1, text: 'Le pays est bloqué : la colère monte, l’activité ralentit.' },
  scandal: { name: 'Scandale d’État', art: '🗞️', cost: 2, text: 'Une affaire éclabousse son gouvernement : sa popularité plonge.' },
  'eu-procedure': { name: 'Sanction de Bruxelles', art: '🇪🇺', cost: 2, text: 'Procédure pour déficit excessif : les marchés s’inquiètent.' },
}

export const ACTIONS = {
  cellule: {
    name: 'Cellule de crise',
    art: '🛡️',
    cost: 2,
    text: 'Gardez-la en main : quand l’adversaire vous envoie une crise, elle la pare sur-le-champ (si vous avez encore 2 ⚡).',
    short: 'Pare une crise, quand elle arrive.',
  },
  sondage: { name: 'Sondage', art: '📊', cost: 1, text: 'Piochez deux cartes.', short: 'Piochez deux cartes.' },
} as const

const DOMAIN_ART: Record<string, string> = {
  Budget: '💶',
  Social: '🤝',
  Emploi: '👷',
  'Services publics': '🏥',
  Économie: '🏭',
  International: '🌍',
  'Énergie & climat': '⚡',
}

export const PROGRAMME_SIZE = 5

/** L'illustration d'une carte (un emoji pour l'instant). */
export function cardArt(c: CardDef): string {
  if (c.kind === 'crise') {
    return CRISES[c.crisis].art
  }
  if (c.kind === 'action') {
    return ACTIONS[c.action].art
  }
  return DOMAIN_ART[c.pledge.measure!.domain] ?? '📜'
}

export function cardName(c: CardDef): string {
  return c.kind === 'crise' ? CRISES[c.crisis].name : c.kind === 'action' ? ACTIONS[c.action].name : c.pledge.measure!.name
}

/** Une mesure générale (hors programme), avec son montant par défaut. */
const generic = (id: string): Pledge => {
  const m = MEASURES[id]
  return { key: `mesure-${id}`, measure: m, amount: null, quote: m.summary, source: '' }
}

/** Les mesures que le moteur sait jouer. */
export const PLAYABLE_MEASURES = Object.values(MEASURES).filter((m) => m.effects.length > 0 && m.effects.every((e) => e.lever !== 'cancelHolder'))

/** Un tirage reproductible dans une liste. */
export function shuffled<T>(items: T[], seed: number, salt: string): T[] {
  return items.map((item, i) => ({ item, r: random(seed, i, salt) })).sort((a, b) => a.r - b.r).map((x) => x.item)
}

/**
 * Le programme : cinq promesses. Celles du candidat (les premières que le moteur sait jouer), complétées si besoin
 * par des mesures tirées au sort (signalées : `added`) ; pour le bot, cinq mesures tirées au sort.
 */
export function programmeOf(candidate: Candidate | null, seed: number, salt: string): Pledge[] {
  const own = candidate ? candidate.promises.filter(isPlayable).filter((p) => p.measure!.effects.every((e) => e.lever !== 'cancelHolder')).slice(0, PROGRAMME_SIZE) : []
  const taken = new Set(own.map((p) => p.measure!.id))
  const extra = shuffled(
    PLAYABLE_MEASURES.filter((m) => !taken.has(m.id)),
    seed,
    `${salt}:programme`,
  )
    .slice(0, PROGRAMME_SIZE - own.length)
    .map((m) => ({ ...generic(m.id), key: `${salt}-ajout-${m.id}`, source: candidate ? 'ajout' : '' }))
  return [...own, ...extra]
}

/** Une promesse ajoutée par le jeu pour compléter un programme trop court. */
export const isAdded = (p: Pledge) => p.source === 'ajout'

const RARE: CrisisId[] = ['financial-crisis', 'ormuz']
const CRISIS_DECK: CrisisId[] = ['financial-crisis', 'recession', 'trade-war', 'ormuz', 'ecb-hike', 'cyberattack', 'heatwave', 'general-strike', 'scandal', 'eu-procedure']

/** Le haut de la pioche, où sont mêlées les promesses des deux joueurs : les deux mains de départ et les trois premières pioches. */
const TOP = 22

/**
 * La pioche commune (un nombre fini de cartes) : les promesses des deux programmes, quatorze mesures générales,
 * chaque crise en double (sauf le krach et le choc pétrolier), quatre cellules de crise et trois sondages. Mélangée avec la graine de la partie.
 */
export function buildDeck(programmes: Pledge[][], seed: number): Card[] {
  const taken = new Set(programmes.flat().map((p) => p.measure!.id))
  const others = shuffled(
    PLAYABLE_MEASURES.filter((m) => !taken.has(m.id)),
    seed,
    'mesures',
  ).slice(0, 14)
  const promises: CardDef[] = programmes.flat().map((pledge) => ({ kind: 'mesure' as const, pledge }))
  const rest: CardDef[] = shuffled(
    [
      ...others.map((m) => ({ kind: 'mesure' as const, pledge: generic(m.id) })),
      // Chaque crise en double, sauf les deux plus dévastatrices : des cartes rares.
      ...[...CRISIS_DECK, ...CRISIS_DECK.filter((c) => !RARE.includes(c))].map((crisis) => ({ kind: 'crise' as const, crisis })),
      ...(['cellule', 'cellule', 'cellule', 'cellule', 'sondage', 'sondage', 'sondage'] as const).map((action) => ({ kind: 'action' as const, action })),
    ],
    seed,
    'reste',
  )
  // Les promesses sont mêlées aux premières cartes : on les a toutes vues vers la 4e année (le hasard décide qui les pioche).
  const top = shuffled([...promises, ...rest.slice(0, TOP - promises.length)], seed, 'haut')
  return [...top, ...rest.slice(TOP - promises.length)].map((d, i) => ({ ...d, uid: `carte-${i}` }))
}
