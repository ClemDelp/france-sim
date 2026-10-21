import { policyAt, simulate } from '../model/sim'
import { rollEvents } from '../model/events'
import type { Decision, FiredEvent, Policy, PolicyKey, YearState } from '../model/types'
import { LEVER_GROUPS, type LeverDef } from '../ui/levers'
import { politicalCapital } from './capital'
import { evaluate, type Scenario } from './scenarios'
import { electionAt, isElectionYear, popularity } from './score'
import { planCost, type Plan } from './session'

/**
 * Un joueur automatique, pour éprouver les scénarios : chaque année, il cherche les réformes qui améliorent
 * le plus le résultat final du scénario, dans la limite de son capital politique (comme un joueur humain),
 * puis passe à l'année suivante. Il joue sans événements tirés au sort (on mesure la robustesse au hasard à part).
 * Il ne cherche pas l'optimum : il montre ce qu'un joueur raisonnable peut atteindre, et ce qui coince.
 */

const START = 2025
const LEVERS: LeverDef[] = LEVER_GROUPS.flatMap((g) => g.levers)

/** Le jeu d'une stratégie : étoiles, marge sur chaque objectif, élections gagnées, et une pénalité si la partie est perdue. */
export function scorePlan(sc: Scenario, plan: Plan, events: FiredEvent[] = sc.events): { score: number; stars: number; lost: string | null; states: YearState[] } {
  const decisions: Decision[] = Object.entries(plan).map(([year, patch]) => ({ year: Number(year), patch }))
  const states = simulate({ decisions, events, until: sc.end })
  const lostState = states.find((s) => s.ending || (isElectionYear(s.year) && s.year > START && !electionAt(s).won))
  const lost = lostState ? `${lostState.year} ${lostState.ending ?? 'élection'}` : null
  const evaluation = evaluate(sc, states)
  // Marge sur chaque objectif, rapportée à la cible : on récompense aussi le fait de s'en approcher.
  const margins = evaluation.results.map((r) => {
    const o = r.objective
    const worst = o.when === 'always' ? states.slice(1).reduce((w, s) => (o.op === 'below' ? Math.max(w, o.get(s)) : Math.min(w, o.get(s))), o.get(states[1] ?? states[0])) : o.get(states.at(-1)!)
    const scale = Math.max(1e-6, Math.abs(o.target))
    const margin = o.op === 'below' ? (o.target - worst) / scale : (worst - o.target) / scale
    return Math.max(-1, Math.min(0.3, margin))
  })
  const elections = states.filter((s) => isElectionYear(s.year) && s.year > START).map((s) => Math.min(0.2, (popularity(s) - 41) / 100))
  const score = evaluation.stars * 10 + margins.reduce((a, m) => a + m, 0) * 5 + elections.reduce((a, m) => a + m, 0) - (lost ? 100 : 0)
  return { score, stars: evaluation.stars, lost, states }
}

/** Les petits pas possibles sur un levier : un ou deux « crans » (un sixième de la plage) dans chaque sens. */
function moves(def: LeverDef, value: number): number[] {
  const notch = (def.max - def.min) / 6
  const out: number[] = []
  for (const k of [-2, -1, -0.5, 0.5, 1, 2]) {
    const v = Math.round((value + k * notch) / def.step) * def.step
    if (v >= def.min - 1e-9 && v <= def.max + 1e-9 && Math.abs(v - value) > 1e-9) {
      out.push(Number(v.toFixed(6)))
    }
  }
  return out
}

export type BotResult = { plan: Plan; stars: number; lost: string | null; score: number; log: string[] }

/** Joue un scénario année après année ; `lastReform` : dernière année où le joueur réforme encore (par défaut, celle d'avant la fin). */
/** Les réformes d'une année : on ajoute, un levier à la fois, celui qui améliore le plus le résultat, tant qu'il reste du capital. */
function reformYear(sc: Scenario, plan: Plan, year: number, events: FiredEvent[], best: ReturnType<typeof scorePlan>, maxSteps: number, log: string[]) {
  const locked = new Set<PolicyKey>(sc.locked?.keys ?? [])
  // Le capital de l'année où l'on prépare la réforme (l'année d'avant), selon la popularité du moment.
  const prepState = best.states.find((s) => s.year === year - 1)!
  const capital = politicalCapital(popularity(prepState), year - 1 === START || isElectionYear(year - 1))
  const patch: Partial<Policy> = {}
  // La politique en vigueur avant les réformes de cette année : c'est par rapport à elle que se compte le capital.
  const current = policyAt(
    Object.entries(plan)
      .filter(([y]) => Number(y) < year)
      .map(([y, p]) => ({ year: Number(y), patch: p })),
    year,
  )
  for (let step = 0; step < maxSteps; step += 1) {
    let candidate: { key: PolicyKey; value: number; result: ReturnType<typeof scorePlan> } | null = null
    for (const def of LEVERS) {
      if (locked.has(def.key) || def.key in patch) {
        continue
      }
      for (const value of moves(def, current[def.key] as number)) {
        const next = { ...patch, [def.key]: value }
        if (planCost(next, current) > capital) {
          continue
        }
        const result = scorePlan(sc, { ...plan, [year]: next }, events)
        if (result.score > (candidate?.result.score ?? best.score) + 1e-6) {
          candidate = { key: def.key, value, result }
        }
      }
    }
    if (!candidate) {
      break
    }
    patch[candidate.key] = candidate.value as never
    plan[year] = { ...patch }
    best = candidate.result
    log.push(`${year} : ${candidate.key} → ${candidate.value} (score ${best.score.toFixed(2)}, ${best.stars}★${best.lost ? `, perdu ${best.lost}` : ''})`)
  }
  return best
}

/** Joue un scénario année après année, sans hasard ; `lastReform` : dernière année où le joueur réforme encore. */
export function playBot(sc: Scenario, options: { lastReform?: number; maxStepsPerYear?: number } = {}): BotResult {
  const plan: Plan = {}
  const log: string[] = []
  let best = scorePlan(sc, plan)
  for (let year = START + 1; year <= (options.lastReform ?? sc.end - 1); year += 1) {
    best = reformYear(sc, plan, year, sc.events, best, options.maxStepsPerYear ?? 4, log)
  }
  return { plan, stars: best.stars, lost: best.lost, score: best.score, log }
}

/**
 * Joue comme un humain face au hasard : chaque année, le monde tire ses événements (graine), puis le joueur revoit
 * ses réformes en connaissant ce qui est arrivé, sans savoir ce qui arrivera ensuite.
 */
export function playAdaptive(sc: Scenario, seed: number, options: { maxStepsPerYear?: number } = {}): BotResult & { events: FiredEvent[] } {
  const plan: Plan = {}
  const log: string[] = []
  const events: FiredEvent[] = [...sc.events]
  let best = scorePlan(sc, plan, events)
  for (let year = START + 1; year <= sc.end; year += 1) {
    // Le joueur prépare l'année qui vient (sauf après la fin), puis le monde tire les événements de cette année.
    if (year < sc.end) {
      best = reformYear(sc, plan, year, events, best, options.maxStepsPerYear ?? 3, log)
    }
    const before = best.states.find((s) => s.year === year - 1)!
    const fired = rollEvents(seed, year, before, best.states[0], events)
    if (fired.length) {
      events.push(...fired)
      log.push(`${year} : événements ${fired.map((e) => e.id).join(', ')}`)
      best = scorePlan(sc, plan, events)
    }
  }
  return { plan, stars: best.stars, lost: best.lost, score: best.score, log, events }
}
