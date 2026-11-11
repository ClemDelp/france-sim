import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CANDIDATES, candidateById, PARODY_NOTE } from '../game/candidates'
import { popularity } from '../game/score'
import { num } from '../ui/format'
import { aiStep } from './ai'
import { ACTIONS, cardArt, cardName, CRISES, isAdded, rarityOf, taglineOf, type Card } from './cards'
import { CONTEXTS } from './contexts'
import {
  BOT,
  canBuy,
  canPlay,
  canSell,
  ALERT_AT,
  budgetCost,
  cardCost,
  contextOf,
  DISCARD_GAIN,
  endYear,
  keptPromises,
  lastState,
  lawLimit,
  lawsOf,
  marginLeft,
  marketPrice,
  MARKET_SIZE,
  newGame,
  answersOf,
  PROGRAMME_GOAL,
  promiseOwner,
  resolveYear,
  scoreOf,
  START_YEAR,
  yourTurn,
  type Answer,
  type Game,
  type Player,
  type Report,
  type Side,
} from './engine'
import type { YearState } from '../model/types'
import { health, healthParts } from './health'
import { fighterStats, STAT_AXES } from './fighters'
import { applyIntent, type Intent } from './online'
import { setSoundOn, sfx, soundOn, type Sfx } from './sound'
import { setTauntsOn, taunt, tauntsOn, type Moment } from './taunts'
import { cardImpact, contextShift, type Impact } from './why'
import { WhyPage } from './WhyPage'
import './duel.css'

const AI_DELAY = 1100

export type Stage = 'context' | 'play' | 'report'
/** La carte ouverte en grand : dans votre main, au marché, parmi vos cartes de l'année, ou parmi celles de l'adversaire. */
type Pick = { card: Card; where: 'main' | 'marche' | 'table' | 'adverse' }

/** Le duel contre l'IA : choisir les présidents, puis jouer année après année, chacun son tour, en plein écran. */
export function Duel({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<Game | null>(null)
  /** Ce que regarde le joueur : l'IA attend qu'il soit à la table (pas devant la conjoncture ou le bilan). */
  const [stage, setStage] = useState<Stage>('context')

  // L'adversaire joue son tour (ou répond à votre crise) après un temps de réflexion ; quand les deux ont passé, l'année se joue.
  useEffect(() => {
    if (!game || stage !== 'play' || game.outcome) {
      return
    }
    const resolve = game.turn === null && !game.pending
    const aiActs = game.pending ? game.pending.from === 'player' : game.turn === 'ai'
    if (!resolve && !aiActs) {
      return
    }
    const id = window.setTimeout(() => setGame(resolve ? resolveYear(game) : (aiStep(game) ?? game)), resolve ? AI_DELAY * 0.8 : AI_DELAY)
    return () => window.clearTimeout(id)
  }, [game, stage])

  if (!game) {
    return (
      <Setup
        mode="ia"
        onExit={onExit}
        onStart={(player, ai, years) => {
          setGame(newGame(player, ai!, { seed: Math.floor(Math.random() * 1e9), years }))
          setStage('context')
        }}
      />
    )
  }
  return <Table game={game} onIntent={(i) => setGame(applyIntent(game, 'player', i))} onExit={onExit} onReplay={() => setGame(null)} onStage={setStage} taunts />
}

/**
 * La table de jeu, vue de la place de « player » : contre l'IA, contre un ami en ligne (la partie reçue de l'hôte,
 * retournée), ou à deux sur le même téléphone. Elle ne change jamais la partie elle-même : elle dit ce que le joueur veut faire.
 */
export function Table({
  game,
  onIntent,
  onExit,
  onReplay,
  onStage,
  initialStage = 'context',
  badge,
  status,
  taunts = false,
}: {
  game: Game
  onIntent: (intent: Intent) => void
  onExit: () => void
  onReplay: () => void
  onStage?: (stage: Stage) => void
  initialStage?: Stage
  /** Une pastille dans la barre du haut (l'état de la connexion avec l'ami, qui tient le téléphone). */
  badge?: React.ReactNode
  /** Ce qu'on ajoute par-dessus la table (l'ami déconnecté). */
  status?: React.ReactNode
  /** L'adversaire est l'IA : elle commente la partie (une bulle au-dessus de sa fiche). */
  taunts?: boolean
}) {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [rules, setRules] = useState(initialStage === 'context' && !game.reports.length)
  const [pick, setPick] = useState<Pick | null>(null)
  /** La dernière chose faite par l'adversaire, annoncée au centre de la table. */
  const [news, setNews] = useState<string | null>(null)
  const [compare, setCompare] = useState(false)
  const [settings, setSettings] = useState(false)
  /** Revoir la conjoncture de l'année (sans relancer l'année). */
  const [context, setContext] = useState(false)
  /** La page « Pourquoi ? » d'une carte, par-dessus la table : la partie où on l'a ouverte, la carte, et à qui elle est. */
  const [why, setWhy] = useState<{ g: Game; card: Card; side: Side } | null>(null)
  /** La table juste avant la dernière année jouée : ce qu'on explique depuis le bilan. */
  const [yearGame, setYearGame] = useState<Game | null>(null)
  /** La réplique de l'IA en cours (une bulle qui s'efface), et celle du bilan de l'année ou de la fin. */
  const [quip, setQuip] = useState<string | null>(null)
  const [yearQuip, setYearQuip] = useState<string | null>(null)
  const quipTimer = useRef(0)
  const say = (moment: Moment) => {
    const line = taunts ? taunt(game.seats.ai.candidate?.id ?? null, moment) : null
    if (line) {
      window.clearTimeout(quipTimer.current)
      setQuip(line)
      window.setTimeout(() => sfx('quip'), 350)
      quipTimer.current = window.setTimeout(() => setQuip(null), QUIP_MS)
    }
  }
  useEffect(() => () => window.clearTimeout(quipTimer.current), [])
  /** Une carte achetée arrive en main : pas de bruit de pioche par-dessus celui des pièces. */
  const bought = useRef(false)
  const hand = useFresh(game.seats.player.hand.map((c) => c.uid))
  const landed = useFresh([...game.seats.player.played.map((p) => p.card.uid), ...game.seats.ai.played.map((p) => p.card.uid)])
  useEffect(() => {
    if (hand.size && !bought.current) {
      sfx('draw')
    }
    bought.current = false
  }, [hand])
  useEffect(() => {
    onStage?.(stage)
  }, [stage, onStage])

  // Ce qui vient de changer sur la table : une année jouée (le bilan), une revanche, ou un geste de l'adversaire (annoncé, avec son bruit).
  const before = useRef(game)
  useEffect(() => {
    const prev = before.current
    before.current = game
    if (prev === game) {
      return
    }
    if (game.reports.length !== prev.reports.length) {
      setNews(null)
      setPick(null)
      if (game.reports.length > prev.reports.length) {
        sfx('flip')
        setYearGame(prev)
        setStage('report')
        const last = game.reports.at(-1)!
        const diff = last.sides.ai.health - last.sides.player.health
        const moment: Moment | null = game.outcome ? (game.outcome.winner === 'ai' ? 'win' : game.outcome.winner === 'player' ? 'lose' : null) : diff > 0 ? 'lead' : diff < 0 ? 'behind' : null
        setYearQuip(taunts && moment ? taunt(game.seats.ai.candidate?.id ?? null, moment) : null)
      } else {
        setStage('context')
      }
      return
    }
    const said = foeNews(prev, game)
    if (said) {
      setNews(said.text)
      sfx(said.sound)
    }
    const moment = quipMoment(prev, game)
    if (moment) {
      say(moment)
    }
    // say() lit la partie du rendu : on ne réagit qu'au changement de partie.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [game])

  const act = (intent: Intent, ...sounds: Sfx[]) => {
    sounds.forEach((name, i) => window.setTimeout(() => sfx(name), i * 140))
    setNews(null)
    setPick(null)
    onIntent(intent)
  }
  const open = (p: Pick) => {
    sfx('pick')
    setPick(p)
  }
  const report = game.reports.at(-1)
  const playing = stage === 'play' && !game.outcome
  const myTurn = playing && !yourTurn(game, 'player')
  const me = game.seats.player
  const ctx = contextOf(game)
  const left = marginLeft(me)
  const aiPassed = game.moves.at(-1)?.kind === 'passe' && game.moves.at(-1)?.side === 'ai'
  return (
    <div className="dlg">
      <header className="dlg-top">
        <button type="button" className="ghost small" onClick={onExit} title="Accueil">
          ←<span className="dlg-lbl"> Accueil</span>
        </button>
        <div className="dlg-mid">
          <strong className="dl-year">
            {game.outcome ? '🏁 Fin' : `🗓️ ${game.year}`} <small>{Math.min(game.year, endYear(game)) - START_YEAR}/{game.years}</small>
          </strong>
          <Lead g={game} />
        </div>
        <span className="dlg-top-right">
          {badge}
          <button type="button" className="ghost small" onClick={() => setCompare(true)} title="Comparer les deux France">
            📊<span className="dlg-lbl"> Comparer</span>
          </button>
          <button type="button" className="ghost small" onClick={() => setRules(true)} title="Les règles">
            📖<span className="dlg-lbl"> Règles</span>
          </button>
          <button type="button" className="ghost small" onClick={() => setSettings(!settings)} aria-expanded={settings} title="Réglages">
            ⚙️
          </button>
        </span>
        {settings ? <Settings onClose={() => setSettings(false)} /> : null}
      </header>

      <Strip g={game} side="ai" turn={playing && (game.pending ? game.pending.from === 'player' : game.turn === 'ai')} quip={playing ? quip : null} />

      <main className="dlg-board">
        <section className="dlg-pile" aria-label="La pioche commune">
          <div className="dl-back big" title="La pioche commune : ce que vous piochez, l’adversaire ne l’a pas">
            <span>{game.deck.length}</span>
          </div>
          <small>Pioche</small>
          <div className="dl-back discard" title="Les cartes jouées et jetées">
            <span>{game.discard.length}</span>
          </div>
          <small>Défausse</small>
        </section>

        <section className="dlg-table">
          <button type="button" className="dlg-context" onClick={() => setContext(true)} title={`${ctx.name} : ${ctx.rule}`}>
            <span aria-hidden="true">{ctx.art}</span>
            <strong>{ctx.name}</strong>
          </button>
          <div className="dlg-zone">
            <p>
              {game.seats.ai.emblem} {game.seats.ai.name} {aiPassed && playing ? <small>· ⏭ passe</small> : null}
            </p>
            <div className="dlg-row">
              {game.seats.ai.played.map((p) => (
                <Mini key={p.card.uid} g={game} card={p.card} side="ai" badge={`⚡${p.cost}`} stamp={stampOf(p)} flip={landed.has(p.card.uid)} onClick={() => open({ card: p.card, where: 'adverse' })} />
              ))}
              {!game.seats.ai.played.length ? <p className="dlg-hint">—</p> : null}
            </div>
          </div>
          {me.peek && playing ? (
            <div className="dlg-zone peek">
              <p>🕵️ Sa main</p>
              <div className="dlg-row">
                {game.seats.ai.hand.map((card) => (
                  <Mini key={card.uid} g={game} card={card} side="ai" badge={`⚡${cardCost(game, 'ai', card)}`} onClick={() => open({ card, where: 'adverse' })} />
                ))}
                {!game.seats.ai.hand.length ? <p className="dlg-hint">Vide</p> : null}
              </div>
            </div>
          ) : null}
          {news && playing ? <div className="dlg-news">{news}</div> : null}
          <div className="dlg-zone mine">
            <p>
              🫵 Vous <small>· 📜 {lawsOf(me)}/{lawLimit(me)} lois</small>
            </p>
            <div className="dlg-row">
              {me.played.map((p) => (
                <Mini key={p.card.uid} g={game} card={p.card} side="player" badge={`⚡${p.cost}`} stamp={stampOf(p)} landed={landed.has(p.card.uid)} onClick={() => open({ card: p.card, where: 'table' })} />
              ))}
              {!me.played.length ? <p className="dlg-hint">{myTurn ? '👇 À vous !' : '⏳'}</p> : null}
            </div>
          </div>
        </section>

        <section className="dlg-market" aria-label="Le marché">
          <p>
            🏷️ Marché <small>{game.market.length}/{MARKET_SIZE}</small>
          </p>
          <div className="dlg-market-row">
            {game.market.map((l) => (
              <Mini key={l.card.uid} g={game} card={l.card} side="player" badge={`${l.price} ⚡`} seller={game.seats[l.seller].emblem} onClick={() => open({ card: l.card, where: 'marche' })} />
            ))}
            {!game.market.length ? <p className="dlg-hint" title="Vendez ici les cartes dont vous ne voulez pas : l’adversaire peut les acheter.">Vide</p> : null}
          </div>
        </section>
      </main>

      <Strip g={game} side="player" turn={myTurn} />

      <footer className="dlg-hand">
        <div className="dlg-cards" aria-label="Votre main">
          {me.hand.map((c, i, all) => (
            <HandCard
              key={c.uid}
              g={game}
              card={c}
              dim={!myTurn || !!canPlay(game, 'player', c)}
              fan={fanOf(i, all.length)}
              drawn={hand.has(c.uid) ? [...hand].indexOf(c.uid) : null}
              up={pick?.where === 'main' && pick.card.uid === c.uid}
              onClick={() => open({ card: c, where: 'main' })}
            />
          ))}
        </div>
        <div className="dlg-side">
          <span className="dl-energy" title="Votre énergie : le capital politique de l’année (selon votre popularité), plus les promesses tenues et les ventes">
            ⚡ {me.energy}
          </span>
          <span className={`dl-budget ${left < 0 ? 'is-over' : ''}`} title={`La marge budgétaire de l’année : ${num(me.margin, 0)} Md€. Au-delà, les marchés s’inquiètent : moins d’énergie l’an prochain.`}>
            💶 {num(left, 0)} <small>Md€</small>
            <i style={{ width: `${me.margin > 0 ? Math.max(0, Math.min(100, (left / me.margin) * 100)) : 0}%` }} />
          </span>
          {game.outcome ? (
            <button type="button" className="primary" onClick={() => setStage('report')}>
              Résultat
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={!myTurn}
              onClick={() => {
                act({ kind: 'pass' }, 'click')
              }}
              title={aiPassed ? `${game.seats.ai.name} a passé : si vous passez aussi, l’année ${game.year} se joue.` : 'Passer votre tour'}
            >
              {!playing ? '…' : myTurn ? (aiPassed ? `Finir ${game.year} ✓` : 'Passer ⏭') : game.turn === null ? `${game.year} se joue…` : `${game.seats.ai.name} joue…`}
            </button>
          )}
        </div>
      </footer>

      {stage === 'context' && !game.outcome ? (
        <ContextModal
          g={game}
          onGo={() => {
            sfx('click')
            setStage('play')
          }}
        />
      ) : null}
      {context ? <ContextModal g={game} onGo={() => setContext(false)} /> : null}
      {playing && game.pending?.from === 'ai' ? (
        <Incoming
          g={game}
          onAnswer={(answer) => {
            // L'ippon s'annonce sur la table, avec son ressort.
            act({ kind: 'respond', answer }, ...(answer === 'ippon' ? [] : [answer ? 'energy' : game.pending?.card.kind === 'crise' ? 'crisis' : 'play'] as Sfx[]))
          }}
        />
      ) : null}
      {stage === 'report' && report ? (
        game.outcome ? (
          <Final g={game} quip={yearQuip} onReplay={onReplay} onCompare={() => setCompare(true)} onClose={() => setStage('play')} />
        ) : (
          <Verdict
            g={game}
            report={report}
            quip={yearQuip}
            onCompare={() => setCompare(true)}
            onClose={() => setStage('context')}
            onWhy={yearGame ? (card, side) => setWhy({ g: yearGame, card, side }) : null}
          />
        )
      ) : null}
      {pick ? (
        <CardModal
          g={game}
          pick={pick}
          canAct={myTurn}
          onClose={() => setPick(null)}
          onWhy={() => setWhy({ g: game, card: pick.card, side: pick.where === 'adverse' ? 'ai' : 'player' })}
          onPlay={() => act({ kind: 'play', uid: pick.card.uid }, playSound(pick.card))}
          onDiscard={() => act({ kind: 'discard', uid: pick.card.uid }, 'discard', 'energy')}
          onSell={() => act({ kind: 'sell', uid: pick.card.uid }, 'coin')}
          onBuy={() => {
            bought.current = true
            act({ kind: 'buy', uid: pick.card.uid }, 'coin')
          }}
        />
      ) : null}
      {compare ? <Compare g={game} onClose={() => setCompare(false)} /> : null}
      {rules ? <Rules onClose={() => setRules(false)} /> : null}
      {why ? <WhyPage g={why.g} card={why.card} side={why.side} kind={kindOf(why.g, why.card, why.side)} onBack={() => setWhy(null)} /> : null}
      {status}
    </div>
  )
}

/** Le bruit d'une carte posée : une crise gronde, le Canard fait coin-coin, les astres scintillent, une légende sonne. */
const playSound = (card: Card): Sfx =>
  card.kind === 'crise' ? (card.crisis === 'fuite' ? 'quack' : 'crisis') : card.kind === 'action' && card.action === 'alignement' ? 'cosmic' : rarityOf(card) === 'legendaire' ? 'promise' : 'play'

/** Combien de temps reste la bulle d'une réplique. */
const QUIP_MS = 2800

/** Ce que l'IA commente : sa carte posée, son coup, votre parade, le coup qu'elle prend, celui qu'elle pare. */
function quipMoment(before: Game, after: Game): Moment | null {
  if (before.pending && !after.pending) {
    const parade = after.moves.length > before.moves.length ? after.moves.at(-1) : undefined
    const parried = parade?.kind === 'parade' && !!parade.answer
    if (before.pending.card.kind !== 'crise') {
      return null
    }
    return before.pending.from === 'ai' ? (parried ? 'parried' : null) : parried ? 'block' : 'hit'
  }
  const m = after.moves.length > before.moves.length ? after.moves.at(-1)! : null
  if (!m || m.side !== 'ai' || m.kind !== 'jeu') {
    return null
  }
  return m.card?.kind === 'crise' ? 'crisis' : 'play'
}

/** Ce que l'adversaire vient de faire, à annoncer (et le son qui va avec), ou null (rien, ou c'était vous). */
function foeNews(before: Game, after: Game): { text: string; sound: Sfx } | null {
  const ai = after.seats.ai
  const who = `${ai.emblem} ${ai.name}`
  if (before.pending && !after.pending) {
    const name = cardName(before.pending.card)
    const parade = after.moves.length > before.moves.length ? after.moves.at(-1) : undefined
    if (before.pending.from !== 'player') {
      // Votre ippon : la crise repart chez lui, ça mérite d'être annoncé.
      return parade?.kind === 'parade' && parade.answer === 'ippon' ? { text: `🥋 IPPON ! ${name} repart chez ${ai.name}`, sound: 'boing' } : null
    }
    if (parade?.kind === 'parade' && parade.answer) {
      return { text: `${ACTIONS[parade.answer].art} ${who} : ${ACTIONS[parade.answer].name} !`, sound: parade.answer === 'conseil' ? 'crisis' : parade.answer === 'ippon' ? 'boing' : 'energy' }
    }
    return before.pending.card.kind === 'crise' ? { text: `💥 ${name} frappe ${ai.name} !`, sound: 'crisis' } : null
  }
  const m = after.moves.length > before.moves.length ? after.moves.at(-1)! : null
  if (!m || m.side !== 'ai') {
    return null
  }
  const name = m.card ? cardName(m.card) : ''
  switch (m.kind) {
    case 'achat':
      return { text: `🛒 ${who} achète ${name}`, sound: 'coin' }
    case 'vente':
      return { text: `🏷️ ${who} vend ${name}`, sound: 'coin' }
    case 'jet':
      return { text: `🗑️ ${who} jette une carte`, sound: 'discard' }
    case 'passe':
      return { text: `⏭ ${who} passe`, sound: 'click' }
    case 'parade':
      return null
    case 'jeu':
      return m.card?.kind === 'crise'
        ? { text: `💥 ${who} → vous : ${name} !`, sound: m.card.crisis === 'fuite' ? 'quack' : 'crisis' }
        : m.card?.kind === 'action' && m.card.action === 'alignement'
        ? { text: `🪐 ${who} aligne les planètes`, sound: 'cosmic' }
        : { text: `${m.card && rarityOf(m.card) === 'legendaire' ? '🌟' : '📜'} ${who} joue ${name}`, sound: m.card && rarityOf(m.card) === 'legendaire' ? 'promise' : 'play' }
  }
}

/** La conjoncture de l'année, retournée au début de chaque année : la même pour les deux présidents. */
function ContextModal({ g, onGo }: { g: Game; onGo: () => void }) {
  const ctx = contextOf(g)
  useEffect(() => {
    sfx('flip')
  }, [ctx.id])
  const first = g.turn
  return (
    <div className="modal-backdrop on-top" role="presentation">
      <div className="modal dl-ctxmodal" role="dialog" aria-modal="true" aria-label={`Conjoncture ${g.year}`}>
        <p className="eyebrow">🌍 {g.year}</p>
        <div className="dl-card big kind-contexte is-flip" title={ctx.text}>
          <span className="dl-kind">🌍 Contexte</span>
          <span className="dl-art" aria-hidden="true">
            {ctx.art}
          </span>
          <strong className="dl-name">{ctx.name}</strong>
          <span className="dl-rule">{ctx.rule}</span>
        </div>
        <p className="dl-ctx-turn">
          ⚡ {g.seats.player.energy} · 💶 {num(g.seats.player.margin, 0)} Md€ · {first === 'player' ? '🫵 Vous commencez' : `${g.seats.ai.emblem} ${g.seats.ai.name} commence`}
        </p>
        <button type="button" className="primary big" onClick={onGo}>
          ▶ Jouer {g.year}
        </button>
      </div>
    </div>
  )
}

/** Ce que fait chaque parade, en une phrase (pour les boutons et les nouvelles). */
const ANSWER_TEXT: Record<Answer, string> = {
  cellule: 'la cellule de crise le pare',
  commission: 'la commission d’enquête désamorce le scandale',
  communication: 'la communication de crise en divise les effets par deux',
  conseil: 'le Conseil constitutionnel censure la loi',
  ippon: 'ippon : le coup repart chez l’envoyeur',
}

/**
 * L'adversaire pose une carte qui vous vise : un coup (crise, scandale, coup politique) à parer, amortir ou encaisser,
 * ou une loi que vous pouvez faire censurer par le Conseil constitutionnel.
 */
function Incoming({ g, onAnswer }: { g: Game; onAnswer: (answer: Answer | null) => void }) {
  const card = g.pending!.card
  const impact = useMemo(() => cardImpact(g, 'ai', card), [g, card])
  const answers = answersOf(g, 'player')
  const kind = kindOf(g, card, 'ai')
  const law = card.kind === 'mesure'
  const rule = card.kind === 'crise' ? CRISES[card.crisis].rule : undefined
  const family = card.kind === 'crise' ? CRISES[card.crisis].family : null
  const what = law ? 'vote une loi' : family === 'politique' ? 'vous attaque !' : family === 'scandale' ? 'lance un scandale !' : 'vous envoie une crise !'
  return (
    <div className="modal-backdrop on-top" role="presentation">
      <div className="modal dl-incoming" role="dialog" aria-modal="true" aria-label={law ? 'Une loi de l’adversaire' : 'Un coup arrive'}>
        <p className="eyebrow">
          {law ? '⚖️' : family === 'politique' ? '🎯' : family === 'scandale' ? '🗞️' : '💥'} {g.seats.ai.emblem} {g.seats.ai.name} {what}
        </p>
        <div className={`dl-card big ${kind.cls} ${rarityClass(card)} is-flip`}>
          <span className="dl-kind">{kind.label}</span>
          <span className="dl-art" aria-hidden="true">
            {cardArt(card)}
          </span>
          <strong className="dl-name">{cardName(card)}</strong>
          {taglineOf(card) ? <em className="dl-tagline">{taglineOf(card)}</em> : null}
          {rule ? <span className="dl-rule">{rule}</span> : null}
        </div>
        <Effects impact={impact} />
        <div className="verdict-actions">
          {answers.map((a) => (
            <button key={a} type="button" className="primary" onClick={() => onAnswer(a)} title={ANSWER_TEXT[a]}>
              {ACTIONS[a].art} {ACTIONS[a].name} · {ACTIONS[a].cost} ⚡
            </button>
          ))}
          <button type="button" className="ghost" onClick={() => onAnswer(null)}>
            {law ? '👍 Laisser passer' : '😤 Encaisser'}
          </button>
        </div>
        {!answers.length && !law ? (
          <small
            className="dl-locked"
            title={
              family === 'politique'
                ? 'Un coup politique ne se pare pas.'
                : family === 'scandale'
                  ? 'Il vous faudrait une commission d’enquête, une cellule ou une communication de crise en main (et l’énergie pour la jouer).'
                  : 'Il vous faudrait une cellule ou une communication de crise en main (et l’énergie pour la jouer).'
            }
          >
            🔒 {family === 'politique' ? 'Imparable' : 'Pas de parade en main'}
          </small>
        ) : null}
      </div>
    </div>
  )
}

/** Les cartes qui viennent d'arriver (pour les animer) : celles qu'on ne voyait pas au rendu précédent. */
function useFresh(uids: string[]): Set<string> {
  const seen = useRef<Set<string>>(new Set())
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const key = uids.join(',')
  useLayoutEffect(() => {
    const now = key ? key.split(',') : []
    const added = now.filter((uid) => !seen.current.has(uid))
    seen.current = new Set(now)
    if (added.length) {
      setFresh(new Set(added))
      const id = window.setTimeout(() => setFresh(new Set()), 900 + added.length * 90)
      return () => window.clearTimeout(id)
    }
  }, [key])
  return fresh
}

/** La place d'une carte dans la main en éventail : son angle, et de combien elle descend sur les bords. */
function fanOf(i: number, n: number): React.CSSProperties {
  const mid = (n - 1) / 2
  const x = mid ? (i - mid) / mid : 0
  const spread = Math.min(5, 28 / Math.max(n, 1))
  return { '--i': i, '--n': n, '--rot': `${(i - mid) * spread}deg`, '--drop': `${Math.round(x * x * 10)}px` } as React.CSSProperties
}

/** Les réglages : le son, les répliques de l'IA. */
function Settings({ onClose }: { onClose: () => void }) {
  const [on, setOn] = useState(soundOn)
  const [talk, setTalk] = useState(tauntsOn)
  return (
    <div className="dlg-settings" role="dialog" aria-label="Réglages">
      <strong>⚙️ Réglages</strong>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`dl-switch ${on ? 'is-on' : ''}`}
        onClick={() => {
          setSoundOn(!on)
          setOn(!on)
          if (!on) {
            sfx('coin')
          }
        }}
      >
        <span>{on ? '🔊' : '🔇'} Son</span>
        <i aria-hidden="true" />
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={talk}
        className={`dl-switch ${talk ? 'is-on' : ''}`}
        onClick={() => {
          setTauntsOn(!talk)
          setTalk(!talk)
          sfx('click')
        }}
      >
        <span>{talk ? '💬' : '🤐'} Répliques</span>
        <i aria-hidden="true" />
      </button>
      <button type="button" className="ghost small" onClick={onClose}>
        Fermer
      </button>
    </div>
  )
}

// — Choisir les présidents : un écran de sélection de jeu de combat

const asPlayer = (c: (typeof CANDIDATES)[number]): Player => ({ candidate: c, name: c.name, emblem: c.emblem, color: c.color })
const SURPRISE: Player = { candidate: null, name: 'Vous', emblem: '🎩', color: '#5b8def' }
/** À deux sur le même téléphone, chacun son programme surprise. */
const SURPRISE_2: Player = { candidate: null, name: 'Joueur 2', emblem: '🎲', color: '#e05a5a' }
const isSurprise = (p: Player) => !p.candidate && p !== BOT

/** Le nom court d'un combattant, pour la grille (« Méluchon »). */
const shortName = (p: Player) => (p.candidate ? p.name.split(' ').slice(1).join(' ') : p === BOT ? 'Le Bot' : 'Surprise')

/** Les durées proposées : un round par année de mandat. */
const ROUNDS = [3, 5, 7]

/**
 * Contre l'IA (on choisit les deux), à deux sur ce téléphone (chacun le sien), en ligne : l'hôte choisit le sien et la durée,
 * l'invité choisit le sien face à celui de l'hôte. En ligne, l'entrée sur le ring se joue quand la partie commence chez les deux.
 */
export type SetupMode = 'ia' | 'local' | 'hote' | 'invite'

const SETUP_TEXT: Record<SetupMode, { me: string; foe: string; cursor: string; ask: string; go: string }> = {
  ia: { me: 'Vous', foe: 'L’IA', cursor: 'IA', ask: 'Contre qui ?', go: '⚔️ Au combat !' },
  local: { me: 'Joueur 1', foe: 'Joueur 2', cursor: 'J2', ask: 'Et le joueur 2 ?', go: '⚔️ Au combat !' },
  hote: { me: 'Vous', foe: 'Votre ami', cursor: 'J2', ask: '', go: '📨 Créer la partie' },
  invite: { me: 'Vous', foe: 'Votre ami', cursor: 'J1', ask: '', go: '✋ Je suis prêt' },
}

export function Setup({
  mode,
  host,
  hostYears,
  foeTag,
  onStart,
  onExit,
}: {
  mode: SetupMode
  /** L'étiquette de l'adversaire (en ligne, chez l'invité : le pseudo de l'hôte). */
  foeTag?: string
  /** En ligne, chez l'invité : le président de l'hôte, et la durée qu'il a choisie. */
  host?: Player
  hostYears?: number
  onStart: (player: Player, foe: Player | null, years: number) => void
  onExit: () => void
}) {
  const online = mode === 'hote' || mode === 'invite'
  const text = SETUP_TEXT[mode]
  const [me, setMe] = useState<Player | null>(null)
  const [foe, setFoe] = useState<Player | null>(host ?? null)
  const [hover, setHover] = useState<Player | null>(null)
  const [years, setYears] = useState(hostYears ?? 5)
  const [intro, setIntro] = useState(false)
  const stats = useMemo(() => fighterStats(CANDIDATES), [])
  const slot = !me ? 'me' : !foe && !online ? 'foe' : null
  // La dernière case de la grille : un programme surprise pour vous, le Bot (ou un autre programme surprise) pour l'adversaire.
  const roster = [...CANDIDATES.map(asPlayer), slot === 'me' ? SURPRISE : mode === 'local' ? SURPRISE_2 : BOT]
  const go = () => {
    if (!me) {
      return
    }
    if (online) {
      sfx('select')
      onStart(me, foe, years)
      return
    }
    sfx('vs')
    setIntro(true)
  }
  const choose = (p: Player) => {
    if (!slot) {
      return
    }
    sfx('select')
    if (slot === 'me') {
      setMe(p)
    } else {
      setFoe(p)
      window.setTimeout(() => sfx('vs'), 120)
    }
    setHover(null)
  }
  const preview = (s: 'me' | 'foe') => (s === 'me' ? (me ?? (slot === 'me' ? hover : null)) : (foe ?? (slot === 'foe' ? hover : null)))
  return (
    <div className="dlg dlg-setup">
      <header className="dlg-top">
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            sfx('click')
            if (foe && !host) {
              setFoe(null)
            } else if (me) {
              setMe(null)
            } else {
              onExit()
            }
          }}
        >
          ← {me ? 'Retour' : 'Accueil'}
        </button>
        <strong className="dl-year">🃏 Le duel des présidents</strong>
        <span />
      </header>

      <section className={`dlv-arena ${me && foe ? 'is-ready' : ''}`} aria-label="Les deux combattants">
        <Fighter
          p={preview('me')}
          tag={text.me}
          side="left"
          chosen={!!me}
          active={slot === 'me'}
          stats={stats}
          onClear={me ? () => (host ? setMe(null) : (setFoe(null), setMe(null))) : undefined}
        />
        <div className={`dlv-vs ${foe ? 'is-on' : ''}`} key={foe?.name ?? 'vs'} aria-hidden="true">
          VS
        </div>
        <Fighter
          p={preview('foe')}
          tag={foeTag || text.foe}
          side="right"
          chosen={!!foe}
          active={slot === 'foe'}
          waiting={mode === 'hote'}
          stats={stats}
          onClear={foe && !host ? () => setFoe(null) : undefined}
        />
      </section>

      {slot ? (
        <section className="dlv-select" aria-label={slot === 'me' ? 'Choisissez votre président' : 'Choisissez votre adversaire'}>
          <p className="dlv-prompt">
            <span className={`dlv-cursor ${slot}`}>{slot === 'me' ? (mode === 'invite' ? 'J2' : 'J1') : text.cursor}</span> {slot === 'me' ? (mode === 'local' ? 'Joueur 1, qui incarnez-vous ?' : 'Qui incarnez-vous ?') : text.ask}
          </p>
          <div className="dlv-grid">
            {roster.map((p) => {
              const other = slot === 'foe' ? me : foe
              const taken = !!other && (other.candidate ? other.candidate.id === p.candidate?.id : isSurprise(other) && other === p)
              return (
                <button
                  key={p.name}
                  type="button"
                  className={`dlv-tile ${taken ? 'is-taken' : ''}`}
                  style={{ '--c': p.color } as React.CSSProperties}
                  disabled={taken}
                  onClick={() => choose(p)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse' && !taken) {
                      setHover(p)
                      sfx('hover')
                    }
                  }}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(p)}
                  aria-label={`${p.name} : ${p.candidate?.family ?? (p === BOT ? 'sans parti, son propre programme' : 'un programme tiré au sort')}`}
                >
                  <span aria-hidden="true">{p.emblem}</span>
                  <small>{shortName(p)}</small>
                  {p.candidate?.fantasy ? (
                    <i className="dlv-fun" aria-hidden="true">
                      🎭
                    </i>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="dlv-ready">
          <div className="dlv-rounds" role="radiogroup" aria-label="Durée du duel">
            {(mode === 'invite' ? [years] : ROUNDS).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={years === n}
                className={years === n ? 'is-selected' : ''}
                onClick={() => {
                  sfx('click')
                  setYears(n)
                }}
              >
                <strong>{n}</strong>
                <small>ans</small>
              </button>
            ))}
          </div>
          <button type="button" className="primary big dlv-go" onClick={go}>
            {text.go}
          </button>
        </section>
      )}
      <p className="note dlg-setup-foot" title={PARODY_NOTE}>
        🎭 Personnages parodiques · programmes réels sourcés (sauf fantaisie)
      </p>
      {intro && me && foe ? <Intro me={me} foe={foe} meTag={mode === 'local' ? 'Joueur 1' : 'Vous'} onDone={() => onStart(me, foe, years)} /> : null}
    </div>
  )
}

/** La fiche d'un combattant : son emblème en grand, son nom, son camp, et ses barres (tirées du modèle). */
function Fighter({
  p,
  tag,
  side,
  chosen,
  active,
  waiting,
  stats,
  onClear,
}: {
  p: Player | null
  tag: string
  side: 'left' | 'right'
  chosen: boolean
  active: boolean
  /** En ligne, chez l'hôte : l'ami choisira le sien en arrivant. */
  waiting?: boolean
  stats: ReturnType<typeof fighterStats>
  onClear?: () => void
}) {
  const values = p?.candidate ? stats.get(p.candidate.id) : null
  return (
    <div
      className={`dlv-fighter ${side} ${chosen ? 'is-chosen' : ''} ${active ? 'is-active' : ''} ${p ? '' : 'is-empty'}`}
      style={{ '--c': p?.color ?? '#3a4560' } as React.CSSProperties}
      key={p?.name ?? 'vide'}
    >
      <span className="dlv-tag">{tag}</span>
      {onClear ? (
        <button type="button" className="dlv-change" onClick={onClear}>
          Changer
        </button>
      ) : null}
      <span className="dlv-emblem" aria-hidden="true">
        {p?.emblem ?? '?'}
      </span>
      <strong className="dlv-name">{p ? (p.candidate ? p.name : p === BOT ? 'Le Bot' : 'Programme surprise') : active ? 'À choisir…' : waiting ? 'Votre ami' : '???'}</strong>
      <small className="dlv-family">{p ? (p.candidate?.family ?? (p === BOT ? '🤖 Sans parti' : '🎲 5 mesures au hasard')) : waiting ? '⏳ Il choisit en arrivant' : ''}</small>
      {p?.candidate?.fantasy ? (
        <small className="dlv-fantasy" title="Il ne se présente pas : programme imaginé pour le jeu, sans source">
          🎭 Candidat fantaisie
        </small>
      ) : null}
      <ul className="dlv-stats">
        {STAT_AXES.map((a) => (
          <li key={a.id} title={a.hint}>
            <span>
              {a.icon} {a.label}
            </span>
            <i>
              <b style={{ width: values ? `${Math.round(values[a.id] * 100)}%` : p ? '50%' : '0%' }} className={values ? '' : 'is-unknown'} />
            </i>
          </li>
        ))}
      </ul>
      {p && !values ? <small className="dlv-mystery">❓ Mystère</small> : null}
    </div>
  )
}

/** L'entrée sur le ring : les deux fiches glissent l'une vers l'autre, « ROUND 1 », « FIGHT ! », puis la table. Toucher l'écran passe. */
export function Intro({ me, foe, meTag = 'Vous', onDone }: { me: Player; foe: Player; meTag?: string; onDone: () => void }) {
  const [phase, setPhase] = useState<'vs' | 'round' | 'fight'>('vs')
  const done = useRef(false)
  const finish = useRef(onDone)
  useEffect(() => {
    finish.current = onDone
  })
  useEffect(() => {
    const quick = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const end = () => {
      if (!done.current) {
        done.current = true
        finish.current()
      }
    }
    const ids = [
      window.setTimeout(() => setPhase('round'), quick ? 300 : 1100),
      window.setTimeout(() => {
        setPhase('fight')
        sfx('fight')
      }, quick ? 700 : 2100),
      window.setTimeout(end, quick ? 1300 : 3200),
    ]
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [])
  const skip = () => {
    if (!done.current) {
      done.current = true
      onDone()
    }
  }
  return (
    <div className={`dlv-intro is-${phase}`} role="presentation" onClick={skip}>
      <div className="dlv-intro-side left" style={{ '--c': me.color } as React.CSSProperties}>
        <span>{me.emblem}</span>
        <strong>{me.candidate ? me.name : meTag}</strong>
      </div>
      <div className="dlv-intro-side right" style={{ '--c': foe.color } as React.CSSProperties}>
        <span>{foe.emblem}</span>
        <strong>{foe.name}</strong>
      </div>
      <div className="dlv-intro-vs">VS</div>
      {phase !== 'vs' ? <div className="dlv-intro-round">ROUND 1 · {START_YEAR + 1}</div> : null}
      {phase === 'fight' ? <div className="dlv-intro-fight">FIGHT !</div> : null}
    </div>
  )
}

// — Un président et sa France, en une ligne

/** Qui mène, toujours en vue dans la barre du haut : « 🔥 Vous 58 · 52 🏝️ ». */
function Lead({ g }: { g: Game }) {
  const a = scoreOf(g.seats.player)
  const b = scoreOf(g.seats.ai)
  return (
    <span className={`dlg-lead ${a > b ? 'is-ahead' : a < b ? 'is-behind' : 'is-even'}`} title={a > b ? 'Vous menez' : a < b ? 'Vous êtes mené' : 'Égalité'}>
      {a > b ? '🔥' : a < b ? '😬' : '🤝'} Vous <b>{a}</b>
      <i style={{ '--p': `${a + b > 0 ? (a / (a + b)) * 100 : 50}%`, '--a': g.seats.player.color, '--b': g.seats.ai.color } as React.CSSProperties} />
      <b>{b}</b> {g.seats.ai.emblem}
    </span>
  )
}

function Strip({ g, side, turn, quip }: { g: Game; side: Side; turn: boolean; quip?: string | null }) {
  const s = g.seats[side]
  const st = lastState(s)
  const kept = new Set(keptPromises(s, g.year - 1).map((p) => p.key))
  const [open, setOpen] = useState<'programme' | 'note' | null>(null)
  const pct = (v: number) => `${num(v * 100, 1)} %`
  return (
    <section className={`dlg-strip strip-${side} ${turn ? 'is-turn' : ''}`} style={{ '--c': s.color } as React.CSSProperties}>
      <span className="dl-emblem">{s.emblem}</span>
      {quip ? (
        <span className="dlg-quip" role="status" key={quip}>
          {quip}
        </span>
      ) : null}
      <div className="dlg-name">
        <strong>{side === 'player' ? `Vous · ${s.name === 'Vous' ? 'programme surprise' : s.name}` : s.name}</strong>
        <small>
          {turn ? (side === 'player' ? '▶ À vous · ' : '▶ Son tour · ') : ''}🂠 {s.hand.length} · ⚡{s.energy} · 💶 {num(marginLeft(s), 0)} Md€ · 📜 {lawsOf(s)}/{lawLimit(s)}
        </small>
      </div>
      <button type="button" className="dlg-score" onClick={() => setOpen(open === 'note' ? null : 'note')} title="La note de santé du pays : touchez pour le détail">
        <strong>{scoreOf(s)}</strong>
        <small>/100</small>
      </button>
      <ul className="dlg-kpis">
        <li title="Popularité">😊 {popularity(st)} %</li>
        <li title="Chômage">👷 {pct(st.unemployment)}</li>
        <li title="Déficit public">💶 {pct(st.deficit / st.gdp)}</li>
        <li title="Dette publique">🏦 {num(st.debtRatio * 100, 0)} %</li>
        <li title="Colère" className={st.discontent > 0.4 ? 'danger' : ''}>
          😠 {Math.max(0, Math.round(st.discontent * 100))}
        </li>
      </ul>
      <button type="button" className="dlg-prog" onClick={() => setOpen(open === 'programme' ? null : 'programme')} title={`Promesses tenues : il en faut ${PROGRAMME_GOAL} sur 5. Touchez pour le détail.`}>
        ⭐ {kept.size}/{PROGRAMME_GOAL}
      </button>
      {open ? (
        <div className="dlg-pop" role="dialog" aria-label={open === 'note' ? 'La note de santé' : 'Le programme'}>
          <button type="button" className="dlg-pop-close" onClick={() => setOpen(null)} aria-label="Fermer">
            ✕
          </button>
          {open === 'programme' ? (
            <>
              <strong>⭐ {side === 'player' ? 'Votre programme' : s.name}</strong>
              <ul>
                {s.programme.map((p) => (
                  <li key={p.key} className={kept.has(p.key) ? 'is-kept' : ''}>
                    {kept.has(p.key) ? '✅' : '⬜'} {p.measure!.name}
                    {isAdded(p) ? <small title="Ajoutée par le jeu : le programme publié en compte moins de cinq que le moteur sait jouer."> ➕</small> : null}
                  </li>
                ))}
              </ul>
              <small>🎯 {PROGRAMME_GOAL} pour gagner · +2 ⚡ chacune</small>
            </>
          ) : (
            <>
              <strong>📊 {scoreOf(s)} / 100</strong>
              <ul>
                {healthParts(st, s.states.find((x) => x.year === START_YEAR)!).map((p) => (
                  <li key={p.id} title={p.explanation}>
                    {p.label} : <b>{num(p.points, 1)}</b> / {p.weight}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}

// — Les cartes

function kindOf(g: Game, card: Card, side: Side): { cls: string; label: string } {
  if (card.kind === 'crise') {
    const { family } = CRISES[card.crisis]
    return { cls: 'kind-crise', label: family === 'politique' ? '🎯 Coup politique' : family === 'scandale' ? '🗞️ Scandale' : '💥 Crise' }
  }
  if (card.kind === 'action') {
    const def = ACTIONS[card.action]
    if (rarityOf(card) === 'legendaire') {
      return { cls: 'kind-action', label: '🌟 Légendaire' }
    }
    if (def.signature) {
      return { cls: 'kind-action', label: `${candidateById(def.signature)?.emblem ?? '✨'} Signature` }
    }
    return { cls: 'kind-action', label: def.reaction ? '🛡️ Parade' : def.events?.length ? '🎉 Événement' : '🎴 Action' }
  }
  const owner = promiseOwner(g, card)
  if (owner === side) {
    return { cls: 'kind-promesse', label: '⭐ Promesse' }
  }
  if (owner) {
    return { cls: 'kind-sienne', label: `🔒 Promesse de ${g.seats[owner].name}` }
  }
  return { cls: 'kind-mesure', label: '📜 Mesure' }
}

/** Le cadre d'une carte rare (argenté) ou légendaire (holographique). */
const rarityClass = (card: Card) => (rarityOf(card) === 'commune' ? '' : `rar-${rarityOf(card)}`)

/** Ce qui est arrivé à une carte posée : une loi censurée, une loi doublée par référendum. */
const stampOf = (p: { cancelled?: boolean; doubled?: boolean }) => (p.cancelled ? '⚖️ Censurée' : p.doubled ? '🗳️ ×2' : undefined)

const signed = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v), digits)}`

function HandCard({ g, card, dim, fan, drawn, up, onClick }: { g: Game; card: Card; dim: boolean; fan: React.CSSProperties; drawn: number | null; up: boolean; onClick: () => void }) {
  const kind = kindOf(g, card, 'player')
  // Les chiffres (effet sur la note, sur les indicateurs) sont dans la fenêtre de la carte : la carte reste lisible.
  return (
    <button
      type="button"
      className={`dl-card hand ${kind.cls} ${rarityClass(card)} ${dim ? 'is-dim' : ''} ${drawn !== null ? 'is-drawn' : ''} ${up ? 'is-up' : ''}`}
      style={drawn !== null ? { ...fan, '--d': `${drawn * 90}ms` } as React.CSSProperties : fan}
      onClick={onClick}
      onPointerEnter={(e) => (e.pointerType === 'mouse' && !dim ? sfx('hover') : undefined)}
      aria-label={`${cardName(card)} : voir la carte`}
    >
      <span className="dl-cost">⚡{cardCost(g, 'player', card)}</span>
      {card.kind === 'mesure' || (card.kind === 'action' && ACTIONS[card.action].spend) ? <MdBadge md={budgetCost(g, 'player', card)} /> : null}
      <span className="dl-kind">{kind.label}</span>
      <span className="dl-art" aria-hidden="true">
        {cardArt(card)}
      </span>
      <strong className="dl-name">{cardName(card)}</strong>
      {card.kind === 'action' ? <span className="dl-text">{ACTIONS[card.action].short}</span> : null}
      {card.kind === 'crise' ? <span className="dl-target">→ chez l’adversaire</span> : null}
    </button>
  )
}

/** Ce qu'une mesure coûte au budget de l'État cette année, en Md€ (« +18 Md€ », « −16 Md€ »). */
const mdText = (md: number) => `${md > 0 ? '+' : md < 0 ? '−' : '±'}${num(Math.abs(md), Math.abs(md) < 10 ? 1 : 0)} Md€`

/** Le coût budgétaire, à côté du coût en énergie : rouge s'il creuse le déficit, vert s'il rapporte. */
function MdBadge({ md }: { md: number }) {
  return (
    <span className={`dl-md ${md > 0.05 ? 'is-cost' : md < -0.05 ? 'is-gain' : ''}`} title="Ce que la mesure coûte au budget de l’État cette année (selon le modèle)">
      {mdText(md)}
    </span>
  )
}

function Mini({ g, card, side, badge, seller, stamp, flip, landed, onClick }: { g: Game; card: Card; side: Side; badge: string; seller?: string; stamp?: string; flip?: boolean; landed?: boolean; onClick: () => void }) {
  const kind = kindOf(g, card, side)
  return (
    <button type="button" className={`dl-card mini ${kind.cls} ${rarityClass(card)} ${flip ? 'is-flip' : ''} ${landed ? 'is-landed' : ''} ${stamp ? 'is-stamped' : ''}`} onClick={onClick} title={kind.label}>
      <span className="dl-cost">{badge}</span>
      {seller ? <span className="dl-seller">{seller}</span> : null}
      {stamp ? <span className="dl-stamp">{stamp}</span> : null}
      <span className="dl-art" aria-hidden="true">
        {cardArt(card)}
      </span>
      <strong className="dl-name">{cardName(card)}</strong>
      {card.kind === 'crise' && side === 'ai' ? <span className="dl-target">→ chez vous</span> : card.kind === 'crise' ? <span className="dl-target">→ chez lui</span> : null}
    </button>
  )
}

// — Une carte en grand : la carte, son effet en quelques pastilles, et ce qu'on peut en faire. Le détail est sur la page « Pourquoi ? ».

type CardActions = { onPlay: () => void; onDiscard: () => void; onSell: () => void; onBuy: () => void }

/** Un emoji par indicateur, pour dire l'effet d'une carte sans phrase. */
const NODE_ICON: Record<string, string> = {
  unemployment: '👷',
  gdp: '📈',
  inflation: '🏷️',
  deficit: '💶',
  debt: '🏦',
  disposableIncome: '🛒',
  poverty: '🥖',
  discontent: '😡',
  frenchEmissions: '🏭',
}

/**
 * L'effet d'une carte en pastilles : la note, puis les indicateurs qui bougent le plus.
 * Les couleurs se lisent de votre point de vue : une crise qui fait mal à l'adversaire est en vert.
 */
function Effects({ impact, max = 3 }: { impact: Impact | null; max?: number }) {
  if (!impact) {
    return null
  }
  const foe = impact.target !== 'player'
  const tone = (good: boolean) => (good !== foe ? 'good' : 'bad')
  return (
    <ul className="dl-fx" aria-label="L’effet prévu l’an prochain">
      <li className={`dl-fx-note ${impact.health ? tone(impact.health > 0) : ''}`} title={foe ? 'Sa note l’an prochain' : 'Votre note l’an prochain'}>
        {foe ? '🎯 Sa note' : '📊 Note'} <b>{signed(impact.health)}</b>
      </li>
      {impact.indicators.slice(0, max).map((i) => (
        <li key={i.node} className={tone(i.good)} title={i.label}>
          {NODE_ICON[i.node] ?? '•'} {i.text}
        </li>
      ))}
      {Math.abs(impact.popularity) >= 1 ? (
        <li className={tone(impact.popularity > 0)} title="Popularité">
          😊 {signed(impact.popularity)} %
        </li>
      ) : null}
    </ul>
  )
}

function CardModal({ g, pick, canAct, onClose, onWhy, ...actions }: { g: Game; pick: Pick; canAct: boolean; onClose: () => void; onWhy: () => void } & CardActions) {
  const { card } = pick
  // Une carte de l'adversaire s'explique de son point de vue : sa mesure sur sa France, sa crise sur la vôtre.
  const side: Side = pick.where === 'adverse' ? 'ai' : 'player'
  const impact = useMemo(() => cardImpact(g, side, card), [g, side, card])
  const kind = kindOf(g, card, side)
  const description = card.kind === 'crise' ? CRISES[card.crisis].text : card.kind === 'action' ? ACTIONS[card.action].text : card.pledge.quote || card.pledge.measure!.summary
  const listing = g.market.find((l) => l.card.uid === card.uid)
  const ctx = contextOf(g)
  const shift = contextShift(g, card)
  const played = pick.where === 'table' ? g.seats.player.played.find((p) => p.card.uid === card.uid) : pick.where === 'adverse' ? g.seats.ai.played.find((p) => p.card.uid === card.uid) : undefined
  const cost = played ? played.cost : cardCost(g, 'player', card)
  const spends = card.kind === 'mesure' || (card.kind === 'action' && !!ACTIONS[card.action].spend)
  const md = !spends ? null : played ? (played.md ?? 0) : budgetCost(g, side, card)
  return (
    <div className="modal-backdrop on-top" role="presentation" onClick={onClose}>
      <div className="modal dl-cardmodal" role="dialog" aria-modal="true" aria-label={cardName(card)} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="dl-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <div className="dl-cardmodal-body">
          <div className={`dl-card big ${kind.cls} ${rarityClass(card)}`}>
            <span className="dl-cost">{listing ? `${listing.price} ⚡` : `⚡${cost}`}</span>
            <span className="dl-kind">{kind.label}</span>
            {/* L'emplacement de l'illustration : un emoji pour l'instant, une image plus tard. */}
            <span className="dl-art" aria-hidden="true">
              {cardArt(card)}
            </span>
            <strong className="dl-name">{cardName(card)}</strong>
            {taglineOf(card) ? <em className="dl-tagline">{taglineOf(card)}</em> : null}
            <span className="dl-desc">{description}</span>
            {card.kind === 'crise' && CRISES[card.crisis].rule ? <span className="dl-rule">{CRISES[card.crisis].rule}</span> : null}
          </div>

          <div className="dl-quick">
            <p className="dl-quick-cost">
              <span title="Le coût en énergie">⚡ {listing ? listing.price : cost}</span>
              {md !== null ? <MdBadge md={md} /> : null}
              {shift ? (
                <span className="dl-quick-ctx" title={`${ctx.name} : ${ctx.rule}`}>
                  {ctx.art} {shift > 0 ? '+' : '−'}
                  {Math.abs(shift)} ⚡
                </span>
              ) : null}
            </p>
            {impact ? <Effects impact={impact} max={4} /> : <p className="dl-fx-rule">🎴 Change les règles du duel</p>}
            <button type="button" className="dl-why-link" onClick={onWhy}>
              🔍 Pourquoi ?
            </button>
          </div>
        </div>

        <footer className="dl-cardmodal-actions">
          <Actions g={g} pick={pick} canAct={canAct} {...actions} />
        </footer>
      </div>
    </div>
  )
}

/** Ce qu'on peut faire de la carte, selon où elle est. */
function Actions({ g, pick, canAct, onPlay, onDiscard, onSell, onBuy }: { g: Game; pick: Pick; canAct: boolean } & CardActions) {
  const { card } = pick
  if (pick.where === 'adverse') {
    return <small className="dl-locked">👀 Carte de {g.seats.ai.name}</small>
  }
  if (pick.where === 'table') {
    return <small className="dl-locked">✅ Posée cette année</small>
  }
  if (!canAct) {
    return <small className="dl-locked">{g.outcome ? '🏁 Partie finie' : `⏳ ${yourTurn(g, 'player') ?? 'Pas votre tour'}`}</small>
  }
  if (pick.where === 'marche') {
    const why = canBuy(g, 'player', card.uid)
    const listing = g.market.find((l) => l.card.uid === card.uid)
    return (
      <>
        <button type="button" className="primary" disabled={!!why} onClick={onBuy}>
          🛒 Acheter · {listing?.price} ⚡
        </button>
        {why ? <small className="dl-locked">🔒 {why}</small> : null}
      </>
    )
  }
  const playWhy = canPlay(g, 'player', card)
  const sellWhy = canSell(g, 'player', card.uid)
  return (
    <>
      <button type="button" className="primary" disabled={!!playWhy} onClick={onPlay}>
        {card.kind === 'crise' ? '💥 Envoyer' : '▶ Jouer'} · ⚡{cardCost(g, 'player', card)}
      </button>
      <button type="button" className="ghost" onClick={onDiscard} title="Jeter la carte : +1 ⚡ tout de suite">
        🗑️ +{DISCARD_GAIN} ⚡
      </button>
      <button type="button" className="ghost" disabled={!!sellWhy} onClick={onSell} title="La mettre au marché : l’adversaire peut l’acheter, vous touchez l’énergie l’an prochain">
        🏷️ Vendre · {marketPrice(g, card)} ⚡
      </button>
      {playWhy || sellWhy ? <small className="dl-locked">🔒 {playWhy ?? sellWhy}</small> : null}
    </>
  )
}

// — Les fenêtres de fin d'année et de fin de partie

/** Les chiffres clés d'une France, pour comparer les deux : la valeur, et dans quel sens c'est mieux. */
type Stat = { id: string; label: string; unit: string; digits: number; better: 'up' | 'down'; value: (s: YearState, start: YearState) => number }

const STATS: Stat[] = [
  { id: 'note', label: '📊 Note', unit: '/100', digits: 0, better: 'up', value: (s, start) => health(s, start) },
  { id: 'chomage', label: '👷 Chômage', unit: ' %', digits: 1, better: 'down', value: (s) => s.unemployment * 100 },
  { id: 'croissance', label: '📈 Croissance', unit: ' %', digits: 1, better: 'up', value: (s) => s.growth * 100 },
  { id: 'pouvoir', label: '🛒 Pouvoir d’achat', unit: ' %', digits: 1, better: 'up', value: (s, start) => (s.medianIncome / start.medianIncome - 1) * 100 },
  { id: 'deficit', label: '💶 Déficit', unit: ' %', digits: 1, better: 'down', value: (s) => (s.deficit / s.gdp) * 100 },
  { id: 'dette', label: '🏦 Dette', unit: ' %', digits: 0, better: 'down', value: (s) => s.debtRatio * 100 },
  { id: 'colere', label: '😡 Colère', unit: '', digits: 0, better: 'down', value: (s) => Math.max(0, s.discontent * 100) },
  { id: 'popularite', label: '😊 Popularité', unit: ' %', digits: 0, better: 'up', value: (s) => popularity(s) },
]

const stateAt = (g: Game, side: Side, year: number) => g.seats[side].states.find((x) => x.year === year)!
const startOf = (g: Game, side: Side) => stateAt(g, side, START_YEAR)

/** Une valeur, et ce qu'elle a bougé : en vert si c'est mieux pour le pays. */
function StatCell({ stat, now, before }: { stat: Stat; now: number; before?: number }) {
  const delta = before === undefined ? 0 : now - before
  const shown = Math.abs(delta) >= 0.5 * 10 ** -stat.digits
  const good = stat.better === 'up' ? delta > 0 : delta < 0
  return (
    <td>
      <b>
        {num(now, stat.digits)}
        <small>{stat.unit}</small>
      </b>
      {before !== undefined ? <span className={`dl-delta ${shown ? (good ? 'good' : 'bad') : ''}`}>{shown ? signed(delta, stat.digits) : '='}</span> : null}
    </td>
  )
}

/** Une carte en une ligne : son dessin, son nom. */
function CardLine({ g, card, side, cost, stamp }: { g: Game; card: Card; side: Side; cost?: number; stamp?: string }) {
  const kind = kindOf(g, card, side)
  return (
    <li className={`dl-cardline ${kind.cls}`}>
      <span aria-hidden="true">{cardArt(card)}</span> {cardName(card)}
      {cost !== undefined ? <small> ⚡{cost}</small> : null}
      {stamp ? <small> · {stamp}</small> : null}
    </li>
  )
}

/** Un pays au bord du gouffre : les seuils de fin de partie du modèle, approchés aux trois quarts. */
function dangers(st: YearState): string[] {
  const out: string[] = []
  if (st.discontent >= 0.75) {
    out.push('🔥 Révolte proche')
  }
  if (st.riskPremium >= 0.06 || st.interest / st.revenue >= 0.19) {
    out.push('💥 Faillite proche')
  }
  if (st.unemployment >= 0.16) {
    out.push('📉 Dépression proche')
  }
  if (st.inflation >= 0.15) {
    out.push('🎈 Hyperinflation proche')
  }
  return out
}

/** Ce qui a marqué l'année d'un président, en pastilles. */
function highlights(r: Report['sides'][Side]): { text: string; tone: '' | 'good' | 'bad' }[] {
  const laws = r.played.filter((p) => p.card.kind === 'mesure' && !p.cancelled).length
  return [
    ...(laws ? [{ text: `🏛️ ${laws} loi${laws > 1 ? 's' : ''}`, tone: '' as const }] : []),
    ...r.kept.map(() => ({ text: '⭐ Promesse tenue', tone: 'good' as const })),
    ...r.received.map((c) => ({ text: `${CRISES[c].art} ${CRISES[c].name}${r.softened.includes(c) ? ' ½' : ''}`, tone: 'bad' as const })),
    ...r.parried.map((c) => ({ text: `🛡️ ${CRISES[c].name} paré`, tone: 'good' as const })),
    ...(r.earned ? [{ text: `⚡ +${r.earned}`, tone: 'good' as const }] : []),
    ...(r.malus ? [{ text: `📉 −${r.malus} ⚡`, tone: 'bad' as const }] : []),
    ...(r.alert ? [{ text: '🚨 Bruxelles', tone: 'bad' as const }] : []),
  ]
}

/**
 * La fin d'une année, façon écran de résultat : qui mène, de combien, si l'écart se creuse, la course aux promesses,
 * les dangers, et ce qui s'est passé en pastilles. Le tableau détaillé est dans « Comparer ».
 */
function Verdict({
  g,
  report,
  quip,
  onClose,
  onCompare,
  onWhy,
}: {
  g: Game
  report: Report
  /** La réplique de l'IA sur l'année (ou null). */
  quip?: string | null
  onClose: () => void
  onCompare: () => void
  /** Ouvrir la page « Pourquoi ? » d'une carte jouée cette année (null : la table de l'année n'est plus là). */
  onWhy: ((card: Card, side: Side) => void) | null
}) {
  const a = report.sides.player
  const b = report.sides.ai
  const lead = a.health - b.health
  const swing = lead - (a.before - b.before)
  useEffect(() => {
    sfx(lead > 0 ? 'promise' : lead < 0 ? 'defeat' : 'flip')
  }, [lead])
  const share = a.health + b.health > 0 ? (a.health / (a.health + b.health)) * 100 : 50
  const ctx = CONTEXTS[report.context]
  return (
    <div className={`dlr ${lead > 0 ? 'is-ahead' : lead < 0 ? 'is-behind' : 'is-even'}`} role="dialog" aria-modal="true" aria-label={`Bilan ${report.year}`}>
      <p className="dlr-year">
        🗓️ {report.year} · {ctx.art} {ctx.name}
      </p>
      <h2 className="dlr-title">{lead > 0 ? '🔥 Vous menez' : lead < 0 ? '😬 Vous êtes mené' : '🤝 Égalité'}</h2>
      {quip ? (
        <p className="dlr-quip">
          {g.seats.ai.emblem} <span>{quip}</span>
        </p>
      ) : null}
      <p className="dlr-score">
        <b style={{ '--c': g.seats.player.color } as React.CSSProperties}>{a.health}</b>
        <span>–</span>
        <b style={{ '--c': g.seats.ai.color } as React.CSSProperties}>{b.health}</b>
      </p>
      <p className={`dlr-swing ${swing > 0 ? 'good' : swing < 0 ? 'bad' : ''}`} title="Comment l’écart a bougé cette année">
        {swing > 0 ? `▲ +${swing}` : swing < 0 ? `▼ −${-swing}` : '= 0'} <small>écart</small>
      </p>
      <div className="dlr-tug" style={{ '--p': `${share}%`, '--a': g.seats.player.color, '--b': g.seats.ai.color } as React.CSSProperties} aria-hidden="true">
        <i />
      </div>
      <div className="dlr-sides">
        {SIDES_ORDER.map((side) => {
          const r = report.sides[side]
          const s = g.seats[side]
          const delta = r.health - r.before
          const kept = keptPromises(s, report.year).length
          return (
            <section key={side} className="dlr-side" style={{ '--c': s.color } as React.CSSProperties}>
              <header>
                <span aria-hidden="true">{s.emblem}</span>
                <strong>{side === 'player' ? 'Vous' : s.name}</strong>
                <b className={delta > 0 ? 'good' : delta < 0 ? 'bad' : ''}>{delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ −${-delta}` : '='}</b>
              </header>
              <p className={`dlr-stars ${kept >= PROGRAMME_GOAL ? 'is-done' : ''}`} title={`Promesses tenues : il en faut ${PROGRAMME_GOAL}`}>
                {Array.from({ length: PROGRAMME_GOAL }, (_, i) => (i < kept ? '⭐' : '☆')).join('')} <small>{Math.min(kept, 5)}/{PROGRAMME_GOAL}</small>
              </p>
              {dangers(stateAt(g, side, report.year)).map((d) => (
                <p key={d} className="dlr-danger">
                  {d}
                </p>
              ))}
              <ul className="dlr-chips">
                {highlights(r).map((h, i) => (
                  <li key={i} className={h.tone}>
                    {h.text}
                  </li>
                ))}
                {r.played.map((p) => (
                  <li key={p.card.uid} className="dlr-card">
                    <button type="button" disabled={!onWhy} onClick={() => onWhy?.(p.card, side)} title={`${cardName(p.card)} : pourquoi ?`}>
                      {cardArt(p.card)}
                      {stampOf(p) ? <small>{stampOf(p)}</small> : null}
                    </button>
                  </li>
                ))}
                {!r.played.length && !highlights(r).length ? <li className="dl-none">😴 Rien</li> : null}
              </ul>
            </section>
          )
        })}
      </div>
      <footer className="dlr-actions">
        <button type="button" className="primary big" onClick={onClose}>
          ▶ {report.year + 1}
        </button>
        <button type="button" className="ghost" onClick={onCompare}>
          📊 Détails
        </button>
      </footer>
    </div>
  )
}

const SIDES_ORDER: Side[] = ['player', 'ai']

/** Une petite courbe : les deux France, année par année. */
function Spark({ g, stat }: { g: Game; stat: Stat }) {
  const series = SIDES_ORDER.map((side) => g.seats[side].states.filter((x) => x.year >= START_YEAR).map((x) => stat.value(x, startOf(g, side))))
  const all = series.flat()
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const n = Math.max(2, series[0].length)
  const w = 96
  const h = 26
  const point = (v: number, i: number) => `${((i / (n - 1)) * w).toFixed(1)},${(hi === lo ? h / 2 : h - 2 - ((v - lo) / (hi - lo)) * (h - 4)).toFixed(1)}`
  return (
    <svg className="dl-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      {series.map((values, k) => (
        <polyline key={k} points={values.map(point).join(' ')} fill="none" stroke={g.seats[SIDES_ORDER[k]].color} strokeWidth={k === 0 ? 2.2 : 1.6} strokeDasharray={k === 0 ? undefined : '3 2'} />
      ))}
    </svg>
  )
}

/** Les deux France côte à côte, à tout moment : la note critère par critère, les chiffres clés année par année, les cartes jouées. */
function Compare({ g, onClose }: { g: Game; onClose: () => void }) {
  const now = (side: Side) => lastState(g.seats[side])
  const parts = SIDES_ORDER.map((side) => healthParts(now(side), startOf(g, side)))
  const name = (side: Side) => (side === 'player' ? 'Vous' : g.seats[side].name)
  const head = (
    <tr>
      <th />
      {SIDES_ORDER.map((side) => (
        <th key={side} style={{ '--c': g.seats[side].color } as React.CSSProperties}>
          {g.seats[side].emblem} {name(side)}
        </th>
      ))}
    </tr>
  )
  return (
    <div className="dl-compare" role="dialog" aria-modal="true" aria-label="Comparer les deux France">
      <header className="dlg-top">
        <strong className="dl-year">📊 Les deux France</strong>
        <button type="button" className="ghost small" onClick={onClose}>
          ✕ Fermer
        </button>
      </header>
      <div className="dl-compare-body">
        <section>
          <h3>📈 Depuis 2027</h3>
          <p className="note">
            <i className="dl-legend" style={{ '--c': g.seats.player.color } as React.CSSProperties} /> Vous · <i className="dl-legend dashed" style={{ '--c': g.seats.ai.color } as React.CSSProperties} />{' '}
            {g.seats.ai.name}
          </p>
          <table className="dl-yeartable">
            <thead>{head}</thead>
            <tbody>
              {STATS.map((stat) => {
                const values = SIDES_ORDER.map((side) => stat.value(now(side), startOf(g, side)))
                return (
                  <tr key={stat.id}>
                    <td>
                      {stat.label}
                      <Spark g={g} stat={stat} />
                    </td>
                    {SIDES_ORDER.map((side, k) => (
                      <StatCell key={side} stat={stat} now={values[k]} before={g.reports.length ? stat.value(stateAt(g, side, now(side).year - 1), startOf(g, side)) : undefined} />
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
        <section>
          <h3>🧮 La note</h3>
          <table className="dl-breakdown">
            <thead>{head}</thead>
            <tbody>
              {parts[0].map((p, i) => (
                <tr key={p.id} title={p.explanation}>
                  <td>
                    {p.label} <small>/ {p.weight}</small>
                  </td>
                  {parts.map((side, k) => (
                    <td key={k} className={side[i].points >= parts[1 - k][i].points + 0.05 ? 'up' : ''}>
                      {num(side[i].points, 1)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="dl-total">
                <td>Total</td>
                {SIDES_ORDER.map((side) => (
                  <td key={side}>{scoreOf(g.seats[side])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>🃏 Les cartes jouées</h3>
          {!g.reports.length ? <p className="note">Rien encore.</p> : null}
          {[...g.reports].reverse().map((r) => (
            <div key={r.year} className="dl-history">
              <strong>{r.year}</strong>
              <div className="dl-versus">
                {SIDES_ORDER.map((side) => (
                  <div key={side} className="dl-side" style={{ '--c': g.seats[side].color } as React.CSSProperties}>
                    <small>
                      {g.seats[side].emblem} {name(side)} · 📊 {r.sides[side].before} → {r.sides[side].health}
                    </small>
                    <ul className="dl-cardlines">
                      {r.sides[side].played.map((p) => (
                        <CardLine key={p.card.uid} g={g} card={p.card} side={side} cost={p.cost} stamp={stampOf(p)} />
                      ))}
                      {r.sides[side].received.map((c, i) => (
                        <li key={`${c}-${i}`} className="down">
                          {CRISES[c].art} {CRISES[c].name}
                        </li>
                      ))}
                      {!r.sides[side].played.length && !r.sides[side].received.length ? <li className="dl-none">—</li> : null}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

/**
 * La fin du duel, façon jeu de combat : la bannière (VICTOIRE, DÉFAITE, K.O. quand un pays s'effondre, MATCH NUL),
 * les deux présidents face à face avec leur note, puis chaque critère en bras de fer : la barre du meilleur s'allume à sa couleur.
 */
function Final({ g, quip, onReplay, onCompare, onClose }: { g: Game; quip?: string | null; onReplay: () => void; onCompare: () => void; onClose: () => void }) {
  const o = g.outcome!
  useEffect(() => {
    sfx(o.winner === 'player' ? 'victory' : o.winner === 'ai' ? 'defeat' : 'flip')
  }, [o.winner])
  const ko = SIDES_ORDER.some((side) => lastState(g.seats[side]).ending)
  const banner = o.winner === 'nul' ? 'Match nul' : ko ? 'K.O.' : o.winner === 'player' ? 'Victoire' : 'Défaite'
  const verdict = o.winner === 'nul' ? 'Personne ne l’emporte' : o.winner === 'player' ? 'Vous gagnez le duel' : `${g.seats.ai.name} gagne le duel`
  const parts = SIDES_ORDER.map((side) => healthParts(lastState(g.seats[side]), startOf(g, side)))
  const name = (side: Side) => (side === 'player' ? 'Vous' : g.seats[side].name)
  return (
    <div className={`dlf ${o.winner === 'player' ? 'is-won' : o.winner === 'ai' ? 'is-lost' : 'is-draw'} ${ko ? 'is-ko' : ''}`} role="dialog" aria-modal="true" aria-label="Fin du duel">
      <header className="dlf-banner">
        <p className="dlf-title">{banner}</p>
        <p className="dlf-verdict">{verdict}</p>
        {quip ? (
          <p className="dlr-quip">
            {g.seats.ai.emblem} <span>{quip}</span>
          </p>
        ) : null}
      </header>
      {o.winner === 'player' ? <Confetti /> : null}
      <section className="dlf-faceoff" aria-label="Les notes finales">
        {SIDES_ORDER.map((side, k) => {
          const s = g.seats[side]
          const won = o.winner === side
          return (
            <div key={side} className={`dlf-fighter ${k === 0 ? 'left' : 'right'} ${won ? 'is-winner' : ''}`} style={{ '--c': s.color } as React.CSSProperties}>
              <span className="dlf-emblem" aria-hidden="true">
                {s.emblem}
              </span>
              <strong>{name(side)}</strong>
              <b className="dlf-score">
                {scoreOf(s)}
                <small>/100</small>
              </b>
              <small>
                ⭐ {keptPromises(s, g.year).length}/5 promesses{lastState(s).ending ? ' · pays effondré' : ''}
              </small>
              {won ? <span className="dlf-crown">👑</span> : null}
            </div>
          )
        })}
        <span className="dlf-vs" aria-hidden="true">
          VS
        </span>
      </section>
      <p className="dlf-reason">{o.reason}</p>
      <section className="dlf-rows" aria-label="La note, critère par critère">
        {parts[0].map((p, i) => {
          const a = p.points
          const b = parts[1][i].points
          const lead = Math.abs(a - b) < 0.05 ? null : a > b ? 0 : 1
          return (
            <div key={p.id} className="dlf-row" title={p.explanation}>
              <span className="dlf-label">
                {p.label} <small>/ {p.weight}</small>
              </span>
              {[a, b].map((v, k) => (
                <span
                  key={k}
                  className={`dlf-bar ${k === 0 ? 'left' : 'right'} ${lead === k ? 'is-lead' : ''}`}
                  style={{ '--c': g.seats[SIDES_ORDER[k]].color, '--w': `${Math.round((v / p.weight) * 100)}%` } as React.CSSProperties}
                >
                  <i />
                  <b>{num(v, 1)}</b>
                </span>
              ))}
            </div>
          )
        })}
      </section>
      <footer className="dlf-actions">
        <button type="button" className="primary big" onClick={onReplay}>
          🔁 Revanche
        </button>
        <button type="button" className="ghost" onClick={onCompare}>
          📊 Comparer les deux France
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Revoir la table
        </button>
      </footer>
    </div>
  )
}

/** Les règles en cinq gestes : l'essentiel d'un coup d'œil, le reste replié. */
const STEPS: { icon: string; title: string; text: string }[] = [
  { icon: '🃏', title: 'Chacun son tour', text: 'Une carte, ou ⏭ passer' },
  { icon: '⚡', title: 'Énergie et budget', text: '2 lois par an · 💶 marge' },
  { icon: '📜', title: 'Votre France', text: '💥 Les crises : la sienne' },
  { icon: '🛡️', title: 'Parez ses coups', text: 'Gardez une parade' },
  { icon: '🏆', title: `⭐ ${PROGRAMME_GOAL} promesses`, text: 'Puis la meilleure note · 💀 faillite = perdu' },
]

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop on-top" role="presentation" onClick={onClose}>
      <div className="modal dl-rules" role="dialog" aria-modal="true" aria-label="Les règles" onClick={(e) => e.stopPropagation()}>
        <h2>🃏 Le duel des présidents</h2>
        <ol className="dl-steps">
          {STEPS.map((step, i) => (
            <li key={step.icon} style={{ '--i': i } as React.CSSProperties}>
              <span aria-hidden="true">{step.icon}</span>
              <strong>{step.title}</strong>
              <small>{step.text}</small>
            </li>
          ))}
        </ol>
        <details className="dl-rules-more">
          <summary>📖 Toutes les règles</summary>
          <ol>
            <li>
              <strong>Chacun sa France.</strong> Vous et votre adversaire partez de la même France de 2027. Le modèle fait vivre chaque pays selon les cartes jouées.
            </li>
            <li>
              <strong>La conjoncture.</strong> Chaque année commence par une carte contexte, la même pour les deux : récession, hausse des taux, élections européennes… Elle frappe vraiment
              les deux France (dans le modèle) et change le prix de certaines cartes.
            </li>
            <li>
              <strong>Une pioche commune.</strong> 5 cartes au départ, puis 3 par an (8 en main au plus). Ce que vous piochez, l’adversaire ne l’a pas, sauf si vous le mettez en vente au
              marché. Vos promesses et les siennes sont mêlées dedans.
            </li>
            <li>
              <strong>Chacun son tour.</strong> On pose une carte à la fois, ou on passe. Quand les deux passent de suite, l’année se joue. Celui dont le pays va le moins bien ouvre l’année.
              Acheter, vendre et jeter ne prennent pas votre tour.
            </li>
            <li>
              <strong>Deux ressources.</strong> L’énergie ⚡ (votre capital politique : 3 par an, plus si vous êtes populaire, +2 par promesse tenue) paie les cartes ; deux lois au plus
              par an. La marge budgétaire 💶 (en Md€, plus large si le déficit et la dette sont bas) : chaque mesure coûte ou rapporte des milliards. Dépasser la marge est permis, mais
              les marchés s’inquiètent : moins d’énergie l’an prochain, et au-delà de {ALERT_AT} Md€, Bruxelles sanctionne.
            </li>
            <li>
              📜 une <em>mesure</em> change votre France · ⭐ une <em>promesse</em> est une mesure de votre programme · 💥 une <em>crise</em>, 🗞️ un <em>scandale</em> ou 🎯 un{' '}
              <em>coup politique</em> (fuite, motion de censure, débauchage) frappe l’adversaire · 🛡️ les <em>parades</em> se gardent en main et se jouent quand le coup arrive : cellule
              de crise, commission d’enquête (scandales), communication de crise (effets divisés par deux), Conseil constitutionnel (censure une loi adverse) · 🎉 les{' '}
              <em>événements</em> (JO, Coupe du monde, selfie avec un panda…) passent par le modèle · 🎴 les <em>actions</em> (sondage, discours, remaniement, 49.3…) changent la partie ·
              🌟 les cartes <em>légendaires</em> (référendum, dissolution, plan de relance européen) sont uniques.
            </li>
            <li>
              <strong>Touchez une carte :</strong> elle s’ouvre en grand, avec son effet en un coup d’œil (🔍 « Pourquoi ? » pour le détail), et ce que vous pouvez en faire : la jouer, la
              jeter (+{DISCARD_GAIN} ⚡ tout de suite) ou la vendre au marché (l’acheteur paie, vous touchez l’énergie l’an prochain).
            </li>
            <li>
              <strong>Avec un ami :</strong> en ligne, chacun joue sur son téléphone et ne voit que sa main (sauf sondage truqué) ; à deux sur le même téléphone, on se le passe à chaque
              tour, et l’écran cache la main de l’autre.
            </li>
            <li>
              <strong>Pour gagner :</strong> si votre pays fait faillite ou se révolte, vous perdez tout de suite. À la fin, celui qui a tenu au moins {PROGRAMME_GOAL} promesses sur 5
              bat celui qui ne l’a pas fait. Sinon, la meilleure note de santé (sur 100) l’emporte.
            </li>
          </ol>
        </details>
        <div className="verdict-actions">
          <button type="button" className="primary big" onClick={onClose}>
            ⚔️ C’est parti
          </button>
        </div>
      </div>
    </div>
  )
}

/** Des confettis pour la victoire (quelques emojis qui tombent ; rien si le mouvement est réduit). */
const CONFETTI = ['🎉', '⭐', '🎊', '🏆', '✨', '🥳']

function Confetti() {
  return (
    <div className="dlf-confetti" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i % 6) * 0.35}s`, '--t': `${2.6 + (i % 4) * 0.5}s` } as React.CSSProperties}>
          {CONFETTI[i % CONFETTI.length]}
        </span>
      ))}
    </div>
  )
}
