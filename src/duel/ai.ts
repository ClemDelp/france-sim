import { CRISES, type Card } from './cards'
import { buy, canBuy, canPlay, canSell, cardCost, discard, HAND_MAX, lastState, other, play, promiseOwner, sell, type Game, type Side } from './engine'
import { cardImpact } from './why'

/**
 * L'adversaire : il tient son programme dès qu'il peut se le payer, ajoute les mesures que le modèle juge bonnes pour son pays,
 * envoie des crises (pas dans une cellule de crise : il la voit), achète au marché ce qui l'arrange,
 * et se débarrasse de ce qui ne lui sert pas (garder vos promesses ne vous bloque pas : vous avez reçu les mêmes cartes).
 */

/** Ce que vaut une carte pour `side`, en points de note à peu près. */
function value(g: Game, side: Side, card: Card): number {
  const me = g.seats[side]
  const foe = g.seats[other(side)]
  const owner = promiseOwner(g, card)
  switch (card.kind) {
    case 'mesure': {
      const impact = cardImpact(g, side, card)!
      // Sa propre promesse compte double : elle rapproche de la victoire et rapporte de l'énergie.
      const promise = owner === side && !me.rewarded.includes(card.pledge.key) && !me.played.some((p) => p.card.kind === 'mesure' && p.card.pledge.key === card.pledge.key) ? 6 : 0
      // Le pays ne doit pas basculer : on évite ce qui fait monter la colère quand elle est déjà haute.
      const risk = lastState(me).discontent > 0.4 && impact.popularity < 0 ? 4 : 0
      return promise + 1.5 * impact.health + 0.3 * impact.popularity - risk
    }
    case 'crise':
      if (foe.shield) {
        return CRISES[card.crisis].cost <= 2 ? 1 : -1
      }
      // Plus le pays d'en face est fragile, plus la crise fait mal.
      return 1.2 * CRISES[card.crisis].cost + 4 * lastState(foe).discontent
    case 'action':
      return card.action === 'cellule' ? (me.shield ? -1 : 2.5) : me.hand.length < 4 ? 2 : 0.5
  }
}

export type AiAction = { kind: 'buy' | 'play' | 'sell' | 'discard'; card: Card }

/** La prochaine action de l'IA cette année, ou null si elle a fini. */
export function nextAiAction(g: Game, side: Side = 'ai'): AiAction | null {
  const me = g.seats[side]
  // 1. Au marché : sa propre promesse, ou une bonne affaire.
  // Une carte qu'il a déjà en main (les deux joueurs reçoivent les mêmes) ne l'intéresse pas.
  const held = (card: Card) => card.kind === 'mesure' && me.hand.some((c) => c.kind === 'mesure' && c.pledge.key === card.pledge.key)
  const deal = g.market
    .filter((l) => !canBuy(g, side, l.card.uid) && !held(l.card))
    .map((l) => ({ l, v: (promiseOwner(g, l.card) === side && !me.rewarded.includes(l.card.kind === 'mesure' ? l.card.pledge.key : '') ? 8 : value(g, side, l.card)) - l.price }))
    .filter((x) => x.v > 1.5)
    .sort((a, b) => b.v - a.v)[0]
  if (deal) {
    return { kind: 'buy', card: deal.l.card }
  }
  // 2. Jouer : la carte qui rapporte le plus par point d'énergie.
  const best = me.hand
    .filter((c) => !canPlay(g, side, c))
    .map((c) => ({ c, v: value(g, side, c) / Math.max(1, cardCost(g, side, c)) }))
    .filter((o) => o.v > 0.4)
    .sort((a, b) => b.v - a.v)[0]
  if (best) {
    return { kind: 'play', card: best.c }
  }
  // 3. Faire de la place : vendre ou jeter ce qui ne sert à rien (sauf ses propres promesses).
  if (me.hand.length >= HAND_MAX - 2) {
    const useless = me.hand
      .filter((c) => promiseOwner(g, c) !== side || (c.kind === 'mesure' && me.rewarded.includes(c.pledge.key)))
      .map((c) => ({ c, v: value(g, side, c) }))
      .sort((a, b) => a.v - b.v)[0]
    if (useless && useless.v < 0.5) {
      return { kind: canSell(g, side, useless.c.uid) ? 'discard' : 'sell', card: useless.c }
    }
  }
  return null
}

export function applyAi(g: Game, action: AiAction, side: Side = 'ai'): Game {
  switch (action.kind) {
    case 'buy':
      return buy(g, side, action.card.uid)
    case 'play':
      return play(g, side, action.card)
    case 'sell':
      return sell(g, side, action.card.uid)
    case 'discard':
      return discard(g, side, action.card.uid)
  }
}

/** L'IA joue toute son année d'un coup (pour les tests). */
export function playAiYear(g: Game, side: Side = 'ai'): Game {
  let next = g
  for (let guard = 0; guard < 16; guard += 1) {
    const action = nextAiAction(next, side)
    if (!action) {
      break
    }
    const after = applyAi(next, action, side)
    if (after === next) {
      break
    }
    next = after
  }
  return next
}
