import { useEffect, useMemo, useState } from 'react'
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
import { healthParts } from './health'
import { cardImpact, crisisEffects, explainChain, leverChanges, startNodes } from './why'
import './duel.css'

const REVEAL_DELAY = 1100

type Stage = 'play' | 'reveal' | 'report'
/** La carte choisie : dans la main, au marché, ou sur la table. */
type Pick = { card: Card; where: 'main' | 'marche' | 'table' }

/** Le duel de cartes : choisir les présidents, puis jouer année après année, en plein écran. */
export function Duel({ onExit, onModel }: { onExit: () => void; onModel: (focus: string | null) => void }) {
  const [game, setGame] = useState<Game | null>(null)
  const [stage, setStage] = useState<Stage>('play')
  const [rules, setRules] = useState(true)
  const [pick, setPick] = useState<Pick | null>(null)
  const [why, setWhy] = useState<{ card: Card; side: Side } | null>(null)
  /** La dernière chose faite par l'adversaire, annoncée au centre de la table. */
  const [news, setNews] = useState<Move | null>(null)

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
          setNews(next.moves.at(-1) ?? null)
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

  const act = (next: Game) => {
    setGame(next)
    setPick(null)
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
          <button type="button" className="ghost small" onClick={() => onModel(null)}>
            🧠 Modèle
          </button>
          <button type="button" className="ghost small" onClick={() => setRules(true)}>
            📖 Règles
          </button>
        </span>
      </header>

      <Strip g={game} side="ai" />

      <main className="dlg-board">
        <section className="dlg-pile" aria-label="La pioche commune">
          <div className="dl-back big" title="La pioche commune aux deux joueurs">
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
                game.seats.ai.played.map(({ card, cost }) => <Mini key={card.uid} g={game} card={card} side="ai" badge={`⚡${cost}`} flip onClick={() => setWhy({ card, side: 'ai' })} />)
              )}
            </div>
          </div>
          {news && stage === 'reveal' ? <div className="dlg-news">{newsText(game, news)}</div> : null}
          <div className="dlg-zone mine">
            <p>Vos cartes de l’année {game.seats.player.played.length && canAct ? <small>· touchez pour reprendre</small> : null}</p>
            <div className="dlg-row">
              {game.seats.player.played.map(({ card, cost }) => (
                <Mini key={card.uid} g={game} card={card} side="player" badge={`⚡${cost}`} onClick={() => (canAct ? act(takeBack(game, 'player', card.uid)) : setWhy({ card, side: 'player' }))} />
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
              <Mini key={l.card.uid} g={game} card={l.card} side="player" badge={`${l.price} ⚡`} seller={game.seats[l.seller].emblem} selected={pick?.card.uid === l.card.uid} onClick={() => setPick({ card: l.card, where: 'marche' })} />
            ))}
            {!game.market.length ? <p className="dlg-hint">Vendez ici les cartes dont vous ne voulez pas : l’adversaire peut les acheter.</p> : null}
          </div>
        </section>
      </main>

      <Strip g={game} side="player" />

      <footer className="dlg-hand">
        <div className="dlg-cards">
          {game.seats.player.hand.map((c) => (
            <HandCard key={c.uid} g={game} card={c} selected={pick?.card.uid === c.uid} dim={!canAct} onClick={() => setPick(pick?.card.uid === c.uid ? null : { card: c, where: 'main' })} onWhy={() => setWhy({ card: c, side: 'player' })} />
          ))}
        </div>
        <div className="dlg-side">
          <span className="dl-energy" title="Votre énergie : le capital politique de l’année (selon votre popularité), plus les promesses tenues et les ventes">
            ⚡ {game.seats.player.energy}
          </span>
          {pick && canAct ? (
            <Actions
              g={game}
              pick={pick}
              onPlay={() => act(play(game, 'player', pick.card))}
              onDiscard={() => act(discard(game, 'player', pick.card.uid))}
              onSell={() => act(sell(game, 'player', pick.card.uid))}
              onBuy={() => act(buy(game, 'player', pick.card.uid))}
              onWhy={() => setWhy({ card: pick.card, side: 'player' })}
            />
          ) : null}
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
          <Final g={game} onReplay={() => setGame(null)} onModel={() => onModel(null)} onClose={() => setStage('play')} />
        ) : (
          <YearReport g={game} report={report} onClose={() => setStage('play')} />
        )
      ) : null}
      {why ? <Why g={game} card={why.card} side={why.side} onClose={() => setWhy(null)} onModel={onModel} /> : null}
      {rules ? <Rules onClose={() => setRules(false)} /> : null}
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

// — Les actions sur la carte choisie

function Actions({ g, pick, onPlay, onDiscard, onSell, onBuy, onWhy }: { g: Game; pick: Pick; onPlay: () => void; onDiscard: () => void; onSell: () => void; onBuy: () => void; onWhy: () => void }) {
  const { card } = pick
  if (pick.where === 'marche') {
    const why = canBuy(g, 'player', card.uid)
    const listing = g.market.find((l) => l.card.uid === card.uid)
    return (
      <div className="dlg-actions">
        <strong>{cardName(card)}</strong>
        <button type="button" className="primary small" disabled={!!why} title={why ?? undefined} onClick={onBuy}>
          🛒 Acheter ({listing?.price} ⚡)
        </button>
        <button type="button" className="ghost small" onClick={onWhy}>
          ❓ Pourquoi
        </button>
        {why ? <small>🔒 {why}</small> : null}
      </div>
    )
  }
  const playWhy = canPlay(g, 'player', card)
  const sellWhy = canSell(g, 'player', card.uid)
  return (
    <div className="dlg-actions">
      <strong>{cardName(card)}</strong>
      <button type="button" className="primary small" disabled={!!playWhy} title={playWhy ?? undefined} onClick={onPlay}>
        ▶ Jouer (⚡{cardCost(g, 'player', card)})
      </button>
      <button type="button" className="ghost small" onClick={onDiscard}>
        🗑️ Jeter (+{DISCARD_GAIN} ⚡)
      </button>
      <button type="button" className="ghost small" disabled={!!sellWhy} title={sellWhy ?? undefined} onClick={onSell}>
        🏷️ Vendre ({marketPrice(g, card)} ⚡)
      </button>
      <button type="button" className="ghost small" onClick={onWhy}>
        ❓ Pourquoi
      </button>
      {playWhy ? <small>🔒 {playWhy}</small> : null}
    </div>
  )
}

// — Choisir les présidents

const asPlayer = (c: (typeof CANDIDATES)[number]): Player => ({ candidate: c, name: c.name, emblem: c.emblem, color: c.color })
const SURPRISE: Player = { candidate: null, name: 'Vous', emblem: '🎩', color: '#5b8def' }

function Setup({ onStart, onExit }: { onStart: (player: Player, ai: Player, years: number) => void; onExit: () => void }) {
  const [me, setMe] = useState<Player | null>(null)
  const [foe, setFoe] = useState<Player | null>(null)
  const [years, setYears] = useState(5)
  const mine = [...CANDIDATES.map(asPlayer), SURPRISE]
  const rivals = [...CANDIDATES.map(asPlayer).filter((p) => p.name !== me?.name), BOT]
  return (
    <div className="dl dl-setup">
      <header className="dl-top">
        <button type="button" className="ghost small" onClick={onExit}>
          ← Accueil
        </button>
        <strong>🃏 Le duel des présidents</strong>
      </header>
      <section className="dl-intro">
        <h1>Deux présidents, deux France</h1>
        <p>Vous et votre adversaire partez de la même France de 2027 et piochez dans la même pioche. Mesures pour votre pays, crises pour le sien, un marché pour vendre ce qui ne vous sert pas. Le modèle fait vivre les deux France : le meilleur bilan gagne.</p>
      </section>
      <h2>1. Votre président·e</h2>
      <div className="dl-pick">
        {mine.map((p) => (
          <Chip key={p.name} p={p} sub={p.candidate?.family ?? 'Un programme tiré au sort'} selected={me?.name === p.name} onClick={() => setMe(p)} />
        ))}
      </div>
      {me ? (
        <>
          <h2>2. Votre adversaire</h2>
          <div className="dl-pick">
            {rivals.map((p) => (
              <Chip key={p.name} p={p} sub={p.candidate?.family ?? 'Pas de parti : il se fait son propre programme'} selected={foe?.name === p.name} onClick={() => setFoe(p)} />
            ))}
          </div>
          <h2>3. La durée</h2>
          <div className="dl-years" role="radiogroup" aria-label="Durée de la partie">
            {[5, 10].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={years === n} className={years === n ? 'is-selected' : ''} onClick={() => setYears(n)}>
                <strong>{n} ans</strong>
                <small>{n === 5 ? 'Un mandat, environ 10 minutes' : 'Deux mandats, environ 20 minutes'}</small>
              </button>
            ))}
          </div>
          <div className="dl-start">
            <button type="button" className="primary big" disabled={!foe} onClick={() => foe && onStart(me, foe, years)}>
              ⚔️ Commencer le duel
            </button>
          </div>
        </>
      ) : null}
      <p className="note">{PARODY_NOTE}</p>
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

function HandCard({ g, card, selected, dim, onClick, onWhy }: { g: Game; card: Card; selected: boolean; dim: boolean; onClick: () => void; onWhy: () => void }) {
  const kind = kindOf(g, card, 'player')
  // L'effet prévu par le modèle (une mesure sur votre France, une crise sur la sienne), calculé une fois par état de la partie.
  const impact = useMemo(() => cardImpact(g, 'player', card), [g, card])
  const top = impact?.indicators[0]
  return (
    <div className={`dl-card hand ${kind.cls} ${selected ? 'is-selected' : ''} ${dim ? 'is-dim' : ''}`}>
      <button type="button" className="dl-card-body" onClick={onClick} aria-pressed={selected}>
        <span className="dl-cost">⚡{cardCost(g, 'player', card)}</span>
        <span className="dl-kind">{kind.label}</span>
        <span className="dl-art" aria-hidden="true">
          {cardArt(card)}
        </span>
        <strong className="dl-name">{cardName(card)}</strong>
        {impact ? (
          <span className="dl-preview">
            <b className={impact.health >= 0 ? 'up' : 'down'}>
              {impact.target === 'player' ? 'Votre note' : 'Sa note'} {signed(impact.health)}
            </b>
            {top ? <b className={top.good === (impact.target === 'player') ? 'up' : 'down'}>{`${top.label} ${top.text}`}</b> : null}
          </span>
        ) : (
          <span className="dl-text">{card.kind === 'action' ? ACTIONS[card.action].text : ''}</span>
        )}
      </button>
      <button type="button" className="dl-why-btn" onClick={onWhy} aria-label={`Pourquoi : ${cardName(card)}`} title="Pourquoi cet effet ?">
        ?
      </button>
    </div>
  )
}

function Mini({ g, card, side, badge, seller, flip, selected, onClick }: { g: Game; card: Card; side: Side; badge: string; seller?: string; flip?: boolean; selected?: boolean; onClick: () => void }) {
  const kind = kindOf(g, card, side)
  return (
    <button type="button" className={`dl-card mini ${kind.cls} ${flip ? 'is-flip' : ''} ${selected ? 'is-selected' : ''}`} onClick={onClick} title={kind.label}>
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

// — Pourquoi cette carte fait ce qu'elle fait

function Why({ g, card, side, onClose, onModel }: { g: Game; card: Card; side: Side; onClose: () => void; onModel: (focus: string | null) => void }) {
  const impact = useMemo(() => cardImpact(g, side, card), [g, side, card])
  const levers = card.kind === 'mesure' ? leverChanges(g, side, card) : []
  const starts = startNodes(g, side, card)
  const kind = kindOf(g, card, side)
  const whose = impact ? (impact.target === 'player' ? 'votre France' : `la France de ${g.seats[impact.target].name}`) : ''
  const description = card.kind === 'crise' ? CRISES[card.crisis].text : card.kind === 'action' ? ACTIONS[card.action].text : (card.pledge.quote || card.pledge.measure!.summary)
  return (
    <div className="modal-backdrop on-top" role="presentation" onClick={onClose}>
      <div className={`modal dl-why ${kind.cls}`} role="dialog" aria-modal="true" aria-label={`Pourquoi : ${cardName(card)}`} onClick={(e) => e.stopPropagation()}>
        <header className="dl-why-head">
          <span className="dl-art" aria-hidden="true">
            {cardArt(card)}
          </span>
          <div>
            <p className="eyebrow">{kind.label}</p>
            <h2>{cardName(card)}</h2>
            <p className="note">{description}</p>
          </div>
        </header>

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

        {impact ? (
          <>
            <section>
              <h3>
                📊 Effet prévu sur {whose} l’an prochain : note {signed(impact.health)}
              </h3>
              <div className="dl-parts">
                {impact.parts.map((p) => (
                  <div key={p.id} className="dl-part">
                    <span>{p.label}</span>
                    <i className={p.delta >= 0 ? 'up' : 'down'} style={{ width: `${Math.min(100, Math.abs(p.delta) * 25)}%` }} />
                    <b>{signed(p.delta, 1)}</b>
                  </div>
                ))}
                {!impact.parts.length ? <p className="note">Presque rien la première année : l’effet est lent, ou trop petit pour bouger la note.</p> : null}
              </div>
            </section>
            <section>
              <h3>🔗 Pourquoi ? Le chemin dans le modèle</h3>
              <ul className="dl-chains">
                {impact.indicators.slice(0, 5).map((ind) => {
                  const chain = explainChain(starts, ind.node)
                  return (
                    <li key={ind.node}>
                      <p className={ind.good === (impact.target === 'player') ? 'good' : 'bad'}>
                        <b>
                          {ind.label} {ind.text}
                        </b>
                      </p>
                      {chain ? (
                        <ol>
                          {chain.map((step) => (
                            <li key={`${step.from}-${step.to}`}>
                              <span className="dl-step">
                                {step.fromName} {step.fromUp ? '↑' : '↓'} → {step.toName} {step.toUp === null ? '↕' : step.toUp ? '↑' : '↓'}
                              </span>
                              {step.explanation ? <small> {step.explanation}</small> : null}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <small>Un effet indirect : plusieurs mécanismes se combinent (voir le modèle).</small>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        ) : null}

        <p className="note">Calculé par le modèle : l’année qui vient, jouée avec et sans la carte (à côté des cartes déjà posées). Tous les liens viennent de modele/liens.csv.</p>
        <div className="verdict-actions">
          {starts.length ? (
            <button type="button" className="ghost" onClick={() => onModel(starts[0].node)}>
              🧠 Voir ce mécanisme dans le modèle
            </button>
          ) : null}
          <button type="button" className="primary" onClick={onClose}>
            Compris
          </button>
        </div>
      </div>
    </div>
  )
}

// — Les fenêtres de fin d'année et de fin de partie

function YearReport({ g, report, onClose }: { g: Game; report: Report; onClose: () => void }) {
  return (
    <div className="modal-backdrop on-top" role="presentation">
      <div className="modal dl-report" role="dialog" aria-modal="true" aria-label={`Bilan de ${report.year}`}>
        <p className="eyebrow">📰 Bilan de l’année {report.year}</p>
        {report.world.length ? <p className="dl-world">🌍 Dans le monde : {report.world.join(', ')}.</p> : null}
        <div className="dl-versus">
          {(['player', 'ai'] as Side[]).map((side) => {
            const r = report.sides[side]
            const s = g.seats[side]
            const delta = r.health - r.before
            return (
              <div key={side} className="dl-side" style={{ '--c': s.color } as React.CSSProperties}>
                <strong>
                  {s.emblem} {side === 'player' ? 'Vous' : s.name}
                </strong>
                <p className="dl-big">
                  {r.health} <small>/ 100</small> <span className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? `+${delta}` : `−${-delta}`}</span>
                </p>
                <ul>
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
                      ⭐ Promesse tenue : {k} (+2 ⚡)
                    </li>
                  ))}
                  {!r.received.length && !r.parried.length && !r.kept.length ? <li>Une année sans surprise.</li> : null}
                </ul>
              </div>
            )
          })}
        </div>
        <div className="verdict-actions">
          <button type="button" className="primary" onClick={onClose}>
            Année {report.year + 1} →
          </button>
        </div>
      </div>
    </div>
  )
}

function Final({ g, onReplay, onModel, onClose }: { g: Game; onReplay: () => void; onModel: () => void; onClose: () => void }) {
  const o = g.outcome!
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
            <strong>Une pioche commune.</strong> 5 cartes au départ, puis 2 par an. Vos promesses et les siennes sont mêlées dedans : vous pouvez tomber sur les siennes.
          </li>
          <li>
            <strong>Touchez une carte</strong> pour la jouer, la jeter (+{DISCARD_GAIN} ⚡ tout de suite) ou la vendre au marché (l’acheteur paie, vous touchez l’énergie l’an prochain). Le <b>?</b> explique son effet.
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

