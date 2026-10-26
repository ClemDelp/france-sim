import { BASE_POLICY } from '../model/calibration'
import { rollEvents } from '../model/events'
import { simulate } from '../model/sim'
import type { FiredEvent, Policy } from '../model/types'
import { isPlayable, partialPatch, promisePatch, promiseRemaining, type Candidate, type Pledge } from './candidates'
import { playSession, planCost, type Session } from './session'

/** Le mandat : élu en 2027, jusqu'à l'élection de 2032. */
export const MANDATE_START = 2027
export const MANDATE_END = 2032
const START_YEAR = 2025

export type Mandate = Session & {
  /** L'année où chaque promesse a été appliquée (absente si le capital politique n'a pas suffi). */
  applied: { pledge: Pledge; year: number }[]
  /** Les promesses jouables restées dans les cartons. */
  pending: Pledge[]
}

/**
 * Le mandat joué « à la lettre » : chaque année, le président applique les promesses suivantes de son programme,
 * dans l'ordre, tant que son capital politique le permet ; une promesse trop chère est commencée (en partie)
 * et finie les années suivantes. Sert à comparer les programmes avec les mêmes règles (mêmes tirages au sort),
 * et aux tests de non-régression.
 */
export function playMandate(c: Candidate, options: { seed?: number } = {}): Mandate {
  const queue = c.promises.filter(isPlayable)
  const applied: Mandate['applied'] = []
  let reverts: Partial<Policy> = {}
  const session = playSession({
    from: MANDATE_START,
    until: MANDATE_END,
    seed: options.seed,
    plan: ({ year, current, capital }) => {
      // Les mesures temporaires (une « année blanche ») s'arrêtent d'elles-mêmes l'année suivante, sans coûter de capital.
      let patch: Partial<Policy> = { ...reverts }
      reverts = {}
      while (queue.length) {
        const planned = { ...current, ...patch }
        const next = promiseRemaining(queue[0], BASE_POLICY, planned)
        const merged = { ...patch, ...next }
        if (planCost(merged, current) > capital) {
          // Trop cher pour cette année : on avance ce qu'on peut, le reste l'an prochain.
          const step = partialPatch(next, planned, capital - planCost(patch, current))
          if (step) {
            patch = { ...patch, ...step }
          }
          break
        }
        patch = merged
        const { revert } = promisePatch(queue[0], planned)
        if (revert) {
          reverts = { ...reverts, ...revert }
        }
        applied.push({ pledge: queue.shift()!, year })
      }
      return Object.keys(patch).length ? patch : null
    },
  })
  return { ...session, applied, pending: queue }
}

/** La politique de départ du mandat : celle de 2025 prolongée (aucune décision avant l'élection). */
export const MANDATE_REFERENCE = BASE_POLICY

/**
 * Les événements tirés au sort avant la prise de fonctions (de 2026 à l'année de l'élection) :
 * la France dont hérite le président n'est pas toujours la même.
 */
export function eventsBeforeMandate(seed: number, until = MANDATE_START): FiredEvent[] {
  const events: FiredEvent[] = []
  for (let year = START_YEAR; year < until; year += 1) {
    const states = simulate({ decisions: [], events, until: year })
    events.push(...rollEvents(seed, year + 1, states.at(-1)!, states[0], events))
  }
  return events
}
