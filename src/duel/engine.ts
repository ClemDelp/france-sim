import { BASE_POLICY } from '../model/calibration'
import { EVENTS, rollEvents } from '../model/events'
import { policyAt, simulate } from '../model/sim'
import type { Decision, FiredEvent, Policy, YearState } from '../model/types'
import { promisePatch, promiseRemaining, promiseStatus, type Candidate, type Pledge } from '../game/candidates'
import { politicalCapital } from '../game/capital'
import { popularity } from '../game/score'
import { planCost } from '../game/session'
import { ACTIONS, buildDeck, CRISES, programmeOf, type Card, type CrisisId } from './cards'
import { health } from './health'

/**
 * Le duel : deux présidents, chacun à la tête de sa propre France (la même au départ, en 2027).
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

export type Seat = {
  /** Le candidat incarné, ou null : un programme tiré au sort (le joueur) ou le bot. */
  candidate: Candidate | null
  name: string
  emblem: string
  color: string
  programme: Pledge[]
  /** Les promesses déjà tenues une fois (le bonus n'est donné qu'une fois). */
  rewarded: string[]
  deck: Card[]
  hand: Card[]
  /** Les cartes jouées cette année (on peut les reprendre tant que l'année n'est pas jouée). */
  played: { card: Card; cost: number }[]
  energy: number
  /** L'énergie gagnée par les promesses tenues, en réserve. */
  bonus: number
  /** Une cellule de crise est prête. */
  shield: boolean
  decisions: Decision[]
  events: FiredEvent[]
  states: YearState[]
  /** Les mesures temporaires à défaire l'an prochain. */
  reverts: Partial<Policy>
}

export type Report = {
  year: number
  /** Pour chaque camp : les crises reçues (et parées), les événements du monde, les promesses tenues cette année. */
  sides: Record<Side, { received: CrisisId[]; parried: CrisisId[]; kept: string[]; health: number; before: number }>
  world: string[]
}

export type Outcome = { winner: Side | 'nul'; reason: string }

export type Game = {
  seed: number
  years: number
  year: number
  seats: Record<Side, Seat>
  /** Les événements du monde (les mêmes pour les deux France, tirés sur une France de référence). */
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

function seatFor(p: Player, seed: number, salt: string, states: YearState[]): Seat {
  const programme = programmeOf(p.candidate, seed, salt)
  const deck = buildDeck(programme, seed, salt)
  return {
    candidate: p.candidate,
    name: p.name,
    emblem: p.emblem,
    color: p.color,
    programme,
    rewarded: [],
    deck: deck.slice(HAND_START),
    hand: deck.slice(0, HAND_START),
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
  const g: Game = {
    seed: options.seed,
    years: options.years,
    year: START_YEAR + 1,
    seats: { player: seatFor(player, options.seed, 'joueur', states), ai: seatFor(ai, options.seed, 'ia', states) },
    world: [],
    reports: [],
    outcome: null,
  }
  return withEnergy(g)
}

// — L'énergie et les coûts

/** L'énergie de l'année : le capital politique (selon la popularité, selon le modèle), plus la réserve des promesses tenues. */
export const capitalOf = (g: Game, side: Side) => politicalCapital(popularity(lastState(g.seats[side])), g.year === START_YEAR + 1)

function withEnergy(g: Game): Game {
  let next = g
  for (const side of SIDES) {
    const s = next.seats[side]
    next = seat(next, side, { energy: capitalOf(next, side) + s.bonus, bonus: 0 })
  }
  return next
}

/** La politique de l'an prochain, avec les mesures déjà jouées cette année. */
export function plannedPolicy(s: Seat, year: number, except?: string): Policy {
  let policy: Policy = { ...policyAt(s.decisions, year), ...s.reverts }
  for (const { card } of s.played) {
    if (card.kind === 'mesure' && card.uid !== except) {
      policy = { ...policy, ...promiseRemaining(card.pledge, BASE_POLICY, policy) }
    }
  }
  return policy
}

/** Ce que coûte une carte en énergie (une mesure : le vrai coût politique de la réforme). */
export function cardCost(g: Game, side: Side, card: Card): number {
  if (card.kind === 'crise') {
    return CRISES[card.crisis].cost
  }
  if (card.kind === 'action') {
    return ACTIONS[card.action].cost
  }
  const s = g.seats[side]
  const planned = plannedPolicy(s, g.year)
  return Math.max(1, planCost(promiseRemaining(card.pledge, BASE_POLICY, planned), policyAt(s.decisions, g.year)))
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

// — Jouer, reprendre, finir l'année

function seat(g: Game, side: Side, patch: Partial<Seat>): Game {
  return { ...g, seats: { ...g.seats, [side]: { ...g.seats[side], ...patch } } }
}

export function play(g: Game, side: Side, card: Card): Game {
  if (canPlay(g, side, card)) {
    return g
  }
  const s = g.seats[side]
  const cost = cardCost(g, side, card)
  let next = seat(g, side, { hand: s.hand.filter((c) => c.uid !== card.uid), played: [...s.played, { card, cost }], energy: s.energy - cost })
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
  return seat(g, side, { hand: [...s.hand, entry.card], played: s.played.filter((p) => p !== entry), energy: s.energy + entry.cost })
}

function draw(g: Game, side: Side, n: number): Game {
  const s = g.seats[side]
  const room = Math.max(0, HAND_MAX - s.hand.length)
  const k = Math.min(n, room, s.deck.length)
  return seat(g, side, { hand: [...s.hand, ...s.deck.slice(0, k)], deck: s.deck.slice(k) })
}

/** Les promesses tenues : les leviers de la France ont atteint ce que la promesse demande. */
export function keptPromises(s: Seat, year: number): Pledge[] {
  const now = policyAt(s.decisions, year)
  return s.programme.filter((p) => promiseStatus(p, BASE_POLICY, now) === 'tenue')
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
  const world = [...g.world, ...rolled]
  let next: Game = { ...g, world }
  const report: Report = { year, sides: {} as Report['sides'], world: rolled.map((e) => EVENTS.find((d) => d.id === e.id)?.label ?? e.id) }
  for (const side of SIDES) {
    const s = next.seats[side]
    const foe = g.seats[other(side)]
    const sent = foe.played.flatMap((p) => (p.card.kind === 'crise' ? [p.card.crisis] : []))
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
    // Les mesures de l'année, dans l'ordre où elles ont été jouées, et les mesures temporaires de l'an dernier qui s'arrêtent.
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
    const decisions = Object.keys(patch).length ? [...s.decisions, { year, patch }] : s.decisions
    const events = [...s.events, ...rolled, ...received.map((id) => ({ year, id }))]
    const states = simulate({ decisions, events, until: year })
    const before = scoreOf(s)
    const updated: Seat = { ...s, decisions, events, states, reverts, shield, played: [] }
    // Les promesses tenues pour la première fois rapportent de l'énergie.
    const kept = keptPromises(updated, year).filter((p) => !s.rewarded.includes(p.key))
    next = seat(next, side, { ...updated, rewarded: [...s.rewarded, ...kept.map((p) => p.key)], bonus: s.bonus + PROMISE_BONUS * kept.length })
    report.sides[side] = { received, parried, kept: kept.map((p) => p.measure!.name), health: scoreOf(next.seats[side]), before }
  }
  next = { ...next, reports: [...next.reports, report] }
  next = { ...next, outcome: outcomeOf(next) }
  if (next.outcome) {
    return next
  }
  next = { ...next, year: year + 1 }
  for (const side of SIDES) {
    next = draw(next, side, DRAW_PER_YEAR)
  }
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

