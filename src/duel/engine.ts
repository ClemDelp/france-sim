import { BASE_POLICY } from '../model/calibration'
import { EVENTS, rollEvents } from '../model/events'
import { policyAt, simulate } from '../model/sim'
import type { Decision, FiredEvent, Policy, YearState } from '../model/types'
import { promisePatch, promiseRemaining, promiseStatus, type Candidate, type Pledge } from '../game/candidates'
import { politicalCapital } from '../game/capital'
import { popularity } from '../game/score'
import { planCost } from '../game/session'
import { ACTIONS, buildDeck, CRISES, programmeOf, shuffled, type Card, type CrisisId } from './cards'
import { health } from './health'

/**
 * Le duel : deux présidents, chacun à la tête de sa propre France (la même au départ, en 2027).
 * Une pioche commune, une défausse, un marché où l'on vend les cartes dont on ne veut pas.
 * Les deux joueurs piochent les mêmes cartes : chaque carte tirée est donnée en double, un exemplaire à chacun.
 * Chaque année, on joue des cartes en même temps : des mesures pour sa France, des crises pour celle de l'adversaire,
 * des parades. Puis l'année se joue dans les deux France, avec le modèle.
 * On perd tout de suite si son pays fait faillite ou se révolte. À la fin, celui qui a tenu au moins 3 promesses sur 5
 * bat celui qui ne l'a pas fait ; s'ils sont à égalité sur ce point, la meilleure note de santé du pays l'emporte.
 */

export type Side = 'player' | 'ai'
export const SIDES: Side[] = ['player', 'ai']
export const other = (s: Side): Side => (s === 'player' ? 'ai' : 'player')

export const START_YEAR = 2027
export const HAND_START = 5
export const DRAW_PER_YEAR = 2
export const HAND_MAX = 8
/** Le mandat est respecté si l'on tient au moins autant de promesses de son programme à la fin. */
export const PROGRAMME_GOAL = 3
/** L'énergie gagnée la première fois qu'une promesse est tenue. */
export const PROMISE_BONUS = 2
/** Jeter une carte rapporte un peu d'énergie, tout de suite. */
export const DISCARD_GAIN = 1
export const MARKET_SIZE = 4

export type Seat = {
  /** Le candidat incarné, ou null : un programme tiré au sort (le joueur) ou le bot. */
  candidate: Candidate | null
  name: string
  emblem: string
  color: string
  programme: Pledge[]
  /** Les promesses déjà tenues une fois (le bonus n'est donné qu'une fois). */
  rewarded: string[]
  hand: Card[]
  /** Les cartes jouées cette année (on peut les reprendre tant que l'année n'est pas jouée). */
  played: { card: Card; cost: number }[]
  energy: number
  /** L'énergie qui arrive l'an prochain : promesses tenues, ventes au marché. */
  bonus: number
  /** Une cellule de crise est prête. */
  shield: boolean
  decisions: Decision[]
  events: FiredEvent[]
  states: YearState[]
  /** Les mesures temporaires à défaire l'an prochain. */
  reverts: Partial<Policy>
}

export type Listing = { card: Card; price: number; seller: Side }

/** Ce qui s'est passé pendant l'année, à raconter : cartes jouées, achats, ventes, cartes jetées. */
export type Move = { side: Side; kind: 'achat' | 'vente' | 'jet' | 'jeu'; card: Card; price?: number }

export type Report = {
  year: number
  /** Pour chaque camp : les crises reçues (et parées), les promesses tenues, les ventes encaissées, la note avant et après. */
  sides: Record<
    Side,
    {
      received: CrisisId[]
      parried: CrisisId[]
      kept: string[]
      health: number
      before: number
      /** Les cartes jouées cette année, et leur coût. */
      played: { card: Card; cost: number }[]
      /** L'énergie gagnée l'an prochain : promesses tenues, ventes au marché. */
      earned: number
    }
  >
  world: string[]
  /** Les achats, ventes et cartes jetées de l'année. */
  moves: Move[]
}

export type Outcome = { winner: Side | 'nul'; reason: string }

export type Game = {
  seed: number
  years: number
  year: number
  seats: Record<Side, Seat>
  /** La pioche commune (chaque carte tirée est donnée aux deux joueurs), la défausse, le marché. */
  deck: Card[]
  discard: Card[]
  market: Listing[]
  /** Les mouvements de l'année en cours (pour les montrer pendant le dévoilement). */
  moves: Move[]
  /** Les événements du monde (les mêmes pour les deux France, tirés sur une France de référence). */
  world: FiredEvent[]
  reports: Report[]
  outcome: Outcome | null
  /** Un compteur, pour que chaque exemplaire distribué ait son propre identifiant. */
  dealt: number
}

export type Player = { candidate: Candidate | null; name: string; emblem: string; color: string }

export const BOT: Player = { candidate: null, name: 'Le Bot', emblem: '🤖', color: '#6b7a99' }

export const lastState = (s: Seat) => s.states.at(-1)!
export const startState = (s: Seat) => s.states.find((x) => x.year === START_YEAR)!
export const scoreOf = (s: Seat) => health(lastState(s), startState(s))
export const endYear = (g: Game) => START_YEAR + g.years

/** À qui est cette promesse (une mesure d'un programme), ou null. */
export function promiseOwner(g: Game, card: Card): Side | null {
  if (card.kind !== 'mesure') {
    return null
  }
  return SIDES.find((side) => g.seats[side].programme.some((p) => p.key === card.pledge.key)) ?? null
}

function seatFor(p: Player, programme: Pledge[], states: YearState[]): Seat {
  return {
    candidate: p.candidate,
    name: p.name,
    emblem: p.emblem,
    color: p.color,
    programme,
    rewarded: [],
    hand: [],
    played: [],
    energy: 0,
    bonus: 0,
    shield: false,
    decisions: [],
    events: [],
    states,
    reverts: {},
  }
}

export function newGame(player: Player, ai: Player, options: { seed: number; years: number }): Game {
  const states = simulate({ decisions: [], events: [], until: START_YEAR })
  const mine = programmeOf(player.candidate, options.seed, 'joueur')
  const theirs = programmeOf(ai.candidate, options.seed, 'ia')
  let g: Game = {
    seed: options.seed,
    years: options.years,
    year: START_YEAR + 1,
    seats: { player: seatFor(player, mine, states), ai: seatFor(ai, theirs, states) },
    deck: buildDeck([mine, theirs], options.seed),
    discard: [],
    market: [],
    moves: [],
    world: [],
    reports: [],
    outcome: null,
    dealt: 0,
  }
  g = deal(g, HAND_START)
  return withEnergy(g)
}

// — L'énergie et les coûts

/** Le capital politique de l'année, selon la popularité (selon le modèle). */
export const capitalOf = (g: Game, side: Side) => politicalCapital(popularity(lastState(g.seats[side])), g.year === START_YEAR + 1)

/** L'énergie de l'année : le capital politique, plus ce qui arrive des promesses tenues et des ventes. */
function withEnergy(g: Game): Game {
  let next = g
  for (const side of SIDES) {
    const s = next.seats[side]
    next = seat(next, side, { energy: capitalOf(next, side) + s.bonus, bonus: 0 })
  }
  return next
}

/** La politique de l'an prochain, avec les mesures déjà jouées cette année (sauf `except`). */
export function plannedPolicy(s: Seat, year: number, except?: string): Policy {
  let policy: Policy = { ...policyAt(s.decisions, year), ...s.reverts }
  for (const { card } of s.played) {
    if (card.kind === 'mesure' && card.uid !== except) {
      policy = { ...policy, ...promiseRemaining(card.pledge, BASE_POLICY, policy) }
    }
  }
  return policy
}

/** Ce que coûte une carte en énergie (une mesure : le vrai coût politique de la réforme pour ce joueur). */
export function cardCost(g: Game, side: Side, card: Card): number {
  if (card.kind === 'crise') {
    return CRISES[card.crisis].cost
  }
  if (card.kind === 'action') {
    return ACTIONS[card.action].cost
  }
  const s = g.seats[side]
  const planned = plannedPolicy(s, g.year, card.uid)
  return Math.max(1, planCost(promiseRemaining(card.pledge, BASE_POLICY, planned), policyAt(s.decisions, g.year)))
}

/** Le prix d'une carte au marché : son coût de base, plus un si c'est la promesse de quelqu'un (elle vaut cher à son auteur). */
export function marketPrice(g: Game, card: Card): number {
  const base = card.kind === 'crise' ? CRISES[card.crisis].cost : card.kind === 'action' ? ACTIONS[card.action].cost : 2
  return base + (promiseOwner(g, card) ? 1 : 0)
}

export function canPlay(g: Game, side: Side, card: Card): string | null {
  if (g.outcome) {
    return 'La partie est finie'
  }
  const s = g.seats[side]
  if (!s.hand.some((c) => c.uid === card.uid)) {
    return 'Pas dans votre main'
  }
  if (card.kind === 'action' && card.action === 'cellule' && (s.shield || s.played.some((p) => p.card.kind === 'action' && p.card.action === 'cellule'))) {
    return 'Une cellule de crise est déjà prête'
  }
  if (card.kind === 'crise' && s.played.some((p) => p.card.kind === 'crise' && p.card.crisis === card.crisis)) {
    return 'Déjà envoyée cette année'
  }
  return cardCost(g, side, card) > s.energy ? 'Pas assez d’énergie ⚡' : null
}

// — Jouer, reprendre, jeter, vendre, acheter

function seat(g: Game, side: Side, patch: Partial<Seat>): Game {
  return { ...g, seats: { ...g.seats, [side]: { ...g.seats[side], ...patch } } }
}

const fromHand = (g: Game, side: Side, uid: string) => seat(g, side, { hand: g.seats[side].hand.filter((c) => c.uid !== uid) })

export function play(g: Game, side: Side, card: Card): Game {
  if (canPlay(g, side, card)) {
    return g
  }
  const s = g.seats[side]
  const cost = cardCost(g, side, card)
  let next = seat(fromHand(g, side, card.uid), side, { played: [...s.played, { card, cost }], energy: s.energy - cost })
  next = { ...next, moves: [...next.moves, { side, kind: 'jeu', card }] }
  if (card.kind === 'action' && card.action === 'sondage') {
    next = draw(next, side, 2)
  }
  return next
}

/** Reprendre une carte jouée cette année (sauf un sondage : les cartes sont déjà piochées). */
export function takeBack(g: Game, side: Side, uid: string): Game {
  const s = g.seats[side]
  const entry = s.played.find((p) => p.card.uid === uid)
  if (!entry || (entry.card.kind === 'action' && entry.card.action === 'sondage')) {
    return g
  }
  const next = seat(g, side, { hand: [...s.hand, entry.card], played: s.played.filter((p) => p !== entry), energy: s.energy + entry.cost })
  return { ...next, moves: g.moves.filter((m) => !(m.kind === 'jeu' && m.card.uid === uid)) }
}

/** Jeter une carte : elle part à la défausse, et rapporte un peu d'énergie tout de suite. */
export function discard(g: Game, side: Side, uid: string): Game {
  const card = g.seats[side].hand.find((c) => c.uid === uid)
  if (!card || g.outcome) {
    return g
  }
  const next = seat(fromHand(g, side, uid), side, { energy: g.seats[side].energy + DISCARD_GAIN })
  return { ...next, discard: [...next.discard, card], moves: [...next.moves, { side, kind: 'jet', card }] }
}

export function canSell(g: Game, side: Side, uid: string): string | null {
  if (g.outcome || !g.seats[side].hand.some((c) => c.uid === uid)) {
    return 'Pas dans votre main'
  }
  return g.market.length >= MARKET_SIZE ? 'Le marché est plein' : null
}

/** Mettre une carte en vente au marché : celui qui l'achète paie son prix, qui revient au vendeur l'an prochain. */
export function sell(g: Game, side: Side, uid: string): Game {
  const card = g.seats[side].hand.find((c) => c.uid === uid)
  if (!card || canSell(g, side, uid)) {
    return g
  }
  const next = fromHand(g, side, uid)
  return { ...next, market: [...next.market, { card, price: marketPrice(g, card), seller: side }], moves: [...next.moves, { side, kind: 'vente', card }] }
}

export function canBuy(g: Game, side: Side, uid: string): string | null {
  const listing = g.market.find((l) => l.card.uid === uid)
  if (g.outcome || !listing) {
    return 'Plus au marché'
  }
  if (listing.seller === side) {
    return 'C’est votre propre carte'
  }
  if (g.seats[side].hand.length >= HAND_MAX) {
    return 'Votre main est pleine'
  }
  return listing.price > g.seats[side].energy ? 'Pas assez d’énergie ⚡' : null
}

export function buy(g: Game, side: Side, uid: string): Game {
  const listing = g.market.find((l) => l.card.uid === uid)
  if (!listing || canBuy(g, side, uid)) {
    return g
  }
  const buyer = g.seats[side]
  let next = seat(g, side, { hand: [...buyer.hand, listing.card], energy: buyer.energy - listing.price })
  next = seat(next, listing.seller, { bonus: next.seats[listing.seller].bonus + listing.price })
  return { ...next, market: next.market.filter((l) => l !== listing), moves: [...next.moves, { side, kind: 'achat', card: listing.card, price: listing.price }] }
}

/** La carte d'origine, dans la pioche, d'un exemplaire distribué. */
export const baseUid = (uid: string) => uid.split('/')[0]

/** Assez de cartes dans la pioche commune ; sinon, on y remélange la défausse (un seul exemplaire de chaque carte). */
function refill(g: Game, n: number, salt: string): Game {
  if (g.deck.length >= n || !g.discard.length) {
    return g
  }
  const seen = new Set(g.deck.map((c) => c.uid))
  const back: Card[] = []
  for (const c of g.discard) {
    const uid = baseUid(c.uid)
    if (!seen.has(uid)) {
      seen.add(uid)
      back.push({ ...c, uid })
    }
  }
  return { ...g, deck: [...g.deck, ...shuffled(back, g.seed, `defausse-${g.year}-${salt}`)], discard: [] }
}

/** Un exemplaire d'une carte de la pioche, pour un joueur. */
const copy = (c: Card, side: Side, n: number): Card => ({ ...c, uid: `${baseUid(c.uid)}/${side === 'player' ? 'j' : 'a'}${n}` })

/** Les deux joueurs piochent les mêmes cartes : chacune est donnée en double (sauf à qui a la main pleine). */
function deal(g: Game, n: number): Game {
  let next = refill(g, n, 'tous')
  const top = next.deck.slice(0, n)
  for (const side of SIDES) {
    const s = next.seats[side]
    const room = Math.max(0, HAND_MAX - s.hand.length)
    next = seat(next, side, { hand: [...s.hand, ...top.slice(0, room).map((c, i) => copy(c, side, next.dealt + i))] })
  }
  return { ...next, deck: next.deck.slice(top.length), dealt: next.dealt + top.length }
}

/** Le sondage : des cartes en plus, pour un seul joueur (l'autre ne les reçoit pas). */
function draw(g: Game, side: Side, n: number): Game {
  const next = refill(g, n, side)
  const s = next.seats[side]
  const k = Math.min(n, Math.max(0, HAND_MAX - s.hand.length), next.deck.length)
  const cards = next.deck.slice(0, k).map((c, i) => copy(c, side, next.dealt + i))
  return { ...seat(next, side, { hand: [...s.hand, ...cards] }), deck: next.deck.slice(k), dealt: next.dealt + k }
}

/** Les promesses tenues : les leviers de la France ont atteint ce que la promesse demande. */
export function keptPromises(s: Seat, year: number): Pledge[] {
  const now = policyAt(s.decisions, year)
  return s.programme.filter((p) => promiseStatus(p, BASE_POLICY, now) === 'tenue')
}

// — L'année se joue

/** Ce que les mesures de l'année changent à une France, et ce qu'il faudra défaire l'an prochain (mesures temporaires). */
function yearPatch(s: Seat, year: number) {
  let policy: Policy = { ...policyAt(s.decisions, year), ...s.reverts }
  let reverts: Partial<Policy> = {}
  let patch: Partial<Policy> = { ...s.reverts }
  for (const { card } of s.played) {
    if (card.kind !== 'mesure') {
      continue
    }
    const change = promiseRemaining(card.pledge, BASE_POLICY, policy)
    const { revert } = promisePatch(card.pledge, policy)
    if (revert) {
      reverts = { ...reverts, ...revert }
    }
    patch = { ...patch, ...change }
    policy = { ...policy, ...change }
  }
  return { patch, reverts }
}

/**
 * L'année se joue : les mesures de chacun s'appliquent à sa France, les crises frappent la France d'en face
 * (sauf cellule de crise), le monde tire ses événements, et le modèle avance d'un an dans les deux France.
 */
export function resolveYear(g: Game): Game {
  const year = g.year
  // Le monde : les mêmes événements pour les deux, tirés sur une France de référence (sans décisions ni crises envoyées).
  const reference = simulate({ decisions: [], events: g.world, until: year - 1 })
  const rolled = rollEvents(g.seed, year, reference.at(-1)!, reference[0], g.world)
  let next: Game = { ...g, world: [...g.world, ...rolled] }
  const report: Report = { year, sides: {} as Report['sides'], world: rolled.map((e) => EVENTS.find((d) => d.id === e.id)?.label ?? e.id), moves: g.moves.filter((m) => m.kind !== 'jeu') }
  const used: Card[] = []
  for (const side of SIDES) {
    const s = next.seats[side]
    const sent = g.seats[other(side)].played.flatMap((p) => (p.card.kind === 'crise' ? [p.card.crisis] : []))
    let shield = s.shield || s.played.some((p) => p.card.kind === 'action' && p.card.action === 'cellule')
    const received: CrisisId[] = []
    const parried: CrisisId[] = []
    for (const crisis of sent) {
      if (shield) {
        shield = false
        parried.push(crisis)
      } else {
        received.push(crisis)
      }
    }
    const { patch, reverts } = yearPatch(s, year)
    const decisions = Object.keys(patch).length ? [...s.decisions, { year, patch }] : s.decisions
    const events = [...s.events, ...rolled, ...received.map((id) => ({ year, id }))]
    const states = simulate({ decisions, events, until: year })
    const before = scoreOf(s)
    const updated: Seat = { ...s, decisions, events, states, reverts, shield, played: [] }
    // Les promesses tenues pour la première fois rapportent de l'énergie.
    const kept = keptPromises(updated, year).filter((p) => !s.rewarded.includes(p.key))
    next = seat(next, side, { ...updated, rewarded: [...s.rewarded, ...kept.map((p) => p.key)], bonus: s.bonus + PROMISE_BONUS * kept.length })
    used.push(...s.played.map((p) => p.card))
    report.sides[side] = {
      received,
      parried,
      kept: kept.map((p) => p.measure!.name),
      health: scoreOf(next.seats[side]),
      before,
      played: s.played,
      earned: s.bonus + PROMISE_BONUS * kept.length,
    }
  }
  next = { ...next, discard: [...next.discard, ...used], reports: [...next.reports, report], moves: [] }
  next = { ...next, outcome: outcomeOf(next) }
  if (next.outcome) {
    return next
  }
  next = deal({ ...next, year: year + 1 }, DRAW_PER_YEAR)
  return withEnergy(next)
}

/** Qui a gagné, et pourquoi (ou null si la partie continue). */
export function outcomeOf(g: Game): Outcome | null {
  const fallen = SIDES.filter((side) => lastState(g.seats[side]).ending)
  const ending = (side: Side) => (lastState(g.seats[side]).ending === 'faillite' ? 'a fait faillite' : lastState(g.seats[side]).ending === 'revolte' ? 'se révolte' : 's’effondre')
  if (fallen.length === 2) {
    return { winner: 'nul', reason: `Les deux pays s’effondrent la même année (${g.year}) : personne ne gagne.` }
  }
  if (fallen.length === 1) {
    const loser = fallen[0]
    return { winner: other(loser), reason: `Le pays de ${g.seats[loser].name} ${ending(loser)} en ${g.year}.` }
  }
  if (g.year < endYear(g)) {
    return null
  }
  const kept = (side: Side) => keptPromises(g.seats[side], g.year).length
  const respected = SIDES.filter((side) => kept(side) >= PROGRAMME_GOAL)
  if (respected.length === 1) {
    const w = respected[0]
    return { winner: w, reason: `Fin du mandat en ${g.year}. ${g.seats[w].name} a tenu ${kept(w)} promesses sur 5, ${g.seats[other(w)].name} seulement ${kept(other(w))} : le mandat respecté l’emporte.` }
  }
  const a = scoreOf(g.seats.player)
  const b = scoreOf(g.seats.ai)
  const why = `Fin du mandat en ${g.year}. ${respected.length === 2 ? 'Les deux ont tenu leur programme' : 'Aucun n’a tenu son programme'} : la note de santé du pays départage. `
  if (a === b) {
    return { winner: 'nul', reason: `${why}Égalité parfaite : ${a} / 100 chacun.` }
  }
  return { winner: a > b ? 'player' : 'ai', reason: `${why}${a} / 100 contre ${b} / 100.` }
}
