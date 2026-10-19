import type { Actor, YearState } from '../model/types'
import { num } from './format'

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

type FlowMapProps = {
  state: YearState
  onPick: (actor: Actor) => void
}

/** La carte des flux d'argent : l'épaisseur et la vitesse d'un trait suivent le montant qui circule. */
export function FlowMap({ state, onPick }: FlowMapProps) {
  const max = Math.max(...state.flows.map((f) => f.amount))
  const balance: Partial<Record<Actor, number>> = {
    etat: state.revenue - state.spending,
  }
  return (
    <svg className="flowmap" viewBox="0 0 800 480" role="img" aria-label="Carte des flux d’argent entre les acteurs">
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="arrowhead" />
        </marker>
      </defs>
      {state.flows.map((f) => {
        const a = NODES[f.from]
        const b = NODES[f.to]
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
        return (
          <g key={`${f.from}-${f.to}-${f.label}`} className={`flow flow-${f.from}`}>
            <title>{`${f.label} : ${num(f.amount, 0)} Md€ par an`}</title>
            <path d={`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`} strokeWidth={width} className="flow-base" />
            <path d={`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`} strokeWidth={Math.max(1, width * 0.45)} className="flow-dots" style={{ animationDuration: `${speed}s` }} markerEnd="url(#flow-arrow)" />
          </g>
        )
      })}
      {(Object.keys(NODES) as Actor[]).map((id) => {
        const n = NODES[id]
        const b = balance[id]
        return (
          <g key={id} className={`node node-${id}`} transform={`translate(${n.x},${n.y})`} onClick={() => onPick(id)} role="button" tabIndex={0}>
            <circle r="34" />
            <text className="node-icon" y="9" textAnchor="middle">
              {n.icon}
            </text>
            <text className="node-label" y="52" textAnchor="middle">
              {n.label}
            </text>
            {b !== undefined ? (
              <text className={b < 0 ? 'node-balance bad' : 'node-balance good'} y="68" textAnchor="middle">
                {b < 0 ? `déficit ${num(-b, 0)} Md€` : `excédent ${num(b, 0)} Md€`}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
