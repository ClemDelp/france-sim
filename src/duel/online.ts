import { candidateById } from '../game/candidates'
import { simulate } from '../model/sim'
import type { YearState } from '../model/types'
import { APP_COMMIT, APP_VERSION } from '../version'
import type { Card } from './cards'
import { buy, discard, other, pass, play, respond, sell, START_YEAR, type Answer, type Game, type Player, type Seat, type Side } from './engine'

/**
 * Jouer à deux, chacun sur son téléphone. L'hôte (celui qui crée la partie) fait tourner le moteur : c'est l'arbitre.
 * L'invité ne lui envoie que des intentions (« je joue telle carte », « je passe »), que l'hôte vérifie avec les règles,
 * et il reçoit en retour la partie vue de sa place : sans la main de l'hôte, sans l'ordre de la pioche, sans les
 * conjonctures à venir. Pour l'hôte, l'invité est le camp « ai » du moteur ; chez l'invité, tout est retourné :
 * il est « player », et l'écran de jeu est le même que contre l'IA.
 */

/** Ce qu'un joueur veut faire (des identifiants de cartes, jamais les cartes : l'hôte les retrouve lui-même). */
export type Intent =
  | { kind: 'play'; uid: string }
  | { kind: 'pass' }
  | { kind: 'respond'; answer: Answer | null }
  | { kind: 'discard'; uid: string }
  | { kind: 'sell'; uid: string }
  | { kind: 'buy'; uid: string }

/** Appliquer une intention pour `side` : la partie suivante, ou la même si les règles la refusent. */
export function applyIntent(g: Game, side: Side, intent: Intent): Game {
  switch (intent.kind) {
    case 'play': {
      const card = g.seats[side].hand.find((c) => c.uid === intent.uid)
      return card ? play(g, side, card) : g
    }
    case 'pass':
      return pass(g, side)
    case 'respond':
      return respond(g, side, intent.answer)
    case 'discard':
      return discard(g, side, intent.uid)
    case 'sell':
      return sell(g, side, intent.uid)
    case 'buy':
      return buy(g, side, intent.uid)
  }
}

/** Qui doit agir maintenant : celui que vise une carte en attente, sinon celui dont c'est le tour (null : l'année se joue). */
export const actorOf = (g: Game): Side | null => (g.outcome ? null : g.pending ? other(g.pending.from) : g.turn)

// — La partie vue d'une place

/** Une carte cachée : le dos d'une carte (main de l'adversaire, pioche). */
export const HIDDEN: Card = { kind: 'action', action: 'sondage', uid: 'cachee' }
export const isHidden = (c: Card) => c.uid.startsWith('cachee')
const hidden = (n: number): Card[] => Array.from({ length: n }, (_, i) => ({ ...HIDDEN, uid: `cachee-${i}` }))

/**
 * Ce que `side` a le droit de voir : la main de l'adversaire seulement s'il a joué le sondage truqué cette année,
 * la pioche réduite à son nombre de cartes, les conjonctures jusqu'à l'année en cours, et pas la graine des tirages.
 */
export function redact(g: Game, side: Side): Game {
  const foe = other(side)
  const peek = g.seats[side].peek
  const past = g.contexts.slice(0, Math.max(1, g.year - START_YEAR))
  return {
    ...g,
    seed: 0,
    deck: hidden(g.deck.length),
    contexts: past,
    seats: { ...g.seats, [foe]: { ...g.seats[foe], hand: peek ? g.seats[foe].hand : hidden(g.seats[foe].hand.length) } },
  }
}

const flipSide = (s: Side): Side => other(s)

/** La même partie, les deux places échangées : l'invité devient « player ». */
export function flip(g: Game): Game {
  return {
    ...g,
    seats: { player: g.seats.ai, ai: g.seats.player },
    turn: g.turn && flipSide(g.turn),
    pending: g.pending && { ...g.pending, from: flipSide(g.pending.from) },
    moves: g.moves.map((m) => ({ ...m, side: flipSide(m.side) })),
    market: g.market.map((l) => ({ ...l, seller: flipSide(l.seller) })),
    reports: g.reports.map((r) => ({ ...r, sides: { player: r.sides.ai, ai: r.sides.player }, moves: r.moves.map((m) => ({ ...m, side: flipSide(m.side) })) })),
    outcome: g.outcome && { ...g.outcome, winner: g.outcome.winner === 'nul' ? 'nul' : flipSide(g.outcome.winner) },
  }
}

/** La partie vue de la place de `side`, retournée pour que ce joueur soit toujours « player ». */
export const viewFor = (g: Game, side: Side): Game => (side === 'player' ? redact(g, 'player') : flip(redact(g, 'ai')))

// — Sur le fil : une partie allégée (les années de chaque France se recalculent, les candidats se retrouvent par leur nom)

type WireSeat = Omit<Seat, 'states' | 'candidate'> & { candidate: string | null; until: number }
export type WireGame = Omit<Game, 'seats'> & { seats: Record<Side, WireSeat> }

export function pack(g: Game): WireGame {
  const seat = (s: Seat): WireSeat => {
    const { states, candidate, ...rest } = s
    return { ...rest, candidate: candidate?.id ?? null, until: states.at(-1)!.year }
  }
  return { ...g, seats: { player: seat(g.seats.player), ai: seat(g.seats.ai) } }
}

/** Les années d'une France ne dépendent que de ses décisions et de ses événements : on les recalcule (une fois). */
const YEARS = new Map<string, YearState[]>()

export function unpack(w: WireGame): Game {
  const seat = (s: WireSeat): Seat => {
    const { until, candidate, ...rest } = s
    const key = JSON.stringify([s.decisions, s.events, until])
    let states = YEARS.get(key)
    if (!states) {
      states = simulate({ decisions: s.decisions, events: s.events, until })
      if (YEARS.size > 40) {
        YEARS.clear()
      }
      YEARS.set(key, states)
    }
    return { ...rest, candidate: candidateById(candidate) ?? null, states }
  }
  return { ...w, seats: { player: seat(w.seats.player), ai: seat(w.seats.ai) } }
}

// — Les messages

/** Deux versions différentes du jeu ne jouent pas ensemble : les règles ou le modèle peuvent avoir changé. */
export const PROTOCOL = `${APP_VERSION}-${APP_COMMIT}`

/** Un joueur, tel qu'on l'envoie : son candidat (par son identifiant) ou un programme surprise, et son pseudo. */
export type Entrant = { candidate: string | null; nick: string }

export type Message =
  /** L'invité se présente (à chaque connexion, y compris pour reprendre une partie). */
  | { t: 'hello'; v: string; nick: string }
  /** L'hôte répond : qui il incarne, la durée ; l'invité choisit alors son candidat. */
  | { t: 'lobby'; host: Entrant; years: number }
  | { t: 'pick'; who: Entrant }
  /** La partie, vue de la place de l'invité ; `n` grandit à chaque envoi (on ignore un envoi plus ancien). */
  | { t: 'view'; n: number; game: WireGame; intro: boolean }
  | { t: 'intent'; intent: Intent }
  /** L'invité demande une revanche (l'hôte relance une partie). */
  | { t: 'rematch' }
  | { t: 'ping' }
  | { t: 'pong' }
  | { t: 'refuse'; reason: string }

export function isMessage(x: unknown): x is Message {
  if (!x || typeof x !== 'object' || typeof (x as { t?: unknown }).t !== 'string') {
    return false
  }
  const m = x as Record<string, unknown>
  switch (m.t) {
    case 'hello':
      return typeof m.v === 'string' && typeof m.nick === 'string'
    case 'lobby':
      return isEntrant(m.host) && typeof m.years === 'number'
    case 'pick':
      return isEntrant(m.who)
    case 'view':
      return typeof m.n === 'number' && !!m.game && typeof m.game === 'object'
    case 'intent':
      return isIntent(m.intent)
    case 'refuse':
      return typeof m.reason === 'string'
    case 'rematch':
    case 'ping':
    case 'pong':
      return true
    default:
      return false
  }
}

const isEntrant = (x: unknown): x is Entrant =>
  !!x && typeof x === 'object' && typeof (x as Entrant).nick === 'string' && ((x as Entrant).candidate === null || typeof (x as Entrant).candidate === 'string')

const ANSWERS: (Answer | null)[] = ['cellule', 'commission', 'communication', 'conseil', null]

export function isIntent(x: unknown): x is Intent {
  if (!x || typeof x !== 'object') {
    return false
  }
  const i = x as Record<string, unknown>
  switch (i.kind) {
    case 'pass':
      return true
    case 'respond':
      return ANSWERS.includes(i.answer as Answer | null)
    case 'play':
    case 'discard':
    case 'sell':
    case 'buy':
      return typeof i.uid === 'string'
    default:
      return false
  }
}

// — Les codes de partie

/** Sans lettres ambiguës (O/0, I/1/L) : un code se dicte au téléphone. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newCode(rand: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join('')
}

export const isCode = (s: string) => new RegExp(`^[${ALPHABET}]{6}$`).test(s)

/** L'identifiant de l'hôte chez le courtier PeerJS : le même pour un code donné (on peut le reprendre après un rechargement). */
export const peerIdOf = (code: string) => `france-sim-duel-${code.toLowerCase()}`

/** Le joueur d'un camp, à partir de ce qu'on a reçu. */
export function entrantPlayer(e: Entrant, fallbackColor: string): Player {
  const c = candidateById(e.candidate)
  return c ? { candidate: c, name: c.name, emblem: c.emblem, color: c.color } : { candidate: null, name: e.nick || 'Programme surprise', emblem: '🎩', color: fallbackColor }
}
