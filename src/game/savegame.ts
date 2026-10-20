import type { Decision, FiredEvent, Policy } from '../model/types'
import { EVENTS } from '../model/events'
import { SCENARIOS } from './scenarios'
import { load, save } from './storage'

/**
 * La partie en cours, sauvegardée à chaque changement : sur téléphone, le système ferme souvent
 * une appli en arrière-plan, et on doit pouvoir reprendre exactement où on en était.
 * (La simulation étant déterministe, les décisions, les événements et la graine suffisent.)
 */
export type SavedGame = {
  v: 1
  /** 'free', ou l'identifiant du scénario (les idées reçues, courtes, ne sont pas sauvegardées). */
  mode: string
  decisions: Decision[]
  events: FiredEvent[]
  year: number
  seed: number
  draft: Partial<Policy>
  handled: number[]
  electionsSeen: number[]
  sandbox: boolean
}

const KEY = 'game'
const isNumberList = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number')

/** Relit une sauvegarde, ou rien si elle est absente, abîmée ou d'une version incompatible. */
export function parseSave(raw: unknown, start: number, end: number): SavedGame | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const g = raw as Partial<SavedGame>
  const knownMode = g.mode === 'free' || SCENARIOS.some((s) => s.id === g.mode)
  const validDecisions = Array.isArray(g.decisions) && g.decisions.every((d) => d && typeof d.year === 'number' && d.patch && typeof d.patch === 'object')
  const validEvents = Array.isArray(g.events) && g.events.every((e) => e && typeof e.year === 'number' && EVENTS.some((x) => x.id === e.id))
  if (
    g.v !== 1 ||
    !knownMode ||
    !validDecisions ||
    !validEvents ||
    typeof g.year !== 'number' ||
    g.year < start ||
    g.year > end ||
    typeof g.seed !== 'number' ||
    !isNumberList(g.handled) ||
    !isNumberList(g.electionsSeen)
  ) {
    return null
  }
  return {
    v: 1,
    mode: g.mode!,
    decisions: g.decisions!,
    events: g.events!,
    year: g.year,
    seed: g.seed,
    draft: g.draft && typeof g.draft === 'object' ? g.draft : {},
    handled: g.handled!,
    electionsSeen: g.electionsSeen!,
    sandbox: g.sandbox === true,
  }
}

export const loadGame = (start: number, end: number) => parseSave(load<unknown>(KEY, null), start, end)
export const saveGame = (game: SavedGame) => save(KEY, game)
