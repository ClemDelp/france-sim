import { random } from '../model/events'
import { isPlayable, MEASURES, type Candidate, type Pledge } from '../game/candidates'

/**
 * Les cartes du duel. Trois familles :
 * - les mesures, qui changent les leviers de sa propre France (celles du programme sont des promesses) ;
 * - les coups contre l'adversaire : crises (des événements du modèle), scandales, et coups politiques (qui changent la partie) ;
 * - les cartes d'action : les parades (cellule de crise, commission d'enquête, communication de crise, Conseil constitutionnel),
 *   les coups de pouce (sondage, discours, remaniement…), les événements qu'on se fait à soi (JO, selfie…) et les cartes légendaires.
 * Tout ce qui touche l'économie ou la société passe par le modèle (un événement ou un levier) ; le reste ne change que la partie.
 * Chaque carte a un emplacement d'illustration (`art`) : un emoji pour l'instant, une image plus tard.
 */

export type CrisisId =
  | 'financial-crisis'
  | 'recession'
  | 'trade-war'
  | 'ormuz'
  | 'ecb-hike'
  | 'cyberattack'
  | 'heatwave'
  | 'general-strike'
  | 'scandal'
  | 'eu-procedure'
  | 'rail-strike'
  | 'gaffe'
  | 'bregancon'
  | 'mustard'
  | 'fuite'
  | 'motion'
  | 'debauchage'

export type ActionId =
  | 'cellule'
  | 'commission'
  | 'communication'
  | 'conseil'
  | 'sondage'
  | 'remaniement'
  | 'discours'
  | 'sondage-truque'
  | '49-3'
  | 'coupe-du-monde'
  | 'jo'
  | 'panda'
  | 'tweet'
  | 'fromage'
  | 'referendum'
  | 'dissolution'
  | 'relance-ue'
  | 'ippon'
  | 'alignement'

export type CardDef = { kind: 'mesure'; pledge: Pledge } | { kind: 'crise'; crisis: CrisisId } | { kind: 'action'; action: ActionId }

export type Card = CardDef & { uid: string }

/** Une carte commune, rare (une seule dans la pioche) ou légendaire (un coup de théâtre, une seule aussi). */
export type Rarity = 'commune' | 'rare' | 'legendaire'

/** Ce qui peut parer un coup : une crise (cellule de crise), un scandale (cellule ou commission d'enquête), un coup politique (rien). */
export type Family = 'crise' | 'scandale' | 'politique'

export type CrisisDef = {
  name: string
  art: string
  cost: number
  text: string
  family: Family
  rarity?: Rarity
  /** L'événement du modèle qui frappe la France d'en face (par défaut, celui qui porte le même nom), ou null : un coup qui ne change que la partie. */
  event?: string | null
  /** Ce que le coup fait à la partie (pour les coups sans événement). */
  rule?: string
  /** Une petite phrase pour rire, en italique sous le nom. */
  tagline?: string
}

/**
 * Les coups qu'on porte à l'adversaire : leur prix en énergie suit leur gravité dans le modèle
 * (ce qu'elles font perdre à la note sur trois ans : krach ≈ 54 points, choc pétrolier ≈ 28, récession ≈ 12, grève ≈ 1).
 */
export const CRISES: Record<CrisisId, CrisisDef> = {
  'financial-crisis': { name: 'Krach financier', art: '📉', cost: 8, family: 'crise', rarity: 'rare', tagline: 'Lehman Brothers a un petit cousin.', text: 'Les banques vacillent, le crédit se ferme : récession et panique sur la dette pendant deux ans.' },
  recession: { name: 'Récession', art: '🏚️', cost: 4, family: 'crise', tagline: 'Les courbes font la sieste.', text: 'La croissance de ses partenaires s’effondre : son PIB recule.' },
  'trade-war': { name: 'Guerre commerciale', art: '🚢', cost: 3, family: 'crise', tagline: 'Les conteneurs boudent.', text: 'Des droits de douane frappent ses exportations pendant trois ans.' },
  ormuz: { name: 'Choc pétrolier', art: '🛢️', cost: 6, family: 'crise', rarity: 'rare', tagline: 'Le plein à 3 € le litre.', text: 'Le baril bondit de 88 $ : inflation et pouvoir d’achat en berne.' },
  'ecb-hike': { name: 'Hausse des taux', art: '🏦', cost: 3, family: 'crise', tagline: 'Francfort a mal dormi.', text: 'Sa dette coûte de plus en plus cher à refinancer, trois ans de suite.' },
  cyberattack: { name: 'Cyberattaque', art: '💻', cost: 1, family: 'crise', tagline: 'Avez-vous essayé de redémarrer ?', text: 'Hôpitaux et administrations paralysés : l’activité recule, la colère monte.' },
  heatwave: { name: 'Canicule', art: '🥵', cost: 1, family: 'crise', tagline: 'Même les ventilateurs sont en grève.', text: 'Six semaines au-delà de 40 °C : dégâts, hôpitaux saturés.' },
  'general-strike': { name: 'Grève générale', art: '✊', cost: 1, family: 'crise', tagline: 'Rendez-vous à Bastille, 14 h.', text: 'Le pays est bloqué : la colère monte, l’activité ralentit.' },
  'rail-strike': { name: 'Grève SNCF', art: '🚆', cost: 1, family: 'crise', tagline: 'Votre train est supprimé. Merci de votre compréhension.', text: 'Pendant les vacances : trains supprimés le week-end des départs, vacanciers furieux, un peu d’activité perdue.' },
  mustard: { name: 'Pénurie de moutarde', art: '🌭', cost: 1, family: 'crise', tagline: 'Un hot-dog sans moutarde, c’est triste.', text: 'Rayons vides, prix doublés : un petit coup de chaud sur les prix, et le pays râle.' },
  scandal: { name: 'Scandale d’État', art: '🗞️', cost: 2, family: 'scandale', tagline: '« Je n’étais pas au courant. »', text: 'Une affaire éclabousse son gouvernement : sa popularité plonge.' },
  gaffe: { name: 'Petite phrase de trop', art: '🎤', cost: 2, family: 'scandale', tagline: 'Le micro était ouvert.', text: '« Traverser la rue », « pognon de dingue » : sa phrase tourne en boucle, −8 points de popularité.' },
  bregancon: { name: 'Vacances à Brégançon', art: '🏖️', cost: 1, family: 'scandale', tagline: 'La piscine était déjà payée.', text: 'Jet-ski au fort de Brégançon en pleine crise, pendant que le pays souffre : −5 points de popularité.' },
  'eu-procedure': { name: 'Sanction de Bruxelles', art: '🇪🇺', cost: 2, family: 'crise', tagline: 'Bruxelles a sorti la calculette.', text: 'Procédure pour déficit excessif : les marchés s’inquiètent.' },
  fuite: {
    name: 'Fuite au Canard enchaîné',
    art: '🦆',
    cost: 2,
    family: 'scandale',
    event: null,
    tagline: 'Coin coin.',
    text: 'Son projet secret fuite dans la presse mercredi : il doit l’abandonner.',
    rule: 'L’adversaire défausse une carte de sa main, au hasard.',
  },
  motion: {
    name: 'Motion de censure',
    art: '🏛️',
    cost: 3,
    family: 'politique',
    event: null,
    tagline: 'Le perchoir tremble.',
    text: 'L’opposition dépose une motion de censure : son gouvernement passe l’année à se défendre.',
    rule: 'L’adversaire vote une loi de moins cette année. Sous 35 % de popularité, la motion passe : −1 ⚡ et son gouvernement tombe (une crise politique dans le modèle : les taux montent).',
  },
  debauchage: {
    name: 'Débauchage d’un ministre',
    art: '🕴️',
    cost: 3,
    family: 'politique',
    rarity: 'rare',
    event: null,
    tagline: 'Il a emporté l’agrafeuse.',
    text: 'Un de ses ministres rejoint votre camp, avec ses dossiers.',
    rule: 'Vous prenez une carte au hasard dans sa main.',
  },
}

/** L'événement du modèle derrière un coup (ou null : un coup qui ne change que la partie). */
export const crisisEvent = (id: CrisisId): string | null => (CRISES[id].event === undefined ? id : CRISES[id].event!)

export type ActionDef = {
  name: string
  art: string
  cost: number
  /** Le texte de la carte en grand, et en une ligne pour la main. */
  text: string
  short: string
  rarity?: Rarity
  /** Une parade : elle se joue en réponse à un coup (`coup`) ou à une loi de l'adversaire (`loi`), jamais pendant son tour. */
  reaction?: 'coup' | 'loi'
  /** Les événements du modèle qu'elle déclenche dans sa propre France (le tweet tire l'un des deux au hasard). */
  events?: string[]
  /** Une dépense d'un an (Md€ sur un levier), défaite l'année suivante. */
  spend?: { lever: 'otherServices'; amount: number }
  /** Le coup signature d'un candidat : la carte n'est dans la pioche que s'il joue (n'importe qui peut la piocher). */
  signature?: string
  /** Une petite phrase pour rire, en italique sous le nom. */
  tagline?: string
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  cellule: {
    name: 'Cellule de crise',
    art: '🛡️',
    cost: 2,
    reaction: 'coup',
    tagline: 'Personne ne panique. Sauf le stagiaire.',
    text: 'Gardez-la en main : quand l’adversaire vous envoie une crise ou un scandale, elle le pare sur-le-champ (si vous avez encore 2 ⚡).',
    short: 'Pare une crise ou un scandale.',
  },
  commission: {
    name: 'Commission d’enquête',
    art: '🔎',
    cost: 1,
    reaction: 'coup',
    tagline: 'Audition à huis clos, compte rendu dans Le Monde.',
    text: 'Gardez-la en main : quand un scandale vous vise (affaire, petite phrase, fuite, vacances mal choisies), l’enquête le désamorce.',
    short: 'Pare un scandale.',
  },
  communication: {
    name: 'Communication de crise',
    art: '📣',
    cost: 1,
    reaction: 'coup',
    tagline: 'Éléments de langage prêts.',
    text: 'Gardez-la en main : quand une crise ou un scandale vous frappe, une communication bien menée en divise les effets par deux.',
    short: 'Une crise à moitié.',
  },
  conseil: {
    name: 'Conseil constitutionnel',
    art: '⚖️',
    cost: 2,
    rarity: 'rare',
    reaction: 'loi',
    tagline: 'Neuf sages, zéro sourire.',
    text: 'Gardez-le en main : quand l’adversaire fait voter une loi, vous saisissez le Conseil, qui la censure. La loi tombe, et sa place de l’année est perdue.',
    short: 'Censure une loi adverse.',
  },
  sondage: { name: 'Sondage', art: '📊', cost: 1, tagline: 'Marge d’erreur : ± tout.', text: 'Piochez deux cartes.', short: 'Piochez deux cartes.' },
  remaniement: {
    name: 'Remaniement',
    art: '🔄',
    cost: 1,
    tagline: 'Nouvelle photo de famille.',
    text: 'Nouveau gouvernement, nouvelles idées : défaussez toute votre main et piochez autant de cartes.',
    short: 'Toute votre main change.',
  },
  discours: { name: 'Discours au 20 h', art: '📺', cost: 0, tagline: 'Bonsoir à toutes et à tous.', text: 'Le pays vous écoute : +1 ⚡ tout de suite.', short: '+1 ⚡ tout de suite.' },
  'sondage-truque': {
    name: 'Sondage truqué',
    art: '🕵️',
    cost: 1,
    rarity: 'rare',
    tagline: 'Échantillon : trois cousins.',
    text: 'Un institut « ami » vous renseigne : vous voyez la main de l’adversaire jusqu’à la fin de l’année.',
    short: 'Voyez sa main cette année.',
  },
  '49-3': {
    name: '49.3',
    art: '📜',
    cost: 1,
    rarity: 'rare',
    events: ['force-493'],
    tagline: 'Débat ? Quel débat ?',
    text: 'Vous engagez la responsabilité du gouvernement : une loi de plus cette année, sans vote. La colère monte, d’autant plus que le pays est déjà en colère.',
    short: 'Une loi de plus cette année.',
  },
  'coupe-du-monde': {
    name: 'Victoire en Coupe du monde',
    art: '🏆',
    cost: 2,
    rarity: 'rare',
    events: ['world-cup'],
    tagline: 'On est champions ! (bis)',
    text: 'Les Bleus sont champions du monde, vous êtes dans la tribune : le pays fait la fête, la colère retombe.',
    short: 'La colère retombe.',
  },
  jo: {
    name: 'Jeux olympiques à Paris',
    art: '🏅',
    cost: 2,
    events: ['olympics'],
    spend: { lever: 'otherServices', amount: 3 },
    tagline: 'Plongeon dans la Seine offert.',
    text: 'Les Jeux attirent visiteurs et chantiers : un peu de croissance et de fierté, mais 3 Md€ d’argent public cette année.',
    short: 'Croissance et fierté, 3 Md€.',
  },
  panda: { name: 'Selfie avec un panda', art: '🐼', cost: 1, events: ['panda-selfie'], tagline: 'Il s’appelle Yuan Meng.', text: 'Vous posez avec un bébé panda : le pays craque. Rien d’autre ne change.', short: '+3 points de popularité.' },
  tweet: {
    name: 'Tweet à 3 h du matin',
    tagline: 'Envoyé depuis mon lit.',
    art: '🐦',
    cost: 1,
    events: ['tweet-up', 'tweet-down'],
    text: 'Un message nocturne, sans relecture : drôle et juste (+5 points de popularité), ou rageur et faux (−5). Pile ou face.',
    short: '±5 points de popularité.',
  },
  fromage: {
    name: 'Défendre le fromage AOP',
    art: '🧀',
    cost: 1,
    events: ['cheese-war'],
    tagline: 'Touche pas à mon roquefort.',
    text: 'Washington taxe le roquefort, vous ripostez : quelques exportations perdues, mais le pays fait bloc derrière vous.',
    short: 'Un peu d’export perdu, +5 de popularité.',
  },
  referendum: {
    name: 'Référendum',
    art: '🗳️',
    cost: 2,
    rarity: 'legendaire',
    tagline: 'Oui, non, peut-être.',
    text: 'Vous soumettez au peuple votre dernière loi de l’année. Au-dessus de 50 % de popularité, c’est oui : son effet double. Sinon, c’est un désaveu : −15 points de popularité.',
    short: 'Double une loi… ou désaveu.',
  },
  dissolution: {
    name: 'Dissolution',
    art: '💥',
    cost: 3,
    rarity: 'legendaire',
    events: ['dissolution'],
    tagline: 'Retour aux urnes, tout le monde.',
    text: 'Vous dissolvez l’Assemblée : les deux présidents remettent leur main dans la pioche et repiochent autant de cartes. Les urnes décident (plus vous êtes populaire, plus vous avez de chances) : +8 ou −8 points de popularité, et la crise politique fait monter les taux.',
    short: 'Tout le monde repioche. Quitte ou double.',
  },
  'relance-ue': {
    name: 'Plan de relance européen',
    art: '🇪🇺',
    cost: 2,
    rarity: 'legendaire',
    events: ['eu-support'],
    tagline: 'Merci qui ? Merci l’Europe.',
    text: 'Vous arrachez un emprunt européen commun : +20 Md€ de marge budgétaire cette année, et de l’investissement pendant trois ans.',
    short: '+20 Md€ de marge.',
  },
  ippon: {
    name: 'Ippon !',
    art: '🥋',
    cost: 2,
    rarity: 'rare',
    reaction: 'coup',
    signature: 'teddy',
    tagline: 'Hajime… et c’est fini.',
    text: 'Gardez-la en main : quand une crise ou un scandale vous vise, vous le saisissez et le projetez sur l’envoyeur. C’est sa France qui le prend.',
    short: 'Renvoie un coup à l’envoyeur.',
  },
  alignement: {
    name: 'Alignement cosmique',
    art: '🪐',
    cost: 1,
    rarity: 'rare',
    signature: 'durif',
    events: ['cosmic-harmony', 'cosmic-eclipse'],
    tagline: 'Les astres ne votent pas le budget.',
    text: 'Les planètes s’alignent au-dessus de l’Élysée. Le plus souvent, le pays se sent en harmonie (la colère retombe) ; parfois, c’est l’éclipse (elle monte un peu). 6 chances sur 10.',
    short: 'Harmonie (6/10) ou éclipse.',
  },
}

/** La petite phrase d'une carte (en italique sous le nom), s'il y en a une. */
export const taglineOf = (c: CardDef): string | undefined => (c.kind === 'crise' ? CRISES[c.crisis].tagline : c.kind === 'action' ? ACTIONS[c.action].tagline : undefined)

/** Le coup signature d'un candidat, s'il en a un. */
export const signatureOf = (candidateId: string | null | undefined): ActionId | null =>
  (Object.keys(ACTIONS) as ActionId[]).find((a) => candidateId && ACTIONS[a].signature === candidateId) ?? null

/** La rareté d'une carte (les mesures et les promesses sont communes). */
export const rarityOf = (c: CardDef): Rarity => (c.kind === 'crise' ? (CRISES[c.crisis].rarity ?? 'commune') : c.kind === 'action' ? (ACTIONS[c.action].rarity ?? 'commune') : 'commune')

/** Une carte qui passe par le modèle (un levier ou un événement) ; les autres ne changent que la partie. */
export function inModel(c: CardDef): boolean {
  if (c.kind === 'mesure') {
    return true
  }
  return c.kind === 'crise' ? crisisEvent(c.crisis) !== null : !!(ACTIONS[c.action].events?.length || ACTIONS[c.action].spend)
}

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

/** Combien de chaque coup et de chaque action dans la pioche (les rares et les légendaires : un seul). */
const CRISIS_COUNT: Record<CrisisId, number> = {
  'financial-crisis': 1,
  recession: 2,
  'trade-war': 2,
  ormuz: 1,
  'ecb-hike': 2,
  cyberattack: 2,
  heatwave: 2,
  'general-strike': 2,
  'rail-strike': 2,
  mustard: 1,
  scandal: 2,
  gaffe: 2,
  bregancon: 1,
  'eu-procedure': 2,
  fuite: 2,
  motion: 1,
  debauchage: 1,
}

const ACTION_COUNT: Record<ActionId, number> = {
  cellule: 3,
  commission: 2,
  communication: 2,
  conseil: 1,
  sondage: 2,
  remaniement: 1,
  discours: 2,
  'sondage-truque': 1,
  '49-3': 1,
  'coupe-du-monde': 1,
  jo: 1,
  panda: 1,
  tweet: 1,
  fromage: 1,
  referendum: 1,
  dissolution: 1,
  'relance-ue': 1,
  // Les coups signature : seulement quand leur candidat joue (voir buildDeck).
  ippon: 0,
  alignement: 0,
}

/** Combien d'exemplaires du coup signature de chaque candidat en lice. */
const SIGNATURE_COUNT = 2

/** Les mesures générales mises dans la pioche, en plus des deux programmes. */
const GENERIC_MEASURES = 16

/** Le haut de la pioche, où sont mêlées les promesses des deux joueurs : les deux mains de départ et les trois premières pioches. */
const TOP = 22

const times = <T>(n: number, x: T): T[] => Array.from({ length: n }, () => x)

/**
 * La pioche commune (un nombre fini de cartes) : les promesses des deux programmes, seize mesures générales,
 * les coups contre l'adversaire et les cartes d'action (les rares et les légendaires en un seul exemplaire). Mélangée avec la graine de la partie.
 */
export function buildDeck(programmes: Pledge[][], seed: number, candidates: (string | null)[] = []): Card[] {
  const taken = new Set(programmes.flat().map((p) => p.measure!.id))
  const others = shuffled(
    PLAYABLE_MEASURES.filter((m) => !taken.has(m.id)),
    seed,
    'mesures',
  ).slice(0, GENERIC_MEASURES)
  const signatures: CardDef[] = candidates.flatMap((id) => {
    const action = signatureOf(id)
    return action ? times<CardDef>(SIGNATURE_COUNT, { kind: 'action', action }) : []
  })
  // Les coups signature sont mêlés aux promesses, en haut de la pioche : on les voit tôt dans la partie.
  const promises: CardDef[] = [...programmes.flat().map((pledge) => ({ kind: 'mesure' as const, pledge })), ...signatures]
  const rest: CardDef[] = shuffled(
    [
      ...others.map((m) => ({ kind: 'mesure' as const, pledge: generic(m.id) })),
      ...(Object.keys(CRISIS_COUNT) as CrisisId[]).flatMap((crisis) => times<CardDef>(CRISIS_COUNT[crisis], { kind: 'crise', crisis })),
      ...(Object.keys(ACTION_COUNT) as ActionId[]).flatMap((action) => times<CardDef>(ACTION_COUNT[action], { kind: 'action', action })),
    ],
    seed,
    'reste',
  )
  // Les promesses sont mêlées aux premières cartes : on les a toutes vues vers la 4e année (le hasard décide qui les pioche).
  const top = shuffled([...promises, ...rest.slice(0, TOP - promises.length)], seed, 'haut')
  return [...top, ...rest.slice(TOP - promises.length)].map((d, i) => ({ ...d, uid: `carte-${i}` }))
}
