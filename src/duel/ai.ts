import { ACTIONS, CRISES, crisisEvent, type Card } from './cards'
import { popularity } from '../game/score'
import {
  budgetCost,
  buy,
  canBuy,
  canPlay,
  canSell,
  cardCost,
  discard,
  DRAW_PER_YEAR,
  HAND_MAX,
  lastLaw,
  lastState,
  lawLimit,
  lawsOf,
  marginLeft,
  other,
  OVERSHOOT_STEP,
  answersOf,
  pass,
  play,
  promiseOwner,
  respond,
  sell,
  REFERENDUM_ABOVE,
  type Answer,
  type Game,
  type Side,
} from './engine'
import { cardImpact } from './why'

/**
 * L'adversaire, chacun son tour : il tient son programme dès qu'il peut se le payer, ajoute les mesures que le modèle juge bonnes
 * pour son pays sans faire exploser son budget, envoie des crises (surtout quand on vient de lui en envoyer une),
 * garde de l'énergie pour parer quand il tient une parade, joue ses coups de pouce (49.3 quand il a une loi de trop, référendum
 * quand il est populaire, dissolution quand il n'a plus rien à perdre), achète au marché ce qui l'arrange,
 * et se débarrasse de ce qui ne lui sert pas, sauf de vos promesses, qu'il garde pour vous bloquer.
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
      const promise = owner === side && !me.rewarded.includes(card.pledge.key) ? 8 : 0
      // Le pays ne doit pas basculer : on évite ce qui fait monter la colère quand elle est déjà haute.
      const risk = lastState(me).discontent > 0.4 && impact.popularity < 0 ? 4 : 0
      // Le budget : dépasser la marge coûte de l'énergie l'an prochain, et à 20 Md€ les marchés s'en mêlent.
      const over = Math.max(0, budgetCost(g, side, card) - Math.max(0, marginLeft(me)))
      return promise + 1.5 * impact.health + 0.3 * impact.popularity - risk - (over / OVERSHOOT_STEP) * 2
    }
    case 'crise': {
      // Plus le pays d'en face est fragile, plus la crise fait mal ; et on rend coup pour coup.
      const revenge = me.received.length ? 1.5 : 0
      switch (card.crisis) {
        case 'fuite':
          return foe.hand.length >= 2 ? 3 + revenge : -1
        case 'debauchage':
          return foe.hand.length >= 3 ? 4.5 + revenge : -1
        case 'motion':
          // Utile tant qu'il a encore des lois à voter cette année (et redoutable s'il est impopulaire).
          return lawsOf(foe) < lawLimit(foe) ? 3.5 + (popularity(lastState(foe)) < 35 ? 2 : 0) + revenge : -1
        default:
          return 0.9 * CRISES[card.crisis].cost + 3 * lastState(foe).discontent + revenge
      }
    }
    case 'action':
      return actionValue(g, side, card)
  }
}

/** Ce que vaut une carte d'action : ses effets sur sa France (le modèle), ou ce qu'elle change à la partie. */
function actionValue(g: Game, side: Side, card: Card): number {
  if (card.kind !== 'action') {
    return 0
  }
  const me = g.seats[side]
  const pop = popularity(lastState(me))
  const laws = me.hand.filter((c) => c.kind === 'mesure' && cardCost(g, side, c) <= me.energy).length
  switch (card.action) {
    case 'cellule':
    case 'commission':
    case 'communication':
    case 'conseil':
      return 2.5
    case 'ippon':
      // Mieux qu'une cellule : le coup repart chez l'adversaire. On la garde en main.
      return 3
    case 'alignement':
      // 6 chances sur 10 : +4 points de popularité ; sinon −2.
      return 1.2
    case 'sondage':
      return me.hand.length < 4 ? 2 : 0.5
    case 'remaniement':
      // Une main sans rien de jouable : on change tout.
      return me.hand.filter((c) => !canPlay(g, side, c)).length <= 1 && me.hand.length >= 4 ? 2 : -1
    case 'discours':
      return 3
    case 'sondage-truque':
      return 0.6
    case '49-3':
      return lawsOf(me) >= lawLimit(me) && laws > 0 ? 4 : -1
    case 'referendum':
      return lastLaw(me) && pop > REFERENDUM_ABOVE ? 5 : -3
    case 'dissolution':
      // Quitte ou double : seulement quand on est populaire (on a plus de chances de gagner les législatives).
      return pop >= 55 ? 2 : -2
    case 'relance-ue':
      return 5
    case 'tweet':
      return 0.3
    default: {
      const impact = cardImpact(g, side, card)
      return impact ? 1.5 * impact.health + 0.3 * impact.popularity : 0
    }
  }
}

export type AiAction = { kind: 'buy' | 'play' | 'sell' | 'discard' | 'pass'; card?: Card }

/** La prochaine action de l'IA pendant son tour : acheter, faire de la place (gratuit), puis poser une carte ou passer. */
export function nextAiAction(g: Game, side: Side = 'ai'): AiAction {
  const me = g.seats[side]
  // 1. Au marché : sa propre promesse, ou une bonne affaire.
  const deal = g.market
    .filter((l) => !canBuy(g, side, l.card.uid))
    .map((l) => ({ l, v: (promiseOwner(g, l.card) === side ? 8 : value(g, side, l.card)) - l.price }))
    .filter((x) => x.v > 1.5)
    .sort((a, b) => b.v - a.v)[0]
  if (deal) {
    return { kind: 'buy', card: deal.l.card }
  }
  // 2. Poser la carte qui rapporte le plus par point d'énergie, en gardant de quoi parer si l'on tient une cellule de crise.
  const shields = me.hand.flatMap((c) => (c.kind === 'action' && ACTIONS[c.action].reaction ? [ACTIONS[c.action].cost] : []))
  const reserve = shields.length && g.seats[other(side)].energy > 0 ? Math.min(...shields) : 0
  const best = me.hand
    .filter((c) => !canPlay(g, side, c))
    .map((c) => ({ c, cost: cardCost(g, side, c), v: value(g, side, c) / Math.max(1, cardCost(g, side, c)) }))
    .filter((o) => o.v > 0.4 && (me.energy - o.cost >= reserve || o.v > 3))
    .sort((a, b) => b.v - a.v)[0]
  if (best) {
    return { kind: 'play', card: best.c }
  }
  // 3. Avant de passer, faire de la place pour la pioche (jamais les promesses de quelqu'un : il les garde).
  if (me.hand.length > HAND_MAX - DRAW_PER_YEAR) {
    const useless = me.hand
      .filter((c) => !promiseOwner(g, c))
      .map((c) => ({ c, v: value(g, side, c) }))
      .sort((a, b) => a.v - b.v)[0]
    if (useless && useless.v < 0.5) {
      return { kind: canSell(g, side, useless.c.uid) ? 'discard' : 'sell', card: useless.c }
    }
  }
  return { kind: 'pass' }
}

/**
 * Répondre à la carte en attente. Une loi de l'adversaire : la censurer si c'est une de ses promesses ou si elle lui fait du bien.
 * Un coup : le parer s'il fait assez mal (la commission d'enquête d'abord, elle coûte moins), sinon l'amortir, sinon l'encaisser.
 */
export function aiAnswer(g: Game, side: Side = 'ai'): Answer | null {
  const options = answersOf(g, side)
  if (!g.pending || !options.length) {
    return null
  }
  const { card, from } = g.pending
  if (card.kind === 'mesure') {
    const impact = cardImpact(g, from, card)
    return promiseOwner(g, card) === from || (impact?.health ?? 0) >= 2 ? 'conseil' : null
  }
  if (card.kind !== 'crise') {
    return null
  }
  // L'ippon ne se refuse pas : même un petit coup, renvoyé, fait mal à l'envoyeur.
  if (options.includes('ippon')) {
    return 'ippon'
  }
  const hurts = CRISES[card.crisis].cost >= 2 || lastState(g.seats[side]).discontent > 0.35 || crisisEvent(card.crisis) === null
  if (!hurts) {
    return null
  }
  // La commission d'abord (elle coûte moins), puis la cellule, la communication.
  return options.includes('commission') ? 'commission' : options.includes('cellule') ? 'cellule' : 'communication'
}

export function applyAi(g: Game, action: AiAction, side: Side = 'ai'): Game {
  switch (action.kind) {
    case 'buy':
      return buy(g, side, action.card!.uid)
    case 'play':
      return play(g, side, action.card!)
    case 'sell':
      return sell(g, side, action.card!.uid)
    case 'discard':
      return discard(g, side, action.card!.uid)
    case 'pass':
      return pass(g, side)
  }
}

/** Une étape de l'IA pour `side` : répondre à une crise qui la vise, ou agir si c'est son tour (null : rien à faire). */
export function aiStep(g: Game, side: Side = 'ai'): Game | null {
  if (g.outcome) {
    return null
  }
  if (g.pending) {
    return g.pending.from === side ? null : respond(g, side, aiAnswer(g, side))
  }
  if (g.turn !== side) {
    return null
  }
  const next = applyAi(g, nextAiAction(g, side), side)
  // Une action refusée (ne devrait pas arriver) : on passe, pour ne jamais bloquer la partie.
  return next === g ? pass(g, side) : next
}

/** Les deux camps joués par l'IA jusqu'à ce que l'année soit prête à se jouer (pour les tests et les essais). */
export function playAiYear(g: Game, sides: Side[] = ['player', 'ai']): Game {
  let next = g
  for (let guard = 0; guard < 80 && next.turn !== null && !next.outcome; guard += 1) {
    const actor = next.pending ? other(next.pending.from) : next.turn
    const step = sides.includes(actor) ? aiStep(next, actor) : null
    if (!step) {
      break
    }
    next = step
  }
  return next
}
