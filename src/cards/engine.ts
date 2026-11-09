import { BASE_POLICY } from '../model/calibration'
import { random, rollEvents } from '../model/events'
import { policyAt, simulate } from '../model/sim'
import type { Decision, FiredEvent, Policy, YearState } from '../model/types'
import { isPlayable, promisePatch, promiseRemaining, type Candidate, type Pledge } from '../game/candidates'
import { eventsBeforeMandate, MANDATE_END, MANDATE_START } from '../game/mandate'
import { afterPresidential, CENSURE_CHANCE, majorityOf, MAJORITY_CAPITAL, START_POLITICS, type Politics } from '../game/parliament'
import { politicalCapital } from '../game/capital'
import { popularity } from '../game/score'
import { planCost } from '../game/session'

/**
 * « Élysée », le duel de cartes : deux candidats s'affrontent, d'abord en campagne (des promesses et des coups),
 * puis l'un gouverne et l'autre s'oppose pendant cinq ans, jusqu'à la présidentielle de 2032.
 * Les promesses sont celles des programmes (modele/promesses.csv) : en campagne, le modèle dit ce qu'elles rapportent
 * en voix et coûtent au budget ; au pouvoir, elles deviennent de vraies décisions, et le modèle fait vivre la France.
 * Le hasard est reproductible : une graine donne toujours la même partie.
 */

export type Side = 'player' | 'ai'
export type Role = 'campagne' | 'president' | 'opposition'
export type Phase = 'campagne' | 'mandat' | 'fin'

export type TacticId = 'meeting' | 'debat' | 'chiffrage' | 'fuite' | 'ralliement' | 'contre-feu' | 'communication' | 'remaniement' | '493' | 'greve' | 'censure' | 'revelations'

export type Card = { uid: string; tactic: TacticId }

export type Seat = {
  candidate: Candidate
  /** L'élan : ce que la campagne et les coups ont fait gagner en voix (en points, cumulés). */
  elan: number
  /** Ce que coûtent au budget les promesses annoncées (Md€ par an, selon le modèle) : la cible des attaques sur le chiffrage. */
  exposure: number
  /** Les promesses encore en main. */
  programme: Pledge[]
  /** Les promesses annoncées pendant la campagne (le président qui ne les tient pas le paiera). */
  announced: Pledge[]
  /** Les promesses appliquées par le président. */
  applied: Pledge[]
  hand: Card[]
  deck: TacticId[]
  /** Le capital politique ⚡ restant ce tour-ci. */
  mana: number
  /** Le prochain coup de l'adversaire sera paré. */
  shield: boolean
  /** A fini de jouer ce tour-ci. */
  done: boolean
}

export type LogEntry = { round: number; side: Side | 'monde'; text: string; tone: 'good' | 'bad' | 'neutral' }

/** Une réforme votée ce tour-ci par le président (elle s'applique au 1er janvier). */
export type Reform = { pledge: Pledge; patch: Partial<Policy>; cost: number }

export type Game = {
  seed: number
  phase: Phase
  /** Le tour en cours : 1 à 3 en campagne, puis une année de mandat par tour. */
  round: number
  /** L'année dont on prépare les décisions. */
  year: number
  seats: Record<Side, Seat>
  president: Side | null
  politics: Politics | null
  decisions: Decision[]
  events: FiredEvent[]
  states: YearState[]
  /** Ce tour-ci : réformes du président, 49.3 engagé, motion de censure, événements provoqués par les cartes. */
  reforms: Reform[]
  forced: boolean
  censureMotion: boolean
  provoked: string[]
  /** Les mesures temporaires à défaire l'an prochain. */
  reverts: Partial<Policy>
  log: LogEntry[]
  /** Les deux élections : le score du joueur au second tour. */
  elections: { year: number; player: number; president: Side; reasons: string[] }[]
}

export const CAMPAIGN_ROUNDS = 3
const HAND_SIZE = 4
export const CAMPAIGN_LABEL = ['Automne 2026', 'Hiver 2027', 'Printemps 2027']

export const other = (side: Side): Side => (side === 'player' ? 'ai' : 'player')
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const half = (v: number) => Math.round(v * 2) / 2

export const roleOf = (g: Game, side: Side): Role => (g.phase !== 'mandat' ? 'campagne' : g.president === side ? 'president' : 'opposition')
export const lastState = (g: Game) => g.states.at(-1)!
export const presidentPopularity = (g: Game) => popularity(lastState(g))

// — Ce que le modèle dit des promesses (calculé une fois par promesse)

const baseline = (() => {
  let states: YearState[] | null = null
  return () => (states ??= simulate({ decisions: [], events: [], until: 2028 }))
})()

export type PledgeStats = {
  /** Points de popularité gagnés (ou perdus) la première année, selon le modèle. */
  popularity: number
  /** Effet sur le déficit la première année (Md€ ; positif = plus de déficit). */
  deficit: number
  /** Ce que la promesse rapporte en voix pendant la campagne. */
  appeal: number
  /** Son prix en capital politique pendant la campagne. */
  cost: number
}

const STATS = new Map<string, PledgeStats>()

export function pledgeStats(p: Pledge): PledgeStats {
  const cached = STATS.get(p.key)
  if (cached) {
    return cached
  }
  const base = baseline().at(-1)!
  const current = policyAt([], 2028)
  const { patch } = promisePatch(p, current)
  const s = simulate({ decisions: [{ year: 2028, patch }], events: [], until: 2028 }).at(-1)!
  const pop = popularity(s) - popularity(base)
  // Une promesse mobilise toujours un peu son camp ; ce que le pays en pense (selon le modèle) fait le reste.
  const stats = { popularity: pop, deficit: Math.round(s.deficit - base.deficit), appeal: clamp(half(1.5 + 0.5 * pop), -3, 4), cost: clamp(planCost(patch, current), 1, 3) }
  STATS.set(p.key, stats)
  return stats
}

// — Les cartes de tactique

export type TacticDef = {
  id: TacticId
  name: string
  icon: string
  cost: number
  text: string
  roles: Role[]
  /** Pourquoi on ne peut pas la jouer maintenant (ou null). */
  blocked?: (g: Game, side: Side) => string | null
  play: (g: Game, side: Side) => Game
}

/** Le président a-t-il voté des réformes ce tour-ci (cible de la censure). */
const reformsThisRound = (g: Game) => g.reforms.length > 0

/** Ce que l'attaque sur le chiffrage fait perdre : plus le programme (ou le déficit) dérape, plus elle porte. */
export function chiffrageDamage(g: Game, target: Side): number {
  if (roleOf(g, target) === 'president') {
    const deficit = (lastState(g).deficit / lastState(g).gdp) * 100
    return clamp(Math.round(deficit - 4), 1, 5)
  }
  return clamp(Math.round(g.seats[target].exposure / 20), 1, 5)
}

/** Un coup porté à l'adversaire, sauf s'il l'a paré. */
function hit(g: Game, side: Side, points: number, what: string): Game {
  const target = other(side)
  if (g.seats[target].shield) {
    return log(seat(g, target, { shield: false }), side, `${what}, mais ${g.seats[target].candidate.name} avait préparé un contre-feu : sans effet.`, 'neutral')
  }
  return log(seat(g, target, { elan: g.seats[target].elan - points }), side, `${what} : −${num(points)} pour ${g.seats[target].candidate.name}.`, 'bad')
}

const gain = (g: Game, side: Side, points: number, what: string) => log(seat(g, side, { elan: g.seats[side].elan + points }), side, `${what} : +${num(points)}.`, 'good')

export const TACTICS: Record<TacticId, TacticDef> = {
  meeting: { id: 'meeting', name: 'Meeting', icon: '📣', cost: 1, text: '+2 voix. Un grand rassemblement remobilise votre camp.', roles: ['campagne', 'opposition'], play: (g, s) => gain(g, s, 2, 'Meeting géant') },
  debat: {
    id: 'debat',
    name: 'Débat télévisé',
    icon: '🎤',
    cost: 2,
    text: '+2 voix, +2 de plus si son programme coûte bien plus cher que le vôtre.',
    roles: ['campagne', 'opposition', 'president'],
    play: (g, s) => gain(g, s, g.seats[other(s)].exposure > g.seats[s].exposure + 10 ? 4 : 2, g.seats[other(s)].exposure > g.seats[s].exposure + 10 ? 'Débat gagné sur les chiffres' : 'Bon débat'),
  },
  chiffrage: {
    id: 'chiffrage',
    name: 'Le chiffrage',
    icon: '🧮',
    cost: 2,
    text: 'Attaque son programme (ou le déficit, s’il gouverne) : −1 à −5 voix, selon ce que ça coûte vraiment.',
    roles: ['campagne', 'opposition', 'president'],
    play: (g, s) => {
      const target = other(s)
      const what = roleOf(g, target) === 'president' ? `« Le déficit atteint ${num((lastState(g).deficit / lastState(g).gdp) * 100)} % du PIB ! »` : `« Son programme coûte ${Math.round(g.seats[target].exposure)} Md€ par an ! »`
      return hit(g, s, chiffrageDamage(g, target), what)
    },
  },
  fuite: { id: 'fuite', name: 'Fuite dans la presse', icon: '🗞️', cost: 2, text: '−3 voix pour l’adversaire. Un vieux dossier ressort au bon moment.', roles: ['campagne', 'president'], play: (g, s) => hit(g, s, 3, 'Une fuite dans la presse') },
  ralliement: { id: 'ralliement', name: 'Ralliement', icon: '🤝', cost: 3, text: '+4 voix. Un poids lourd vous rejoint.', roles: ['campagne', 'opposition'], play: (g, s) => gain(g, s, 4, 'Un ralliement de poids') },
  'contre-feu': { id: 'contre-feu', name: 'Contre-feu', icon: '🛡️', cost: 1, text: 'Pare la prochaine attaque de l’adversaire (chiffrage, fuite, révélations).', roles: ['campagne', 'opposition', 'president'], play: (g, s) => log(seat(g, s, { shield: true }), s, 'Contre-feu prêt : la prochaine attaque tombera à plat.', 'neutral') },
  communication: { id: 'communication', name: 'Allocution', icon: '📺', cost: 2, text: '+2 voix. Le président s’adresse aux Français à 20 h.', roles: ['president'], play: (g, s) => gain(g, s, 2, 'Allocution télévisée') },
  remaniement: {
    id: 'remaniement',
    name: 'Remaniement',
    icon: '🔁',
    cost: 0,
    text: '+2 ⚡ ce tour-ci, mais −1 voix : un nouveau gouvernement relance l’action.',
    roles: ['president'],
    play: (g, s) => log(seat(g, s, { mana: g.seats[s].mana + 2, elan: g.seats[s].elan - 1 }), s, 'Remaniement : nouveau gouvernement, +2 ⚡, −1 voix.', 'neutral'),
  },
  '493': {
    id: '493',
    name: '49.3',
    icon: '📜',
    cost: 0,
    text: '+3 ⚡ : vos réformes passent sans vote. Mais la colère monte, et une motion de censure peut tout faire tomber.',
    roles: ['president'],
    blocked: (g) => (g.forced ? 'Déjà engagé cette année' : null),
    play: (g, s) => {
      const chance = Math.round(CENSURE_CHANCE[majorityOf(g.politics!.seats)] * 100)
      return log({ ...seat(g, s, { mana: g.seats[s].mana + 3 }), forced: true }, s, `49.3 engagé : +3 ⚡. Risque de censure : ${chance} %.`, 'neutral')
    },
  },
  greve: {
    id: 'greve',
    name: 'Grève générale',
    icon: '✊',
    cost: 3,
    text: 'Le pays s’arrête : la colère monte pour de bon (selon le modèle), le président en paie le prix.',
    roles: ['opposition'],
    blocked: (g) => (g.provoked.includes('general-strike') || g.events.some((e) => e.id === 'general-strike' && g.year - e.year < 3) ? 'Une grève a déjà eu lieu il y a moins de 3 ans' : null),
    play: (g, s) => log({ ...g, provoked: [...g.provoked, 'general-strike'] }, s, 'Appel à la grève générale : le pays sera bloqué cette année.', 'bad'),
  },
  censure: {
    id: 'censure',
    name: 'Motion de censure',
    icon: '🏛️',
    cost: 2,
    text: 'Seulement après un 49.3 : augmente fortement la chance que le gouvernement tombe avec ses réformes.',
    roles: ['opposition'],
    blocked: (g) => (!g.forced ? 'Seulement si le président a engagé le 49.3' : !reformsThisRound(g) ? 'Aucune réforme à faire tomber' : g.censureMotion ? 'Déjà déposée' : null),
    play: (g, s) => log({ ...g, censureMotion: true }, s, `Motion de censure déposée : le gouvernement tombe à ${Math.round(censureChance({ ...g, censureMotion: true }) * 100)} %.`, 'bad'),
  },
  revelations: {
    id: 'revelations',
    name: 'Révélations',
    icon: '🔎',
    cost: 3,
    text: 'Un scandale d’État éclate : la colère monte (selon le modèle) et le président perd 1 voix.',
    roles: ['opposition'],
    blocked: (g) => (g.provoked.includes('scandal') || g.events.some((e) => e.id === 'scandal' && g.year - e.year < 5) ? 'Un scandale a déjà éclaté il y a moins de 5 ans' : null),
    play: (g, s) => hit({ ...g, provoked: [...g.provoked, 'scandal'] }, s, 1, 'Révélations dans la presse : un scandale d’État'),
  },
}

const DECKS: Record<Role, TacticId[]> = {
  campagne: ['meeting', 'meeting', 'meeting', 'debat', 'debat', 'chiffrage', 'chiffrage', 'fuite', 'fuite', 'ralliement', 'contre-feu', 'contre-feu'],
  president: ['communication', 'communication', 'communication', 'remaniement', 'remaniement', '493', '493', 'debat', 'chiffrage', 'fuite', 'contre-feu', 'contre-feu'],
  opposition: ['meeting', 'meeting', 'meeting', 'greve', 'greve', 'censure', 'censure', 'revelations', 'chiffrage', 'chiffrage', 'ralliement', 'debat', 'contre-feu'],
}

export function censureChance(g: Game): number {
  const base = CENSURE_CHANCE[majorityOf(g.politics!.seats)]
  return g.censureMotion ? Math.min(0.9, base * 1.5 + 0.15) : base
}

// — Petites aides

const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString('fr-FR')

function seat(g: Game, side: Side, patch: Partial<Seat>): Game {
  return { ...g, seats: { ...g.seats, [side]: { ...g.seats[side], ...patch } } }
}

function log(g: Game, side: LogEntry['side'], text: string, tone: LogEntry['tone']): Game {
  return { ...g, log: [...g.log, { round: g.round, side, text, tone }] }
}

/** Un paquet mélangé (toujours le même pour la même graine). */
function shuffle(ids: TacticId[], seed: number, salt: string): TacticId[] {
  return ids.map((id, i) => ({ id, r: random(seed, i, salt) })).sort((a, b) => a.r - b.r).map((x) => x.id)
}

function draw(g: Game, side: Side): Game {
  const s = g.seats[side]
  const deck = s.deck.length >= HAND_SIZE - s.hand.length ? s.deck : [...s.deck, ...shuffle(DECKS[roleOf(g, side)], g.seed, `${side}:${g.round}`)]
  const n = Math.max(0, HAND_SIZE - s.hand.length)
  const drawn = deck.slice(0, n).map((tactic, i) => ({ uid: `${side}-${g.round}-${i}-${tactic}`, tactic }))
  return seat(g, side, { hand: [...s.hand, ...drawn], deck: deck.slice(n) })
}

/** Le capital politique ⚡ de chacun au début d'un tour. */
export function manaFor(g: Game, side: Side): number {
  const role = roleOf(g, side)
  if (role === 'campagne') {
    return 2 + g.round
  }
  const pop = presidentPopularity(g)
  if (role === 'president') {
    return Math.max(1, politicalCapital(pop, g.year === MANDATE_START + 1) + MAJORITY_CAPITAL[majorityOf(g.politics!.seats)])
  }
  // L'opposition est d'autant plus forte que le président est impopulaire.
  return clamp(3 + Math.round((55 - pop) / 6), 2, 6)
}

function startRound(g: Game): Game {
  let next: Game = { ...g, reforms: [], forced: false, censureMotion: false, provoked: [] }
  for (const side of ['player', 'ai'] as Side[]) {
    next = draw(seat(next, side, { done: false }), side)
    next = seat(next, side, { mana: manaFor(next, side) })
  }
  return next
}

// — La partie

export function newGame(player: Candidate, ai: Candidate, seed: number): Game {
  const events = eventsBeforeMandate(seed)
  const states = simulate({ decisions: [], events, until: MANDATE_START })
  const fresh = (c: Candidate): Seat => ({ candidate: c, elan: 0, exposure: 0, programme: c.promises.filter(isPlayable), announced: [], applied: [], hand: [], deck: [], mana: 0, shield: false, done: false })
  const g: Game = {
    seed,
    phase: 'campagne',
    round: 1,
    year: MANDATE_START,
    seats: { player: fresh(player), ai: fresh(ai) },
    president: null,
    politics: null,
    decisions: [],
    events,
    states,
    reforms: [],
    forced: false,
    censureMotion: false,
    provoked: [],
    reverts: {},
    log: [],
    elections: [],
  }
  return startRound(log(g, 'monde', `La campagne commence : ${player.name} contre ${ai.name}.`, 'neutral'))
}

/** La politique qui s'appliquera l'an prochain, avec les réformes déjà votées ce tour-ci. */
export function plannedPolicy(g: Game): Policy {
  const current = policyAt(g.decisions, g.year)
  return { ...current, ...g.reverts, ...Object.assign({}, ...g.reforms.map((r) => r.patch)) }
}

/** Le prix d'une promesse : en campagne, selon le modèle ; au pouvoir, le vrai coût de la réforme (capital politique). */
export function pledgeCost(g: Game, side: Side, p: Pledge): number {
  if (roleOf(g, side) !== 'president') {
    return pledgeStats(p).cost
  }
  const planned = plannedPolicy(g)
  return Math.max(1, planCost(promiseRemaining(p, BASE_POLICY, planned), policyAt(g.decisions, g.year)))
}

export function canPlayPledge(g: Game, side: Side, p: Pledge): string | null {
  const s = g.seats[side]
  if (g.phase === 'fin' || s.done) {
    return 'Ce n’est pas votre tour'
  }
  if (!s.programme.some((x) => x.key === p.key)) {
    return 'Déjà jouée'
  }
  return pledgeCost(g, side, p) > s.mana ? 'Pas assez de capital politique ⚡' : null
}

export function playPledge(g: Game, side: Side, p: Pledge): Game {
  if (canPlayPledge(g, side, p)) {
    return g
  }
  const s = g.seats[side]
  const cost = pledgeCost(g, side, p)
  const programme = s.programme.filter((x) => x.key !== p.key)
  const name = p.measure!.name
  if (roleOf(g, side) === 'president') {
    const planned = plannedPolicy(g)
    const patch = promiseRemaining(p, BASE_POLICY, planned)
    const { revert } = promisePatch(p, planned)
    const next = seat({ ...g, reforms: [...g.reforms, { pledge: p, patch, cost }], reverts: revert ? { ...g.reverts, ...revert } : g.reverts }, side, { mana: s.mana - cost, programme })
    return log(next, side, `Réforme votée : ${name}. Elle s’appliquera en ${g.year}.`, 'neutral')
  }
  const st = pledgeStats(p)
  const appeal = roleOf(g, side) === 'opposition' ? Math.max(1, st.appeal) : st.appeal
  const next = seat(g, side, { mana: s.mana - cost, programme, announced: [...s.announced, p], elan: s.elan + appeal, exposure: s.exposure + st.deficit })
  const verb = roleOf(g, side) === 'opposition' ? 'Contre-proposition' : 'Promesse'
  return log(next, side, `${verb} : ${name} (${appeal >= 0 ? '+' : '−'}${num(Math.abs(appeal))} voix, ${st.deficit >= 0 ? '+' : '−'}${Math.abs(st.deficit)} Md€ de déficit).`, appeal >= 0 ? 'good' : 'bad')
}

export function canPlayTactic(g: Game, side: Side, card: Card): string | null {
  const s = g.seats[side]
  const def = TACTICS[card.tactic]
  if (g.phase === 'fin' || s.done) {
    return 'Ce n’est pas votre tour'
  }
  if (!def.roles.includes(roleOf(g, side))) {
    return 'Pas dans ce rôle'
  }
  if (def.cost > s.mana) {
    return 'Pas assez de capital politique ⚡'
  }
  return def.blocked?.(g, side) ?? null
}

export function playTactic(g: Game, side: Side, card: Card): Game {
  if (canPlayTactic(g, side, card)) {
    return g
  }
  const def = TACTICS[card.tactic]
  const s = g.seats[side]
  const paid = seat(g, side, { mana: s.mana - def.cost, hand: s.hand.filter((c) => c.uid !== card.uid) })
  return def.play(paid, side)
}

/** Les cartes de tactique qu'on ne pourra jamais jouer dans ce rôle sont défaussées en changeant de phase. */
function resetHands(g: Game): Game {
  let next = g
  for (const side of ['player', 'ai'] as Side[]) {
    next = seat(next, side, { hand: [], deck: shuffle(DECKS[roleOf(next, side)], next.seed, `${side}:${roleOf(next, side)}`), shield: false })
  }
  return next
}

/** Le score du joueur au second tour de 2027 : l'élan de chacun, et une part de hasard (reproductible). */
export function campaignVote(g: Game): number {
  const lead = g.seats.player.elan - g.seats.ai.elan
  return clamp(Math.round((50 + 0.6 * lead + (random(g.seed, MANDATE_START, 'second-tour') - 0.5) * 2) * 10) / 10, 25, 75)
}

/** Ce que le président a tenu ou trahi de ses promesses de campagne. */
export function promiseBalance(g: Game) {
  const p = g.seats[g.president!]
  const applied = new Set(p.applied.map((x) => x.key))
  const betrayed = p.announced.filter((x) => !applied.has(x.key)).length
  return { kept: p.applied.length, betrayed, points: 0.25 * p.applied.length - 0.75 * betrayed }
}

/** Les événements provoqués par les cartes et les jokers : la France « sans vos réformes » ne les connaît pas. */
const CARD_EVENTS = new Set(['general-strike', 'scandal', 'force-493', 'censure'])

/** L'usure du pouvoir : depuis 1974, deux présidents sortants sur cinq candidats à leur succession ont été battus. */
const INCUMBENCY = 2

/**
 * Le score du président sortant en 2032. Son bilan : la popularité qu'il a (selon le modèle), comparée à celle qu'aurait
 * eue la même France sans ses réformes ; puis ses promesses, et l'élan de chacun pendant le mandat.
 */
export function finalVote(g: Game): { president: number; reasons: string[] } {
  const s = lastState(g)
  const pres = g.president!
  const pop = popularity(s)
  const without = popularity(simulate({ decisions: [], events: g.events.filter((e) => !CARD_EVENTS.has(e.id)), until: s.year }).at(-1)!)
  const record = 0.6 * (pop - without)
  const balance = promiseBalance(g)
  const lead = 0.6 * (g.seats[pres].elan - g.seats[other(pres)].elan)
  let vote = 50 + record + lead + balance.points - INCUMBENCY
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v))}`
  const reasons = [
    `Bilan : popularité ${pop} %, contre ${without} % pour la même France sans ses réformes (${signed(record)} points)`,
    `Coups portés pendant le mandat : ${signed(lead)} points`,
    `Promesses : ${balance.kept} tenue${balance.kept > 1 ? 's' : ''}, ${balance.betrayed} trahie${balance.betrayed > 1 ? 's' : ''} (${signed(balance.points)})`,
    `Usure du pouvoir : −${INCUMBENCY} points`,
  ]
  if (s.ending) {
    vote = Math.min(vote, 35)
    reasons.push('Le pays a sombré dans la crise : impossible d’être réélu.')
  }
  return { president: clamp(Math.round(vote * 10) / 10, 20, 80), reasons }
}

function electPresident(g: Game): Game {
  const vote = campaignVote(g)
  const president: Side = vote > 50 ? 'player' : 'ai'
  const winner = g.seats[president].candidate
  const pop = popularity(lastState(g))
  const politics = afterPresidential(START_POLITICS(MANDATE_START), MANDATE_START, Math.max(vote, 100 - vote), pop, g.seed)
  let next: Game = {
    ...g,
    phase: 'mandat',
    president,
    politics,
    round: g.round + 1,
    year: MANDATE_START + 1,
    elections: [...g.elections, { year: MANDATE_START, player: vote, president, reasons: [`Élan de campagne : ${num(g.seats.player.elan)} contre ${num(g.seats.ai.elan)}`] }],
  }
  next = log(next, 'monde', `${winner.name} est élu·e avec ${num(Math.max(vote, 100 - vote))} % des voix. Législatives : ${politics.seats} sièges sur 577.`, president === 'player' ? 'good' : 'bad')
  // Un nouveau départ : l'élan de la campagne est dépensé, le programme du président devient sa feuille de route.
  for (const side of ['player', 'ai'] as Side[]) {
    const s = next.seats[side]
    next = seat(next, side, { elan: 0, exposure: side === president ? 0 : s.exposure, programme: s.candidate.promises.filter(isPlayable) })
  }
  return startRound(resetHands(next))
}

/** L'année se joue : réformes (sauf censure), événements du monde et des cartes, puis le modèle avance d'un an. */
function resolveYear(g: Game): Game {
  let next = g
  const year = g.year
  const pres = g.president!
  let reforms = g.reforms
  const events: FiredEvent[] = [...g.events]
  let politics = g.politics!
  if (g.forced && reforms.length) {
    const chance = censureChance(g)
    if (random(g.seed, year, 'censure') < chance) {
      reforms = []
      events.push({ year, id: 'censure' })
      politics = { ...politics, censured: [...politics.censured, year] }
      next = log(next, other(pres), `Censure adoptée (${Math.round(chance * 100)} % de risque) : le gouvernement tombe, ses réformes avec lui.`, 'bad')
    } else {
      events.push({ year, id: 'force-493' })
      politics = { ...politics, forced: [...politics.forced, year] }
      next = log(next, pres, 'La censure échoue : les réformes passent par le 49.3.', 'neutral')
    }
  }
  const patch = { ...g.reverts, ...Object.assign({}, ...reforms.map((r) => r.patch)) }
  const decisions = Object.keys(patch).length ? [...g.decisions, { year, patch }] : g.decisions
  for (const id of g.provoked) {
    events.push({ year, id })
  }
  const rolled = rollEvents(g.seed, year, lastState(g), g.states[0], events)
  events.push(...rolled)
  const states = simulate({ decisions, events, until: year })
  const applied = [...next.seats[pres].applied, ...reforms.map((r) => r.pledge)]
  // Une réforme censurée retourne dans la main du président : il pourra la retenter.
  const back = g.reforms.filter((r) => !reforms.includes(r)).map((r) => r.pledge)
  next = seat({ ...next, decisions, events, states, politics, reverts: {} }, pres, { applied, programme: [...next.seats[pres].programme, ...back] })
  const s = states.at(-1)!
  return log(next, 'monde', `Bilan ${year} : popularité du président ${popularity(s)} %, chômage ${num(s.unemployment * 100)} %, déficit ${num((s.deficit / s.gdp) * 100)} % du PIB.`, 'neutral')
}

/** Les événements du monde survenus une année (pour les annoncer). */
export const eventsOf = (g: Game, year: number) => g.events.filter((e) => e.year === year)

/** Fin du tour : quand les deux camps ont joué, on résout et on passe au tour suivant. */
export function endTurn(g: Game, side: Side): Game {
  let next = seat(g, side, { done: true })
  if (!next.seats.player.done || !next.seats.ai.done) {
    return next
  }
  if (next.phase === 'campagne') {
    if (next.round < CAMPAIGN_ROUNDS) {
      return startRound({ ...next, round: next.round + 1 })
    }
    return electPresident(next)
  }
  next = resolveYear(next)
  if (next.year >= MANDATE_END || lastState(next).ending) {
    const { president, reasons } = finalVote(next)
    const pres = next.president!
    const player = pres === 'player' ? president : Math.round((100 - president) * 10) / 10
    const winner: Side = player > 50 ? 'player' : 'ai'
    next = { ...next, phase: 'fin', elections: [...next.elections, { year: lastState(next).year, player, president: winner, reasons }] }
    return log(next, 'monde', `Présidentielle ${lastState(next).year} : ${next.seats[winner].candidate.name} l’emporte (${num(Math.max(player, 100 - player))} %).`, winner === 'player' ? 'good' : 'bad')
  }
  return startRound({ ...next, round: next.round + 1, year: next.year + 1 })
}

/** Qui joue en premier ce tour-ci : le président (l'opposition réagit à ses réformes), le joueur en campagne. */
export const firstToPlay = (g: Game): Side => (g.phase === 'mandat' ? g.president! : 'player')
