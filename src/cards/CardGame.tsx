import { useEffect, useMemo, useState } from 'react'
import { EVENTS } from '../model/events'
import type { YearState } from '../model/types'
import { CANDIDATES, PARODY_NOTE, type Candidate, type Pledge } from '../game/candidates'
import { headline } from '../game/headlines'
import { MANDATE_END, MANDATE_START } from '../game/mandate'
import { majorityOf, MAJORITY_LABEL } from '../game/parliament'
import { popularity } from '../game/score'
import { num } from '../ui/format'
import { Newspaper } from '../ui/game/Hud'
import { playAiTurn, reformEffect } from './ai'
import {
  CAMPAIGN_LABEL,
  CAMPAIGN_ROUNDS,
  campaignVote,
  canPlayPledge,
  canPlayTactic,
  endTurn,
  finalVote,
  firstToPlay,
  lastState,
  newGame,
  other,
  playPledge,
  playTactic,
  pledgeCost,
  pledgeStats,
  roleOf,
  TACTICS,
  type Card,
  type Game,
  type Role,
  type Side,
} from './engine'
import './cards.css'

const ROLE_LABEL: Record<Role, string> = { campagne: 'Candidat·e', president: 'Président·e', opposition: 'Opposition' }
const AI_DELAY = 700

/** « Élysée » : le duel de cartes contre l'IA. */
export function CardGame({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<Game | null>(null)
  const [thinking, setThinking] = useState(false)
  /** L'année dont on montre le journal (après chaque année de mandat), et l'élection à annoncer. */
  const [journal, setJournal] = useState<number | null>(null)
  const [announce, setAnnounce] = useState<number | null>(null)

  // L'IA joue quand c'est à elle : au début du tour si elle gouverne, sinon après le joueur.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!game || game.phase === 'fin' || game.seats.ai.done || journal !== null || announce !== null) {
      return
    }
    if (firstToPlay(game) !== 'ai' && !game.seats.player.done) {
      return
    }
    setThinking(true)
    const id = window.setTimeout(() => {
      setThinking(false)
      advance(endTurn(playAiTurn(game), 'ai'), game)
    }, AI_DELAY)
    return () => window.clearTimeout(id)
  }, [game, journal, announce])

  /** Passe au nouvel état, et ouvre le journal ou l'annonce d'une élection si l'année ou la phase a changé. */
  function advance(next: Game, before: Game) {
    if (next.elections.length > before.elections.length) {
      setAnnounce(next.elections.length - 1)
    }
    if (before.phase === 'mandat' && (next.year !== before.year || next.phase === 'fin')) {
      setJournal(before.year)
    }
    setGame(next)
  }

  if (!game) {
    return <Setup onStart={(p, a) => setGame(newGame(p, a, Math.floor(Math.random() * 1e9)))} onExit={onExit} />
  }

  const playerTurn = !game.seats.player.done && game.phase !== 'fin' && (firstToPlay(game) === 'player' || game.seats.ai.done)
  return (
    <div className="duel">
      <header className="duel-top">
        <button type="button" className="ghost small" onClick={onExit}>
          ← Quitter
        </button>
        <strong>🃏 Élysée · le duel</strong>
        <span className="duel-round">{roundLabel(game)}</span>
      </header>

      <SeatBar g={game} side="ai" thinking={thinking} />
      <Arena g={game} />
      <SeatBar g={game} side="player" thinking={false} />

      <Hand g={game} active={playerTurn} onPlay={(next) => setGame(next)} />

      <div className="duel-actions">
        {game.phase === 'fin' ? (
          <button type="button" className="primary big" onClick={() => setAnnounce(game.elections.length - 1)}>
            Voir le résultat
          </button>
        ) : (
          <button type="button" className="primary big" disabled={!playerTurn} onClick={() => advance(endTurn(game, 'player'), game)}>
            {playerTurn ? (game.phase === 'mandat' ? `Fin du tour · l’année ${game.year} se joue →` : 'Fin du tour →') : thinking ? 'L’adversaire joue…' : '…'}
          </button>
        )}
      </div>

      {journal !== null ? <YearJournal g={game} year={journal} onClose={() => setJournal(null)} /> : null}
      {journal === null && announce !== null ? (
        <ElectionModal
          g={game}
          index={announce}
          onClose={() => setAnnounce(null)}
          onReplay={() => {
            setAnnounce(null)
            setGame(null)
          }}
        />
      ) : null}
    </div>
  )
}

function roundLabel(g: Game) {
  if (g.phase === 'campagne') {
    return `Campagne · tour ${g.round}/${CAMPAIGN_ROUNDS} · ${CAMPAIGN_LABEL[g.round - 1]}`
  }
  if (g.phase === 'mandat') {
    return `Mandat · année ${g.year - MANDATE_START}/${MANDATE_END - MANDATE_START} · ${g.year}`
  }
  return 'Partie terminée'
}

// — Le choix des candidats

function Setup({ onStart, onExit }: { onStart: (player: Candidate, ai: Candidate) => void; onExit: () => void }) {
  const [player, setPlayer] = useState<Candidate | null>(null)
  const [ai, setAi] = useState<Candidate | null>(null)
  const rivals = CANDIDATES.filter((c) => c.id !== player?.id)
  return (
    <div className="duel duel-setup">
      <header className="duel-top">
        <button type="button" className="ghost small" onClick={onExit}>
          ← Accueil
        </button>
        <strong>🃏 Élysée · le duel</strong>
      </header>
      <section className="duel-intro">
        <h1>Deux candidats, un seul Élysée</h1>
        <p>
          <strong>Acte 1, la campagne :</strong> trois tours pour annoncer vos promesses et attaquer celles de l’adversaire. <strong>Acte 2, le mandat :</strong> le vainqueur
          gouverne cinq ans, le vaincu mène l’opposition. <strong>Acte 3, 2032 :</strong> le bilan réel, calculé par le modèle, face aux coups portés.
        </p>
      </section>
      <h2>{player ? `Vous : ${player.emblem} ${player.name}` : '1. Qui incarnez-vous ?'}</h2>
      <div className="duel-pick">
        {CANDIDATES.map((c) => (
          <CandidateChip key={c.id} c={c} selected={player?.id === c.id} onClick={() => setPlayer(c)} />
        ))}
      </div>
      {player ? (
        <>
          <h2>2. Votre adversaire, joué par l’IA</h2>
          <div className="duel-pick">
            {rivals.map((c) => (
              <CandidateChip key={c.id} c={c} selected={ai?.id === c.id} onClick={() => setAi(c)} />
            ))}
          </div>
          <div className="duel-actions">
            <button type="button" className="primary big" disabled={!ai} onClick={() => ai && onStart(player, ai)}>
              ⚔️ Commencer le duel
            </button>
            <button type="button" className="ghost" onClick={() => onStart(player, rivals[Math.floor(Math.random() * rivals.length)])}>
              🎲 Adversaire au hasard
            </button>
          </div>
        </>
      ) : null}
      <p className="note">{PARODY_NOTE}</p>
    </div>
  )
}

function CandidateChip({ c, selected, onClick }: { c: Candidate; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`duel-chip ${selected ? 'is-selected' : ''}`} style={{ '--c': c.color } as React.CSSProperties} onClick={onClick} aria-pressed={selected}>
      <span className="duel-chip-emblem">{c.emblem}</span>
      <strong>{c.name}</strong>
      <small>{c.family}</small>
    </button>
  )
}

// — Le plateau

function SeatBar({ g, side, thinking }: { g: Game; side: Side; thinking: boolean }) {
  const s = g.seats[side]
  const role = roleOf(g, side)
  return (
    <section className={`seat seat-${side} ${s.done ? 'is-done' : ''}`} style={{ '--c': s.candidate.color } as React.CSSProperties}>
      <span className="seat-emblem">{s.candidate.emblem}</span>
      <div className="seat-id">
        <strong>
          {side === 'player' ? 'Vous · ' : 'IA · '}
          {s.candidate.name}
        </strong>
        <span className={`seat-role role-${role}`}>{ROLE_LABEL[role]}</span>
      </div>
      <div className="seat-stats">
        <span title="Capital politique : ce qui reste pour jouer des cartes ce tour-ci" className="seat-mana">
          ⚡ {s.mana}
        </span>
        <span title="L’élan : les voix gagnées par la campagne et les coups portés">🗳️ {num(s.elan, 1)}</span>
        {s.shield ? <span title="Un contre-feu est prêt : la prochaine attaque tombera à plat">🛡️</span> : null}
        {side === 'ai' ? (
          <span className="seat-hand" title="Ses cartes en main">
            {s.hand.map((c) => (
              <i key={c.uid} />
            ))}
          </span>
        ) : null}
      </div>
      {thinking ? <span className="seat-thinking">réfléchit…</span> : s.done && g.phase !== 'fin' ? <span className="seat-thinking">a joué</span> : null}
    </section>
  )
}

/** Le centre de la table : la barre des voix, la France (au pouvoir), et ce qui vient de se jouer. */
function Arena({ g }: { g: Game }) {
  const projected = useMemo(() => {
    if (g.phase === 'campagne') {
      return { player: campaignVote(g), label: 'Sondage du second tour' }
    }
    const last = g.elections.at(-1)!
    if (g.phase === 'fin') {
      return { player: last.player, label: `Résultat ${last.year}` }
    }
    const pres = finalVote(g).president
    return { player: g.president === 'player' ? pres : 100 - pres, label: 'Si la présidentielle avait lieu aujourd’hui' }
    // Le calcul (une simulation) ne dépend que de l'état de la France et des élans.
  }, [g])
  const recent = g.log.slice(-6).reverse()
  return (
    <section className="arena">
      <div className="tug" aria-label={`${projected.label} : vous ${num(projected.player, 1)} %`}>
        <div className="tug-labels">
          <span>Vous {num(projected.player, 1)} %</span>
          <small>{projected.label}</small>
          <span>{num(100 - projected.player, 1)} % IA</span>
        </div>
        <div className="tug-bar" style={{ '--you': g.seats.player.candidate.color, '--them': g.seats.ai.candidate.color } as React.CSSProperties}>
          <i style={{ width: `${projected.player}%` }} />
          <b />
        </div>
      </div>
      {g.phase !== 'campagne' ? <France g={g} /> : null}
      <ul className="feed">
        {recent.map((e, i) => (
          <li key={g.log.length - i} className={`feed-${e.side} tone-${e.tone}`}>
            <span>{e.side === 'monde' ? '🌍' : g.seats[e.side].candidate.emblem}</span>
            {e.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

function France({ g }: { g: Game }) {
  const s = lastState(g)
  const start = g.states.find((x) => x.year === MANDATE_START)!
  const pct = (v: number) => `${num(v * 100, 1)} %`
  const items: { label: string; value: string; delta: number; goodUp: boolean }[] = [
    { label: '😊 Popularité du président', value: `${popularity(s)} %`, delta: popularity(s) - popularity(start), goodUp: true },
    { label: '👷 Chômage', value: pct(s.unemployment), delta: s.unemployment - start.unemployment, goodUp: false },
    { label: '💶 Déficit', value: pct(s.deficit / s.gdp), delta: s.deficit / s.gdp - start.deficit / start.gdp, goodUp: false },
    { label: '🏦 Dette', value: `${num(s.debtRatio * 100, 0)} %`, delta: s.debtRatio - start.debtRatio, goodUp: false },
    { label: '📉 Pauvreté', value: pct(s.poverty), delta: s.poverty - start.poverty, goodUp: false },
  ]
  const m = majorityOf(g.politics!.seats)
  return (
    <div className="france">
      <p className="france-title">
        🇫🇷 La France en {s.year} <small>· {MAJORITY_LABEL[m]} ({g.politics!.seats} sièges)</small>
      </p>
      <ul>
        {items.map((it) => (
          <li key={it.label} className={Math.abs(it.delta) < 1e-3 ? '' : it.delta > 0 === it.goodUp ? 'good' : 'bad'}>
            <small>{it.label}</small>
            <strong>{it.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

// — La main du joueur

function Hand({ g, active, onPlay }: { g: Game; active: boolean; onPlay: (g: Game) => void }) {
  const s = g.seats.player
  const role = roleOf(g, 'player')
  const president = role === 'president'
  // Au pouvoir, chaque réforme est essayée dans le modèle : ce qu'elle ferait l'an prochain s'affiche sur la carte.
  const effects = useMemo(() => (president ? new Map(s.programme.map((p) => [p.key, reformEffect(g, p)])) : null), [president, g, s.programme])
  return (
    <section className={`hand ${active ? 'is-active' : ''}`}>
      <div className="hand-row">
        <h3>
          {president ? '📜 Votre programme : chaque carte devient une loi' : role === 'opposition' ? '📜 Vos contre-propositions' : '📜 Vos promesses de campagne'}
          <small>{s.programme.length} en main</small>
        </h3>
        <div className="cards">
          {s.programme.map((p) => (
            <PledgeCard key={p.key} g={g} p={p} effect={effects?.get(p.key) ?? null} disabled={!active} onPlay={() => onPlay(playPledge(g, 'player', p))} />
          ))}
          {!s.programme.length ? <p className="note">Programme épuisé.</p> : null}
        </div>
      </div>
      <div className="hand-row">
        <h3>
          🎴 Vos coups <small>4 cartes, piochées à chaque tour</small>
        </h3>
        <div className="cards">
          {s.hand.map((c) => (
            <TacticCard key={c.uid} g={g} card={c} disabled={!active} onPlay={() => onPlay(playTactic(g, 'player', c))} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PledgeCard({ g, p, effect, disabled, onPlay }: { g: Game; p: Pledge; effect: { popularity: number; deficit: number } | null; disabled: boolean; onPlay: () => void }) {
  const why = canPlayPledge(g, 'player', p)
  const cost = pledgeCost(g, 'player', p)
  const st = pledgeStats(p)
  const signed = (v: number, unit: string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v), 1)}${unit}`
  const role = roleOf(g, 'player')
  const appeal = role === 'opposition' ? Math.max(1, st.appeal) : st.appeal
  return (
    <button type="button" className="card card-pledge" style={{ '--c': g.seats.player.candidate.color } as React.CSSProperties} disabled={disabled || !!why} title={why ?? p.quote} onClick={onPlay}>
      <span className="card-cost">⚡{cost}</span>
      <span className="card-kind">{p.measure!.domain}</span>
      <strong className="card-name">{p.measure!.name}</strong>
      <span className="card-text">{p.quote}</span>
      <span className="card-model" title="Calculé par le modèle">
        {effect ? (
          <>
            <b className={effect.popularity >= 0 ? 'up' : 'down'}>😊 {signed(effect.popularity, ' pt')}</b>
            <b className={effect.deficit <= 0 ? 'up' : 'down'}>💶 {signed(effect.deficit, ' Md€')}</b>
          </>
        ) : (
          <>
            <b className={appeal >= 0 ? 'up' : 'down'}>🗳️ {signed(appeal, ' voix')}</b>
            <b className={st.deficit <= 0 ? 'up' : 'down'}>💶 {signed(st.deficit, ' Md€')}</b>
          </>
        )}
      </span>
    </button>
  )
}

function TacticCard({ g, card, disabled, onPlay }: { g: Game; card: Card; disabled: boolean; onPlay: () => void }) {
  const def = TACTICS[card.tactic]
  const why = canPlayTactic(g, 'player', card)
  return (
    <button type="button" className={`card card-tactic tactic-${card.tactic}`} disabled={disabled || !!why} title={why ?? def.text} onClick={onPlay}>
      <span className="card-cost">⚡{def.cost}</span>
      <span className="card-art" aria-hidden="true">
        {def.icon}
      </span>
      <strong className="card-name">{def.name}</strong>
      <span className="card-text">{def.text}</span>
      {why && !disabled ? <span className="card-why">🔒 {why}</span> : null}
    </button>
  )
}

// — Les fenêtres : le journal de l'année, les élections

function YearJournal({ g, year, onClose }: { g: Game; year: number; onClose: () => void }) {
  const s = g.states.find((x) => x.year === year)
  const prev = g.states.find((x) => x.year === year - 1)
  if (!s) {
    return null
  }
  const defs = g.events.filter((e) => e.year === year).flatMap((e) => EVENTS.filter((d) => d.id === e.id))
  return (
    <div className="modal-backdrop on-top" role="presentation" onClick={onClose}>
      <div className="modal duel-journal" role="dialog" aria-modal="true" aria-label={`Le journal de ${year}`} onClick={(e) => e.stopPropagation()}>
        <Newspaper headline={headline(s, prev, false, defs)} state={s} prev={prev} start={g.states[0]} events={defs} />
        <div className="verdict-actions">
          <button type="button" className="primary" onClick={onClose}>
            Continuer →
          </button>
        </div>
      </div>
    </div>
  )
}

function ElectionModal({ g, index, onClose, onReplay }: { g: Game; index: number; onClose: () => void; onReplay: () => void }) {
  const e = g.elections[index]
  const won = e.president === 'player'
  const final = index > 0
  const winner = g.seats[e.president].candidate
  const start = g.states.find((x) => x.year === MANDATE_START)!
  const end: YearState = lastState(g)
  return (
    <div className="modal-backdrop on-top" role="presentation">
      <div className={`modal duel-election ${won ? 'is-won' : 'is-lost'}`} role="dialog" aria-modal="true" aria-label={`Présidentielle ${e.year}`}>
        <p className="eyebrow">🗳️ Présidentielle {e.year} · second tour</p>
        <h2>{won ? (final ? '🎉 Vous êtes réélu·e !' : '🎉 Vous êtes élu·e !') : final ? `${winner.emblem} ${winner.name} l’emporte` : `${winner.emblem} ${winner.name} est élu·e`}</h2>
        <div className="duel-score">
          <span>
            {g.seats.player.candidate.emblem} Vous <strong>{num(e.player, 1)} %</strong>
          </span>
          <span>
            <strong>{num(100 - e.player, 1)} %</strong> {g.seats.ai.candidate.emblem} IA
          </span>
        </div>
        {final ? (
          <>
            <h3>Pourquoi ce résultat</h3>
            <ul className="duel-reasons">
              {e.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <h3>
              La France de {g.seats[g.president!].candidate.name}, {MANDATE_START} → {end.year}
            </h3>
            <ul className="duel-reasons">
              <li>
                Chômage : {num(start.unemployment * 100, 1)} % → {num(end.unemployment * 100, 1)} %
              </li>
              <li>
                Déficit : {num((start.deficit / start.gdp) * 100, 1)} % → {num((end.deficit / end.gdp) * 100, 1)} % du PIB
              </li>
              <li>
                Dette : {num(start.debtRatio * 100, 0)} % → {num(end.debtRatio * 100, 0)} % du PIB
              </li>
              <li>
                Pauvreté : {num(start.poverty * 100, 1)} % → {num(end.poverty * 100, 1)} %
              </li>
            </ul>
            <div className="verdict-actions">
              <button type="button" className="primary big" onClick={onReplay}>
                🔁 Nouveau duel
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                Revoir la table
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {won
                ? `Vous gouvernez jusqu’en ${MANDATE_END}. Vos promesses deviennent des lois : chaque carte jouée s’applique l’année suivante, et le modèle fait vivre la France. ${g.seats[other(e.president)].candidate.name} mène l’opposition : grèves, censure, révélations…`
                : `Vous menez l’opposition jusqu’en ${MANDATE_END}. ${winner.name} applique son programme ; à vous de l’user : grèves, motions de censure, révélations, contre-propositions. En ${MANDATE_END}, son bilan sera jugé.`}
            </p>
            <p className="note">
              Législatives : {g.politics!.seats} sièges sur 577 pour {winner.name} ({MAJORITY_LABEL[majorityOf(g.politics!.seats)].toLowerCase()}).
            </p>
            <div className="verdict-actions">
              <button type="button" className="primary big" onClick={onClose}>
                {won ? 'Entrer à l’Élysée →' : 'Prendre la tête de l’opposition →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
