import { LINKS, NODE_BY_ID } from '../model/graph'
import type { Overrides } from '../model/params'
import { policyAt, simulate } from '../model/sim'
import type { Decision, FiredEvent, Policy, PolicyKey, YearState } from '../model/types'
import { num, signed } from '../ui/format'
import { formatLever, LEVER_GROUPS, type LeverDef } from '../ui/levers'
import { readNode } from '../ui/nodeValues'

/**
 * L'avis détaillé d'un ministre : d'où vient l'effet annoncé pour l'an prochain.
 * Tout est recalculé par la simulation : la part de chaque levier (en le bougeant seul),
 * les mécanismes (les causes de l'indicateur dans le graphe du modèle, et ce que la décision y change),
 * et, pour le budget, les recettes et dépenses qui bougent et qui paie.
 */
export type Topic = 'deficit' | 'unemployment' | 'poverty' | 'emissions' | 'inflation' | 'discontent'

type Metric = { node: string; label: string; get: (s: YearState) => number; show: (d: number) => string; goodWhenUp: boolean }

const pts = (d: number) => `${signed(d * 100, 1)} pt`
export const METRICS: Record<Topic, Metric> = {
  deficit: { node: 'deficit', label: 'Déficit public', get: (s) => s.deficit, show: (d) => `${signed(d, 0)} Md€`, goodWhenUp: false },
  unemployment: { node: 'unemployment', label: 'Chômage', get: (s) => s.unemployment, show: pts, goodWhenUp: false },
  poverty: { node: 'poverty', label: 'Pauvreté', get: (s) => s.poverty, show: pts, goodWhenUp: false },
  emissions: { node: 'frenchEmissions', label: 'Émissions françaises', get: (s) => s.frenchEmissions, show: (d) => `${signed(d, 0)} Mt de CO2`, goodWhenUp: false },
  inflation: { node: 'inflation', label: 'Inflation', get: (s) => s.inflation, show: pts, goodWhenUp: false },
  discontent: { node: 'discontent', label: 'Colère', get: (s) => s.discontent, show: (d) => signed(d, 2), goodWhenUp: false },
}

export type LeverPart = { key: PolicyKey; label: string; change: string; value: number }
export type Mechanism = { id: string; name: string; now: string; delta: string; explanation: string; causes: Mechanism[] }
export type MoneyLine = { label: string; value: number }
export type AdviceDetail = {
  topic: Topic
  metric: Metric
  year: number
  total: number
  /** La part de chaque levier bougé, s'il était seul. */
  levers: LeverPart[]
  /** Ce qui vient de la combinaison des leviers (ils se renforcent ou se compensent). */
  combination: number
  mechanisms: Mechanism[]
  /** Pour le budget : ce qui change dans les recettes et les dépenses publiques. */
  money: { revenue: MoneyLine[]; spending: MoneyLine[]; privateInvestment: number; firmDebt: number } | null
}

const LEVERS: Record<string, LeverDef> = Object.fromEntries(LEVER_GROUPS.flatMap((g) => g.levers.map((l) => [l.key, l])))

type Input = { decisions: Decision[]; events: FiredEvent[]; year: number; params: Overrides; draft: Partial<Policy> }

const nextYear = (input: Input, patch: Partial<Policy> | null) =>
  simulate({ decisions: patch ? [...input.decisions, { year: input.year + 1, patch }] : input.decisions, events: input.events, until: input.year + 1, params: input.params }).at(-1)!

/** Les causes d'une variable qui ont bougé, et (un cran plus haut) les causes de ces causes. */
function mechanismsOf(node: string, withDraft: YearState, without: YearState, depth: number, seen: Set<string>): Mechanism[] {
  const out: Mechanism[] = []
  for (const link of LINKS.filter((l) => l.to === node)) {
    if (seen.has(link.from)) {
      continue
    }
    const reading = readNode(link.from, withDraft, without)
    const graphNode = NODE_BY_ID[link.from]
    if (!reading?.moved || !reading.delta || !graphNode) {
      continue
    }
    const next = new Set(seen).add(link.from)
    out.push({
      id: link.from,
      name: graphNode.name,
      now: reading.now,
      delta: reading.delta,
      explanation: link.explanation || graphNode.explanation,
      causes: depth > 1 ? mechanismsOf(link.from, withDraft, without, depth - 1, next) : [],
    })
  }
  return out
}

const diffLines = (a: Record<string, number>, b: Record<string, number>): MoneyLine[] =>
  Object.keys({ ...a, ...b })
    .map((label) => ({ label, value: (a[label] ?? 0) - (b[label] ?? 0) }))
    .filter((l) => Math.abs(l.value) >= 0.5)
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))

export function adviceDetail(input: Input, topic: Topic): AdviceDetail {
  const metric = METRICS[topic]
  const without = nextYear(input, null)
  const withDraft = nextYear(input, input.draft)
  const total = metric.get(withDraft) - metric.get(without)
  const current = policyAt(input.decisions, input.year + 1)
  const keys = (Object.keys(input.draft) as PolicyKey[]).filter((k) => LEVERS[k])
  const levers = keys
    .map((key) => {
      const def = LEVERS[key]
      const alone = nextYear(input, { [key]: input.draft[key] } as Partial<Policy>)
      return {
        key,
        label: def.label,
        change: `${formatLever(def, current[key] as number)} → ${formatLever(def, input.draft[key] as number)}`,
        value: metric.get(alone) - metric.get(without),
      }
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const combination = keys.length > 1 ? total - levers.reduce((a, l) => a + l.value, 0) : 0
  const money =
    topic === 'deficit'
      ? {
          // Les recettes en plus réduisent le déficit : on les montre avec leur signe propre (+ = plus de recettes).
          revenue: diffLines(withDraft.taxes, without.taxes),
          spending: diffLines(withDraft.budget, without.budget),
          privateInvestment: withDraft.investment + withDraft.housing - (without.investment + without.housing),
          firmDebt: withDraft.firmDebt - without.firmDebt,
        }
      : null
  return {
    topic,
    metric,
    year: input.year + 1,
    total,
    levers,
    combination,
    mechanisms: mechanismsOf(metric.node, withDraft, without, 2, new Set([metric.node])),
    money,
  }
}

/** Un montant en Md€ signé, pour les lignes du budget. */
export const money = (v: number) => `${signed(v, 0)} Md€`
export const amount = (v: number) => `${num(Math.abs(v), 0)} Md€`
