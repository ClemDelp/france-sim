import type { YearState } from '../model/types'
import { num, pct, pts, signed } from './format'
import { HISTORY } from './history'

type Kpi = {
  id: string
  label: string
  value: (s: YearState) => number
  show: (v: number) => string
  delta: (d: number) => string
  goodWhenUp: boolean
  /** Série historique 2017–2024, quand elle existe. */
  history?: string
  hint: string
}

const KPIS: Kpi[] = [
  { id: 'gdp', label: 'Croissance', value: (s) => s.growth, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: true, history: 'growth', hint: 'Progression de la richesse produite en volume, hors hausse des prix.' },
  { id: 'unemployment', label: 'Chômage', value: (s) => s.unemployment, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: false, history: 'unemployment', hint: 'Part des actifs qui cherchent un emploi.' },
  { id: 'inflation', label: 'Inflation', value: (s) => s.inflation, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: false, history: 'inflation', hint: 'Hausse des prix sur un an. Peut monter sans croissance : choc pétrolier, droits de douane, TVA.' },
  { id: 'deficit', label: 'Déficit', value: (s) => s.deficit / s.gdp, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: false, history: 'deficitRatio', hint: 'Ce que l’État et la Sécu dépensent de plus que leurs recettes, en % du PIB.' },
  { id: 'debt', label: 'Dette', value: (s) => s.debtRatio, show: (v) => pct(v, 0), delta: (d) => pts(d), goodWhenUp: false, history: 'debtRatio', hint: 'Somme des déficits passés, en % du PIB.' },
  { id: 'rate', label: 'Taux 10 ans', value: (s) => s.rate, show: (v) => pct(v, 2), delta: (d) => pts(d, 2), goodWhenUp: false, history: 'rate', hint: 'Le prix auquel la France emprunte : il dépend de la BCE et de la confiance des prêteurs.' },
  { id: 'poverty', label: 'Pauvreté', value: (s) => s.poverty, show: (v) => pct(v), delta: (d) => pts(d), goodWhenUp: false, history: 'poverty', hint: 'Part de la population sous 60 % du niveau de vie médian.' },
  { id: 'gini', label: 'Inégalités', value: (s) => s.gini, show: (v) => num(v, 3), delta: (d) => signed(d, 3), goodWhenUp: false, hint: 'Indice de Gini des niveaux de vie : 0 = égalité parfaite, 1 = une seule personne a tout.' },
  { id: 'life', label: 'Espérance de vie', value: (s) => s.lifeExpectancy, show: (v) => `${num(v, 1)} ans`, delta: (d) => `${signed(d, 1)} an`, goodWhenUp: true, hint: 'À la naissance. Écart de 13 ans entre les 5 % les plus riches et les 5 % les plus pauvres (hommes).' },
]

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

type KpisProps = { states: YearState[]; base: YearState[]; changed: boolean }

/** Les chiffres clés de l'année, comparés à « si on n'avait rien changé ». */
export function Kpis({ states, base, changed }: KpisProps) {
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
          <div key={k.id} className={`kpi tone-${changed ? tone : 'flat'}`} title={k.hint}>
            <span className="kpi-label">{k.label}</span>
            <strong className="kpi-value">{k.show(v)}</strong>
            <span className="kpi-delta">{changed && tone !== 'flat' ? `${k.delta(d)} vs sans rien changer` : ' '}</span>
            <Sparkline past={past} sim={states.map(k.value)} base={base.map(k.value)} />
          </div>
        )
      })}
    </div>
  )
}
