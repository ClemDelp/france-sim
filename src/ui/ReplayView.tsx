import { useMemo, useState, type PointerEvent } from 'react'
import type { Overrides } from '../model/params'
import { OBSERVED, REPLAY_END, REPLAY_METRICS, REPLAY_NOTES, REPLAY_START, replay, replayErrors, type ReplayMetric } from '../model/replay'
import type { YearState } from '../model/types'
import { WORLD_NOTES } from '../model/world'
import { num, signed } from './format'

const W = 320
const H = 150
const PAD = { left: 34, right: 8, top: 10, bottom: 20 }
const pctTick = (v: number) => `${num(v * 100, Math.abs(v) < 0.1 ? 1 : 0)} %`

/** Une courbe : la réalité (gris) et le modèle rejoué (or), avec la variante en violet si elle existe. */
function MiniChart({ metric, states, variant }: { metric: ReplayMetric; states: YearState[]; variant: YearState[] | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const real = OBSERVED.map((o) => ({ year: o.year, value: o[metric.id] }))
  const model = states.map((s) => ({ year: s.year, value: metric.model(s) }))
  const alt = variant?.map((s) => ({ year: s.year, value: metric.model(s) })) ?? []
  const all = [...real, ...model, ...alt].map((p) => p.value)
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const pad = (hi - lo) * 0.08 || 0.01
  const x = (y: number) => PAD.left + ((y - REPLAY_START) / (REPLAY_END - REPLAY_START)) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - PAD.top - PAD.bottom)
  const path = (pts: { year: number; value: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.year).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    setHover(Math.round(Math.min(REPLAY_END, Math.max(REPLAY_START, REPLAY_START + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (REPLAY_END - REPLAY_START)))))
  }
  const h = hover === null ? null : { real: real.find((p) => p.year === hover)?.value, model: model.find((p) => p.year === hover)?.value, alt: alt.find((p) => p.year === hover)?.value }
  return (
    <div className="replay-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="trajectory" role="img" aria-label={`${metric.label} : réalité et modèle`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => {
          const v = lo - pad + t * (hi - lo + 2 * pad)
          return (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
              <text className="axis" x={PAD.left - 4} y={y(v) + 3} textAnchor="end">
                {pctTick(v)}
              </text>
            </g>
          )
        })}
        {[2000, 2008, 2016, 2024].map((yr) => (
          <text key={yr} className="axis" x={x(yr)} y={H - 6} textAnchor={yr === REPLAY_END ? 'end' : yr === REPLAY_START ? 'start' : 'middle'}>
            {yr}
          </text>
        ))}
        <path className="line-past" d={path(real)} />
        <path className="line-sim" d={path(model)} />
        {alt.length ? <path className="line-variant" d={path(alt)} /> : null}
        {hover !== null ? <line className="cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} /> : null}
      </svg>
      <p className="trajectory-legend">
        {h ? (
          <span>
            <strong>{hover}</strong> · réalité {h.real !== undefined ? pctTick(h.real) : '—'} · modèle {h.model !== undefined ? pctTick(h.model) : '—'}
            {h.alt !== undefined ? ` · variante ${pctTick(h.alt)}` : ''}
            {hover !== null && WORLD_NOTES[hover] ? <em> — {WORLD_NOTES[hover]}</em> : null}
          </span>
        ) : (
          <>
            <span className="key key-past">Réalité</span>
            <span className="key key-sim">Modèle</span>
            {alt.length ? <span className="key key-variant">Votre variante</span> : null}
          </>
        )}
      </p>
    </div>
  )
}

/** Le test de vérité : le modèle rejoue 2000–2024 et on compare à ce qui s'est vraiment passé. */
export function ReplayView({ overrides }: { overrides: Overrides }) {
  const hasVariant = Object.keys(overrides).length > 0
  const states = useMemo(() => replay(), [])
  const variant = useMemo(() => (hasVariant ? replay(overrides) : null), [hasVariant, overrides])
  const errors = useMemo(() => replayErrors(states), [states])
  const variantErrors = useMemo(() => (variant ? replayErrors(variant) : null), [variant])
  const [showNotes, setShowNotes] = useState(false)

  return (
    <div className="replay">
      <div className="replay-intro">
        <h3>Le modèle face au passé : rejouer 2000–2024</h3>
        <p>
          On part de la France de 2000, avec les décisions réellement prises (35 heures, réformes des retraites, CICE, hausses d’impôts de 2011-2013, aides Covid, bouclier
          tarifaire…) et le monde tel qu’il a été (bulle internet, crise de 2008, crise de l’euro, Covid, guerre en Ukraine). Le modèle ne connaît pas la suite : on compare ce
          qu’il calcule à ce qui s’est vraiment passé.
        </p>
        <p className="note">
          Fichiers : modele/donnees-2000.csv, modele/politiques-2000-2024.csv, modele/monde.csv, modele/historique.csv. Un test automatique vérifie que chaque proposition
          de modification ne dégrade pas ce rejeu.
        </p>
      </div>

      <table className="replay-table">
        <thead>
          <tr>
            <th>Indicateur</th>
            <th>Écart moyen</th>
            <th>Biais</th>
            {variantErrors ? <th>Avec votre variante</th> : null}
          </tr>
        </thead>
        <tbody>
          {REPLAY_METRICS.map((m) => {
            const e = errors[m.id]
            const v = variantErrors?.[m.id]
            const better = v ? v.mae < e.mae - 1e-5 : false
            const worse = v ? v.mae > e.mae + 1e-5 : false
            return (
              <tr key={m.id}>
                <td>{m.label}</td>
                <td>{num(e.mae * 100, 1)} pt</td>
                <td>{signed(e.bias * 100, 1)} pt</td>
                {v ? <td className={better ? 'good' : worse ? 'bad' : ''}>{`${num(v.mae * 100, 1)} pt ${better ? '(mieux)' : worse ? '(moins bien)' : '(pareil)'}`}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="note">Écart moyen : de combien le modèle se trompe en moyenne chaque année. Biais : s’il se trompe toujours dans le même sens (+ = trop haut).</p>

      <div className="replay-grid">
        {REPLAY_METRICS.map((m) => (
          <div key={m.id}>
            <h4>{m.label}</h4>
            <MiniChart metric={m} states={states} variant={variant} />
          </div>
        ))}
      </div>

      <div className="replay-limits">
        <h3>Ce que le modèle rate, et pourquoi</h3>
        <ul>
          <li>
            <strong>Le chômage de 2014-2018</strong> : le modèle le fait baisser trop vite avec la baisse du pétrole et les rachats de la BCE ; en réalité, la reprise a été lente
            et la productivité a ralenti.
          </li>
          <li>
            <strong>2022-2024</strong> : le modèle voit une récession avec la flambée de l’énergie ; en réalité, le rattrapage après le Covid et le bouclier tarifaire (prix de
            l’énergie plafonnés, absent du modèle) ont soutenu l’activité, et l’emploi a progressé plus vite que la production (énigme de la productivité).
          </li>
          <li>
            <strong>Les inégalités</strong> : la pauvreté de départ est calée, mais ses variations d’une année à l’autre sont plus faibles que dans la réalité (le saut de 2023 est
            en partie un changement de méthode de l’INSEE).
          </li>
          <li>
            <strong>Les données de 2000 et l’histoire</strong> sont des ordres de grandeur arrondis : ils gagneraient à être vérifiés et sourcés précisément. C’est une bonne
            première contribution.
          </li>
        </ul>
      </div>

      <button type="button" className="ghost small" onClick={() => setShowNotes(!showNotes)} aria-expanded={showNotes}>
        {showNotes ? 'Masquer' : 'Voir'} les décisions et événements rejoués
      </button>
      {showNotes ? (
        <ol className="journal replay-notes">
          {[...new Set([...REPLAY_NOTES.map((n) => n.year), ...Object.keys(WORLD_NOTES).map(Number).filter((y) => y <= REPLAY_END)])]
            .sort((a, b) => a - b)
            .map((year) => (
              <li key={year}>
                <strong>{year}</strong>
                <ul>
                  {WORLD_NOTES[year] ? <li>🌍 {WORLD_NOTES[year]}</li> : null}
                  {REPLAY_NOTES.filter((n) => n.year === year).map((n) => (
                    <li key={n.text}>🏛️ {n.text}</li>
                  ))}
                </ul>
              </li>
            ))}
        </ol>
      ) : null}
    </div>
  )
}
