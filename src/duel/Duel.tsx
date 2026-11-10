import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CANDIDATES, PARODY_NOTE } from '../game/candidates'
import { popularity } from '../game/score'
import { num } from '../ui/format'
import { applyAi, nextAiAction } from './ai'
import { ACTIONS, cardArt, cardName, CRISES, isAdded, type Card } from './cards'
import {
  BOT,
  buy,
  canBuy,
  canPlay,
  canSell,
  cardCost,
  discard,
  DISCARD_GAIN,
  endYear,
  keptPromises,
  lastState,
  marketPrice,
  MARKET_SIZE,
  newGame,
  other,
  play,
  PROGRAMME_GOAL,
  promiseOwner,
  resolveYear,
  scoreOf,
  sell,
  START_YEAR,
  takeBack,
  type Game,
  type Move,
  type Player,
  type Report,
  type Side,
} from './engine'
import type { YearState } from '../model/types'
import { health, healthParts } from './health'
import { setSoundOn, sfx, soundOn, type Sfx } from './sound'
import { cardImpact, CRITERION_NODE, crisisEffects, leverChanges, startNodes, whyTree, type Detail, type Impact, type Indicator, type WhyNode } from './why'
import './duel.css'

const REVEAL_DELAY = 1100

type Stage = 'play' | 'reveal' | 'report'
/** La carte ouverte en grand : dans votre main, au marché, parmi vos cartes de l'année, ou parmi celles de l'adversaire. */
type Pick = { card: Card; where: 'main' | 'marche' | 'table' | 'adverse' }

/** Le duel de cartes : choisir les présidents, puis jouer année après année, en plein écran. */
export function Duel({ onExit, onModel }: { onExit: () => void; onModel: (focus: string | null) => void }) {
  const [game, setGame] = useState<Game | null>(null)
  const [stage, setStage] = useState<Stage>('play')
  const [rules, setRules] = useState(true)
  const [pick, setPick] = useState<Pick | null>(null)
  /** La dernière chose faite par l'adversaire, annoncée au centre de la table. */
  const [news, setNews] = useState<Move | null>(null)
  const [compare, setCompare] = useState(false)
  const [settings, setSettings] = useState(false)
  /** Une carte achetée arrive en main : pas de bruit de pioche par-dessus celui des pièces. */
  const bought = useRef(false)
  const hand = useFresh(game?.seats.player.hand.map((c) => c.uid) ?? [])
  const landed = useFresh(game?.seats.player.played.map((p) => p.card.uid) ?? [])
  useEffect(() => {
    if (hand.size && !bought.current) {
      sfx('draw')
    }
    bought.current = false
  }, [hand])

  // Le dévoilement : l'adversaire agit une fois par instant (achats, cartes posées, ventes), puis l'année se joue.
  useEffect(() => {
    if (!game || stage !== 'reveal') {
      return
    }
    const action = nextAiAction(game)
    const id = window.setTimeout(
      () => {
        if (action) {
          const next = applyAi(game, action)
          const move = next === game ? null : (next.moves.at(-1) ?? null)
          setNews(move)
          if (move) {
            sfx(MOVE_SFX[move.kind](move))
          }
          setGame(next === game ? resolveYear(game) : next)
          if (next === game) {
            setStage('report')
          }
        } else {
          setNews(null)
          setGame(resolveYear(game))
          setStage('report')
        }
      },
      action ? REVEAL_DELAY : REVEAL_DELAY * 1.3,
    )
    return () => window.clearTimeout(id)
  }, [game, stage])

  if (!game) {
    return (
      <Setup
        onExit={onExit}
        onStart={(player, ai, years) => {
          setGame(newGame(player, ai, { seed: Math.floor(Math.random() * 1e9), years }))
          setStage('play')
        }}
      />
    )
  }

  const act = (next: Game, ...sounds: Sfx[]) => {
    if (next !== game) {
      sounds.forEach((name, i) => window.setTimeout(() => sfx(name), i * 140))
    }
    setGame(next)
    setPick(null)
  }
  const open = (p: Pick) => {
    sfx('pick')
    setPick(p)
  }
  const report = game.reports.at(-1)
  const canAct = stage === 'play' && !game.outcome
  return (
    <div className="dlg">
      <header className="dlg-top">
        <button type="button" className="ghost small" onClick={onExit}>
          ← Accueil
        </button>
        <strong className="dl-year">
          {game.outcome ? 'Partie terminée' : `Année ${game.year}`} <small>· {Math.min(game.year, endYear(game)) - START_YEAR}/{game.years}</small>
        </strong>
        <span className="dlg-top-right">
          <button type="button" className="ghost small" onClick={() => setCompare(true)} title="Comparer les deux France">
            📊<span className="dlg-lbl"> Comparer</span>
          </button>
          <button type="button" className="ghost small" onClick={() => onModel(null)} title="Le modèle">
            🧠<span className="dlg-lbl"> Modèle</span>
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

      <Strip g={game} side="ai" />

      <main className="dlg-board">
        <section className="dlg-pile" aria-label="La pioche commune">
          <div className="dl-back big" title="La pioche commune : chaque carte tirée est donnée aux deux joueurs">
            <span>{game.deck.length}</span>
          </div>
          <small>Pioche commune</small>
          <div className="dl-back discard" title="Les cartes jouées et jetées">
            <span>{game.discard.length}</span>
          </div>
          <small>Défausse</small>
        </section>

        <section className="dlg-table">
          <div className="dlg-zone">
            <p>
              {game.seats.ai.emblem} {stage === 'play' ? `${game.seats.ai.name} prépare son année…` : `Cartes de ${game.seats.ai.name}`}
            </p>
            <div className="dlg-row">
              {stage === 'play' ? (
                <div className="dl-back" aria-label="Cartes cachées" />
              ) : (
                game.seats.ai.played.map(({ card, cost }) => <Mini key={card.uid} g={game} card={card} side="ai" badge={`⚡${cost}`} flip onClick={() => open({ card, where: 'adverse' })} />)
              )}
            </div>
          </div>
          {news && stage === 'reveal' ? <div className="dlg-news">{newsText(game, news)}</div> : null}
          <div className="dlg-zone mine">
            <p>Vos cartes de l’année {game.seats.player.played.length && canAct ? <small>· touchez pour revoir ou reprendre</small> : null}</p>
            <div className="dlg-row">
              {game.seats.player.played.map(({ card, cost }) => (
                <Mini key={card.uid} g={game} card={card} side="player" badge={`⚡${cost}`} landed={landed.has(card.uid)} onClick={() => open({ card, where: 'table' })} />
              ))}
              {!game.seats.player.played.length ? <p className="dlg-hint">Choisissez une carte dans votre main.</p> : null}
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
            {!game.market.length ? <p className="dlg-hint">Vendez ici les cartes dont vous ne voulez pas : l’adversaire peut les acheter.</p> : null}
          </div>
        </section>
      </main>

      <Strip g={game} side="player" />

      <footer className="dlg-hand">
        <div className="dlg-cards" aria-label="Votre main">
          {game.seats.player.hand.map((c, i, all) => (
            <HandCard
              key={c.uid}
              g={game}
              card={c}
              dim={!canAct}
              fan={fanOf(i, all.length)}
              drawn={hand.has(c.uid) ? [...hand].indexOf(c.uid) : null}
              up={pick?.where === 'main' && pick.card.uid === c.uid}
              onClick={() => open({ card: c, where: 'main' })}
            />
          ))}
        </div>
        <div className="dlg-side">
          <span className="dl-energy" title="Votre énergie : le capital politique de l’année (selon votre popularité), plus les promesses tenues et les ventes">
            ⚡ {game.seats.player.energy}
          </span>
          {game.outcome ? (
            <button type="button" className="primary" onClick={() => setStage('report')}>
              Résultat
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={!canAct}
              onClick={() => {
                sfx('flip')
                setPick(null)
                setStage('reveal')
              }}
            >
              {stage === 'reveal' ? `${game.seats.ai.name} joue…` : `Jouer ${game.year} →`}
            </button>
          )}
        </div>
      </footer>

      {stage === 'report' && report ? (
        game.outcome ? (
          <Final g={game} onReplay={() => setGame(null)} onModel={() => onModel(null)} onCompare={() => setCompare(true)} onClose={() => setStage('play')} />
        ) : (
          <YearReport g={game} report={report} onCompare={() => setCompare(true)} onClose={() => setStage('play')} />
        )
      ) : null}
      {pick ? (
        <CardModal
          g={game}
          pick={pick}
          canAct={canAct}
          onClose={() => setPick(null)}
          onModel={onModel}
          onPlay={() => act(play(game, 'player', pick.card), 'play')}
          onDiscard={() => act(discard(game, 'player', pick.card.uid), 'discard', 'energy')}
          onSell={() => act(sell(game, 'player', pick.card.uid), 'coin')}
          onBuy={() => {
            bought.current = true
            act(buy(game, 'player', pick.card.uid), 'coin')
          }}
          onTakeBack={() => act(takeBack(game, 'player', pick.card.uid), 'pick')}
        />
      ) : null}
      {compare ? <Compare g={game} onClose={() => setCompare(false)} /> : null}
      {rules ? <Rules onClose={() => setRules(false)} /> : null}
    </div>
  )
}

const MOVE_SFX: Record<Move['kind'], (m: Move) => Sfx> = {
  achat: () => 'coin',
  vente: () => 'coin',
  jet: () => 'discard',
  jeu: (m) => (m.card.kind === 'crise' ? 'crisis' : 'play'),
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

/** Les réglages : le son. */
function Settings({ onClose }: { onClose: () => void }) {
  const [on, setOn] = useState(soundOn)
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
      <button type="button" className="ghost small" onClick={onClose}>
        Fermer
      </button>
    </div>
  )
}

function newsText(g: Game, m: Move): string {
  const who = `${g.seats[m.side].emblem} ${g.seats[m.side].name}`
  const name = cardName(m.card)
  switch (m.kind) {
    case 'achat':
      return `${who} achète « ${name} » au marché (${m.price} ⚡)`
    case 'vente':
      return `${who} met « ${name} » en vente`
    case 'jet':
      return `${who} jette une carte (+${DISCARD_GAIN} ⚡)`
    case 'jeu':
      return m.card.kind === 'crise' ? `${who} vous envoie : ${name} !` : `${who} joue « ${name} »`
  }
}

// — Choisir les présidents

const asPlayer = (c: (typeof CANDIDATES)[number]): Player => ({ candidate: c, name: c.name, emblem: c.emblem, color: c.color })
const SURPRISE: Player = { candidate: null, name: 'Vous', emblem: '🎩', color: '#5b8def' }

function Setup({ onStart, onExit }: { onStart: (player: Player, ai: Player, years: number) => void; onExit: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [me, setMe] = useState<Player | null>(null)
  const [foe, setFoe] = useState<Player | null>(null)
  const [years, setYears] = useState(5)
  const mine = [...CANDIDATES.map(asPlayer), SURPRISE]
  const rivals = [...CANDIDATES.map(asPlayer).filter((p) => p.name !== me?.name), BOT]
  const titles = { 1: 'Qui incarnez-vous ?', 2: 'Contre qui ?', 3: 'Combien de temps ?' }
  return (
    <div className="dlg dlg-setup">
      <header className="dlg-top">
        <button type="button" className="ghost small" onClick={() => (step === 1 ? onExit() : setStep((step - 1) as 1 | 2))}>
          ← {step === 1 ? 'Accueil' : 'Retour'}
        </button>
        <strong className="dl-year">🃏 Le duel des présidents</strong>
        <span className="dl-steps" aria-label={`Étape ${step} sur 3`}>
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= step ? 'on' : ''} />
          ))}
        </span>
      </header>
      <section className="dlg-setup-head">
        <h1>{titles[step]}</h1>
        <p>
          {step === 1
            ? 'Deux présidents, deux France : la même au départ, en 2027. Les mêmes cartes pour les deux : mesures pour votre pays, crises pour le sien, et un marché. Le modèle fait vivre les deux France.'
            : step === 2
              ? 'Un candidat (version parodique, avec son programme), ou le Bot, qui se fait son propre programme.'
              : 'Le meilleur bilan gagne à la fin. Faillite ou révolte : défaite immédiate.'}
        </p>
      </section>
      <div className="dlg-setup-body">
        {step === 1 ? (
          <div className="dl-pick">
            {mine.map((p) => (
              <Chip
                key={p.name}
                p={p}
                sub={p.candidate?.family ?? 'Un programme tiré au sort'}
                selected={me?.name === p.name}
                onClick={() => {
                  sfx('click')
                  setMe(p)
                  setFoe(null)
                  setStep(2)
                }}
              />
            ))}
          </div>
        ) : step === 2 ? (
          <div className="dl-pick">
            {rivals.map((p) => (
              <Chip
                key={p.name}
                p={p}
                sub={p.candidate?.family ?? 'Sans parti, son propre programme'}
                selected={foe?.name === p.name}
                onClick={() => {
                  sfx('click')
                  setFoe(p)
                  setStep(3)
                }}
              />
            ))}
          </div>
        ) : (
          <div className="dl-final-step">
            <div className="dl-versus-chips">
              <Chip p={me!} sub="Vous" selected onClick={() => setStep(1)} />
              <strong>contre</strong>
              <Chip p={foe!} sub="L’IA" selected onClick={() => setStep(2)} />
            </div>
            <div className="dl-years" role="radiogroup" aria-label="Durée de la partie">
              {[5, 10].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={years === n} className={years === n ? 'is-selected' : ''} onClick={() => {
                    sfx('click')
                    setYears(n)
                  }}>
                  <strong>{n} ans</strong>
                  <small>{n === 5 ? 'Un mandat, environ 10 minutes' : 'Deux mandats, environ 20 minutes'}</small>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="primary big"
              onClick={() => {
                sfx('flip')
                onStart(me!, foe!, years)
              }}
            >
              ⚔️ Commencer le duel
            </button>
          </div>
        )}
      </div>
      <p className="note dlg-setup-foot">{PARODY_NOTE}</p>
    </div>
  )
}

function Chip({ p, sub, selected, onClick }: { p: Player; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`dl-chip ${selected ? 'is-selected' : ''}`} style={{ '--c': p.color } as React.CSSProperties} onClick={onClick} aria-pressed={selected}>
      <span>{p.emblem}</span>
      <strong>{p.name}</strong>
      <small>{sub}</small>
    </button>
  )
}

// — Un président et sa France, en une ligne

function Strip({ g, side }: { g: Game; side: Side }) {
  const s = g.seats[side]
  const st = lastState(s)
  const kept = new Set(keptPromises(s, g.year - 1).map((p) => p.key))
  const [open, setOpen] = useState<'programme' | 'note' | null>(null)
  const pct = (v: number) => `${num(v * 100, 1)} %`
  return (
    <section className={`dlg-strip strip-${side}`} style={{ '--c': s.color } as React.CSSProperties}>
      <span className="dl-emblem">{s.emblem}</span>
      <div className="dlg-name">
        <strong>{side === 'player' ? `Vous · ${s.name === 'Vous' ? 'programme surprise' : s.name}` : s.name}</strong>
        <small>
          {side === 'ai' ? `🂠 ${s.hand.length} en main` : `🂠 ${s.hand.length} en main`}
          {s.shield ? ' · 🛡️ cellule prête' : ''}
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
      <button type="button" className="dlg-prog" onClick={() => setOpen(open === 'programme' ? null : 'programme')} title="Le programme : touchez pour le détail">
        ⭐ {kept.size}/5 <small>(objectif {PROGRAMME_GOAL})</small>
      </button>
      {open ? (
        <div className="dlg-pop" role="dialog" aria-label={open === 'note' ? 'La note de santé' : 'Le programme'}>
          <button type="button" className="dlg-pop-close" onClick={() => setOpen(null)} aria-label="Fermer">
            ✕
          </button>
          {open === 'programme' ? (
            <>
              <strong>⭐ Programme de {side === 'player' ? 'vous' : s.name}</strong>
              <ul>
                {s.programme.map((p) => (
                  <li key={p.key} className={kept.has(p.key) ? 'is-kept' : ''}>
                    {kept.has(p.key) ? '✅' : '⬜'} {p.measure!.name}
                    {isAdded(p) ? <small> (ajoutée par le jeu : le programme publié en compte moins de cinq que le moteur sait jouer)</small> : null}
                  </li>
                ))}
              </ul>
              <small>Une promesse est tenue quand la mesure est appliquée. Chacune rapporte +2 ⚡ la première fois.</small>
            </>
          ) : (
            <>
              <strong>Note de santé : {scoreOf(s)} / 100</strong>
              <ul>
                {healthParts(st, s.states.find((x) => x.year === START_YEAR)!).map((p) => (
                  <li key={p.id} title={p.explanation}>
                    {p.label} : <b>{num(p.points, 1)}</b> / {p.weight}
                  </li>
                ))}
              </ul>
              <small>Les critères et leurs poids sont dans modele/note-pays.csv : discutables, comme tout le modèle.</small>
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
    return { cls: 'kind-crise', label: '💥 Crise' }
  }
  if (card.kind === 'action') {
    return { cls: 'kind-action', label: '🛡️ Action' }
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

const signed = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v), digits)}`

function HandCard({ g, card, dim, fan, drawn, up, onClick }: { g: Game; card: Card; dim: boolean; fan: React.CSSProperties; drawn: number | null; up: boolean; onClick: () => void }) {
  const kind = kindOf(g, card, 'player')
  // Les chiffres (effet sur la note, sur les indicateurs) sont dans la fenêtre de la carte : la carte reste lisible.
  return (
    <button
      type="button"
      className={`dl-card hand ${kind.cls} ${dim ? 'is-dim' : ''} ${drawn !== null ? 'is-drawn' : ''} ${up ? 'is-up' : ''}`}
      style={drawn !== null ? { ...fan, '--d': `${drawn * 90}ms` } as React.CSSProperties : fan}
      onClick={onClick}
      onPointerEnter={(e) => (e.pointerType === 'mouse' && !dim ? sfx('hover') : undefined)}
      aria-label={`${cardName(card)} : voir la carte`}
    >
      <span className="dl-cost">⚡{cardCost(g, 'player', card)}</span>
      <span className="dl-kind">{kind.label}</span>
      <span className="dl-art" aria-hidden="true">
        {cardArt(card)}
      </span>
      <strong className="dl-name">{cardName(card)}</strong>
      {card.kind === 'action' ? <span className="dl-text">{ACTIONS[card.action].text}</span> : null}
      {card.kind === 'crise' ? <span className="dl-target">→ chez l’adversaire</span> : null}
    </button>
  )
}

function Mini({ g, card, side, badge, seller, flip, landed, onClick }: { g: Game; card: Card; side: Side; badge: string; seller?: string; flip?: boolean; landed?: boolean; onClick: () => void }) {
  const kind = kindOf(g, card, side)
  return (
    <button type="button" className={`dl-card mini ${kind.cls} ${flip ? 'is-flip' : ''} ${landed ? 'is-landed' : ''}`} onClick={onClick} title={kind.label}>
      <span className="dl-cost">{badge}</span>
      {seller ? <span className="dl-seller">{seller}</span> : null}
      <span className="dl-art" aria-hidden="true">
        {cardArt(card)}
      </span>
      <strong className="dl-name">{cardName(card)}</strong>
      {card.kind === 'crise' && side === 'ai' ? <span className="dl-target">→ chez vous</span> : card.kind === 'crise' ? <span className="dl-target">→ chez lui</span> : null}
    </button>
  )
}

// — Une carte en grand : la carte, ce qu'elle fait et pourquoi, et ce qu'on peut en faire

type CardActions = { onPlay: () => void; onDiscard: () => void; onSell: () => void; onBuy: () => void; onTakeBack: () => void }

function CardModal({ g, pick, canAct, onClose, onModel, ...actions }: { g: Game; pick: Pick; canAct: boolean; onClose: () => void; onModel: (focus: string | null) => void } & CardActions) {
  const { card } = pick
  // Une carte de l'adversaire s'explique de son point de vue : sa mesure sur sa France, sa crise sur la vôtre.
  const side: Side = pick.where === 'adverse' ? 'ai' : 'player'
  const impact = useMemo(() => cardImpact(g, side, card), [g, side, card])
  const levers = card.kind === 'mesure' ? leverChanges(g, side, card) : []
  const starts = startNodes(g, side, card)
  const kind = kindOf(g, card, side)
  const whose = impact ? (impact.target === 'player' ? 'votre France' : `la France de ${g.seats[impact.target].name}`) : ''
  const description = card.kind === 'crise' ? CRISES[card.crisis].text : card.kind === 'action' ? ACTIONS[card.action].text : card.pledge.quote || card.pledge.measure!.summary
  const listing = g.market.find((l) => l.card.uid === card.uid)
  const cost = pick.where === 'table' ? g.seats.player.played.find((p) => p.card.uid === card.uid)?.cost : pick.where === 'adverse' ? g.seats.ai.played.find((p) => p.card.uid === card.uid)?.cost : cardCost(g, 'player', card)
  return (
    <div className="modal-backdrop on-top" role="presentation" onClick={onClose}>
      <div className="modal dl-cardmodal" role="dialog" aria-modal="true" aria-label={cardName(card)} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="dl-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <div className="dl-cardmodal-body">
          <div className={`dl-card big ${kind.cls}`}>
            <span className="dl-cost">{listing ? `${listing.price} ⚡` : `⚡${cost ?? '?'}`}</span>
            <span className="dl-kind">{kind.label}</span>
            {/* L'emplacement de l'illustration : un emoji pour l'instant, une image plus tard. */}
            <span className="dl-art" aria-hidden="true">
              {cardArt(card)}
            </span>
            <strong className="dl-name">{cardName(card)}</strong>
            <span className="dl-desc">{description}</span>
          </div>

          <div className="dl-explain">
            {levers.length ? (
              <section>
                <h3>🎚️ Ce que la carte change</h3>
                <ul className="dl-levers">
                  {levers.map((l) => (
                    <li key={l.key}>
                      {l.label} : {l.from} → <b>{l.to}</b>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {card.kind === 'crise' ? (
              <section>
                <h3>🌍 Ce que la crise déclenche</h3>
                <p>
                  {crisisEffects(card.crisis).text.join(', ')}
                  {crisisEffects(card.crisis).years > 1 ? `, pendant ${crisisEffects(card.crisis).years} ans` : ''}.
                </p>
              </section>
            ) : null}
            {card.kind === 'action' ? (
              <section>
                <h3>🎴 Une carte d’action</h3>
                <p>{ACTIONS[card.action].text} Elle ne change pas l’économie : elle change la partie.</p>
              </section>
            ) : null}
            {impact ? (
              <>
                <section>
                  <h3>
                    📊 Note de {whose} l’an prochain : {signed(impact.health)} point{Math.abs(impact.health) > 1 ? 's' : ''}
                  </h3>
                  <p className="note">En points de note (sur 100), critère par critère. Sous chaque critère, ce qui le fait bouger.</p>
                  <div className="dl-parts">
                    {impact.parts.map((p) => (
                      <details key={p.id} className="dl-part-row" open>
                        <summary className="dl-part">
                          <span>{p.label}</span>
                          <i className={p.delta >= 0 ? 'up' : 'down'} style={{ width: `${Math.min(100, Math.abs(p.delta) * 25)}%` }} />
                          <b className={p.delta >= 0 ? 'good' : 'bad'}>{signed(p.delta, 1)}</b>
                        </summary>
                        <DetailView detail={impact.details[CRITERION_NODE[p.id]]} />
                      </details>
                    ))}
                    {!impact.parts.length ? <p className="note">Presque rien la première année : l’effet est lent, ou trop petit pour bouger la note.</p> : null}
                  </div>
                </section>
                <section>
                  <h3>📈 Ce qui bouge dans {whose}</h3>
                  <ul className="dl-moves">
                    {impact.indicators.map((ind) => (
                      <Move key={ind.node} ind={ind} />
                    ))}
                  </ul>
                  {!impact.indicators.length ? <p className="note">Rien ne bouge assez dès la première année : l’effet est lent ou très petit.</p> : null}
                </section>
                <Why starts={starts} impact={impact} />
              </>
            ) : null}
          </div>
        </div>

        <footer className="dl-cardmodal-actions">
          <Actions g={g} pick={pick} canAct={canAct} {...actions} />
          {starts.length ? (
            <button type="button" className="ghost" onClick={() => onModel(starts[0].node)}>
              🧠 Voir dans le modèle
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}

const arrow = (up: boolean | null) => (up === null ? '↕' : up ? '↑' : '↓')

/** Un indicateur qui bouge : sa flèche, de combien, en vert si c'est bon pour le pays. */
function Move({ ind }: { ind: Indicator }) {
  return (
    <li className={ind.good ? 'good' : 'bad'}>
      {ind.label} {arrow(ind.up)} <b>{ind.amount}</b>
    </li>
  )
}

/** Pourquoi : une seule histoire, de la carte jusqu'aux indicateurs, les chemins communs montrés une fois. */
function Why({ starts, impact }: { starts: { node: string; up: boolean }[]; impact: Impact }) {
  const { roots, other } = whyTree(starts, impact)
  // Les indicateurs de la note sont déjà décomposés plus haut, critère par critère : ici, seulement les autres.
  const rest = other.filter((ind) => !impact.parts.some((p) => CRITERION_NODE[p.id] === ind.node))
  if (!roots.length && !rest.length) {
    return null
  }
  return (
    <section>
      <h3>🔗 Pourquoi ? L’histoire dans le modèle</h3>
      {roots.length ? <WhyList nodes={roots} /> : null}
      {rest.map((ind) => (
        <div key={ind.node} className="dl-other">
          <b className={ind.good ? 'good' : 'bad'}>
            {ind.label} {arrow(ind.up)} {ind.amount}
          </b>{' '}
          : plusieurs effets s’additionnent.
          <DetailView detail={impact.details[ind.node]} />
        </div>
      ))}
      <p className="note">Calculé par le modèle : l’année qui vient, jouée avec et sans la carte (à côté des cartes déjà posées). Les liens viennent de modele/liens.csv.</p>
    </section>
  )
}

/** Pourquoi un indicateur bouge : une phrase, puis chaque contribution (en vert ce qui aide le pays). */
function DetailView({ detail }: { detail: Detail | undefined }) {
  if (!detail) {
    return null
  }
  return (
    <div className="dl-detail">
      <p>{detail.text}</p>
      {detail.lines.length ? (
        <ul>
          {detail.lines.map((l) => (
            <li key={l.label} className={l.good ? 'good' : 'bad'}>
              <span>{l.label}</span>
              <b>{l.value}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function WhyList({ nodes }: { nodes: WhyNode[] }) {
  return (
    <ul className="dl-tree">
      {nodes.map((n) => (
        <li key={`${n.node}-${String(n.up)}`}>
          <span className="dl-node">
            {n.name} {arrow(n.up)}
          </span>
          {n.hits.map((ind) => (
            <b key={ind.node} className={`dl-hit ${ind.good ? 'good' : 'bad'}`}>
              {ind.label} {arrow(ind.up)} {ind.amount}
            </b>
          ))}
          {n.explanation ? <small> {n.explanation}</small> : null}
          {n.children.length ? <WhyList nodes={n.children} /> : null}
        </li>
      ))}
    </ul>
  )
}

/** Ce qu'on peut faire de la carte, selon où elle est. */
function Actions({ g, pick, canAct, onPlay, onDiscard, onSell, onBuy, onTakeBack }: { g: Game; pick: Pick; canAct: boolean } & CardActions) {
  const { card } = pick
  if (!canAct) {
    return <small className="dl-locked">{g.outcome ? 'La partie est finie.' : 'L’année est en train de se jouer : attendez le bilan.'}</small>
  }
  if (pick.where === 'adverse') {
    return <small className="dl-locked">Une carte de {g.seats.ai.name} : vous ne pouvez que la regarder.</small>
  }
  if (pick.where === 'table') {
    const sondage = card.kind === 'action' && card.action === 'sondage'
    return (
      <button type="button" className="primary" disabled={sondage} title={sondage ? 'Les cartes sont déjà piochées' : undefined} onClick={onTakeBack}>
        ↩︎ Reprendre en main
      </button>
    )
  }
  if (pick.where === 'marche') {
    const why = canBuy(g, 'player', card.uid)
    const listing = g.market.find((l) => l.card.uid === card.uid)
    return (
      <>
        <button type="button" className="primary" disabled={!!why} onClick={onBuy}>
          🛒 Acheter ({listing?.price} ⚡)
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
        ▶ Jouer (⚡{cardCost(g, 'player', card)})
      </button>
      <button type="button" className="ghost" onClick={onDiscard}>
        🗑️ Jeter (+{DISCARD_GAIN} ⚡)
      </button>
      <button type="button" className="ghost" disabled={!!sellWhy} onClick={onSell}>
        🏷️ Vendre au marché ({marketPrice(g, card)} ⚡)
      </button>
      {playWhy || sellWhy ? <small className="dl-locked">🔒 {playWhy ?? sellWhy}</small> : null}
    </>
  )
}

// — Les fenêtres de fin d'année et de fin de partie

/** Les chiffres clés d'une France, pour comparer les deux : la valeur, et dans quel sens c'est mieux. */
type Stat = { id: string; label: string; unit: string; digits: number; better: 'up' | 'down'; value: (s: YearState, start: YearState) => number }

const STATS: Stat[] = [
  { id: 'note', label: 'Note de santé', unit: '/100', digits: 0, better: 'up', value: (s, start) => health(s, start) },
  { id: 'chomage', label: 'Chômage', unit: ' %', digits: 1, better: 'down', value: (s) => s.unemployment * 100 },
  { id: 'croissance', label: 'Croissance', unit: ' %', digits: 1, better: 'up', value: (s) => s.growth * 100 },
  { id: 'pouvoir', label: 'Pouvoir d’achat depuis 2027', unit: ' %', digits: 1, better: 'up', value: (s, start) => (s.medianIncome / start.medianIncome - 1) * 100 },
  { id: 'deficit', label: 'Déficit (% du PIB)', unit: ' %', digits: 1, better: 'down', value: (s) => (s.deficit / s.gdp) * 100 },
  { id: 'dette', label: 'Dette (% du PIB)', unit: ' %', digits: 0, better: 'down', value: (s) => s.debtRatio * 100 },
  { id: 'colere', label: 'Colère', unit: '', digits: 0, better: 'down', value: (s) => Math.max(0, s.discontent * 100) },
  { id: 'popularite', label: 'Popularité', unit: ' %', digits: 0, better: 'up', value: (s) => popularity(s) },
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
function CardLine({ g, card, side, cost }: { g: Game; card: Card; side: Side; cost?: number }) {
  const kind = kindOf(g, card, side)
  return (
    <li className={`dl-cardline ${kind.cls}`}>
      <span aria-hidden="true">{cardArt(card)}</span> {cardName(card)}
      {cost !== undefined ? <small> ⚡{cost}</small> : null}
    </li>
  )
}

function YearReport({ g, report, onClose, onCompare }: { g: Game; report: Report; onClose: () => void; onCompare: () => void }) {
  const mine = report.sides.player
  useEffect(() => {
    sfx(mine.kept.length ? 'promise' : mine.health >= mine.before ? 'energy' : 'flip')
  }, [mine])
  const name = (side: Side) => (side === 'player' ? 'Vous' : g.seats[side].name)
  return (
    <div className="modal-backdrop on-top" role="presentation">
      <div className="modal dl-report" role="dialog" aria-modal="true" aria-label={`Bilan de ${report.year}`}>
        <p className="eyebrow">📰 Bilan de l’année {report.year}</p>
        {report.world.length ? <p className="dl-world">🌍 Dans le monde (pour les deux) : {report.world.join(', ')}.</p> : null}
        <table className="dl-yeartable">
          <thead>
            <tr>
              <th>En {report.year}</th>
              {SIDES_ORDER.map((side) => (
                <th key={side} style={{ '--c': g.seats[side].color } as React.CSSProperties}>
                  {g.seats[side].emblem} {name(side)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATS.map((stat) => (
              <tr key={stat.id}>
                <td>{stat.label}</td>
                {SIDES_ORDER.map((side) => (
                  <StatCell key={side} stat={stat} now={stat.value(stateAt(g, side, report.year), startOf(g, side))} before={stat.value(stateAt(g, side, report.year - 1), startOf(g, side))} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dl-versus">
          {SIDES_ORDER.map((side) => {
            const r = report.sides[side]
            const s = g.seats[side]
            const moves = report.moves.filter((m) => m.side === side)
            return (
              <div key={side} className="dl-side" style={{ '--c': s.color } as React.CSSProperties}>
                <strong>
                  {s.emblem} {side === 'player' ? 'Ce que vous avez fait' : `Ce qu’a fait ${s.name}`}
                </strong>
                <ul className="dl-cardlines">
                  {r.played.map(({ card, cost }) => (
                    <CardLine key={card.uid} g={g} card={card} side={side} cost={cost} />
                  ))}
                  {!r.played.length ? <li className="dl-none">Aucune carte jouée.</li> : null}
                </ul>
                <ul>
                  {moves.map((m, i) => (
                    <li key={i} className="dl-move">
                      {m.kind === 'achat' ? `🛒 Achète « ${cardName(m.card)} » (${m.price} ⚡)` : m.kind === 'vente' ? `🏷️ Met en vente « ${cardName(m.card)} »` : `🗑️ Jette « ${cardName(m.card)} »`}
                    </li>
                  ))}
                  {r.received.map((c) => (
                    <li key={c} className="down">
                      {CRISES[c].art} Crise reçue : {CRISES[c].name}
                    </li>
                  ))}
                  {r.parried.map((c) => (
                    <li key={c} className="up">
                      🛡️ Crise parée : {CRISES[c].name}
                    </li>
                  ))}
                  {r.kept.map((k) => (
                    <li key={k} className="up">
                      ⭐ Promesse tenue : {k}
                    </li>
                  ))}
                  {r.earned ? <li className="up">⚡ +{r.earned} d’énergie l’an prochain (promesses, ventes)</li> : null}
                </ul>
              </div>
            )
          })}
        </div>
        <div className="verdict-actions">
          <button type="button" className="primary" onClick={onClose}>
            Année {report.year + 1} →
          </button>
          <button type="button" className="ghost" onClick={onCompare}>
            📊 Comparer depuis le début
          </button>
        </div>
      </div>
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
          <h3>Les chiffres clés, de 2027 à aujourd’hui</h3>
          <p className="note">
            La courbe : <i className="dl-legend" style={{ '--c': g.seats.player.color } as React.CSSProperties} /> vous,{' '}
            <i className="dl-legend dashed" style={{ '--c': g.seats.ai.color } as React.CSSProperties} /> {g.seats.ai.name}. L’écart est celui de cette année.
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
          <h3>La note, critère par critère</h3>
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
          <h3>Les cartes jouées, année par année</h3>
          {!g.reports.length ? <p className="note">Aucune année jouée pour l’instant.</p> : null}
          {[...g.reports].reverse().map((r) => (
            <div key={r.year} className="dl-history">
              <strong>{r.year}</strong>
              <div className="dl-versus">
                {SIDES_ORDER.map((side) => (
                  <div key={side} className="dl-side" style={{ '--c': g.seats[side].color } as React.CSSProperties}>
                    <small>
                      {g.seats[side].emblem} {name(side)} · note {r.sides[side].before} → {r.sides[side].health}
                    </small>
                    <ul className="dl-cardlines">
                      {r.sides[side].played.map(({ card, cost }) => (
                        <CardLine key={card.uid} g={g} card={card} side={side} cost={cost} />
                      ))}
                      {r.sides[side].received.map((c) => (
                        <li key={c} className="down">
                          {CRISES[c].art} Reçoit : {CRISES[c].name}
                        </li>
                      ))}
                      {!r.sides[side].played.length && !r.sides[side].received.length ? <li className="dl-none">Rien.</li> : null}
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

function Final({ g, onReplay, onModel, onCompare, onClose }: { g: Game; onReplay: () => void; onModel: () => void; onCompare: () => void; onClose: () => void }) {
  const o = g.outcome!
  useEffect(() => {
    sfx(o.winner === 'player' ? 'victory' : o.winner === 'ai' ? 'defeat' : 'flip')
  }, [o.winner])
  const title = o.winner === 'nul' ? '🤝 Match nul' : o.winner === 'player' ? '🏆 Vous gagnez !' : `${g.seats.ai.emblem} ${g.seats.ai.name} gagne`
  const parts = (side: Side) => healthParts(lastState(g.seats[side]), g.seats[side].states.find((x) => x.year === START_YEAR)!)
  const mine = parts('player')
  const theirs = parts('ai')
  return (
    <div className="modal-backdrop on-top" role="presentation">
      <div className={`modal dl-final ${o.winner === 'player' ? 'is-won' : o.winner === 'ai' ? 'is-lost' : ''}`} role="dialog" aria-modal="true" aria-label="Fin de la partie">
        <p className="eyebrow">🏁 Fin du duel</p>
        <h2>{title}</h2>
        <p>{o.reason}</p>
        <table className="dl-breakdown">
          <thead>
            <tr>
              <th>Note de santé</th>
              <th>Vous</th>
              <th>{g.seats[other('player')].name}</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((p, i) => (
              <tr key={p.id} title={p.explanation}>
                <td>
                  {p.label} <small>({p.weight} pts)</small>
                </td>
                <td className={p.points >= theirs[i].points ? 'up' : ''}>{num(p.points, 1)}</td>
                <td className={theirs[i].points >= p.points ? 'up' : ''}>{num(theirs[i].points, 1)}</td>
              </tr>
            ))}
            <tr className="dl-total">
              <td>Total</td>
              <td>{scoreOf(g.seats.player)}</td>
              <td>{scoreOf(g.seats.ai)}</td>
            </tr>
          </tbody>
        </table>
        <div className="verdict-actions">
          <button type="button" className="primary big" onClick={onReplay}>
            🔁 Nouveau duel
          </button>
          <button type="button" className="ghost" onClick={onCompare}>
            📊 Comparer les deux France
          </button>
          <button type="button" className="ghost" onClick={onModel}>
            🧠 Comprendre le modèle
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Revoir la table
          </button>
        </div>
      </div>
    </div>
  )
}

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop on-top" role="presentation" onClick={onClose}>
      <div className="modal dl-rules" role="dialog" aria-modal="true" aria-label="Les règles" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">📖 Les règles</p>
        <h2>Le duel des présidents</h2>
        <ol>
          <li>
            <strong>Chacun sa France.</strong> Vous et votre adversaire partez de la même France de 2027. Le modèle fait vivre chaque pays selon les cartes jouées.
          </li>
          <li>
            <strong>Les mêmes cartes pour les deux.</strong> 5 cartes au départ, puis 2 par an, tirées d’une pioche commune : chaque carte tirée est donnée aux deux joueurs, chacun son exemplaire. Vos promesses et les siennes sont dedans. Seul le sondage fait piocher des cartes en plus, pour celui qui le joue.
          </li>
          <li>
            <strong>Touchez une carte :</strong> elle s’ouvre en grand, avec son effet expliqué par le modèle, et ce que vous pouvez en faire : la jouer, la jeter (+{DISCARD_GAIN} ⚡ tout de suite) ou la vendre au marché (l’acheteur paie, vous touchez l’énergie l’an prochain). L’adversaire peut vendre et acheter lui aussi.
          </li>
          <li>
            <strong>L’énergie ⚡</strong> est votre capital politique : plus vous êtes populaire, plus vous en avez. Chaque promesse tenue rapporte +2 ⚡.
          </li>
          <li>
            📜 une <em>mesure</em> change votre France · ⭐ une <em>promesse</em> est une mesure de votre programme · 💥 une <em>crise</em> frappe la France d’en face · 🛡️ la <em>cellule de crise</em> pare la prochaine crise · 📊 le <em>sondage</em> fait piocher.
          </li>
          <li>
            <strong>Pour gagner :</strong> si votre pays fait faillite ou se révolte, vous perdez tout de suite. À la fin, celui qui a tenu au moins {PROGRAMME_GOAL} promesses sur 5 bat celui qui ne l’a pas fait. Sinon, la meilleure note de santé (sur 100) l’emporte.
          </li>
        </ol>
        <div className="verdict-actions">
          <button type="button" className="primary big" onClick={onClose}>
            C’est parti
          </button>
        </div>
      </div>
    </div>
  )
}

