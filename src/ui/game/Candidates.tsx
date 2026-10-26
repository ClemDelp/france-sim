import { useMemo, useState } from 'react'
import { BASE_POLICY } from '../../model/calibration'
import { policyAt } from '../../model/sim'
import type { Decision, Policy, YearState } from '../../model/types'
import { CANDIDATES, isPlayable, PARODY_NOTE, promisePatch, promiseStatus, promisesKept, type Candidate, type Pledge } from '../../game/candidates'
import { MANDATE_END, MANDATE_START, playMandate } from '../../game/mandate'
import { planCost, playSession } from '../../game/session'
import { electionAt, popularity } from '../../game/score'
import { num } from '../format'
import { ALL_LEVERS, formatLever } from '../levers'

const STATUS: Record<ReturnType<typeof promiseStatus>, { icon: string; label: string }> = {
  tenue: { icon: '✅', label: 'Appliquée' },
  partielle: { icon: '◐', label: 'En partie' },
  'a-faire': { icon: '○', label: 'À faire' },
  'hors-moteur': { icon: '⚙️', label: 'Pas encore dans le simulateur' },
}

const amountLabel = (p: Pledge) => {
  const param = p.measure?.param
  const amount = p.amount ?? param?.default
  return param && amount !== undefined ? `${num(amount, amount % 1 ? 1 : 0)} ${param.unit}` : ''
}

/** Le choix du personnage, sur l'écran d'accueil. */
export function CandidatePicker({ onPick, onCompare }: { onPick: (c: Candidate) => void; onCompare: () => void }) {
  return (
    <>
      <p className="note candidate-note">{PARODY_NOTE}</p>
      <div className="scenario-grid candidate-grid">
        {CANDIDATES.map((c) => (
          <button key={c.id} type="button" className="scenario-card candidate-card" style={{ borderColor: c.color }} onClick={() => onPick(c)}>
            <span className="scenario-icon">{c.emblem}</span>
            <strong>{c.name}</strong>
            <span className="candidate-family" style={{ color: c.color }}>
              {c.family}
            </span>
            <small>{c.summary.split(':')[0]}</small>
            <span className="scenario-meta">
              <span>{c.promises.filter(isPlayable).length} promesses jouables</span>
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="ghost compare-button" onClick={onCompare}>
        📊 Comparer les mandats de tous les candidats
      </button>
    </>
  )
}

/** La présentation du personnage et de son programme, avant de prendre ses fonctions. */
export function CandidateBriefing({ candidate: c, onStart, onBack }: { candidate: Candidate; onStart: () => void; onBack: () => void }) {
  return (
    <div className="modal-backdrop on-top" role="presentation">
      <div className="modal briefing candidate-briefing" role="dialog" aria-modal="true" aria-label={c.name} style={{ borderTop: `4px solid ${c.color}` }}>
        <p className="eyebrow">
          {c.emblem} {c.family} · mandat {MANDATE_START}–{MANDATE_END}
        </p>
        <h2>{c.name}</h2>
        <p className="briefing-story">
          Vous venez d’être élu·e. {c.summary}
        </p>
        <h3>🗳️ Vos promesses de campagne</h3>
        <ul className="pledge-list">
          {c.promises.map((p) => (
            <li key={p.key} className={isPlayable(p) ? '' : 'is-off'}>
              <strong>
                {isPlayable(p) ? '•' : '⚙️'} {p.measure?.name ?? 'Proposition'} {amountLabel(p) ? <small>({amountLabel(p)})</small> : null}
              </strong>
              <span className="pledge-quote">« {p.quote} »</span>
              {p.measure?.notes.length ? <small className="pledge-note">{p.measure.notes.join(' ')}</small> : null}
              {!p.measure ? <small className="pledge-note">Pas encore dans le simulateur.</small> : null}
              {p.source ? (
                <a href={p.source} target="_blank" rel="noreferrer">
                  Source ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="note">
          Programme de référence :{' '}
          <a href={c.program.url} target="_blank" rel="noreferrer">
            {c.program.label} ↗
          </a>
          . {c.caveats}
        </p>
        <p className="note">
          💡 Vous gouvernez de {MANDATE_START} à l’élection de {MANDATE_END}. Chaque année, le capital politique limite les réformes : choisissez l’ordre de vos promesses, et
          gardez un œil sur votre popularité. Les promesses marquées ⚙️ ne sont pas encore représentées dans le simulateur.
        </p>
        <p className="note candidate-note">{PARODY_NOTE}</p>
        <div className="verdict-actions">
          <button type="button" className="primary big" onClick={onStart}>
            Prendre ses fonctions
          </button>
          <button type="button" className="ghost" onClick={onBack}>
            Retour
          </button>
        </div>
      </div>
    </div>
  )
}

/** Les leviers qu'une promesse fait bouger, lisibles : « Âge de départ : 64 ans → 60 ans ». */
function leverChanges(patch: Partial<Policy>, from: Policy): string[] {
  return Object.entries(patch).flatMap(([key, value]) => {
    if (key === 'cancelShare') {
      return (value as number) > 0 ? [`Annulation de ${num((value as number) * 100, 0)} % de la dette visée`] : []
    }
    const def = ALL_LEVERS.find((l) => l.key === key)
    return def ? [`${def.label} : ${formatLever(def, from[def.key] as number)} → ${formatLever(def, value as number)}`] : []
  })
}

/** Pendant le mandat : les promesses, leur état, ce qu'elles changent, et de quoi les inscrire au programme de l'année (ou les retirer). */
export function PledgesPanel({
  candidate: c,
  decisions,
  draft,
  year,
  capital,
  onApply,
  onRemove,
  onShow,
}: {
  candidate: Candidate
  decisions: Decision[]
  draft: Partial<Policy>
  year: number
  capital: number | null
  onApply: (p: Pledge) => void
  onRemove: (p: Pledge) => void
  /** Montrer, dans « Vos décisions », les curseurs que la promesse fait bouger. */
  onShow: (p: Pledge) => void
}) {
  const [open, setOpen] = useState(false)
  const voted = policyAt(decisions, year + 1)
  const planned = { ...voted, ...draft }
  const kept = promisesKept(c, decisions, year + 1, BASE_POLICY)
  const left = capital === null ? Infinity : capital - planCost(draft, voted)
  const shown = open ? c.promises : c.promises.filter((p) => isPlayable(p) && promiseStatus(p, BASE_POLICY, voted) !== 'tenue')
  const playing = year < MANDATE_END
  return (
    <div className="objectives pledges" style={{ borderColor: c.color }}>
      <div className="objectives-head">
        <strong>
          {c.emblem} {c.name}
        </strong>
        <span>
          {year} → {MANDATE_END}
        </span>
      </div>
      <p className="pledges-score">
        Promesses tenues : <strong>{kept.kept}</strong> / {kept.playable}
      </p>
      {playing ? (
        <p className="pledges-hint">
          Touchez <strong>➕ Inscrire</strong> pour mettre une promesse au programme de {year + 1} : ses curseurs bougent dans « Vos décisions » (surlignés), et vous pouvez encore les ajuster.
          {capital !== null ? (
            <>
              {' '}
              Capital politique restant : <strong className={left < 0 ? 'bad' : undefined}>⚡ {Math.max(0, left)}</strong> / {capital}.
            </>
          ) : null}
        </p>
      ) : null}
      <ul className="pledge-rows">
        {shown.map((p) => {
          const status = promiseStatus(p, BASE_POLICY, voted)
          const playable = isPlayable(p) && status !== 'tenue'
          const inDraft = playable && promiseStatus(p, BASE_POLICY, planned) === 'tenue'
          const { patch } = playable ? promisePatch(p, inDraft ? voted : planned) : { patch: {} }
          const cost = playable ? planCost(patch, voted) : 0
          const tooDear = !inDraft && cost > left
          return (
            <li key={p.key} className={`pledge-${status}${inDraft ? ' is-draft' : ''}`}>
              <span title={inDraft ? 'Inscrite au programme de l’an prochain' : STATUS[status].label}>{inDraft ? '📝' : STATUS[status].icon}</span>
              <span>
                {p.measure?.name ?? p.quote.slice(0, 60)} {amountLabel(p) ? <small>({amountLabel(p)})</small> : null}
                {playable ? (
                  <span className="pledge-levers">
                    {leverChanges(patch, voted).map((line) => (
                      <small key={line}>{line}</small>
                    ))}
                  </span>
                ) : null}
              </span>
              {playable && playing ? (
                inDraft ? (
                  <span className="pledge-actions">
                    <button type="button" className="ghost small" onClick={() => onShow(p)} title="Voir les curseurs que cette promesse a bougés">
                      🎚️ Voir
                    </button>
                    <button type="button" className="ghost small" onClick={() => onRemove(p)} title="Retirer cette promesse du programme de l’an prochain">
                      ↩︎ Retirer
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="primary small"
                    onClick={() => onApply(p)}
                    disabled={tooDear}
                    title={tooDear ? 'Pas assez de capital politique cette année : retirez une autre mesure, ou attendez l’an prochain.' : `Coûte ${cost} point${cost > 1 ? 's' : ''} de capital politique`}
                  >
                    ➕ Inscrire <small>⚡{cost}</small>
                  </button>
                )
              ) : null}
            </li>
          )
        })}
        {!shown.length ? <li className="pledge-tenue">✅ Toutes vos promesses jouables sont appliquées.</li> : null}
      </ul>
      <button type="button" className="ghost small" onClick={() => setOpen(!open)}>
        {open ? 'Seulement celles à faire' : 'Voir tout le programme'}
      </button>
    </div>
  )
}

const pct = (v: number) => `${num(v * 100, 1)} %`

/** Les chiffres qui résument un mandat, face à la France « sans rien changer ». */
const MANDATE_KPIS: { label: string; get: (s: YearState) => number; show: (v: number) => string; goodWhenUp: boolean }[] = [
  { label: 'Chômage', get: (s) => s.unemployment, show: pct, goodWhenUp: false },
  { label: 'Pauvreté', get: (s) => s.poverty, show: pct, goodWhenUp: false },
  { label: 'Déficit', get: (s) => s.deficit / s.gdp, show: pct, goodWhenUp: false },
  { label: 'Dette', get: (s) => s.debtRatio, show: (v) => `${num(v * 100, 0)} %`, goodWhenUp: false },
  { label: 'Croissance', get: (s) => s.growth, show: pct, goodWhenUp: true },
  { label: 'Émissions', get: (s) => s.frenchEmissions, show: (v) => `${num(v, 0)} Mt`, goodWhenUp: false },
]

/** Le bilan du mandat, après l'élection de 2032. */
export function MandateReport({
  candidate: c,
  states,
  base,
  decisions,
  onReplay,
  onCompare,
  onMenu,
}: {
  candidate: Candidate
  states: YearState[]
  base: YearState[]
  decisions: Decision[]
  onReplay: () => void
  onCompare: () => void
  onMenu: () => void
}) {
  const s = states.at(-1)!
  const b = base.at(-1)!
  const vote = electionAt(s)
  const kept = promisesKept(c, decisions, MANDATE_END, BASE_POLICY)
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal scenario-end mandate-report" role="dialog" aria-modal="true" aria-label="Bilan du mandat" style={{ borderTop: `4px solid ${c.color}` }}>
        <p className="eyebrow">
          {c.emblem} {c.name} · bilan du mandat {MANDATE_START}–{MANDATE_END}
        </p>
        <h2>{vote.won ? 'Réélu·e !' : 'Battu·e en 2032'}</h2>
        <p className="belief">
          {vote.vote} % des voix au second tour · promesses tenues : {kept.kept} / {kept.playable}
        </p>
        <ul className="end-objectives">
          {MANDATE_KPIS.map((k) => {
            const v = k.get(s)
            const ref = k.get(b)
            const better = Math.abs(v - ref) < 1e-4 ? null : v > ref === k.goodWhenUp
            return (
              <li key={k.label} className={better === null ? '' : better ? 'good' : 'bad'}>
                <span>{better === null ? '＝' : better ? '▲' : '▼'}</span>
                <span>{k.label}</span>
                <strong>
                  {k.show(v)} <small>(sans rien changer : {k.show(ref)})</small>
                </strong>
              </li>
            )
          })}
        </ul>
        <p className="note">Comparé à la même France, avec les mêmes événements, si rien n’avait changé depuis 2025.</p>
        <div className="verdict-actions">
          <button type="button" className="primary" onClick={onReplay}>
            ↺ Rejouer ce mandat
          </button>
          <button type="button" className="ghost" onClick={onCompare}>
            📊 Comparer les candidats
          </button>
          <button type="button" className="ghost" onClick={onMenu}>
            🏠 Menu
          </button>
        </div>
      </div>
    </div>
  )
}

/** Les dix mandats joués « à la lettre », avec les mêmes règles et sans hasard, face à « sans rien changer ». */
export function CompareMandates({ onClose, onPick }: { onClose: () => void; onPick: (c: Candidate) => void }) {
  const rows = useMemo(() => {
    const idle = playSession({ plan: {}, from: MANDATE_START, until: MANDATE_END })
    return [
      { id: 'idle', name: 'Sans rien changer', emblem: '⏸️', color: 'var(--muted)', candidate: null as Candidate | null, applied: '—', states: idle.states, lost: idle.lost },
      ...CANDIDATES.map((c) => {
        const m = playMandate(c)
        return { id: c.id, name: c.name, emblem: c.emblem, color: c.color, candidate: c, applied: `${m.applied.length} / ${m.applied.length + m.pending.length}`, states: m.states, lost: m.lost }
      }),
    ]
  }, [])
  return (
    <div className="modal-backdrop on-top" onClick={onClose} role="presentation">
      <div className="modal compare-mandates" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Comparer les mandats">
        <header>
          <div>
            <p className="eyebrow">Mandat {MANDATE_START}–{MANDATE_END}</p>
            <h2>📊 Les programmes face à face</h2>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <p className="modal-lead">
          Chaque programme joué « à la lettre » : les promesses appliquées dans l’ordre, dès que le capital politique le permet, avec les mêmes règles et sans hasard. Résultats en{' '}
          {MANDATE_END}.
        </p>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Programme</th>
                <th>Promesses</th>
                <th>Élection 2032</th>
                {MANDATE_KPIS.map((k) => (
                  <th key={k.label}>{k.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = r.states.at(-1)!
                return (
                  <tr key={r.id}>
                    <th>
                      {r.candidate ? (
                        <button type="button" className="link-button" style={{ color: r.color }} onClick={() => onPick(r.candidate!)}>
                          {r.emblem} {r.name}
                        </button>
                      ) : (
                        <span>
                          {r.emblem} {r.name}
                        </span>
                      )}
                    </th>
                    <td>{r.applied}</td>
                    <td>{r.lost ? `perdu (${r.lost.year})` : s.year === MANDATE_END ? `${electionAt(s).won ? 'réélu·e' : 'battu·e'} · ${popularity(s)} %` : '—'}</td>
                    {MANDATE_KPIS.map((k) => (
                      <td key={k.label}>{k.show(k.get(s))}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="note candidate-note">{PARODY_NOTE}</p>
      </div>
    </div>
  )
}
