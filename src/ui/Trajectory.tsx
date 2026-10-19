import { useState, type PointerEvent } from 'react'
import type { Decision, FiredEvent, YearState } from '../model/types'
import { HISTORY } from './history'
import { KPIS } from './indicators'

type Props = {
  states: YearState[]
  base: YearState[]
  decisions: Decision[]
  events: FiredEvent[]
  /** Au-delà de cette année, le modèle donne des tendances, pas des prévisions. */
  reliableUntil: number
}

const W = 360
const H = 200
const PAD = { left: 40, right: 10, top: 12, bottom: 24 }

/** La trajectoire d'un indicateur sur toute la partie : le passé, vos choix, et « si on n'avait rien changé ». */
export function Trajectory({ states, base, decisions, events, reliableUntil }: Props) {
  const [kpiId, setKpiId] = useState('debt')
  const [hover, setHover] = useState<number | null>(null)
  const kpi = KPIS.find((k) => k.id === kpiId) ?? KPIS[0]
  const fmt = kpi.axis ?? kpi.show
  const past = kpi.history ? (HISTORY[kpi.history] ?? []) : []
  const sim = states.map((s) => ({ year: s.year, value: kpi.value(s) }))
  const ref = base.map((s) => ({ year: s.year, value: kpi.value(s) }))
  const all = [...past, ...sim, ...ref]
  const first = all.length ? Math.min(...all.map((p) => p.year)) : 2025
  const last = Math.max(first + 1, ...all.map((p) => p.year))
  let lo = Math.min(...all.map((p) => p.value))
  let hi = Math.max(...all.map((p) => p.value))
  const margin = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 0.01
  lo -= margin
  hi += margin
  const x = (year: number) => PAD.left + ((year - first) / (last - first)) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const path = (pts: { year: number; value: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.year).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo))
  const yearStep = last - first > 30 ? 10 : 5
  const yearTicks = Array.from({ length: Math.floor((last - first) / yearStep) + 1 }, (_, i) => Math.ceil(first / yearStep) * yearStep + i * yearStep).filter((v) => v <= last)
  const changed = decisions.length > 0
  const hovered = hover === null ? null : { year: hover, sim: sim.find((p) => p.year === hover), ref: ref.find((p) => p.year === hover), past: past.find((p) => p.year === hover) }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const year = Math.round(first + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (last - first))
    setHover(Math.min(last, Math.max(first, year)))
  }

  return (
    <div className="panel">
      <div className="chips" role="tablist" aria-label="Indicateur">
        {KPIS.map((k) => (
          <button key={k.id} type="button" className={k.id === kpi.id ? 'chip small is-on' : 'chip small'} onClick={() => setKpiId(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="panel-lead">{kpi.hint}</p>
      <svg className="trajectory" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Évolution : ${kpi.label}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {last > reliableUntil ? (
          <g>
            <rect className="haze" x={x(Math.max(first, reliableUntil))} y={PAD.top} width={x(last) - x(Math.max(first, reliableUntil))} height={H - PAD.top - PAD.bottom} />
            <text className="haze-label" x={x(Math.max(first, reliableUntil)) + 4} y={PAD.top + 10}>
              tendances, pas prévisions
            </text>
          </g>
        ) : null}
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={PAD.left - 4} y={y(t) + 3} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {yearTicks.map((yr) => (
          <text key={yr} className="axis" x={x(yr)} y={H - 8} textAnchor="middle">
            {yr}
          </text>
        ))}
        {events.map((e) => (
          <line key={`${e.id}-${e.year}`} className="mark-event" x1={x(e.year)} x2={x(e.year)} y1={PAD.top} y2={H - PAD.bottom} />
        ))}
        {decisions.map((d) => (
          <line key={`d-${d.year}`} className="mark-decision" x1={x(d.year)} x2={x(d.year)} y1={PAD.top} y2={H - PAD.bottom} />
        ))}
        {past.length ? <path className="line-past" d={path([...past, sim[0]])} /> : null}
        <path className="line-base" d={path(ref)} />
        <path className="line-sim" d={path(sim)} />
        {hovered ? <line className="cursor" x1={x(hovered.year)} x2={x(hovered.year)} y1={PAD.top} y2={H - PAD.bottom} /> : null}
      </svg>
      <div className="trajectory-legend">
        {hovered ? (
          <span>
            <strong>{hovered.year}</strong>
            {hovered.past ? ` · observé ${fmt(hovered.past.value)}` : null}
            {hovered.sim ? ` · vos choix ${fmt(hovered.sim.value)}` : null}
            {hovered.ref && changed ? ` · sans rien changer ${fmt(hovered.ref.value)}` : null}
          </span>
        ) : (
          <>
            <span className="key key-past">Observé</span>
            <span className="key key-sim">{changed ? 'Vos choix' : 'Simulation'}</span>
            {changed ? <span className="key key-base">Sans rien changer</span> : null}
            {decisions.length ? <span className="key key-decision">Décision</span> : null}
            {events.length ? <span className="key key-event">Événement</span> : null}
          </>
        )}
      </div>
    </div>
  )
}
