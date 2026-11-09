import { BASE_POLICY } from '../model/calibration'
import { simulate } from '../model/sim'
import { promiseRemaining } from '../game/candidates'
import { popularity } from '../game/score'
import { CRISES, type Card } from './cards'
import { canPlay, cardCost, lastState, other, play, plannedPolicy, startState, type Game, type Side } from './engine'
import { health } from './health'

/** Ce qu'une mesure ferait l'an prochain à sa France, selon le modèle (à côté de ce qui est déjà joué cette année). */
export type Preview = { health: number; unemployment: number; deficit: number; popularity: number }

export function previewMeasure(g: Game, side: Side, card: Card): Preview | null {
  if (card.kind !== 'mesure') {
    return null
  }
  const s = g.seats[side]
  const base = plannedPolicy(s, g.year, card.uid)
  const run = (policy: typeof base) => simulate({ decisions: [...s.decisions, { year: g.year, patch: policy }], events: s.events, until: g.year }).at(-1)!
  const without = run(base)
  const withIt = run({ ...base, ...promiseRemaining(card.pledge, BASE_POLICY, base) })
  const start = startState(s)
  return {
    health: health(withIt, start) - health(without, start),
    unemployment: withIt.unemployment - without.unemployment,
    deficit: withIt.deficit - without.deficit,
    popularity: popularity(withIt) - popularity(without),
  }
}

/**
 * L'adversaire : il tient son programme dès qu'il peut se le payer, ajoute les mesures que le modèle juge bonnes pour son pays,
 * et garde de l'énergie pour envoyer des crises (pas dans une cellule de crise : il la voit).
 */
function value(g: Game, side: Side, card: Card): number {
  const me = g.seats[side]
  const foe = g.seats[other(side)]
  switch (card.kind) {
    case 'mesure': {
      const p = previewMeasure(g, side, card)!
      // Une promesse compte double : elle rapproche de la victoire et rapporte de l'énergie.
      const promise = card.promise && !me.rewarded.includes(card.pledge.key) ? 6 : 0
      // Le pays ne doit pas basculer : on évite ce qui fait trop monter la colère quand elle est déjà haute.
      const risk = lastState(me).discontent > 0.4 && p.popularity < 0 ? 4 : 0
      return promise + 1.5 * p.health + 0.3 * p.popularity - risk
    }
    case 'crise': {
      if (foe.shield) {
        return CRISES[card.crisis].cost <= 2 ? 1 : -1
      }
      // Plus le pays d'en face est fragile, plus la crise fait mal.
      return 1.2 * CRISES[card.crisis].cost + 4 * lastState(foe).discontent
    }
    case 'action':
      return card.action === 'cellule' ? (me.shield ? -1 : 2.5) : me.hand.length < 4 ? 2 : 0.5
  }
}

/** La prochaine carte que l'IA joue cette année, ou null si elle a fini. */
export function nextAiCard(g: Game, side: Side = 'ai'): Card | null {
  const options = g.seats[side].hand
    .filter((c) => !canPlay(g, side, c))
    .map((c) => ({ c, v: value(g, side, c) / Math.max(1, cardCost(g, side, c)) }))
    .filter((o) => o.v > 0.4)
    .sort((a, b) => b.v - a.v)
  return options[0]?.c ?? null
}

/** L'IA joue toute son année d'un coup (pour les tests). */
export function playAiYear(g: Game, side: Side = 'ai'): Game {
  let next = g
  for (let guard = 0; guard < 12; guard += 1) {
    const card = nextAiCard(next, side)
    if (!card) {
      break
    }
    next = play(next, side, card)
  }
  return next
}
