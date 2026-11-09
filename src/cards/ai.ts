import { simulate } from '../model/sim'
import { BASE_POLICY } from '../model/calibration'
import { promiseRemaining, type Pledge } from '../game/candidates'
import { popularity } from '../game/score'
import { canPlayPledge, canPlayTactic, censureChance, chiffrageDamage, lastState, other, playPledge, playTactic, pledgeCost, pledgeStats, plannedPolicy, roleOf, TACTICS, type Card, type Game, type Side } from './engine'

/**
 * L'adversaire : il joue comme un politique pressé, la carte qui rapporte le plus de voix pour son capital politique,
 * encore et encore tant qu'il lui en reste. Au pouvoir, il demande au modèle ce que chaque réforme fera à sa popularité
 * avant de la voter (comme le joueur peut le voir sur la carte).
 */

type Option = { value: number; cost: number; play: (g: Game) => Game }

/** Ce qu'une réforme ferait l'an prochain, selon le modèle : popularité du président (points) et déficit (Md€). */
export function reformEffect(g: Game, p: Pledge): { popularity: number; deficit: number } {
  const policy = plannedPolicy(g)
  const run = (patch: typeof policy) => simulate({ decisions: [...g.decisions, { year: g.year, patch }], events: g.events, until: g.year + 1 }).at(-1)!
  const without = run(policy)
  const withIt = run({ ...policy, ...promiseRemaining(p, BASE_POLICY, policy) })
  return { popularity: popularity(withIt) - popularity(without), deficit: Math.round(withIt.deficit - without.deficit) }
}

/** Ce qu'une réforme rapporterait au président : sa popularité (selon le modèle), et la promesse tenue. */
function reformValue(g: Game, side: Side, p: Pledge): number {
  const announced = g.seats[side].announced.some((x) => x.key === p.key)
  return 0.5 * reformEffect(g, p).popularity + 0.25 + (announced ? 0.75 : 0)
}

function tacticValue(g: Game, side: Side, card: Card, reformValues: Map<string, number>): number {
  const foe = g.seats[other(side)]
  const me = g.seats[side]
  switch (card.tactic) {
    case 'meeting':
      return 2
    case 'debat':
      return foe.exposure > me.exposure + 10 ? 4 : 2
    case 'chiffrage':
      return foe.shield ? 0.2 : chiffrageDamage(g, other(side))
    case 'fuite':
      return foe.shield ? 0.2 : 3
    case 'ralliement':
      return 4
    case 'contre-feu':
      return me.shield ? 0 : 1.2
    case 'communication':
      return 2
    case 'revelations':
      return popularity(lastState(g)) < 60 ? 3 : 1
    case 'greve':
      return popularity(lastState(g)) < 55 ? 3.5 : 1
    case 'censure': {
      const at = g.reforms.reduce((a, r) => a + (reformValues.get(r.pledge.key) ?? 1), 0)
      return (censureChance({ ...g, censureMotion: true }) - censureChance(g)) * (at + 2)
    }
    case 'remaniement':
    case '493': {
      // Utile seulement s'il permet une réforme qu'on ne peut pas se payer, et qui en vaut la peine.
      const extra = card.tactic === '493' ? 3 : 2
      const best = me.programme
        .filter((p) => pledgeCost(g, side, p) > me.mana && pledgeCost(g, side, p) <= me.mana + extra)
        .reduce((a, p) => Math.max(a, reformValues.get(p.key) ?? 0), 0)
      const risk = card.tactic === '493' ? censureChance(g) * best + 0.8 : 1
      return best - risk
    }
  }
}

function options(g: Game, side: Side, reformValues: Map<string, number>): Option[] {
  const s = g.seats[side]
  const role = roleOf(g, side)
  const out: Option[] = []
  for (const p of s.programme) {
    if (canPlayPledge(g, side, p)) {
      continue
    }
    const value = role === 'president' ? (reformValues.get(p.key) ?? 0) : role === 'opposition' ? Math.max(1, pledgeStats(p).appeal) - 0.01 * Math.max(0, pledgeStats(p).deficit) : pledgeStats(p).appeal - 0.02 * Math.max(0, pledgeStats(p).deficit)
    out.push({ value, cost: pledgeCost(g, side, p), play: (x) => playPledge(x, side, p) })
  }
  for (const card of s.hand) {
    if (canPlayTactic(g, side, card)) {
      continue
    }
    out.push({ value: tacticValue(g, side, card, reformValues), cost: Math.max(0.5, TACTICS[card.tactic].cost), play: (x) => playTactic(x, side, card) })
  }
  return out.filter((o) => o.value > 0.3)
}

/** L'IA joue son tour (sans le terminer). */
export function playAiTurn(g: Game, side: Side = 'ai'): Game {
  let next = g
  const reformValues = new Map<string, number>()
  if (roleOf(g, side) === 'president') {
    for (const p of g.seats[side].programme) {
      reformValues.set(p.key, reformValue(g, side, p))
    }
  }
  for (let guard = 0; guard < 20; guard += 1) {
    const opts = options(next, side, reformValues)
    if (!opts.length) {
      break
    }
    const best = opts.sort((a, b) => b.value / b.cost - a.value / a.cost)[0]
    const played = best.play(next)
    if (played === next) {
      break
    }
    next = played
  }
  return next
}
