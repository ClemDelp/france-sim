import { useEffect, useRef, useState } from 'react'
import { analyzeRobustness, HYPOTHESES, SPREAD, type Robustness as Result } from '../model/robustness'
import type { SimulationInput } from '../model/sim'
import type { RobustMetric } from './robustnessMetrics'

type Props = {
  input: Pick<SimulationInput, 'decisions' | 'events' | 'until' | 'params'>
  metrics: RobustMetric[]
  /** Ouvre un paramètre dans « Le modèle » pour le lire ou le modifier. */
  onInspect: (id: string) => void
}

const VERDICT: Record<Result['verdict'], { label: string; text: string }> = {
  solide: { label: 'Solide', text: 'Le sens et l’ampleur de l’effet tiennent, quelles que soient les hypothèses.' },
  'a-nuancer': { label: 'À nuancer', text: 'Le sens tient, mais l’ampleur dépend d’hypothèses.' },
  fragile: { label: 'Fragile', text: 'L’effet peut changer de sens ou varier du simple au double selon des hypothèses incertaines.' },
}

/** « Ce résultat est-il solide ? » : on refait le calcul en faisant varier chaque hypothèse du modèle. */
export function Robustness({ input, metrics, onInspect }: Props) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const signal = useRef({ cancelled: false })

  // Si on ferme la fenêtre pendant le calcul, on l'abandonne.
  useEffect(() => {
    const current = signal.current
    return () => {
      current.cancelled = true
    }
  }, [])

  const run = async () => {
    signal.current = { cancelled: false }
    setResults(null)
    setProgress(0)
    const r = await analyzeRobustness(input, metrics, setProgress, signal.current)
    if (r) {
      setResults(r)
      setProgress(null)
    }
  }

  if (!results && progress === null) {
    return (
      <div className="robust">
        <button type="button" className="ghost" onClick={run}>
          🔬 Ce résultat est-il solide ?
        </button>
        <small className="note">
          On refait le calcul en faisant varier chacune des {HYPOTHESES.length} hypothèses du modèle (± {SPREAD * 100} %, ou sa plage plausible).
        </small>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="robust">
        <div className="robust-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
          <span style={{ width: `${(progress ?? 0) * 100}%` }} />
        </div>
        <small className="note">Test des hypothèses… {Math.round((progress ?? 0) * 100)} %</small>
      </div>
    )
  }

  return (
    <div className="robust">
      <h4>🔬 Solidité du résultat</h4>
      <ul className="robust-list">
        {results.map((r) => {
          const m = metrics.find((x) => x.id === r.metric.id)!
          return (
            <li key={r.metric.id} className={`robust-${r.verdict}`}>
              <div className="robust-head">
                <span>{m.label}</span>
                <strong>{m.show(r.effect)}</strong>
                <em className="badge">{VERDICT[r.verdict].label}</em>
              </div>
              <small>
                Entre {m.show(r.low)} et {m.show(r.high)} selon les hypothèses. {VERDICT[r.verdict].text}
              </small>
              {r.verdict !== 'solide' && r.drivers.length ? (
                <small className="robust-drivers">
                  Ce qui décide :{' '}
                  {r.drivers.map((d, i) => (
                    <span key={d.id}>
                      {i ? ', ' : ''}
                      <button type="button" className="link" onClick={() => onInspect(d.id)} title={`Basse : ${m.show(d.low)} · haute : ${m.show(d.high)}`}>
                        {d.name}
                      </button>
                    </span>
                  ))}
                  .
                </small>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="note">
        Une hypothèse est une valeur choisie faute de mesure précise. Si vous connaissez une étude qui la précise, proposez-la : le modèle deviendra plus solide.
      </p>
    </div>
  )
}
