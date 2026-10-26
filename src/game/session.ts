import { rollEvents } from '../model/events'
import { policyAt, simulate } from '../model/sim'
import type { Decision, Ending, FiredEvent, Policy, YearState } from '../model/types'
import { LEVER_GROUPS, type LeverDef } from '../ui/levers'
import { CANCEL_COST, politicalCapital, reformCost } from './capital'
import { evaluate, type Scenario } from './scenarios'
import { electionAt, isElectionYear, popularity } from './score'

/**
 * Une partie jouée comme dans le jeu, année après année : le joueur prépare ses réformes pendant une année
 * (dans la limite de son capital politique), elles s'appliquent l'année suivante ; le monde tire ses événements
 * au sort ; les élections et les fins de partie peuvent arrêter la partie.
 * Sert aux tests de non-régression des scénarios, et à jouer des stratégies sans l'interface.
 */
export type Plan = Record<number, Partial<Policy>>

export type SessionInput = {
  scenario?: Scenario
  /**
   * Les réformes, par année où elles s'appliquent ; ou une fonction qui les choisit chaque année,
   * en voyant la situation, la politique en vigueur et le capital politique disponible (un joueur qui s'adapte).
   */
  plan: Plan | ((turn: { year: number; state: YearState; current: Policy; capital: number }) => Partial<Policy> | null)
  /** Dernière année jouée (par défaut, la fin du scénario). */
  until?: number
  /** Une graine pour les événements tirés au sort ; sans graine, seuls les événements du scénario arrivent. */
  seed?: number
  /** Élections tous les cinq ans (vrai par défaut, comme en partie libre et en scénario). */
  elections?: boolean
  /** L'année où le joueur prend les commandes (par défaut 2025) : avant, la France suit sa politique ; l'élection de cette année-là est celle qu'il vient de gagner. */
  from?: number
}

export type Session = {
  states: YearState[]
  events: FiredEvent[]
  decisions: Decision[]
  /** Les années où le plan demandait plus de réformes que le capital politique ne le permettait. */
  overBudget: { year: number; cost: number; capital: number }[]
  /** Comment la partie s'est arrêtée avant la fin, si c'est le cas. */
  lost: { year: number; reason: Ending | 'election' } | null
  evaluation: ReturnType<typeof evaluate> | null
}

const START = 2025
const LEVERS: Record<string, LeverDef> = Object.fromEntries(LEVER_GROUPS.flatMap((g) => g.levers.map((l) => [l.key, l])))

/** Ce que coûte une réforme en capital politique (même règle que dans le jeu). */
export function planCost(patch: Partial<Policy>, current: Policy): number {
  return Object.entries(patch).reduce((total, [key, value]) => {
    if (key === 'cancelShare') {
      return total + ((value as number) > 0 ? CANCEL_COST : 0)
    }
    const def = LEVERS[key]
    return total + (def ? reformCost(def, current[def.key] as number, value as number) : 0)
  }, 0)
}

/** La partie s'arrête-t-elle cette année (élection perdue, fin de partie) ? */
function stopAt(s: YearState, elections: boolean, from: number): Session['lost'] {
  if (s.ending) {
    return { year: s.year, reason: s.ending }
  }
  if (elections && isElectionYear(s.year) && s.year > from && !electionAt(s).won) {
    return { year: s.year, reason: 'election' }
  }
  return null
}

export function playSession({ scenario, plan, until, seed, elections = true, from = START }: SessionInput): Session {
  const end = until ?? scenario?.end ?? 2075
  const events: FiredEvent[] = [...(scenario?.events ?? [])]
  const decisions: Decision[] = []
  const overBudget: Session['overBudget'] = []
  let states = simulate({ decisions, events, until: START })
  let lost: Session['lost'] = null
  for (let year = START; year < end; year += 1) {
    const s = states.at(-1)!
    lost = stopAt(s, elections, from)
    if (lost) {
      break
    }
    const capital = politicalCapital(popularity(s), year === from || (elections && isElectionYear(year)))
    const current = policyAt(decisions, year + 1)
    const patch = year < from ? null : typeof plan === 'function' ? plan({ year: year + 1, state: s, current, capital }) : plan[year + 1]
    if (patch && Object.keys(patch).length) {
      const cost = planCost(patch, current)
      if (cost > capital) {
        overBudget.push({ year: year + 1, cost, capital })
      }
      decisions.push({ year: year + 1, patch })
    }
    if (seed !== undefined) {
      events.push(...rollEvents(seed, year + 1, s, states[0], events))
    }
    states = simulate({ decisions, events, until: year + 1 })
  }
  lost ??= stopAt(states.at(-1)!, elections, from)
  return { states, events, decisions, overBudget, lost, evaluation: scenario ? evaluate(scenario, states) : null }
}
