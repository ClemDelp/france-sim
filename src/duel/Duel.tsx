import { useEffect, useMemo, useState } from 'react'
import { CANDIDATES, PARODY_NOTE } from '../game/candidates'
import { popularity } from '../game/score'
import { num } from '../ui/format'
import { nextAiCard, previewMeasure, type Preview } from './ai'
import { ACTIONS, cardArt, cardName, CRISES, isAdded, type Card } from './cards'
import {
  BOT,
  canPlay,
  capitalOf,
  cardCost,
  endYear,
  keptPromises,
  lastState,
  newGame,
  other,
  play,
  PROGRAMME_GOAL,
  resolveYear,
  scoreOf,
  START_YEAR,
  takeBack,
  type Game,
  type Player,
  type Report,
  type Side,
} from './engine'
import { healthParts } from './health'
import './duel.css'

const REVEAL_DELAY = 1000

type Stage = 'play' | 'reveal' | 'report'

/** Le duel de cartes : choisir les présidents, puis jouer année après année. */
export function Duel({ onExit, onModel }: { onExit: () => void; onModel: () => void }) {
  const [game, setGame] = useState<Game | null>(null)
  const [stage, setStage] = useState<Stage>('play')
  const [rules, setRules] = useState(true)

  // Le dévoilement : l'adversaire pose ses cartes une à une, puis l'année se joue dans les deux France.
  useEffect(() => {
    if (!game || stage !== 'reveal') {
      return
    }
    const card = nextAiCard(game)
    const id = window.setTimeout(
      () => {
        if (card) {
          setGame(play(game, 'ai', card))
        } else {
          setGame(resolveYear(game))
          setStage('report')
        }
      },
      card ? REVEAL_DELAY : REVEAL_DELAY * 1.4,
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

  const report = game.reports.at(-1)
  return (
    <div className="dl">
      <header className="dl-top">
        <button type="button" className="ghost small" onClick={onExit}>
          ← Accueil
        </button>
        <strong className="dl-year">
          {game.outcome ? 'Partie terminée' : `Année ${game.year}`} <small>· mandat {Math.min(game.year, endYear(game)) - START_YEAR}/{game.years}</small>
        </strong>
        <button type="button" className="ghost small" onClick={() => setRules(true)}>
          📖 Règles
        </button>
      </header>

      <SeatPanel g={game} side="ai" />
      <Table g={game} stage={stage} onTakeBack={(uid) => setGame(takeBack(game, 'player', uid))} />
      <SeatPanel g={game} side="player" />
      <Hand g={game} active={stage === 'play' && !game.outcome} onPlay={(c) => setGame(play(game, 'player', c))} />

      <div className="dl-bar">
        <span className="dl-energy" title="Votre énergie : le capital politique de l’année (selon votre popularité) plus les bonus des promesses tenues">
          ⚡ {game.seats.player.energy} <small>énergie</small>
        </span>
        {game.outcome ? (
          <button type="button" className="primary big" onClick={() => setStage('report')}>
            Voir le résultat
          </button>
        ) : (
          <button type="button" className="primary big" disabled={stage !== 'play'} onClick={() => setStage('reveal')}>
            {stage === 'reveal' ? `${game.seats.ai.name} joue…` : `Jouer l’année ${game.year} →`}
          </button>
        )}
      </div>

      {stage === 'report' && report ? (
        game.outcome ? (
          <Final g={game} onReplay={() => setGame(null)} onModel={onModel} onClose={() => setStage('play')} />
        ) : (
          <YearReport g={game} report={report} onClose={() => setStage('play')} />
        )
      ) : null}
      {rules ? <Rules onClose={() => setRules(false)} /> : null}
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
        <p>Vous et votre adversaire partez de la même France de 2027. Chacun joue ses cartes : des mesures pour son pays, des crises pour celui d’en face. Le modèle fait vivre les deux France. Le meilleur bilan gagne.</p>
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

// — Les présidents et leur France

function SeatPanel({ g, side }: { g: Game; side: Side }) {
  const s = g.seats[side]
  const st = lastState(s)
  const kept = new Set(keptPromises(s, g.year - 1).map((p) => p.key))
  const pct = (v: number) => `${num(v * 100, 1)} %`
  return (
    <section className={`dl-seat dl-seat-${side}`} style={{ '--c': s.color } as React.CSSProperties}>
      <div className="dl-who">
        <span className="dl-emblem">{s.emblem}</span>
        <div>
          <strong>
            {side === 'ai' ? 'Adversaire · ' : ''}
            {s.name}
          </strong>
          <small>
            {side === 'ai' ? `${s.hand.length} cartes en main · ${s.deck.length} dans la pioche` : `${s.deck.length} cartes dans la pioche`}
            {s.shield ? ' · 🛡️ cellule de crise prête' : ''}
          </small>
        </div>
        <div className="dl-score" title="La note de santé du pays : chômage, pouvoir d’achat, dette, déficit, pauvreté, colère, climat…">
          <strong>{scoreOf(s)}</strong>
          <small>/ 100</small>
        </div>
      </div>
      <ul className="dl-kpis">
        <li>
          <small>😊 Popularité</small>
          <strong>{popularity(st)} %</strong>
        </li>
        <li>
          <small>👷 Chômage</small>
          <strong>{pct(st.unemployment)}</strong>
        </li>
        <li>
          <small>💶 Déficit</small>
          <strong>{pct(st.deficit / st.gdp)}</strong>
        </li>
        <li>
          <small>🏦 Dette</small>
          <strong>{num(st.debtRatio * 100, 0)} %</strong>
        </li>
        <li className={st.discontent > 0.4 ? 'danger' : ''}>
          <small>😠 Colère</small>
          <strong>{Math.max(0, Math.round(st.discontent * 100))} / 100</strong>
        </li>
      </ul>
      <div className="dl-programme">
        <small>
          ⭐ Programme · {kept.size} / 5 tenues (objectif : {PROGRAMME_GOAL})
        </small>
        <ul>
          {s.programme.map((p) => (
            <li key={p.key} className={kept.has(p.key) ? 'is-kept' : ''} title={isAdded(p) ? 'Promesse ajoutée par le jeu : le programme publié en compte moins de cinq que le moteur sait jouer' : p.quote}>
              {kept.has(p.key) ? '✅' : '⬜'} {p.measure!.name}
              {isAdded(p) ? ' *' : ''}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** La table : les cartes jouées cette année par chacun. Celles de l'adversaire restent cachées jusqu'au dévoilement. */
function Table({ g, stage, onTakeBack }: { g: Game; stage: Stage; onTakeBack: (uid: string) => void }) {
  const mine = g.seats.player.played
  const theirs = g.seats.ai.played
  return (
    <section className="dl-table">
      <div className="dl-zone">
        <p>
          {g.seats.ai.emblem} {stage === 'play' ? `${g.seats.ai.name} prépare son année…` : `Les cartes de ${g.seats.ai.name}`}
        </p>
        <div className="dl-row">
          {stage === 'play' ? (
            <span className="dl-back" aria-label="Cartes cachées" />
          ) : (
            theirs.map(({ card, cost }) => <CardFace key={card.uid} card={card} cost={cost} target={card.kind === 'crise' ? 'vous' : null} flip />)
          )}
          {stage !== 'play' && !theirs.length ? <p className="note">Rien pour l’instant…</p> : null}
        </div>
      </div>
      <div className="dl-zone dl-zone-me">
        <p>Vos cartes de l’année {mine.length ? <small>· touchez une carte pour la reprendre</small> : null}</p>
        <div className="dl-row">
          {mine.map(({ card, cost }) => (
            <CardFace key={card.uid} card={card} cost={cost} target={card.kind === 'crise' ? 'lui' : null} onClick={stage === 'play' ? () => onTakeBack(card.uid) : undefined} />
          ))}
          {!mine.length ? <p className="note">Jouez des cartes de votre main : elles s’appliqueront quand l’année se jouera.</p> : null}
        </div>
      </div>
    </section>
  )
}

function Hand({ g, active, onPlay }: { g: Game; active: boolean; onPlay: (c: Card) => void }) {
  const hand = g.seats.player.hand
  // Chaque mesure est essayée dans le modèle : ce qu'elle ferait à votre France l'an prochain s'affiche sur la carte.
  const previews = useMemo(() => new Map(hand.map((c) => [c.uid, previewMeasure(g, 'player', c)])), [g, hand])
  return (
    <section className={`dl-hand ${active ? 'is-active' : ''}`}>
      <p>
        🃏 Votre main <small>· {hand.length} cartes · capital politique de l’année : ⚡{capitalOf(g, 'player')}</small>
      </p>
      <div className="dl-row dl-fan">
        {hand.map((c) => {
          const why = canPlay(g, 'player', c)
          return <CardFace key={c.uid} card={c} cost={cardCost(g, 'player', c)} preview={previews.get(c.uid) ?? null} disabled={!active || !!why} why={active ? why : null} onClick={() => onPlay(c)} />
        })}
      </div>
    </section>
  )
}

// — Une carte

function CardFace({
  card,
  cost,
  preview,
  target,
  disabled,
  why,
  flip,
  onClick,
}: {
  card: Card
  cost: number
  preview?: Preview | null
  target?: 'vous' | 'lui' | null
  disabled?: boolean
  why?: string | null
  flip?: boolean
  onClick?: () => void
}) {
  const kind = card.kind === 'mesure' ? (card.promise ? 'promesse' : 'mesure') : card.kind
  const label = { promesse: '⭐ Promesse', mesure: '📜 Mesure', crise: '💥 Crise', action: '🛡️ Action' }[kind]
  const text = card.kind === 'crise' ? CRISES[card.crisis].text : card.kind === 'action' ? ACTIONS[card.action].text : measureText(card)
  const signed = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v), digits)}`
  return (
    <button type="button" className={`dl-card kind-${kind} ${flip ? 'is-flip' : ''}`} disabled={disabled || !onClick} onClick={onClick} title={why ?? undefined}>
      <span className="dl-cost">⚡{cost}</span>
      <span className="dl-kind">{label}</span>
      {/* L'emplacement de l'illustration : un emoji pour l'instant, une image plus tard. */}
      <span className="dl-art" aria-hidden="true">
        {cardArt(card)}
      </span>
      <strong className="dl-name">{cardName(card)}</strong>
      <span className="dl-text">{text}</span>
      {preview ? (
        <span className="dl-preview" title="Ce que le modèle prévoit pour votre France l’an prochain">
          <b className={preview.health >= 0 ? 'up' : 'down'}>Note {signed(preview.health, 0)}</b>
          <b className={preview.unemployment <= 0 ? 'up' : 'down'}>Chômage {signed(preview.unemployment * 100, 1)} pt</b>
          <b className={preview.deficit <= 0 ? 'up' : 'down'}>Déficit {signed(preview.deficit, 0)} Md€</b>
          <b className={preview.popularity >= 0 ? 'up' : 'down'}>Popularité {signed(preview.popularity, 0)}</b>
        </span>
      ) : null}
      {target ? <span className={`dl-target target-${target}`}>{target === 'vous' ? '→ frappe votre France' : '→ frappe sa France'}</span> : null}
      {why ? <span className="dl-why">🔒 {why}</span> : null}
    </button>
  )
}

function measureText(card: Extract<Card, { kind: 'mesure' }>) {
  const m = card.pledge.measure!
  const amount = card.pledge.amount ?? m.param?.default
  const param = m.param && amount !== undefined ? `${m.param.label} : ${num(amount, 0)} ${m.param.unit}. ` : ''
  return `${param}${m.summary}`
}

// — Les fenêtres

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
        <p className="note">Les critères et leurs poids sont dans modele/note-pays.csv : discutables et modifiables, comme tout le modèle.</p>
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
            <strong>Chaque année</strong>, vous piochez 2 cartes (5 au départ) et en jouez autant que votre énergie ⚡ le permet. L’énergie, c’est votre capital politique : plus vous êtes
            populaire, plus vous en avez.
          </li>
          <li>
            <strong>Les cartes :</strong> 📜 une <em>mesure</em> change votre France (le modèle affiche son effet sur la carte) · ⭐ une <em>promesse</em> est une mesure de votre programme ·
            💥 une <em>crise</em> frappe la France de l’adversaire · 🛡️ la <em>cellule de crise</em> pare la prochaine crise reçue · 📊 le <em>sondage</em> fait piocher.
          </li>
          <li>
            <strong>Vous jouez en même temps.</strong> Quand vous lancez l’année, l’adversaire dévoile ses cartes, puis l’année se joue dans les deux pays.
          </li>
          <li>
            <strong>Chaque promesse tenue</strong> rapporte +2 ⚡ l’année suivante.
          </li>
          <li>
            <strong>Pour gagner :</strong> si votre pays fait faillite ou se révolte, vous perdez tout de suite. À la fin, celui qui a tenu au moins {PROGRAMME_GOAL} promesses sur 5 bat celui qui ne l’a
            pas fait. Sinon, la meilleure note de santé du pays (sur 100) l’emporte.
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
