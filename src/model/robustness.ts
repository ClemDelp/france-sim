import { DEFAULTS, PARAM_ROWS, type Overrides } from './params'
import { simulate, type SimulationInput } from './sim'
import type { YearState } from './types'

/**
 * Ce résultat est-il solide ? On refait le calcul avec chaque hypothèse 30 % plus basse, puis 30 % plus haute
 * du modèle (les paramètres dont la fiabilité est « hypothèse »). Si l'effet d'une décision change de sens,
 * ou varie beaucoup, il dépend d'hypothèses fragiles : on le dit, et on montre lesquelles.
 */

/** Une hypothèse à tester : un paramètre, ou une ligne entière d'un tableau (toutes les tranches ou toutes les tailles d'entreprise). */
export type Hypothesis = {
  id: string
  name: string
  keys: string[]
  /** Une part ne peut pas dépasser 100 %. */
  share: boolean
  /** La plage plausible donnée dans le fichier (colonnes min et max), sinon ± 30 %. */
  range?: [number, number]
}

/** L'incertitude testée sur chaque hypothèse : ± 30 %. */
export const SPREAD = 0.3

export const HYPOTHESES: Hypothesis[] = (() => {
  const out: Hypothesis[] = []
  const seen = new Set<string>()
  for (const r of PARAM_ROWS) {
    if (!r.reliability.startsWith('hypoth') || DEFAULTS[r.id] === 0) {
      continue
    }
    const row = r.kind === 'tranche' || r.kind === 'entreprise' ? r.id.split('.')[0] : r.id
    if (seen.has(row)) {
      continue
    }
    seen.add(row)
    const keys = r.kind === 'tranche' || r.kind === 'entreprise' ? PARAM_ROWS.filter((x) => x.id.startsWith(`${row}.`)).map((x) => x.id) : [r.id]
    out.push({ id: row, name: r.kind === 'tranche' || r.kind === 'entreprise' ? r.name.replace(/ \([^)]*\)$/, '') : r.name, keys, share: r.unit === 'part' && r.kind === 'comportement', range: r.range })
  }
  return out
})()

export type Metric = { id: string; label: string; value: (s: YearState) => number; /** Écart en dessous duquel un effet est négligeable. */ epsilon: number }

export type Driver = { id: string; name: string; low: number; high: number; spread: number }

export type Robustness = {
  metric: Metric
  /** L'effet de la décision avec le modèle tel qu'il est. */
  effect: number
  low: number
  high: number
  verdict: 'solide' | 'a-nuancer' | 'fragile'
  drivers: Driver[]
}

type Input = Pick<SimulationInput, 'decisions' | 'events' | 'until' | 'params'>

function effectOf(input: Input, metrics: Metric[], params: Overrides | undefined): number[] {
  const withDecisions = simulate({ ...input, params }).at(-1)!
  const without = simulate({ ...input, decisions: [], params }).at(-1)!
  return metrics.map((m) => m.value(withDecisions) - m.value(without))
}

/**
 * Analyse la solidité des effets d'une partie. Le calcul est découpé (une hypothèse à la fois) pour ne pas
 * bloquer l'écran ; `onProgress` reçoit la part déjà faite. `signal` permet d'abandonner.
 */
export async function analyzeRobustness(input: Input, metrics: Metric[], onProgress?: (done: number) => void, signal?: { cancelled: boolean }): Promise<Robustness[] | null> {
  const base = effectOf(input, metrics, input.params)
  const results = metrics.map(() => [] as Driver[])
  for (const [i, h] of HYPOTHESES.entries()) {
    if (signal?.cancelled) {
      return null
    }
    const scaled = (bound: 0 | 1) => ({
      ...input.params,
      ...Object.fromEntries(
        h.keys.map((k) => [k, h.range ? h.range[bound] : Math.min(h.share ? 0.995 : Infinity, (input.params?.[k] ?? DEFAULTS[k]) * (bound ? 1 + SPREAD : 1 - SPREAD))]),
      ),
    })
    const low = effectOf(input, metrics, scaled(0))
    const high = effectOf(input, metrics, scaled(1))
    metrics.forEach((_, m) => {
      results[m].push({ id: h.id, name: h.name, low: low[m], high: high[m], spread: Math.max(Math.abs(low[m] - base[m]), Math.abs(high[m] - base[m])) })
    })
    onProgress?.((i + 1) / HYPOTHESES.length)
    // On rend la main au navigateur entre deux hypothèses.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return metrics.map((metric, m) => {
    const drivers = results[m].sort((a, b) => b.spread - a.spread)
    const effect = base[m]
    const values = drivers.flatMap((d) => [d.low, d.high])
    const low = Math.min(effect, ...values)
    const high = Math.max(effect, ...values)
    const big = Math.abs(effect) > metric.epsilon
    // Fragile : l'effet change de sens selon une hypothèse, ou varie de plus de moitié.
    const flips = big && drivers.some((d) => [d.low, d.high].some((v) => Math.abs(v) > metric.epsilon && Math.sign(v) !== Math.sign(effect)))
    const worst = drivers[0]?.spread ?? 0
    const verdict = !big ? (worst > 2 * metric.epsilon ? 'a-nuancer' : 'solide') : flips || worst > 0.5 * Math.abs(effect) ? 'fragile' : worst > 0.25 * Math.abs(effect) ? 'a-nuancer' : 'solide'
    return { metric, effect, low, high, verdict, drivers: drivers.slice(0, 3) }
  })
}
