import { BASE_POLICY } from '../model/calibration'
import { EVENTS } from '../model/events'
import { LINKS, NODE_BY_ID } from '../model/graph'
import { simulate } from '../model/sim'
import type { Policy, PolicyKey, World, YearState } from '../model/types'
import { promiseRemaining } from '../game/candidates'
import { popularity } from '../game/score'
import { formatLever, LEVER_GROUPS, type LeverDef } from '../ui/levers'
import type { Card } from './cards'
import { other, plannedPolicy, startState, type Game, type Side } from './engine'
import { healthParts } from './health'

/**
 * Pourquoi une carte fait ce qu'elle fait. Le modèle joue l'année deux fois, avec et sans la carte :
 * la différence donne son effet sur chaque indicateur et sur chaque critère de la note. Le graphe des causes
 * (modele/liens.csv) dit par où passe l'effet : du levier bougé jusqu'à l'indicateur, lien après lien.
 */

export type Impact = {
  /** La France touchée : la sienne (une mesure) ou celle de l'adversaire (une crise). */
  target: Side
  health: number
  /** Ce que chaque critère de la note gagne ou perd (points). */
  parts: { id: string; label: string; delta: number }[]
  indicators: { node: string; label: string; delta: number; text: string; good: boolean }[]
  popularity: number
}

const LEVERS: Record<string, LeverDef> = Object.fromEntries(LEVER_GROUPS.flatMap((g) => g.levers.map((l) => [l.key, l])))

/** Les indicateurs qu'on explique, avec le nœud du graphe qui leur correspond. */
const INDICATORS: { node: string; label: string; value: (s: YearState) => number; unit: 'pt' | 'Md€'; goodUp: boolean }[] = [
  { node: 'unemployment', label: 'Chômage', value: (s) => s.unemployment * 100, unit: 'pt', goodUp: false },
  { node: 'gdp', label: 'Croissance', value: (s) => s.growth * 100, unit: 'pt', goodUp: true },
  { node: 'inflation', label: 'Inflation', value: (s) => s.inflation * 100, unit: 'pt', goodUp: false },
  { node: 'deficit', label: 'Déficit', value: (s) => s.deficit, unit: 'Md€', goodUp: false },
  { node: 'debt', label: 'Dette', value: (s) => s.debtRatio * 100, unit: 'pt', goodUp: false },
  { node: 'disposableIncome', label: 'Pouvoir d’achat', value: (s) => s.medianIncome, unit: 'Md€', goodUp: true },
  { node: 'poverty', label: 'Pauvreté', value: (s) => s.poverty * 100, unit: 'pt', goodUp: false },
  { node: 'discontent', label: 'Colère', value: (s) => s.discontent * 100, unit: 'pt', goodUp: false },
]

const signed = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`

function compare(target: Side, withIt: YearState, without: YearState, start: YearState): Impact {
  const a = healthParts(withIt, start)
  const b = healthParts(without, start)
  const parts = a.map((p, i) => ({ id: p.id, label: p.label, delta: p.points - b[i].points })).filter((p) => Math.abs(p.delta) >= 0.05)
  const indicators = INDICATORS.map((ind) => {
    const delta = ind.value(withIt) - ind.value(without)
    // Le pouvoir d'achat : en pourcentage du revenu médian, plus parlant qu'en euros.
    const text = ind.node === 'disposableIncome' ? `${signed((delta / ind.value(without)) * 100, 1)} %` : ind.unit === 'Md€' ? `${signed(delta, 0)} Md€` : `${signed(delta, 1)} pt`
    const shown = ind.node === 'disposableIncome' ? (delta / ind.value(without)) * 100 : delta
    return { node: ind.node, label: ind.label, delta: shown, text, good: delta > 0 === ind.goodUp }
  }).filter((i) => Math.abs(i.delta) >= (i.node === 'deficit' ? 0.5 : 0.05))
  return {
    target,
    // La somme des critères, arrondie une fois : la carte annonce ce que détaille la fenêtre.
    health: Math.round(a.reduce((x, p) => x + p.points, 0) - b.reduce((x, p) => x + p.points, 0)),
    parts: parts.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)),
    indicators,
    popularity: popularity(withIt) - popularity(without),
  }
}

/** L'effet d'une carte l'an prochain : une mesure sur sa France, une crise sur la France d'en face. Null pour les actions. */
export function cardImpact(g: Game, side: Side, card: Card): Impact | null {
  if (card.kind === 'mesure') {
    const s = g.seats[side]
    const base = plannedPolicy(s, g.year, card.uid)
    const run = (policy: Policy) => simulate({ decisions: [...s.decisions, { year: g.year, patch: policy }], events: s.events, until: g.year }).at(-1)!
    return compare(side, run({ ...base, ...promiseRemaining(card.pledge, BASE_POLICY, base) }), run(base), startState(s))
  }
  if (card.kind === 'crise') {
    const foe = g.seats[other(side)]
    const policy = plannedPolicy(foe, g.year)
    const run = (extra: boolean) => simulate({ decisions: [...foe.decisions, { year: g.year, patch: policy }], events: extra ? [...foe.events, { year: g.year, id: card.crisis }] : foe.events, until: g.year }).at(-1)!
    return compare(other(side), run(true), run(false), startState(foe))
  }
  return null
}

/** Les leviers qu'une mesure bouge, de combien. */
export function leverChanges(g: Game, side: Side, card: Card): { key: PolicyKey; label: string; from: string; to: string; up: boolean }[] {
  if (card.kind !== 'mesure') {
    return []
  }
  const s = g.seats[side]
  const base = plannedPolicy(s, g.year, card.uid)
  const patch = promiseRemaining(card.pledge, BASE_POLICY, base)
  return (Object.keys(patch) as PolicyKey[])
    .filter((k) => LEVERS[k] && typeof patch[k] === 'number')
    .map((k) => ({ key: k, label: LEVERS[k].label, from: formatLever(LEVERS[k], base[k] as number), to: formatLever(LEVERS[k], patch[k] as number), up: (patch[k] as number) > (base[k] as number) }))
}

/** Ce qu'une crise fait au monde, en clair. */
const WORLD_TEXT: Partial<Record<keyof World, (v: number) => string>> = {
  growth: (v) => `croissance mondiale ${signed(v * 100, 1)} pt`,
  oil: (v) => `pétrole ${signed(v, 0)} $ le baril`,
  ecbRate: (v) => `taux de la BCE ${signed(v * 100, 1)} pt`,
  panic: () => 'panique sur les marchés',
  demandShock: (v) => `demande ${signed(-v * 100, 1)} % du PIB`,
  bankLoss: (v) => `banques : ${Math.round(v * 100)} % de leurs fonds propres perdus`,
  heatShock: () => 'dégâts et vies perdues',
  unrest: (v) => `colère ${signed(v * 100, 0)}`,
}

/** Les nœuds du graphe où une crise entre dans le modèle. */
const WORLD_NODE: Partial<Record<keyof World, string>> = { growth: 'worldGrowth', oil: 'oil', ecbRate: 'ecbRate', panic: 'crisis', demandShock: 'crisis', bankLoss: 'crisis', heatShock: 'crisis', unrest: 'discontent' }

export function crisisEffects(id: string): { text: string[]; years: number; nodes: { node: string; up: boolean }[] } {
  const def = EVENTS.find((e) => e.id === id)
  const first = def?.effects[0] ?? {}
  const keys = Object.keys(first) as (keyof World)[]
  return {
    text: keys.flatMap((k) => (WORLD_TEXT[k] ? [WORLD_TEXT[k]!(first[k] as number)] : [])),
    years: def?.effects.length ?? 1,
    nodes: keys.flatMap((k) => (WORLD_NODE[k] ? [{ node: WORLD_NODE[k]!, up: (first[k] as number) > 0 }] : [])).filter((n, i, all) => all.findIndex((x) => x.node === n.node) === i),
  }
}

export type Step = { from: string; to: string; fromName: string; toName: string; sign: '+' | '-' | '±'; explanation: string }

/** Le plus court chemin dans le graphe des causes, d'un des nœuds de départ jusqu'à `target` (au plus 4 liens). */
export function chainTo(starts: string[], target: string): Step[] | null {
  const prev = new Map<string, (typeof LINKS)[number] | null>(starts.map((s) => [s, null]))
  let frontier = starts
  for (let depth = 0; depth < 4 && !prev.has(target); depth += 1) {
    const next: string[] = []
    for (const node of frontier) {
      for (const link of LINKS.filter((l) => l.from === node && !prev.has(l.to))) {
        prev.set(link.to, link)
        next.push(link.to)
      }
    }
    frontier = next
  }
  if (!prev.has(target) || starts.includes(target)) {
    return null
  }
  const steps: Step[] = []
  for (let link = prev.get(target); link; link = prev.get(link.from)) {
    steps.unshift({ from: link.from, to: link.to, fromName: NODE_BY_ID[link.from]?.name ?? link.from, toName: NODE_BY_ID[link.to]?.name ?? link.to, sign: link.sign, explanation: link.explanation })
  }
  return steps
}

/** Où la carte entre dans le modèle (et dans quel sens) : les leviers d'une mesure, les variables du monde d'une crise. */
export function startNodes(g: Game, side: Side, card: Card): { node: string; up: boolean }[] {
  if (card.kind === 'mesure') {
    return leverChanges(g, side, card).map((l) => ({ node: l.key, up: l.up }))
  }
  return card.kind === 'crise' ? crisisEffects(card.crisis).nodes : []
}

/** Le chemin d'une carte jusqu'à un indicateur, avec le sens de chaque variable (↑ ou ↓) le long du chemin. */
export function explainChain(starts: { node: string; up: boolean }[], target: string): (Step & { fromUp: boolean; toUp: boolean | null })[] | null {
  const steps = chainTo(
    starts.map((s) => s.node),
    target,
  )
  if (!steps) {
    return null
  }
  let up = starts.find((s) => s.node === steps[0].from)?.up ?? true
  return steps.map((step) => {
    const fromUp = up
    const toUp = step.sign === '±' ? null : step.sign === '+' ? up : !up
    up = toUp ?? up
    return { ...step, fromUp, toUp }
  })
}
