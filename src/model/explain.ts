import { simulate, type SimulationInput } from './sim'
import { EVENTS } from './events'
import type { Decision, FiredEvent, YearState } from './types'

/**
 * Pourquoi la France en est là : on rejoue la partie en retirant, une à une, chaque décision et chaque événement.
 * La différence mesure ce que chacun a réellement causé. Ce qui reste, une fois toutes les causes additionnées,
 * c'est l'effet de leur combinaison : des causes qui se renforcent ou s'amortissent entre elles, sans qu'aucune
 * règle ne l'ait prévu. Rien n'est écrit à l'avance : tout sort du modèle.
 */

export type Cause = { id: string; kind: 'decision' | 'event' | 'older'; key: string; year?: number }

export type Contribution = { cause: Cause; value: number }

export type Explanation = {
  /** La valeur cette année. */
  value: number
  /** La valeur si rien ne s'était passé : ni décision, ni événement (la tendance de fond). */
  trend: number
  contributions: Contribution[]
  /** Ce que la combinaison des causes ajoute (ou retire) au-delà de leur simple somme. */
  combination: number
}

type Input = Pick<SimulationInput, 'decisions' | 'events' | 'params' | 'scenario'>

/** Un événement compte à part s'il est récent (8 ans) ou si ses effets durent encore ; les plus anciens sont regroupés. */
const isRecent = (e: FiredEvent, year: number) => year - e.year < 8 || (EVENTS.find((d) => d.id === e.id)?.effects.length ?? 0) > year - e.year

/** Les causes en jeu : chaque levier bougé (toutes années confondues), chaque événement récent, et les plus anciens ensemble. */
export function causesOf(decisions: Decision[], events: FiredEvent[], year: number): Cause[] {
  const keys = new Set<string>()
  for (const d of decisions.filter((x) => x.year <= year)) {
    for (const k of Object.keys(d.patch)) {
      keys.add(k === 'cancelHolder' || k === 'cancelShare' ? 'cancel' : k)
    }
  }
  return [
    ...[...keys].map((key): Cause => ({ id: `decision:${key}`, kind: 'decision', key })),
    ...events.filter((e) => e.year <= year && isRecent(e, year)).map((e): Cause => ({ id: `event:${e.id}:${e.year}`, kind: 'event', key: e.id, year: e.year })),
    ...(events.some((e) => e.year <= year && !isRecent(e, year)) ? [{ id: 'older', kind: 'older' as const, key: 'older' }] : []),
  ]
}

function without(input: Input, cause: Cause, year: number): Input {
  if (cause.kind === 'older') {
    return { ...input, events: input.events.filter((e) => e.year > year || isRecent(e, year)) }
  }
  if (cause.kind === 'event') {
    return { ...input, events: input.events.filter((e) => !(e.id === cause.key && e.year === cause.year)) }
  }
  const drop = cause.key === 'cancel' ? ['cancelShare', 'cancelHolder'] : [cause.key]
  return {
    ...input,
    decisions: input.decisions.map((d) => ({ ...d, patch: Object.fromEntries(Object.entries(d.patch).filter(([k]) => !drop.includes(k))) })).filter((d) => Object.keys(d.patch).length),
  }
}

const at = (states: YearState[], year: number) => states.find((s) => s.year === year)!

/**
 * Explique `year` pour plusieurs indicateurs à la fois. Découpé cause par cause pour ne pas bloquer l'écran ;
 * `onProgress` reçoit la part déjà faite.
 */
export async function explainYear(
  input: Input,
  year: number,
  metrics: Record<string, (s: YearState) => number>,
  onProgress?: (done: number) => void,
  signal?: { cancelled: boolean },
): Promise<Record<string, Explanation> | null> {
  const run = (i: Input) => at(simulate({ ...i, until: year }), year)
  const full = run(input)
  const trend = run({ ...input, decisions: [], events: [] })
  const causes = causesOf(input.decisions, input.events, year)
  const values: Record<string, number>[] = []
  for (const [i, cause] of causes.entries()) {
    if (signal?.cancelled) {
      return null
    }
    const s = run(without(input, cause, year))
    values.push(Object.fromEntries(Object.entries(metrics).map(([k, f]) => [k, f(full) - f(s)])))
    onProgress?.((i + 1) / Math.max(1, causes.length))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return Object.fromEntries(
    Object.entries(metrics).map(([k, f]) => {
      const contributions = causes.map((cause, i) => ({ cause, value: values[i][k] })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      const total = f(full) - f(trend)
      const sum = contributions.reduce((a, c) => a + c.value, 0)
      return [k, { value: f(full), trend: f(trend), contributions, combination: total - sum }]
    }),
  )
}
