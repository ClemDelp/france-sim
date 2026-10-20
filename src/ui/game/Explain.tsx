import { useEffect, useState } from 'react'
import { EVENTS } from '../../model/events'
import { explainYear, type Cause, type Explanation } from '../../model/explain'
import type { SimulationInput } from '../../model/sim'
import type { YearState } from '../../model/types'
import { num } from '../format'
import { LEVER_GROUPS } from '../levers'

type Metric = { id: string; label: string; get: (s: YearState) => number; show: (v: number) => string; delta: (d: number) => string; goodWhenUp: boolean; epsilon: number }

const pt = (d: number) => `${d > 0 ? '+' : '−'}${num(Math.abs(d) * 100, 1)} pt`
const METRICS: Metric[] = [
  { id: 'unemployment', label: 'Chômage', get: (s) => s.unemployment, show: (v) => `${num(v * 100, 1)} %`, delta: pt, goodWhenUp: false, epsilon: 0.0005 },
  { id: 'inflation', label: 'Inflation', get: (s) => s.inflation, show: (v) => `${num(v * 100, 1)} %`, delta: pt, goodWhenUp: false, epsilon: 0.0005 },
  { id: 'deficit', label: 'Déficit', get: (s) => s.deficit / s.gdp, show: (v) => `${num(v * 100, 1)} % du PIB`, delta: pt, goodWhenUp: false, epsilon: 0.0005 },
  { id: 'debt', label: 'Dette', get: (s) => s.debtRatio, show: (v) => `${num(v * 100, 0)} % du PIB`, delta: pt, goodWhenUp: false, epsilon: 0.002 },
  { id: 'poverty', label: 'Pauvreté', get: (s) => s.poverty, show: (v) => `${num(v * 100, 1)} %`, delta: pt, goodWhenUp: false, epsilon: 0.0005 },
  { id: 'discontent', label: 'Colère', get: (s) => s.discontent, show: (v) => num(v, 2), delta: (d) => `${d > 0 ? '+' : '−'}${num(Math.abs(d), 2)}`, goodWhenUp: false, epsilon: 0.005 },
  { id: 'migration', label: 'Arrivées hors voies légales', get: (s) => s.migrationIrregular, show: (v) => `${num(v, 0)} 000`, delta: (d) => `${d > 0 ? '+' : '−'}${num(Math.abs(d), 0)} 000`, goodWhenUp: false, epsilon: 0.5 },
  { id: 'influence', label: 'Influence', get: (s) => s.influence * 100, show: (v) => `indice ${num(v, 0)}`, delta: (d) => `${d > 0 ? '+' : '−'}${num(Math.abs(d), 1)}`, goodWhenUp: true, epsilon: 0.1 },
  { id: 'life', label: 'Espérance de vie', get: (s) => s.lifeExpectancy, show: (v) => `${num(v, 1)} ans`, delta: (d) => `${d > 0 ? '+' : '−'}${num(Math.abs(d), 2)} an`, goodWhenUp: true, epsilon: 0.01 },
]

const LEVERS = LEVER_GROUPS.flatMap((g) => g.levers.map((l) => ({ ...l, icon: g.icon })))

function causeLabel(c: Cause): { icon: string; text: string } {
  if (c.kind === 'older') {
    return { icon: '🕰️', text: 'Les événements plus anciens' }
  }
  if (c.kind === 'event') {
    const e = EVENTS.find((d) => d.id === c.key)
    return { icon: e?.icon ?? '🌍', text: `${e?.label ?? c.key} (${c.year})` }
  }
  if (c.key === 'cancel') {
    return { icon: '✂️', text: 'Votre annulation de dette' }
  }
  if (c.key === 'crisisResponse') {
    return { icon: '🇪🇺', text: 'Votre réponse à la crise de la dette' }
  }
  const l = LEVERS.find((x) => x.key === c.key)
  return { icon: l?.icon ?? '🎛️', text: `Votre décision : ${l?.label ?? c.key}` }
}

/** Ce qui explique la France d'une année : chaque décision et chaque événement, mesurés en les retirant un à un. */
export function Explain({ input, year, onClose }: { input: Pick<SimulationInput, 'decisions' | 'events' | 'params'>; year: number; onClose: () => void }) {
  const [result, setResult] = useState<Record<string, Explanation> | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const signal = { cancelled: false }
    explainYear(input, year, Object.fromEntries(METRICS.map((m) => [m.id, m.get])), setProgress, signal).then((r) => {
      if (r) {
        setResult(r)
      }
    })
    return () => {
      signal.cancelled = true
    }
  }, [input, year])

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal explain" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pourquoi">
        <header>
          <div>
            <p className="eyebrow">🔍 Pourquoi ? · {year}</p>
            <h2>Ce qui explique la France de {year}</h2>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <p className="modal-lead">
          On rejoue la partie en retirant, une à une, chacune de vos décisions et chaque événement : la différence montre ce que chacun a vraiment causé. Rien n’est écrit
          à l’avance, tout sort du modèle. Quand des causes se renforcent ou s’amortissent entre elles, cela apparaît dans « l’effet de combinaison ».
        </p>
        {!result ? (
          <div className="robust">
            <div className="robust-progress">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <small className="note">On rejoue la partie… {Math.round(progress * 100)} %</small>
          </div>
        ) : (
          <div className="explain-grid">
            {METRICS.map((m) => {
              const e = result[m.id]
              const shown = e.contributions.filter((c) => Math.abs(c.value) > m.epsilon).slice(0, 4)
              const max = Math.max(m.epsilon, ...shown.map((c) => Math.abs(c.value)), Math.abs(e.combination))
              const tone = (d: number) => (d > 0 === m.goodWhenUp ? 'good' : 'bad')
              return (
                <section key={m.id} className="explain-card">
                  <h3>
                    {m.label} : {m.show(e.value)}
                  </h3>
                  <p className="note">Si rien ne s’était passé : {m.show(e.trend)} (démographie, tendance du monde, réchauffement déjà engagé).</p>
                  {shown.length === 0 && Math.abs(e.combination) <= m.epsilon ? <p className="note">Vos décisions et les événements n’y ont presque rien changé.</p> : null}
                  <ul>
                    {shown.map((c) => {
                      const { icon, text } = causeLabel(c.cause)
                      return (
                        <li key={c.cause.id}>
                          <span className="explain-cause">
                            {icon} {text}
                          </span>
                          <span className="explain-bar">
                            <span className={tone(c.value)} style={{ width: `${(Math.abs(c.value) / max) * 100}%` }} />
                          </span>
                          <strong className={tone(c.value)}>{m.delta(c.value)}</strong>
                        </li>
                      )
                    })}
                    {Math.abs(e.combination) > m.epsilon ? (
                      <li className="explain-combo" title="Ce que les causes produisent ensemble, au-delà de leur simple somme.">
                        <span className="explain-cause">🌀 Effet de combinaison : les causes interagissent</span>
                        <span className="explain-bar">
                          <span className={tone(e.combination)} style={{ width: `${(Math.abs(e.combination) / max) * 100}%` }} />
                        </span>
                        <strong className={tone(e.combination)}>{m.delta(e.combination)}</strong>
                      </li>
                    ) : null}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
