import { useState } from 'react'
import type { Actor, Flow, YearState } from '../model/types'
import { num, signed } from './format'

const NODES: Record<Actor, { x: number; y: number; icon: string; label: string }> = {
  etat: { x: 330, y: 70, icon: '🏛️', label: 'État' },
  secu: { x: 560, y: 70, icon: '🤝', label: 'Sécurité sociale' },
  menages: { x: 110, y: 235, icon: '👨‍👩‍👧', label: 'Ménages' },
  entreprises: { x: 400, y: 245, icon: '🏭', label: 'Entreprises' },
  energie: { x: 590, y: 175, icon: '⚡', label: 'Énergie importée' },
  monde: { x: 700, y: 300, icon: '🌍', label: 'Reste du monde' },
  banques: { x: 210, y: 410, icon: '🏦', label: 'Banques' },
  bce: { x: 520, y: 420, icon: '💶', label: 'Banque de France' },
}

/** Sur un téléphone tenu droit : les mêmes acteurs, disposés en hauteur, pour que tout reste lisible. */
const PORTRAIT: Record<Actor, { x: number; y: number }> = {
  etat: { x: 140, y: 70 },
  secu: { x: 370, y: 80 },
  energie: { x: 400, y: 260 },
  menages: { x: 80, y: 300 },
  entreprises: { x: 250, y: 330 },
  monde: { x: 400, y: 450 },
  banques: { x: 100, y: 540 },
  bce: { x: 300, y: 580 },
}

type FlowMapProps = {
  state: YearState
  /** La même année sans les décisions du joueur, pour montrer ce qui change. */
  base: YearState | null
  /** Ouvre l'onglet d'analyse qui détaille un acteur. */
  onOpen: (actor: Actor) => void
  /** Disposition en hauteur (téléphone). */
  portrait?: boolean
}

const keyOf = (f: Flow) => `${f.from}>${f.to}>${f.label}`

/** La carte des flux d'argent : l'épaisseur et la vitesse d'un trait suivent le montant qui circule. */
export function FlowMap({ state, base, onOpen, portrait = false }: FlowMapProps) {
  const at = (id: Actor) => (portrait ? { ...NODES[id], ...PORTRAIT[id] } : NODES[id])
  const [selected, setSelected] = useState<Actor | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const max = Math.max(...state.flows.map((f) => f.amount))
  const ref = new Map((base?.flows ?? []).map((f) => [keyOf(f), f.amount]))
  // Écart de chaque flux avec « sans rien changer », en part du flux de référence.
  const change = (f: Flow) => {
    const r = ref.get(keyOf(f))
    return base && r ? f.amount / r - 1 : 0
  }
  // On n'étiquette que les plus gros changements, pour rester lisible.
  const labelled = new Set(
    [...state.flows]
      .filter((f) => Math.abs(change(f)) > 0.03)
      .sort((a, b) => Math.abs(change(b)) - Math.abs(change(a)))
      .slice(0, 6)
      .map(keyOf),
  )
  const balance = state.revenue - state.spending
  const k = 1 / state.priceLevel
  const touches = (f: Flow) => !selected || f.from === selected || f.to === selected

  return (
    <div className="flowmap-wrap">
      {base ? (
        <p className="flow-legend">
          <span className="key-up">plus</span> / <span className="key-down">moins</span> d’argent que « sans rien changer ». {portrait ? 'Touchez' : 'Cliquez sur'} un acteur pour le détail.
        </p>
      ) : null}
      <svg className="flowmap" viewBox={portrait ? '0 0 480 650' : '0 0 800 480'} role="img" aria-label="Carte des flux d’argent entre les acteurs">
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="arrowhead" />
          </marker>
        </defs>
        {state.flows.map((f) => {
          const a = at(f.from)
          const b = at(f.to)
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          // Les flux aller et retour se courbent de part et d'autre : on les distingue.
          const bend = 0.18 * len
          const cx = (a.x + b.x) / 2 + (-dy / len) * bend
          const cy = (a.y + b.y) / 2 + (dx / len) * bend
          const shrink = 40 / len
          const sx = a.x + dx * shrink
          const sy = a.y + dy * shrink
          const ex = b.x - dx * shrink
          const ey = b.y - dy * shrink
          const width = 1.2 + 11 * Math.sqrt(f.amount / max)
          const speed = Math.max(1.2, 14 - 12 * Math.sqrt(f.amount / max))
          const d = change(f)
          const tone = Math.abs(d) > 0.03 ? (d > 0 ? ' is-up' : ' is-down') : ''
          const dim = !touches(f) || (hovered && hovered !== keyOf(f)) ? ' is-dim' : ''
          const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex
          const my = 0.25 * sy + 0.5 * cy + 0.25 * ey
          const path = `M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`
          return (
            <g
              key={keyOf(f)}
              className={`flow flow-${f.from}${tone}${dim}`}
              onPointerEnter={() => setHovered(keyOf(f))}
              onPointerLeave={() => setHovered(null)}
            >
              <title>{`${f.label} : ${num(f.amount * k, 0)} Md€ par an (euros de 2025)${base ? ` · ${signed(d * 100, 1)} % vs sans rien changer` : ''}`}</title>
              <path d={path} strokeWidth={width} className="flow-base" />
              <path d={path} strokeWidth={Math.max(1, width * 0.45)} className="flow-dots" style={{ animationDuration: `${speed}s` }} markerEnd="url(#flow-arrow)" />
              <path d={path} strokeWidth={Math.max(14, width)} className="flow-hit" />
              {labelled.has(keyOf(f)) && !dim ? (
                <g className="flow-tag" transform={`translate(${mx} ${my})`}>
                  <rect x={-24} y={-9} width={48} height={18} rx={9} />
                  <text textAnchor="middle" y={4}>
                    {`${signed(d * 100, 0)} %`}
                  </text>
                </g>
              ) : null}
            </g>
          )
        })}
        {(Object.keys(NODES) as Actor[]).map((id) => {
          const n = at(id)
          return (
            <g
              key={id}
              className={`node node-${id}${selected === id ? ' is-selected' : ''}${selected && selected !== id ? ' is-dim' : ''}`}
              transform={`translate(${n.x},${n.y})`}
              onClick={() => setSelected(selected === id ? null : id)}
              onKeyDown={(e) => (e.key === 'Enter' ? setSelected(selected === id ? null : id) : null)}
              role="button"
              tabIndex={0}
              aria-pressed={selected === id}
            >
              <circle r="34" />
              <text className="node-icon" y="9" textAnchor="middle">
                {n.icon}
              </text>
              <text className="node-label" y="52" textAnchor="middle">
                {n.label}
              </text>
              {id === 'etat' ? (
                <text className={balance < 0 ? 'node-balance bad' : 'node-balance good'} y="68" textAnchor="middle">
                  {balance < 0 ? `déficit ${num((-balance / state.gdp) * 100, 1)} % du PIB` : `excédent ${num((balance / state.gdp) * 100, 1)} % du PIB`}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {selected ? (
        <div className="flow-detail">
          <div className="flow-detail-head">
            <strong>
              {NODES[selected].icon} {NODES[selected].label} en {state.year}
            </strong>
            <button type="button" className="ghost small" onClick={() => onOpen(selected)}>
              Voir l’analyse détaillée
            </button>
          </div>
          {(['in', 'out'] as const).map((dir) => {
            const list = state.flows.filter((f) => (dir === 'in' ? f.to === selected : f.from === selected))
            return (
              <div key={dir}>
                <h4>{dir === 'in' ? 'Ce qui arrive' : 'Ce qui part'}</h4>
                <ul className="flow-list">
                  {list.map((f) => {
                    const d = change(f)
                    return (
                      <li key={keyOf(f)}>
                        <span>
                          {f.label} <small>({dir === 'in' ? NODES[f.from].label : NODES[f.to].label})</small>
                        </span>
                        <strong>
                          {num(f.amount * k, 0)} Md€
                          {base && Math.abs(d) > 0.005 ? <em className={d > 0 ? 'up' : 'down'}>{` ${signed(d * 100, 1)} %`}</em> : null}
                        </strong>
                      </li>
                    )
                  })}
                  {list.length === 0 ? <li className="note">Aucun flux.</li> : null}
                </ul>
              </div>
            )
          })}
          <p className="note">Montants annuels en euros de 2025.{base ? ' Les pourcentages comparent à la même année sans vos décisions.' : ''}</p>
        </div>
      ) : null}
    </div>
  )
}
