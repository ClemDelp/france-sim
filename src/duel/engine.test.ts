import { describe, expect, it } from 'vitest'
import { simulate } from '../model/sim'
import { CANDIDATES, candidateById, isPlayable, MEASURES } from '../game/candidates'
import { ACTIONS, buildDeck, copiesOf, CRISES, generic, inModel, programmeOf, PROGRAMME_SIZE, rarityOf, type ActionId, type Card, type CrisisId } from './cards'
import {
  ALERT_AT,
  BOT,
  goalOf,
  PROGRAMME_GOAL,
  budgetCost,
  buy,
  canBuy,
  canPlay,
  cardCost,
  contextOf,
  discard,
  DISCARD_GAIN,
  keptPromises,
  answersOf,
  lawLimit,
  LAWS_PER_YEAR,
  marginLeft,
  neutralGame,
  newGame,
  outcomeOf,
  pass,
  play,
  respond,
  resolveYear,
  scoreOf,
  sell,
  type Game,
  type Player,
} from './engine'
import { CONTEXTS } from './contexts'
import { playAiYear } from './ai'
import { CRITERIA, health } from './health'
import { cardImpact, explainChain, leverChanges, startNodes } from './why'

const as = (id: string): Player => {
  const c = candidateById(id)!
  return { candidate: c, name: c.name, emblem: c.emblem, color: c.color }
}

/** Une partie jouée par deux IA jusqu'au bout. */
function auto(g0: Game): Game {
  let g = g0
  while (!g.outcome) {
    g = resolveYear(playAiYear(g))
  }
  return g
}

/** Les deux joueurs passent : l'année est prête à se jouer. */
const bothPass = (g: Game): Game => (g.turn ? pass(pass(g, g.turn), g.turn === 'player' ? 'ai' : 'player') : g)

/** Une partie où les deux mains et les énergies sont données (pour tester une règle). */
const rich = (g: Game, player: Game['seats']['player']['hand'], ai: Game['seats']['ai']['hand'] = []): Game => ({
  ...g,
  seats: { player: { ...g.seats.player, energy: 20, hand: [...player, ...g.seats.player.hand] }, ai: { ...g.seats.ai, energy: 20, hand: [...ai, ...g.seats.ai.hand] } },
})

describe('le duel des présidents', () => {
  it('se joue jusqu’au bout, et la même graine donne la même partie', () => {
    const a = auto(newGame(as('melenchon'), BOT, { seed: 11, years: 5 }))
    const b = auto(newGame(as('melenchon'), BOT, { seed: 11, years: 5 }))
    expect(a.outcome).not.toBeNull()
    expect(a.outcome).toEqual(b.outcome)
    expect(a.reports.length).toBeGreaterThan(0)
  }, 60_000)

  it('chaque programme reprend toutes les promesses jouables (au moins cinq), toutes dans le haut de la pioche commune', () => {
    for (const c of CANDIDATES) {
      const mine = programmeOf(c, 3, 'joueur')
      const theirs = programmeOf(null, 3, 'ia')
      const playable = c.promises.filter(isPlayable).filter((p) => p.measure!.effects.every((e) => e.lever !== 'cancelHolder'))
      expect(mine).toHaveLength(Math.max(PROGRAMME_SIZE, playable.length))
      expect(theirs).toHaveLength(PROGRAMME_SIZE)
      const deck = buildDeck([mine, theirs], 3)
      const keys = new Set([...mine, ...theirs].map((p) => p.key))
      const top = mine.length + theirs.length + 12
      expect(deck.slice(0, top).filter((d) => d.kind === 'mesure' && keys.has(d.pledge.key))).toHaveLength(mine.length + theirs.length)
    }
  })

  it('un long programme demande d’en tenir la moitié, un court au moins trois', () => {
    const goal = (id: string) => goalOf(newGame(as(id), BOT, { seed: 1, years: 5 }).seats.player)
    expect(goal('ruffin')).toBe(PROGRAMME_GOAL)
    expect(goal('glucksmann')).toBe(PROGRAMME_GOAL)
    expect(goal('tondelier')).toBe(PROGRAMME_GOAL)
    expect(goal('le-pen')).toBe(4)
    expect(goal('melenchon')).toBe(6)
  })

  it('l’immigration est dans la pioche quand Le Stylo, Retaillot ou Zémourre jouent : elle fait partie de leur programme', () => {
    for (const id of ['le-pen', 'retailleau', 'zemmour']) {
      const g = newGame(as(id), BOT, { seed: 2, years: 5 })
      const cards = [...g.deck, ...g.seats.player.hand, ...g.seats.ai.hand]
      const promise = cards.find((c) => c.kind === 'mesure' && c.pledge.measure!.id === 'immigration' && g.seats.player.programme.some((p) => p.key === c.pledge.key))
      expect(promise, id).toBeDefined()
    }
  })

  it('on peut jeter une carte (+1 ⚡), la vendre au marché, et l’adversaire peut l’acheter : le vendeur touche le prix', () => {
    let g = newGame(as('melenchon'), BOT, { seed: 8, years: 5 })
    expect(g.turn).toBe('player')
    const [a, b] = g.seats.player.hand
    const energy = g.seats.player.energy
    g = discard(g, 'player', a.uid)
    expect(g.seats.player.energy).toBe(energy + DISCARD_GAIN)
    expect(g.discard.map((c) => c.uid)).toContain(a.uid)
    g = sell(g, 'player', b.uid)
    expect(g.market.map((l) => l.card.uid)).toEqual([b.uid])
    expect(canBuy(g, 'player', b.uid)).not.toBeNull()
    const price = g.market[0].price
    g = { ...g, seats: { ...g.seats, ai: { ...g.seats.ai, energy: 20 } } }
    // On n'achète que pendant son tour.
    expect(canBuy(g, 'ai', b.uid)).not.toBeNull()
    g = buy(pass(g, 'player'), 'ai', b.uid)
    expect(g.seats.ai.hand.map((c) => c.uid)).toContain(b.uid)
    expect(g.seats.player.bonus).toBe(price)
    expect(g.market).toHaveLength(0)
  })

  it('une crise posée frappe la France d’en face, sauf si elle la pare sur-le-champ avec une cellule de crise', () => {
    const base = newGame(as('attal'), BOT, { seed: 5, years: 5 })
    const crisis = { kind: 'crise' as const, crisis: 'financial-crisis' as const, uid: 'test-krach' }
    const shield = { kind: 'action' as const, action: 'cellule' as const, uid: 'test-cellule' }
    const g = play(rich(base, [crisis], [shield]), 'player', crisis)
    expect(g.pending?.card.uid).toBe(crisis.uid)
    // Tant que la cible n'a pas répondu, personne ne joue.
    expect(canPlay(g, 'ai', g.seats.ai.hand.find((c) => c.kind === 'mesure')!)).toContain('Répondez')
    // La cellule de crise ne se pose pas d'avance : elle répond à une crise.
    expect(canPlay(respond(g, 'ai', null), 'ai', shield)).toContain('réponse')
    const hit = resolveYear(bothPass(respond(g, 'ai', null)))
    expect(hit.reports[0].sides.ai.received).toEqual(['financial-crisis'])
    expect(hit.seats.ai.events.some((e) => e.id === 'financial-crisis')).toBe(true)
    expect(scoreOf(hit.seats.ai)).toBeLessThan(scoreOf(resolveYear(bothPass(rich(base, [crisis], [shield]))).seats.ai))
    const parriedNow = respond(g, 'ai', 'cellule')
    expect(parriedNow.seats.ai.hand.some((c) => c.uid === shield.uid)).toBe(false)
    expect(parriedNow.turn).toBe('ai')
    const parried = resolveYear(bothPass(parriedNow))
    expect(parried.reports[0].sides.ai.parried).toEqual(['financial-crisis'])
    expect(parried.seats.ai.events.some((e) => e.id === 'financial-crisis')).toBe(false)
  })

  it('chacun son tour : une carte à la fois, l’année se joue quand les deux passent de suite, et l’ouverture alterne', () => {
    let g = newGame(as('melenchon'), BOT, { seed: 3, years: 5 })
    expect(g.turn).toBe('player')
    const card = g.seats.ai.hand[0]
    expect(canPlay(g, 'ai', card)).toBe('Ce n’est pas votre tour')
    g = pass(g, 'player')
    expect(g.turn).toBe('ai')
    // L'adversaire joue après votre passe : vous pouvez rejouer.
    const sondage = { kind: 'action' as const, action: 'sondage' as const, uid: 'test-sondage' }
    g = play(rich(g, [], [sondage]), 'ai', sondage)
    expect(g.turn).toBe('player')
    expect(g.passes).toBe(0)
    g = pass(pass(g, 'player'), 'ai')
    expect(g.turn).toBeNull()
    g = resolveYear(g)
    expect(g.year).toBe(2029)
    expect(g.turn).toBe('ai')
  })

  it('pas plus de deux lois par an, et on pioche trois cartes par an', () => {
    const g0 = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const laws = g0.seats.player.programme.slice(0, LAWS_PER_YEAR + 1).map((pledge, i) => ({ kind: 'mesure' as const, pledge, uid: `test-loi-${i}` }))
    let g = rich(g0, laws)
    for (const law of laws.slice(0, LAWS_PER_YEAR)) {
      g = pass(play(g, 'player', law), 'ai')
    }
    expect(canPlay(g, 'player', laws[LAWS_PER_YEAR])).toContain('lois')
    const hand = g.seats.player.hand.length
    g = resolveYear(bothPass(g))
    expect(g.seats.player.hand.length).toBe(Math.min(8, hand + 3 + (contextOf(g).draw ?? 0)))
  })

  it('la conjoncture est la même pour les deux : son événement frappe les deux France, et elle change le prix des cartes', () => {
    const g = newGame(as('attal'), BOT, { seed: 9, years: 5 })
    const ctx = contextOf(g)
    if (ctx.event) {
      expect(g.seats.player.events).toContainEqual({ year: 2028, id: ctx.event })
      expect(g.seats.ai.events).toContainEqual({ year: 2028, id: ctx.event })
    }
    // Une guerre aux portes de l'Europe : les crises coûtent un point de plus.
    const war: Game = { ...g, contexts: ['war-europe', ...g.contexts.slice(1)] }
    const crisis = { kind: 'crise' as const, crisis: 'recession' as const, uid: 'test-recession' }
    expect(cardCost(war, 'player', crisis)).toBe(CRISES.recession.cost + CONTEXTS['war-europe'].crisis!)
    // Toutes les conjonctures existent dans le modèle.
    expect(Object.values(CONTEXTS).every((c) => !c.event || c.event.length > 0)).toBe(true)
  })

  it('le budget : une mesure coûteuse entame la marge, la dépasser coûte de l’énergie l’an prochain, et alerte les marchés', () => {
    const g0 = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const pledge = (id: string) => ({ key: `test-${id}`, measure: MEASURES[id], amount: null, quote: '', source: '' })
    const defence = { kind: 'mesure' as const, pledge: pledge('defence-35'), uid: 'test-defense' }
    const savings = { kind: 'mesure' as const, pledge: pledge('savings'), uid: 'test-economies' }
    expect(budgetCost(g0, 'player', defence)).toBeGreaterThan(ALERT_AT)
    expect(budgetCost(g0, 'player', savings)).toBeLessThan(0)
    const g = play(rich(g0, [defence, savings]), 'player', defence)
    expect(marginLeft(g.seats.player)).toBeLessThan(g.seats.player.margin)
    const after = resolveYear(bothPass(g))
    expect(after.reports[0].sides.player.alert).toBe(true)
    expect(after.reports[0].sides.player.malus).toBeGreaterThan(0)
    expect(after.seats.player.events).toContainEqual({ year: 2028, id: 'eu-procedure' })
    // Les économies, elles, redonnent de la marge.
    expect(marginLeft(play(rich(g0, [savings]), 'player', savings).seats.player)).toBeGreaterThan(g0.seats.player.margin)
  })

  it('une promesse jouée devient une décision, compte comme tenue et rapporte de l’énergie', () => {
    let g = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const smic = g.seats.player.programme.find((p) => p.measure!.id === 'smic-up')!
    const card = { kind: 'mesure' as const, pledge: smic, uid: 'test-smic' }
    g = play(rich(g, [card]), 'player', card)
    expect(canPlay(g, 'player', card)).not.toBeNull()
    g = resolveYear(bothPass(g))
    expect(g.seats.player.decisions.at(-1)!.patch.smicBoost).toBeGreaterThan(0)
    expect(keptPromises(g.seats.player, 2028).map((p) => p.key)).toContain(smic.key)
    expect(g.reports[0].sides.player.kept).toHaveLength(1)
  })

  it('la note de santé suit les fichiers du modèle et récompense un pays en meilleure santé', () => {
    expect(CRITERIA.reduce((a, c) => a + c.weight, 0)).toBe(100)
    const start = simulate({ decisions: [], events: [], until: 2027 }).at(-1)!
    expect(health(start, start)).toBeGreaterThan(20)
    expect(health({ ...start, unemployment: 0.04 }, start)).toBeGreaterThan(health(start, start))
    expect(health({ ...start, debtRatio: 1.6 }, start)).toBeLessThan(health(start, start))
  })

  it('un pays qui fait faillite ou se révolte perd tout de suite, même en cours de mandat', () => {
    const g = newGame(as('melenchon'), BOT, { seed: 4, years: 5 })
    const fall = (ending: 'faillite' | 'revolte'): Game => ({ ...g, seats: { ...g.seats, ai: { ...g.seats.ai, states: [...g.seats.ai.states.slice(0, -1), { ...g.seats.ai.states.at(-1)!, ending }] } } })
    expect(outcomeOf(fall('faillite'))).toMatchObject({ winner: 'player' })
    expect(outcomeOf(fall('revolte'))!.reason).toContain('se révolte')
    expect(outcomeOf(g)).toBeNull()
  })
})

const action = (a: ActionId, uid = `test-${a}`): Card => ({ kind: 'action', action: a, uid })
const coup = (c: CrisisId, uid = `test-${c}`): Card => ({ kind: 'crise', crisis: c, uid })

describe('les nouvelles cartes', () => {
  it('la pioche mêle mesures, coups, parades et événements, avec une seule carte de chaque rare et légendaire', () => {
    const g = newGame(as('melenchon'), BOT, { seed: 4, years: 5 })
    const all = [...g.deck, ...g.seats.player.hand, ...g.seats.ai.hand]
    const named = (c: Card) => (c.kind === 'crise' ? c.crisis : c.kind === 'action' ? c.action : c.pledge.key)
    for (const id of ['referendum', 'dissolution', 'relance-ue', 'conseil', 'debauchage', 'financial-crisis']) {
      expect(all.filter((c) => named(c) === id), id).toHaveLength(1)
    }
    expect(all.filter((c) => rarityOf(c) === 'legendaire')).toHaveLength(3)
    expect(all.some((c) => c.kind === 'mesure' && c.pledge.measure!.id === 'basic-income') || all.length > 70).toBe(true)
  })

  it('chaque carte qui touche l’économie ou la société passe par un événement ou un levier du modèle', () => {
    for (const id of Object.keys(CRISES) as CrisisId[]) {
      expect(inModel({ kind: 'crise', crisis: id }), id).toBe(!CRISES[id].rule)
    }
    for (const id of ['jo', 'coupe-du-monde', 'panda', 'tweet', 'fromage', '49-3', 'dissolution', 'relance-ue'] as ActionId[]) {
      expect(inModel({ kind: 'action', action: id }), id).toBe(true)
    }
    for (const id of ['sondage', 'remaniement', 'discours', 'sondage-truque', 'referendum', 'cellule', 'conseil'] as ActionId[]) {
      expect(ACTIONS[id].events?.length ?? 0, id).toBe(0)
    }
  })

  it('le 49.3 donne une loi de plus (et fâche dans le modèle), la motion de censure en retire une', () => {
    const g0 = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    let g = play(rich(g0, [action('49-3'), action('cellule')], [coup('motion')]), 'player', action('49-3'))
    expect(lawLimit(g.seats.player)).toBe(LAWS_PER_YEAR + 1)
    expect(g.seats.player.events.some((e) => e.id === 'force-493')).toBe(true)
    g = play(g, 'ai', coup('motion'))
    // Un coup politique ne se pare pas, même avec une cellule de crise en main.
    expect(answersOf(g, 'player')).toEqual([])
    g = respond(g, 'player', null)
    expect(lawLimit(g.seats.player)).toBe(LAWS_PER_YEAR)
  })

  it('la commission d’enquête pare un scandale, la communication de crise en divise l’effet par deux', () => {
    const g0 = newGame(as('attal'), BOT, { seed: 5, years: 5 })
    const g = play(rich(g0, [coup('gaffe')], [action('commission'), action('communication')]), 'player', coup('gaffe'))
    expect(answersOf(g, 'ai')).toEqual(['commission', 'communication'])
    expect(respond(g, 'ai', 'commission').seats.ai.parried).toEqual(['gaffe'])
    const half = respond(g, 'ai', 'communication')
    expect(half.seats.ai.events.find((e) => e.id === 'gaffe')?.scale).toBe(0.5)
    const full = respond(g, 'ai', null)
    const anger = (x: Game) => resolveYear(bothPass(x)).seats.ai.states.at(-1)!.discontent
    expect(anger(half)).toBeLessThan(anger(full))
    // La communication de crise n'amortit pas un coup qui ne passe pas par le modèle.
    const leak = play(rich(g0, [coup('fuite')], [action('communication')]), 'player', coup('fuite'))
    expect(answersOf(leak, 'ai')).toEqual([])
  })

  it('le Conseil constitutionnel censure une loi : elle ne s’applique pas et ne coûte rien au budget', () => {
    const g0 = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const law = { kind: 'mesure' as const, pledge: g0.seats.player.programme[0], uid: 'test-loi' }
    const g = play(rich(g0, [law], [action('conseil')]), 'player', law)
    expect(g.pending?.card.uid).toBe('test-loi')
    const censored = respond(g, 'ai', 'conseil')
    expect(censored.seats.player.played[0].cancelled).toBe(true)
    expect(marginLeft(censored.seats.player)).toBe(censored.seats.player.margin)
    const after = resolveYear(bothPass(censored))
    expect(after.seats.player.decisions.length).toBe(g0.seats.player.decisions.length)
    // Sans Conseil constitutionnel en main, une loi passe sans attendre.
    expect(play(rich(g0, [law]), 'player', law).pending).toBeNull()
  })

  it('fuite, débauchage, sondage truqué, discours et remaniement changent la partie', () => {
    const base = newGame(as('attal'), BOT, { seed: 9, years: 5 })
    const g0 = rich({ ...base, seats: { ...base.seats, player: { ...base.seats.player, hand: [] } } }, [coup('fuite'), coup('debauchage'), action('sondage-truque'), action('discours'), action('remaniement'), ...base.seats.player.hand.slice(0, 2)])
    const theirs = g0.seats.ai.hand.length
    let g = respond(play(g0, 'player', coup('fuite')), 'ai', null)
    expect(g.seats.ai.hand).toHaveLength(theirs - 1)
    g = pass(g, 'ai')
    const mine = g.seats.player.hand.length
    g = respond(play(g, 'player', coup('debauchage')), 'ai', null)
    expect(g.seats.ai.hand).toHaveLength(theirs - 2)
    expect(g.seats.player.hand).toHaveLength(mine)
    g = play(pass(g, 'ai'), 'player', action('sondage-truque'))
    expect(g.seats.player.peek).toBe(true)
    const energy = g.seats.player.energy
    g = play(pass(g, 'ai'), 'player', action('discours'))
    expect(g.seats.player.energy).toBe(energy + 1)
    const before = g.seats.player.hand.filter((c) => c.uid !== 'test-remaniement')
    g = play(pass(g, 'ai'), 'player', action('remaniement'))
    expect(g.seats.player.hand).toHaveLength(before.length)
    expect(g.seats.player.hand.some((c) => before.some((b) => b.uid === c.uid))).toBe(false)
    expect(resolveYear(bothPass(g)).seats.player.peek).toBe(false)
  })

  it('le référendum double une loi quand on est populaire, sinon c’est un désaveu', () => {
    const g0 = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const law = { kind: 'mesure' as const, pledge: g0.seats.player.programme[0], uid: 'test-loi' }
    const voted = pass(play(rich(g0, [law, action('referendum')]), 'player', law), 'ai')
    expect(canPlay(rich(g0, [action('referendum')]), 'player', action('referendum'))).toContain('loi')
    const won = play(voted, 'player', action('referendum'))
    // La France de 2027 est à 62 % de popularité : c'est oui.
    expect(won.seats.player.played[0].doubled).toBe(true)
    const unpopular = { ...voted, seats: { ...voted.seats, player: { ...voted.seats.player, states: [...voted.seats.player.states.slice(0, -1), { ...voted.seats.player.states.at(-1)!, discontent: 0.6 }] } } }
    const lost = play(unpopular, 'player', action('referendum'))
    expect(lost.seats.player.played[0].doubled).toBeUndefined()
    expect(lost.seats.player.events.some((e) => e.id === 'referendum-lost')).toBe(true)
  })

  it('la dissolution remet les deux mains dans la pioche, le plan de relance donne 20 Md€ de marge, les JO coûtent un an', () => {
    const g0 = newGame(as('attal'), BOT, { seed: 6, years: 5 })
    const g1 = rich(g0, [action('dissolution'), action('relance-ue'), action('jo')])
    const margin = g1.seats.player.margin
    let g = play(g1, 'player', action('relance-ue'))
    expect(g.seats.player.margin).toBe(margin + 20)
    g = play(pass(g, 'ai'), 'player', action('jo'))
    expect(marginLeft(g.seats.player)).toBe(g.seats.player.margin - 3)
    const sizes = [g.seats.player.hand.length - 1, g.seats.ai.hand.length]
    g = play(pass(g, 'ai'), 'player', action('dissolution'))
    expect([g.seats.player.hand.length, g.seats.ai.hand.length]).toEqual(sizes)
    expect(g.seats.player.events.filter((e) => e.id.startsWith('dissolution'))).toHaveLength(2)
    const next = resolveYear(bothPass(g))
    expect(next.seats.player.reverts.otherServices).toBeDefined()
  })
})

describe('pourquoi une carte fait ce qu’elle fait', () => {
  it('la hausse du SMIC : le modèle dit ce qu’elle change, et le graphe dit par où passe le chômage', () => {
    const g = newGame(as('melenchon'), BOT, { seed: 2, years: 5 })
    const smic = g.seats.player.programme.find((p) => p.measure!.id === 'smic-up')!
    const card = { kind: 'mesure' as const, pledge: smic, uid: 'test-smic' }
    expect(leverChanges(g, 'player', card).map((l) => l.key)).toEqual(['smicBoost'])
    const impact = cardImpact(g, 'player', card)!
    const unemployment = impact.indicators.find((i) => i.node === 'unemployment')!
    expect(unemployment.delta).toBeGreaterThan(0)
    // La note se décompose critère par critère : la somme redonne (à l'arrondi près) l'effet annoncé.
    expect(Math.abs(impact.parts.reduce((a, p) => a + p.delta, 0) - impact.health)).toBeLessThan(1.5)
    const chain = explainChain(startNodes(g, 'player', card), 'unemployment')!
    expect(chain[0]).toMatchObject({ from: 'smicBoost', fromUp: true })
    expect(chain.at(-1)).toMatchObject({ to: 'unemployment', toUp: true })
  })

  it('une crise s’explique sur la France d’en face, depuis les variables du monde qu’elle touche', () => {
    const g = newGame(as('attal'), BOT, { seed: 2, years: 5 })
    const card = { kind: 'crise' as const, crisis: 'ormuz' as const, uid: 'test-ormuz' }
    const impact = cardImpact(g, 'player', card)!
    expect(impact.target).toBe('ai')
    expect(impact.health).toBeLessThan(0)
    expect(startNodes(g, 'player', card).map((n) => n.node)).toContain('oil')
    expect(explainChain(startNodes(g, 'player', card), 'inflation')).not.toBeNull()
  })
})

describe('le prix des crises suit leur gravité dans le modèle', () => {
  it('plus une crise fait perdre de points de note sur trois ans, plus elle coûte cher', () => {
    const base = simulate({ decisions: [], events: [], until: 2030 })
    const start = base.find((s) => s.year === 2027)!
    const damage = (id: string) => {
      const s = simulate({ decisions: [], events: [{ year: 2028, id }], until: 2030 })
      return [2028, 2029, 2030].reduce((a, y) => a + health(base.find((x) => x.year === y)!, start) - health(s.find((x) => x.year === y)!, start), 0)
    }
    const order = ['financial-crisis', 'ormuz', 'recession', 'general-strike'] as const
    const damages = order.map(damage)
    expect(damages).toEqual([...damages].sort((a, b) => b - a))
    expect(order.map((id) => CRISES[id].cost)).toEqual([...order.map((id) => CRISES[id].cost)].sort((a, b) => b - a))
  })
})

describe('les candidats fantaisie et leurs coups signature', () => {
  it('Teddy Rêneur et Sylvain Dhurif jouent un vrai programme, tiré de leurs promesses imaginaires', () => {
    for (const id of ['teddy', 'durif']) {
      const c = candidateById(id)!
      expect(c.fantasy).toBe(true)
      const programme = programmeOf(c, 1, 'joueur')
      expect(programme).toHaveLength(PROGRAMME_SIZE)
      // Ses cinq promesses viennent de son programme (aucune ajoutée par le jeu).
      expect(programme.every((p) => p.source !== 'ajout'), id).toBe(true)
    }
  })

  it('le coup signature n’est dans la pioche que si son candidat joue (en deux exemplaires, que n’importe qui peut piocher)', () => {
    const count = (g: Game, a: ActionId) => [...g.deck, ...g.seats.player.hand, ...g.seats.ai.hand].filter((c) => c.kind === 'action' && c.action === a).length
    const teddy = newGame(as('teddy'), as('durif'), { seed: 4, years: 5 })
    expect(count(teddy, 'ippon')).toBe(2)
    expect(count(teddy, 'alignement')).toBe(2)
    const other = newGame(as('melenchon'), BOT, { seed: 4, years: 5 })
    expect(count(other, 'ippon') + count(other, 'alignement')).toBe(0)
    expect(buildDeck([], 1, ['teddy']).filter((c) => c.kind === 'action' && c.action === 'ippon')).toHaveLength(2)
  })

  it('l’ippon pare une crise et la projette sur l’envoyeur : c’est sa France qui la prend', () => {
    const g0 = newGame(as('attal'), as('teddy'), { seed: 5, years: 5 })
    const g = play(rich(g0, [coup('recession')], [action('ippon')]), 'player', coup('recession'))
    expect(answersOf(g, 'ai')).toContain('ippon')
    const thrown = respond(g, 'ai', 'ippon')
    expect(thrown.seats.ai.parried).toEqual(['recession'])
    expect(thrown.seats.player.received).toEqual(['recession'])
    expect(thrown.seats.player.events.some((e) => e.id === 'recession')).toBe(true)
    expect(thrown.seats.ai.events.some((e) => e.id === 'recession')).toBe(false)
    // Un coup qui ne passe pas par le modèle repart aussi : la fuite fait jeter une carte à celui qui l'a lancée.
    const leak = play(rich(g0, [coup('fuite')], [action('ippon')]), 'player', coup('fuite'))
    const before = leak.seats.player.hand.length
    expect(respond(leak, 'ai', 'ippon').seats.player.hand.length).toBe(before - 1)
  })

  it('l’alignement cosmique passe par le modèle : harmonie (la colère retombe) ou éclipse, au hasard de la graine', () => {
    expect(inModel({ kind: 'action', action: 'alignement' })).toBe(true)
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 12; seed += 1) {
      const g0 = newGame(as('durif'), BOT, { seed, years: 5 })
      const g = play(rich(g0, [action('alignement')]), 'player', action('alignement'))
      const fired = g.seats.player.events.filter((e) => e.id.startsWith('cosmic-')).map((e) => e.id)
      expect(fired).toHaveLength(1)
      outcomes.add(fired[0])
    }
    expect([...outcomes].sort()).toEqual(['cosmic-eclipse', 'cosmic-harmony'])
    const harmony = simulate({ decisions: [], events: [{ year: 2028, id: 'cosmic-harmony' }], until: 2028 }).at(-1)!
    const calm = simulate({ decisions: [], events: [], until: 2028 }).at(-1)!
    expect(harmony.discontent).toBeLessThan(calm.discontent)
  })
})

describe('le catalogue de toutes les cartes', () => {
  it('regarde chaque carte sur une France de 2027 neutre : rien de joué, aucune conjoncture dans le modèle', () => {
    const g = neutralGame()
    expect(g.world).toEqual([])
    expect(g.seats.player.events).toEqual([])
    expect(g.seats.player.programme).toEqual([])
    // La mesure d'immigration coûte au budget : contrôles et reconduites.
    const card: Card = { kind: 'mesure', pledge: generic('immigration'), uid: 'cat-immigration' }
    expect(cardImpact(g, 'player', card)!.budget.lines.find((l) => l.label.startsWith('Immigration'))!.delta).toBeGreaterThan(0.5)
  })

  it('dit combien d’exemplaires de chaque carte sont dans la pioche', () => {
    expect(copiesOf({ kind: 'crise', crisis: 'financial-crisis' })).toBe(1)
    expect(copiesOf({ kind: 'action', action: 'cellule' })).toBe(3)
    expect(copiesOf({ kind: 'action', action: 'ippon' })).toBe(2)
  })
})
