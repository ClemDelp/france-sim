import { BASE_POLICY } from '../model/calibration'
import { policyAt, simulate } from '../model/sim'
import type { Decision, FiredEvent, Policy, YearState } from '../model/types'
import { promisePatch, promiseRemaining, promiseStatus, type Candidate, type Pledge } from '../game/candidates'
import { popularity } from '../game/score'
import { planCost } from '../game/session'
import { ACTIONS, buildDeck, CRISES, programmeOf, shuffled, type Card, type CrisisId } from './cards'
import { contextDeck, CONTEXTS, type ContextDef, type ContextId } from './contexts'
import { health } from './health'

/**
 * Le duel : deux présidents, chacun à la tête de sa propre France (la même au départ, en 2027).
 * Une pioche commune, une défausse, un marché où l'on vend les cartes dont on ne veut pas.
 * Chaque année commence par une conjoncture, la même pour les deux. Puis on joue chacun son tour, une carte à la fois :
 * des mesures pour sa France (deux lois par an au plus), des crises pour celle de l'adversaire, qu'il peut parer sur-le-champ.
 * Deux ressources : l'énergie (le capital politique) et la marge budgétaire (en Md€). Quand les deux passent, l'année se joue
 * dans les deux France, avec le modèle.
 * On perd tout de suite si son pays fait faillite ou se révolte. À la fin, celui qui a tenu au moins 3 promesses sur 5
 * bat celui qui ne l'a pas fait ; s'ils sont à égalité sur ce point, la meilleure note de santé du pays l'emporte.
 */

export type Side = 'player' | 'ai'
export const SIDES: Side[] = ['player', 'ai']
export const other = (s: Side): Side => (s === 'player' ? 'ai' : 'player')

export const START_YEAR = 2027
export const HAND_START = 5
export const DRAW_PER_YEAR = 3
export const HAND_MAX = 8
/** Le Parlement ne vote pas plus de deux lois par an et par président. */
export const LAWS_PER_YEAR = 2
/** Faire voter une loi coûte au moins deux points d'énergie, même pour une petite réforme. */
export const LAW_COST = 2
/** Le capital politique de base, chaque année (plus ou moins un selon la popularité). */
export const ENERGY_BASE = 3
/** Le mandat est respecté si l'on tient au moins autant de promesses de son programme à la fin. */
export const PROGRAMME_GOAL = 3
/** L'énergie gagnée la première fois qu'une promesse est tenue. */
export const PROMISE_BONUS = 2
/** Jeter une carte rapporte un peu d'énergie, tout de suite. */
export const DISCARD_GAIN = 1
export const MARKET_SIZE = 4
/** La marge budgétaire d'un pays aux comptes à l'équilibre (Md€ par an) : ce qu'on peut engager sans inquiéter. */
export const MARGIN_BASE = 25
/** Au-delà de la marge : un point d'énergie en moins l'an prochain par tranche de 10 Md€ ; à 20 Md€, Bruxelles et les marchés réagissent. */
export const OVERSHOOT_STEP = 10
export const ALERT_AT = 20

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
  /** Les cartes posées cette année, leur coût en énergie et en Md€ (une carte posée est définitive : l'adversaire l'a vue). */
  played: { card: Card; cost: number; md: number }[]
  energy: number
  /** L'énergie qui arrive l'an prochain : promesses tenues, ventes au marché. */
  bonus: number
  /** L'énergie perdue l'an prochain : la marge budgétaire dépassée (les marchés). */
  malus: number
  /** La marge budgétaire de l'année (Md€) : ce que les mesures peuvent coûter sans inquiéter. */
  margin: number
  /** Les crises reçues et parées cette année. */
  received: CrisisId[]
  parried: CrisisId[]
  decisions: Decision[]
  events: FiredEvent[]
  states: YearState[]
  /** Les mesures temporaires à défaire l'an prochain. */
  reverts: Partial<Policy>
}

export type Listing = { card: Card; price: number; seller: Side }

/** Ce qui s'est passé pendant l'année, à raconter : cartes posées, parades, passes, achats, ventes, cartes jetées. */
export type Move = { side: Side; kind: 'achat' | 'vente' | 'jet' | 'jeu' | 'parade' | 'passe'; card?: Card; price?: number }

export type Report = {
  year: number
  /** Pour chaque camp : les crises reçues (et parées), les promesses tenues, le budget, la note avant et après. */
  sides: Record<
    Side,
    {
      received: CrisisId[]
      parried: CrisisId[]
      kept: string[]
      health: number
      before: number
      /** Les cartes jouées cette année, et leur coût. */
      played: { card: Card; cost: number; md: number }[]
      /** L'énergie gagnée l'an prochain : promesses tenues, ventes au marché. */
      earned: number
      /** Le budget : ce que les mesures ont engagé, la marge, l'énergie perdue, l'alerte des marchés. */
      spent: number
      margin: number
      malus: number
      alert: boolean
    }
  >
  /** La conjoncture de l'année, et ce qu'elle a déclenché dans le monde. */
  context: ContextId
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
  /** La pioche commune, la défausse, le marché. */
  deck: Card[]
  discard: Card[]
  market: Listing[]
  /** Les conjonctures de la partie, une par an. */
  contexts: ContextId[]
  /** À qui de jouer (null : les deux ont passé, l'année peut se jouer). */
  turn: Side | null
  /** Les passes de suite : à deux, l'année se joue. */
  passes: number
  /** Une crise vient d'être posée : sa cible peut la parer avant de jouer. */
  pending: { card: Card; from: Side } | null
  /** Les mouvements de l'année en cours. */
  moves: Move[]
  /** Les événements du monde (les mêmes pour les deux France : ceux des conjonctures). */
  world: FiredEvent[]
  reports: Report[]
  outcome: Outcome | null
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
    malus: 0,
    margin: 0,
    received: [],
    parried: [],
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
    contexts: contextDeck(options.seed),
    turn: null,
    passes: 0,
    pending: null,
    moves: [],
    world: [],
    reports: [],
    outcome: null,
  }
  for (const side of SIDES) {
    g = draw(g, side, HAND_START)
  }
  return startYear(g, 0)
}

// — La conjoncture, l'énergie, le budget et les coûts

export const contextOf = (g: Game): ContextDef & { id: ContextId } => {
  const id = g.contexts[(g.year - START_YEAR - 1) % g.contexts.length]
  return { id, ...CONTEXTS[id] }
}

/** Qui ouvre l'année : celui dont le pays va le moins bien (ouvrir est un avantage) ; à égalité, chacun son tour (vous en 2028). */
export function firstOf(g: Game): Side {
  const a = scoreOf(g.seats.player)
  const b = scoreOf(g.seats.ai)
  return a < b ? 'player' : b < a ? 'ai' : (g.year - START_YEAR) % 2 === 1 ? 'player' : 'ai'
}

/**
 * Le capital politique de l'année : 3, un de plus si l'on est populaire (60 % ou plus), un de moins sous 40 %
 * (deux en année d'élections européennes), et un de plus la première année (l'état de grâce).
 */
export function capitalOf(g: Game, side: Side): number {
  const pop = popularity(lastState(g.seats[side]))
  const step = (pop >= 60 ? 1 : pop < 40 ? -1 : 0) * (contextOf(g).popularity ?? 1)
  return Math.max(1, ENERGY_BASE + step) + (g.year === START_YEAR + 1 ? 1 : 0)
}

/**
 * La marge budgétaire de l'année (Md€) : 25 Md€ pour un pays aux comptes sains, 4 de moins par point de déficit au-delà de 3 %,
 * 1 de moins par tranche de 4 points de dette au-delà de 100 % du PIB, plus ou moins ce que dit la conjoncture.
 */
export function marginOf(g: Game, side: Side): number {
  const st = lastState(g.seats[side])
  const deficit = (st.deficit / st.gdp) * 100
  const debt = st.debtRatio * 100
  return Math.max(0, Math.round(MARGIN_BASE - 4 * Math.max(0, deficit - 3) - Math.max(0, debt - 100) / 4 + (contextOf(g).margin ?? 0)))
}

/** Ce que les mesures posées cette année engagent (Md€ de déficit en plus ; négatif : des économies). */
export const spentOf = (s: Seat) => s.played.reduce((a, p) => a + p.md, 0)

/** Ce qui reste de la marge budgétaire (négatif : dépassée). */
export const marginLeft = (s: Seat) => Math.round((s.margin - spentOf(s)) * 10) / 10

/** Le coût d'un dépassement : l'énergie perdue l'an prochain. */
export const overshootMalus = (over: number) => (over > 0 ? Math.min(3, Math.ceil(over / OVERSHOOT_STEP)) : 0)

const BUDGET = new WeakMap<Seat, Map<string, number>>()

/** Ce qu'une mesure coûte au budget de l'État cette année (Md€ de déficit en plus, selon le modèle ; négatif : elle rapporte). */
export function budgetCost(g: Game, side: Side, card: Card): number {
  if (card.kind !== 'mesure') {
    return 0
  }
  const s = g.seats[side]
  let memo = BUDGET.get(s)
  if (!memo) {
    memo = new Map()
    BUDGET.set(s, memo)
  }
  const key = `${g.year}:${card.uid}`
  const known = memo.get(key)
  if (known !== undefined) {
    return known
  }
  const base = plannedPolicy(s, g.year, card.uid)
  const run = (policy: Policy) => simulate({ decisions: [...s.decisions, { year: g.year, patch: policy }], events: s.events, until: g.year }).at(-1)!
  const cost = Math.round((run({ ...base, ...promiseRemaining(card.pledge, BASE_POLICY, base) }).deficit - run(base).deficit) * 10) / 10
  memo.set(key, cost)
  return cost
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

/**
 * Ce que coûte une carte en énergie, selon la conjoncture. Une mesure : le vrai coût politique de la réforme pour ce joueur,
 * et au moins deux points (la faire voter au Parlement).
 */
export function cardCost(g: Game, side: Side, card: Card): number {
  const ctx = contextOf(g)
  if (card.kind === 'crise') {
    return Math.max(1, CRISES[card.crisis].cost + (ctx.crisis ?? 0))
  }
  if (card.kind === 'action') {
    return ACTIONS[card.action].cost
  }
  const s = g.seats[side]
  const planned = plannedPolicy(s, g.year, card.uid)
  const shift = ctx.domains?.names.includes(card.pledge.measure!.domain) ? ctx.domains.delta : 0
  return Math.max(1, Math.max(LAW_COST, planCost(promiseRemaining(card.pledge, BASE_POLICY, planned), policyAt(s.decisions, g.year))) + shift)
}

/** Le prix d'une carte au marché : son coût de base, plus un si c'est la promesse de quelqu'un (elle vaut cher à son auteur). */
export function marketPrice(g: Game, card: Card): number {
  const base = card.kind === 'crise' ? CRISES[card.crisis].cost : card.kind === 'action' ? ACTIONS[card.action].cost : 2
  return base + (promiseOwner(g, card) ? 1 : 0)
}

export const lawsOf = (s: Seat) => s.played.filter((p) => p.card.kind === 'mesure').length

/** Est-ce à ce joueur d'agir (son tour, et pas de crise en attente de réponse) ? */
export function yourTurn(g: Game, side: Side): string | null {
  if (g.outcome) {
    return 'La partie est finie'
  }
  if (g.pending) {
    return g.pending.from === side ? 'L’adversaire répond à votre crise' : 'Répondez d’abord à la crise'
  }
  return g.turn === side ? null : g.turn === null ? 'L’année se joue' : 'Ce n’est pas votre tour'
}

export function canPlay(g: Game, side: Side, card: Card): string | null {
  const turn = yourTurn(g, side)
  if (turn) {
    return turn
  }
  const s = g.seats[side]
  if (!s.hand.some((c) => c.uid === card.uid)) {
    return 'Pas dans votre main'
  }
  if (card.kind === 'action' && card.action === 'cellule') {
    return 'Elle se joue en réponse à une crise'
  }
  if (card.kind === 'mesure' && lawsOf(s) >= LAWS_PER_YEAR) {
    return `Déjà ${LAWS_PER_YEAR} lois cette année`
  }
  if (card.kind === 'crise' && s.played.some((p) => p.card.kind === 'crise' && p.card.crisis === card.crisis)) {
    return 'Déjà envoyée cette année'
  }
  return cardCost(g, side, card) > s.energy ? 'Pas assez d’énergie ⚡' : null
}

// — Jouer, parer, passer, jeter, vendre, acheter

function seat(g: Game, side: Side, patch: Partial<Seat>): Game {
  return { ...g, seats: { ...g.seats, [side]: { ...g.seats[side], ...patch } } }
}

const fromHand = (g: Game, side: Side, uid: string) => seat(g, side, { hand: g.seats[side].hand.filter((c) => c.uid !== uid) })

/** Poser une carte : c'est son tour. Une crise attend la réponse de sa cible ; sinon, la main passe à l'adversaire. */
export function play(g: Game, side: Side, card: Card): Game {
  if (canPlay(g, side, card)) {
    return g
  }
  const s = g.seats[side]
  const cost = cardCost(g, side, card)
  const md = budgetCost(g, side, card)
  let next = seat(fromHand(g, side, card.uid), side, { played: [...s.played, { card, cost, md }], energy: s.energy - cost })
  next = { ...next, moves: [...next.moves, { side, kind: 'jeu', card }], turn: other(side), passes: 0 }
  if (card.kind === 'crise') {
    return { ...next, pending: { card, from: side } }
  }
  if (card.kind === 'action' && card.action === 'sondage') {
    next = draw(next, side, 2)
  }
  return next
}

/** La cellule de crise que ce joueur peut opposer à la crise en attente, ou null. */
export function parryCard(g: Game, side: Side): Card | null {
  if (!g.pending || g.pending.from === side) {
    return null
  }
  const s = g.seats[side]
  return s.hand.find((c) => c.kind === 'action' && c.action === 'cellule' && ACTIONS.cellule.cost <= s.energy) ?? null
}

/** Répondre à une crise : la parer avec une cellule de crise (elle part à la défausse), ou l'encaisser (elle frappe cette année). */
export function respond(g: Game, side: Side, parry: boolean): Game {
  if (!g.pending || g.pending.from === side) {
    return g
  }
  const { card } = g.pending
  if (card.kind !== 'crise') {
    return g
  }
  const s = g.seats[side]
  const shield = parry ? parryCard(g, side) : null
  if (shield) {
    const next = seat(fromHand(g, side, shield.uid), side, { energy: s.energy - ACTIONS.cellule.cost, parried: [...s.parried, card.crisis] })
    return { ...next, pending: null, discard: [...next.discard, shield], moves: [...next.moves, { side, kind: 'parade', card }] }
  }
  return { ...seat(g, side, { received: [...s.received, card.crisis], events: [...s.events, { year: g.year, id: card.crisis }] }), pending: null }
}

/** Passer : à deux passes de suite, l'année se joue. On peut rejouer ensuite si l'adversaire, lui, rejoue. */
export function pass(g: Game, side: Side): Game {
  if (yourTurn(g, side)) {
    return g
  }
  const passes = g.passes + 1
  return { ...g, passes, turn: passes >= 2 ? null : other(side), moves: [...g.moves, { side, kind: 'passe' }] }
}

/** Jeter une carte (pendant son tour) : elle part à la défausse, et rapporte un peu d'énergie tout de suite. */
export function discard(g: Game, side: Side, uid: string): Game {
  const card = g.seats[side].hand.find((c) => c.uid === uid)
  if (!card || yourTurn(g, side)) {
    return g
  }
  const next = seat(fromHand(g, side, uid), side, { energy: g.seats[side].energy + DISCARD_GAIN })
  return { ...next, discard: [...next.discard, card], moves: [...next.moves, { side, kind: 'jet', card }] }
}

export function canSell(g: Game, side: Side, uid: string): string | null {
  const turn = yourTurn(g, side)
  if (turn) {
    return turn
  }
  if (!g.seats[side].hand.some((c) => c.uid === uid)) {
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
  if (!listing) {
    return 'Plus au marché'
  }
  const turn = yourTurn(g, side)
  if (turn) {
    return turn
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

/** Piocher dans la pioche commune ; vide, on remélange la défausse. Une main pleine ne pioche plus. */
function draw(g: Game, side: Side, n: number): Game {
  let next = g
  if (next.deck.length < n && next.discard.length) {
    next = { ...next, deck: [...next.deck, ...shuffled(next.discard, next.seed, `defausse-${next.year}-${side}`)], discard: [] }
  }
  const s = next.seats[side]
  const k = Math.min(n, Math.max(0, HAND_MAX - s.hand.length), next.deck.length)
  return { ...seat(next, side, { hand: [...s.hand, ...next.deck.slice(0, k)] }), deck: next.deck.slice(k) }
}

/** Les promesses tenues : les leviers de la France ont atteint ce que la promesse demande. */
export function keptPromises(s: Seat, year: number): Pledge[] {
  const now = policyAt(s.decisions, year)
  return s.programme.filter((p) => promiseStatus(p, BASE_POLICY, now) === 'tenue')
}

// — L'année commence, l'année se joue

/** Une nouvelle année : la conjoncture se retourne (son événement frappe les deux France), on pioche, l'énergie et la marge arrivent. */
function startYear(g: Game, cards: number): Game {
  const ctx = contextOf(g)
  const fired = ctx.event ? [{ year: g.year, id: ctx.event }] : []
  let next: Game = { ...g, world: [...g.world, ...fired], turn: firstOf(g), passes: 0, pending: null, moves: [] }
  for (const side of SIDES) {
    const s = next.seats[side]
    next = seat(next, side, { events: [...s.events, ...fired], received: [], parried: [], played: [] })
    if (cards + (ctx.draw ?? 0) > 0) {
      next = draw(next, side, cards + (ctx.draw ?? 0))
    }
  }
  for (const side of SIDES) {
    const s = next.seats[side]
    next = seat(next, side, { energy: Math.max(1, capitalOf(next, side) + s.bonus - s.malus), bonus: 0, malus: 0, margin: marginOf(next, side) })
  }
  return next
}

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
 * L'année se joue : les mesures de chacun s'appliquent à sa France, les crises encaissées et la conjoncture y sont déjà,
 * un budget trop dépensier fait réagir les marchés, et le modèle avance d'un an dans les deux France.
 */
export function resolveYear(g: Game): Game {
  const year = g.year
  const ctx = contextOf(g)
  let next: Game = { ...g, pending: null }
  const report: Report = {
    year,
    sides: {} as Report['sides'],
    context: ctx.id,
    world: [ctx.name],
    moves: g.moves.filter((m) => m.kind === 'achat' || m.kind === 'vente' || m.kind === 'jet'),
  }
  const used: Card[] = []
  for (const side of SIDES) {
    const s = next.seats[side]
    const spent = spentOf(s)
    const over = spent - s.margin
    const alert = over >= ALERT_AT
    const { patch, reverts } = yearPatch(s, year)
    const decisions = Object.keys(patch).length ? [...s.decisions, { year, patch }] : s.decisions
    const events = alert ? [...s.events, { year, id: 'eu-procedure' }] : s.events
    const states = simulate({ decisions, events, until: year })
    const before = scoreOf(s)
    const updated: Seat = { ...s, decisions, events, states, reverts, played: [] }
    // Les promesses tenues pour la première fois rapportent de l'énergie.
    const kept = keptPromises(updated, year).filter((p) => !s.rewarded.includes(p.key))
    const malus = overshootMalus(over)
    next = seat(next, side, { ...updated, rewarded: [...s.rewarded, ...kept.map((p) => p.key)], bonus: s.bonus + PROMISE_BONUS * kept.length, malus })
    used.push(...s.played.map((p) => p.card))
    report.sides[side] = {
      received: s.received,
      parried: s.parried,
      kept: kept.map((p) => p.measure!.name),
      health: scoreOf(next.seats[side]),
      before,
      played: s.played,
      earned: s.bonus + PROMISE_BONUS * kept.length,
      spent: Math.round(spent * 10) / 10,
      margin: s.margin,
      malus,
      alert,
    }
  }
  next = { ...next, discard: [...next.discard, ...used], reports: [...next.reports, report], moves: [], turn: null }
  next = { ...next, outcome: outcomeOf(next) }
  if (next.outcome) {
    return next
  }
  return startYear({ ...next, year: year + 1 }, DRAW_PER_YEAR)
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
