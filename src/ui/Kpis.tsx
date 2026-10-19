import type { YearState } from '../model/types'
import { HISTORY } from './history'
import { KPIS } from './indicators'

function Sparkline({ past, sim, base }: { past: number[]; sim: number[]; base: number[] }) {
  const all = [...past, ...sim, ...base]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = hi - lo || 1
  const n = past.length + sim.length
  const x = (i: number) => 2 + (i / Math.max(1, n - 1)) * 116
  const y = (v: number) => 34 - ((v - lo) / span) * 30
  const line = (values: number[], offset: number) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i + offset).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="spark" viewBox="0 0 120 38" preserveAspectRatio="none" aria-hidden="true">
      {past.length ? <path className="past" d={line([...past, sim[0]], 0)} /> : null}
      <path className="base" d={line(base, past.length)} />
      <path className="sim" d={line(sim, past.length)} />
    </svg>
  )
}

type KpisProps = { states: YearState[]; base: YearState[]; changed: boolean; onPick: (node: string) => void }

/** Les chiffres clés de l'année, comparés à « si on n'avait rien changé ». Un clic ouvre ce qui les fait bouger. */
export function Kpis({ states, base, changed, onPick }: KpisProps) {
  const s = states[states.length - 1]
  const b = base[base.length - 1]
  return (
    <div className="kpis">
      {KPIS.map((k) => {
        const v = k.value(s)
        const d = v - k.value(b)
        const tone = Math.abs(d) < 1e-4 ? 'flat' : d > 0 === k.goodWhenUp ? 'good' : 'bad'
        const past = k.history ? (HISTORY[k.history] ?? []).map((p) => p.value) : []
        return (
          <button key={k.id} type="button" className={`kpi tone-${changed ? tone : 'flat'}`} title={`${k.hint} Cliquez pour voir ce qui le fait bouger.`} onClick={() => onPick(k.node)}>
            <span className="kpi-label">{k.label}</span>
            <strong className="kpi-value">{k.show(v)}</strong>
            <span className="kpi-delta">{changed && tone !== 'flat' ? `${k.delta(d)} vs sans rien changer` : ' '}</span>
            <Sparkline past={past} sim={states.map(k.value)} base={base.map(k.value)} />
          </button>
        )
      })}
    </div>
  )
}
