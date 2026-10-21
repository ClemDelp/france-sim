import { useMemo, useState } from 'react'
import { BLOCKS, LINKS, NODE_BY_ID, NODES, type GraphLink, type GraphNode } from '../model/graph'
import { exportCsv, PARAM_ROWS, type Overrides, type ParamKind, type ParamRow } from '../model/params'
import { BASE_POLICY } from '../model/calibration'
import type { Policy, PolicyKey, YearState } from '../model/types'
import { formatLever, LEVER_GROUPS, type LeverDef } from './levers'
import { readNode } from './nodeValues'
import { ReplayView } from './ReplayView'
import { usePhone } from './game/usePhone'
import { CONTRIBUTING_URL, DOCS_URL, ISSUES_URL, REPO_URL } from './links'
import { SourcesView } from './SourcesView'

export type Impact = { year: number; rows: { label: string; withChanges: string; original: string; tone: 'good' | 'bad' | 'flat' }[] }

type Props = {
  focus: string | null
  onFocus: (id: string | null) => void
  overrides: Overrides
  onOverride: (id: string, value: number | null) => void
  onReset: () => void
  impact: Impact | null
  /** L'année en cours de la partie, et la même France sans les décisions du joueur (null s'il n'a rien changé). */
  state: YearState
  baseState: YearState | null
  /** La politique en vigueur, pour montrer les leviers que le joueur a bougés. */
  policy: Policy
  /** Ouvrir directement un onglet, avec une recherche (par exemple depuis l'analyse de solidité). */
  initialView?: View
  initialQuery?: string
  onClose: () => void
}

export type View = 'graphe' | 'parametres' | 'sources' | 'passe' | 'participer'

const LEVER_BY_KEY: Partial<Record<string, LeverDef>> = Object.fromEntries(LEVER_GROUPS.flatMap((g) => g.levers.map((l) => [l.key, l])))
const ROW_BY_ID: Record<string, ParamRow> = Object.fromEntries(PARAM_ROWS.map((r) => [r.id, r]))
const BLOCK_COLOR = ['#f5b70a', '#c58cff', '#2fbf71', '#ff8a3d', '#5b8def', '#ff5d62', '#3fc7d4', '#e879b9', '#a3e635', '#94a3b8', '#fbbf24', '#60a5fa', '#f472b6']
const colorOf = (block: string) => BLOCK_COLOR[BLOCKS.indexOf(block) % BLOCK_COLOR.length]
const SIGN_LABEL: Record<GraphLink['sign'], string> = { '+': '+', '-': '−', '±': '±' }
const SIGN_HINT: Record<GraphLink['sign'], string> = {
  '+': 'quand l’un monte, l’autre monte',
  '-': 'quand l’un monte, l’autre baisse',
  '±': 'l’effet dépend de la situation',
}
const KIND_LABEL: Record<ParamKind, string> = { donnee: 'Données de 2025', comportement: 'Comportements', tranche: 'Tranches de ménages', entreprise: 'Tailles d’entreprises' }
const FILE_OF: Record<ParamKind, string> = { donnee: 'donnees-2025.csv', comportement: 'comportements.csv', tranche: 'tranches.csv', entreprise: 'entreprises.csv' }

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : v.toLocaleString('fr-FR', { maximumFractionDigits: 6 }))
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Un paramètre, sa valeur (modifiable), sa fiabilité et sa source. */
function ParamField({ id, overrides, onOverride }: { id: string; overrides: Overrides; onOverride: Props['onOverride'] }) {
  const row = ROW_BY_ID[id]
  if (!row) {
    return null
  }
  const value = overrides[id] ?? row.value
  const moved = id in overrides
  return (
    <div className={moved ? 'param is-moved' : 'param'}>
      <div className="param-head">
        <span className="param-name">{row.name}</span>
        <span className={`badge rel-${normalize(row.reliability).split(' ')[0] || 'na'}`}>{row.reliability || 'non précisé'}</span>
      </div>
      {row.explanation ? <p className="param-text">{row.explanation}</p> : null}
      <div className="param-edit">
        <input
          type="number"
          step="any"
          value={value}
          aria-label={row.name}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(v)) {
              onOverride(id, Math.abs(v - row.value) < 1e-12 ? null : v)
            }
          }}
        />
        <span className="param-unit">{row.unit}</span>
        {moved ? (
          <button type="button" className="ghost small" onClick={() => onOverride(id, null)}>
            ↺ {fmt(row.value)}
          </button>
        ) : null}
      </div>
      <small className="param-source">
        <code>{id}</code> · {row.source || 'source à compléter'}
      </small>
    </div>
  )
}

/** Une variable vue de près : ce qui la fait bouger, et ce qu'elle fait bouger. */
function Reading({ id, state, baseState, policy }: { id: string; state: YearState; baseState: YearState | null; policy: Policy }) {
  const lever = LEVER_BY_KEY[id]
  if (lever) {
    const v = policy[lever.key as PolicyKey] as number
    const moved = Math.abs(v - (BASE_POLICY[lever.key as PolicyKey] as number)) > 1e-9
    return (
      <span className={moved ? 'reading is-moved' : 'reading'}>
        {formatLever(lever, v)}
        {moved ? <em>vous l’avez changé</em> : null}
      </span>
    )
  }
  const r = readNode(id, state, baseState)
  if (!r) {
    return null
  }
  return (
    <span className={r.moved ? 'reading is-moved' : 'reading'}>
      {r.now}
      {r.delta && r.moved ? <em>{r.delta}</em> : null}
    </span>
  )
}

type FocusProps = {
  node: GraphNode
  overrides: Overrides
  onOverride: Props['onOverride']
  onFocus: Props['onFocus']
  state: YearState
  baseState: YearState | null
  policy: Policy
}

function Focus({ node, overrides, onOverride, onFocus, state, baseState, policy }: FocusProps) {
  const causes = LINKS.filter((l) => l.to === node.id)
  const effects = LINKS.filter((l) => l.from === node.id)
  const [open, setOpen] = useState<string | null>(null)
  const linkKey = (l: GraphLink) => `${l.from}>${l.to}`

  const side = (links: GraphLink[], dir: 'in' | 'out') => (
    <ul className="ego-list">
      {links.map((l) => {
        const other = NODE_BY_ID[dir === 'in' ? l.from : l.to]
        const key = linkKey(l)
        return (
          <li key={key} className={open === key ? 'is-open' : ''}>
            <div className="ego-row">
              {dir === 'out' ? <span className={`sign sign-${l.sign === '+' ? 'plus' : l.sign === '-' ? 'minus' : 'mixed'}`} title={SIGN_HINT[l.sign]}>{SIGN_LABEL[l.sign]}</span> : null}
              <button type="button" className="ego-node" style={{ borderColor: colorOf(other.block) }} onClick={() => onFocus(other.id)}>
                <span>{other.name}</span>
                <Reading id={other.id} state={state} baseState={baseState} policy={policy} />
              </button>
              {dir === 'in' ? <span className={`sign sign-${l.sign === '+' ? 'plus' : l.sign === '-' ? 'minus' : 'mixed'}`} title={SIGN_HINT[l.sign]}>{SIGN_LABEL[l.sign]}</span> : null}
              <button type="button" className="ego-more" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key} title="Pourquoi ?">
                {l.params.length ? `${l.params.length} param.` : 'pourquoi ?'}
              </button>
            </div>
            {open === key ? (
              <div className="ego-detail">
                <p>
                  <strong>{NODE_BY_ID[l.from].name}</strong> {l.sign === '+' ? 'fait monter' : l.sign === '-' ? 'fait baisser' : 'fait bouger'} <strong>{NODE_BY_ID[l.to].name.toLowerCase()}</strong>
                  {l.explanation ? ` : ${l.explanation}` : '.'}
                </p>
                {l.params.length ? l.params.map((p) => <ParamField key={p} id={p} overrides={overrides} onOverride={onOverride} />) : <p className="note">Lien comptable : pas de paramètre à régler.</p>}
              </div>
            ) : null}
          </li>
        )
      })}
      {links.length === 0 ? <li className="note">{dir === 'in' ? 'Rien dans le modèle : c’est une décision ou une donnée extérieure.' : 'C’est un résultat final.'}</li> : null}
    </ul>
  )

  return (
    <div className="ego">
      <div className="ego-col">
        <h3>Ce qui le fait bouger</h3>
        {side(causes, 'in')}
      </div>
      <div className="ego-center">
        <div className="ego-main" style={{ borderColor: colorOf(node.block) }}>
          <small style={{ color: colorOf(node.block) }}>{node.block}</small>
          <strong>{node.name}</strong>
          <p>{node.explanation}</p>
          {readNode(node.id, state, baseState) || LEVER_BY_KEY[node.id] ? (
            <p className="ego-now">
              En {state.year} : <Reading id={node.id} state={state} baseState={baseState} policy={policy} />
            </p>
          ) : null}
        </div>
        {baseState ? (
          <p className="note ego-help">Les écarts en couleur comparent votre partie à la même France sans vos décisions : ils montrent quelles causes ont vraiment bougé.</p>
        ) : null}
        <p className="note ego-help">
          <span className="sign sign-plus">+</span> l’un monte, l’autre monte · <span className="sign sign-minus">−</span> l’un monte, l’autre baisse · <span className="sign sign-mixed">±</span> ça dépend
        </p>
      </div>
      <div className="ego-col">
        <h3>Ce qu’il fait bouger</h3>
        {side(effects, 'out')}
      </div>
    </div>
  )
}

const COL_W = 150
const BOX_W = 128
const ROW_H = 24

/** Tout le modèle d'un coup d'œil : les décisions à gauche, les résultats à droite. */
function Overview({ highlight, onFocus }: { highlight: Set<string> | null; onFocus: Props['onFocus'] }) {
  const [hover, setHover] = useState<string | null>(null)
  const layout = useMemo(() => {
    const columns = [...new Set(NODES.map((n) => n.column))].sort((a, b) => a - b)
    const height = Math.max(...columns.map((c) => NODES.filter((n) => n.column === c).length)) * ROW_H + 20
    const pos: Record<string, { x: number; y: number }> = {}
    for (const c of columns) {
      const inCol = NODES.filter((n) => n.column === c)
      const top = (height - inCol.length * ROW_H) / 2
      inCol.forEach((n, i) => {
        pos[n.id] = { x: 10 + c * COL_W, y: top + i * ROW_H }
      })
    }
    return { pos, height, width: 10 + (columns.at(-1)! + 1) * COL_W }
  }, [])
  const active = hover
  const linked = active ? new Set(LINKS.filter((l) => l.from === active || l.to === active).flatMap((l) => [l.from, l.to])) : null

  return (
    <div className="overview-wrap">
      <svg className="overview" viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ minWidth: layout.width * 0.75 }} role="img" aria-label="Graphe complet du modèle">
        {LINKS.map((l) => {
          const a = layout.pos[l.from]
          const b = layout.pos[l.to]
          const x1 = a.x + BOX_W
          const y1 = a.y + 9
          const x2 = b.x
          const y2 = b.y + 9
          const back = x2 <= x1
          const d = back ? `M${x1} ${y1} C${x1 + 60} ${y1 + 40}, ${x2 - 60} ${y2 + 40}, ${x2} ${y2}` : `M${x1} ${y1} C${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
          const on = active ? l.from === active || l.to === active : false
          return <path key={`${l.from}>${l.to}`} d={d} className={`edge sign-${l.sign === '+' ? 'plus' : l.sign === '-' ? 'minus' : 'mixed'}${on ? ' is-on' : ''}${active && !on ? ' is-dim' : ''}`} />
        })}
        {NODES.map((n) => {
          const p = layout.pos[n.id]
          const dim = (linked && !linked.has(n.id)) || (highlight && !highlight.has(n.id))
          return (
            <g
              key={n.id}
              className={dim ? 'gnode is-dim' : 'gnode'}
              transform={`translate(${p.x} ${p.y})`}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onFocus(n.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' ? onFocus(n.id) : null)}
            >
              <rect width={BOX_W} height={18} rx={9} style={{ stroke: colorOf(n.block) }} />
              <text x={8} y={12.5}>
                {n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}
              </text>
              <title>{`${n.name} — ${n.explanation}`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Le tableau de tous les paramètres, modifiable, exportable en CSV pour proposer une correction. */
function ParamTable({ overrides, onOverride, onReset, initialQuery }: { overrides: Overrides; onOverride: Props['onOverride']; onReset: () => void; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [kind, setKind] = useState<ParamKind | 'tous' | 'modifies'>('tous')
  const q = normalize(query)
  const rows = PARAM_ROWS.filter(
    (r) =>
      (kind === 'tous' || (kind === 'modifies' ? r.id in overrides : r.kind === kind)) &&
      (!q || normalize(`${r.id} ${r.name} ${r.block} ${r.explanation} ${r.source}`).includes(q)),
  )
  const count = Object.keys(overrides).length
  return (
    <div className="params">
      <div className="params-tools">
        <input type="search" placeholder="Chercher un paramètre (ex. : dette, SMIC, pétrole)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips">
          {(['tous', 'donnee', 'comportement', 'tranche', 'entreprise', 'modifies'] as const).map((k) => (
            <button key={k} type="button" className={kind === k ? 'chip small is-on' : 'chip small'} onClick={() => setKind(k)}>
              {k === 'tous' ? `Tous (${PARAM_ROWS.length})` : k === 'modifies' ? `Modifiés (${count})` : KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="params-actions">
        {(['donnee', 'comportement', 'tranche', 'entreprise'] as const).map((k) => (
          <button key={k} type="button" className="ghost small" onClick={() => download(FILE_OF[k], exportCsv(k, overrides))}>
            ⬇ {FILE_OF[k]}
          </button>
        ))}
        {count ? (
          <button type="button" className="ghost small" onClick={onReset}>
            ↺ {count > 1 ? `Remettre les ${count} valeurs d’origine` : 'Remettre la valeur d’origine'}
          </button>
        ) : null}
      </div>
      <div className="param-grid">
        {rows.map((r) => (
          <ParamField key={r.id} id={r.id} overrides={overrides} onOverride={onOverride} />
        ))}
        {rows.length === 0 ? <p className="note">Aucun paramètre ne correspond.</p> : null}
      </div>
    </div>
  )
}

function Contribute() {
  return (
    <div className="contribute">
      <h3>Un modèle ouvert, que chacun peut vérifier et améliorer</h3>
      <div className="contribute-links">
        <a className="primary" href={REPO_URL} target="_blank" rel="noreferrer">
          <span aria-hidden="true">🐙</span> Le projet sur GitHub
        </a>
        <a className="ghost" href={CONTRIBUTING_URL} target="_blank" rel="noreferrer">
          <span aria-hidden="true">✍️</span> Proposer une correction
        </a>
        <a className="ghost" href={ISSUES_URL} target="_blank" rel="noreferrer">
          <span aria-hidden="true">💬</span> Signaler un problème, suggérer une idée
        </a>
        <a className="ghost" href={DOCS_URL} target="_blank" rel="noreferrer">
          <span aria-hidden="true">📖</span> La documentation
        </a>
      </div>
      <p>
        Le code du jeu, le modèle et sa documentation sont publics sur <a href={REPO_URL} target="_blank" rel="noreferrer">github.com/ClemDelp/france-sim</a>. Pas besoin de
        savoir coder : un compte GitHub suffit pour proposer une meilleure valeur ou signaler une erreur.
      </p>
      <p>
        Toutes les hypothèses du simulateur sont dans des fichiers du dossier <code>modele/</code> du dépôt, lisibles dans Excel, LibreOffice ou Google Sheets (séparateur
        « ; », virgule décimale) :
      </p>
      <ul>
        <li>
          <code>donnees-2025.csv</code> : la France de 2025 (PIB, dette, population…), avec la source de chaque chiffre.
        </li>
        <li>
          <code>comportements.csv</code> : comment chacun réagit (élasticités, délais, seuils), avec son degré de fiabilité : <em>mesuré</em>, <em>estimé</em> ou{' '}
          <em>hypothèse</em>.
        </li>
        <li>
          <code>tranches.csv</code> : qui reçoit quoi et qui paie quoi, des 20 % les plus modestes aux 10 % les plus aisés.
        </li>
        <li>
          <code>variables.csv</code> et <code>liens.csv</code> : le graphe que vous voyez ici, avec l’explication de chaque lien.
        </li>
        <li>
          <code>sources.csv</code> et <code>references.csv</code> : les organismes, méthodes et études sur lesquels repose le modèle (onglet « Sources »).
        </li>
      </ul>
      <h3>Proposer une correction</h3>
      <ol>
        <li>Essayez une autre valeur ici : toute la partie se recalcule avec votre variante, et le bandeau montre l’effet.</li>
        <li>Si elle vous paraît plus juste, téléchargez le fichier modifié (onglet « Tous les paramètres »).</li>
        <li>Proposez-le sur GitHub (une « pull request ») avec votre source : une étude, une statistique officielle.</li>
        <li>Les tests automatiques vérifient que le modèle reste cohérent (chaque euro a un payeur et un receveur, pas d’emballement sur 50 ans).</li>
      </ol>
      <h3>Ce qui aide le plus</h3>
      <ul>
        <li>Remplacer une <em>hypothèse</em> par une valeur <em>estimée</em> dans une étude sérieuse.</li>
        <li>Signaler un lien qui manque ou qui va dans le mauvais sens.</li>
        <li>Comparer une trajectoire du simulateur au passé réel (2000–2024).</li>
      </ul>
      <p className="note">
        Le fonctionnement complet, avec des schémas, et le pas-à-pas pour modifier un paramètre et tester son changement sont dans{' '}
        <a href={DOCS_URL} target="_blank" rel="noreferrer">
          la documentation
        </a>
        .
      </p>
    </div>
  )
}

/** Le cerveau du modèle : le graphe des interactions, tous les paramètres, et comment participer. */
export function Brain({ focus, onFocus, overrides, onOverride, onReset, impact, state, baseState, policy, initialView, initialQuery, onClose }: Props) {
  const [view, setView] = useState<View>(initialView ?? 'graphe')
  /** La recherche de « Tous les paramètres » (on y arrive aussi depuis les sources). */
  const [paramQuery, setParamQuery] = useState(initialQuery ?? '')
  const phone = usePhone()
  const [trail, setTrail] = useState<string[]>(focus ? [focus] : [])
  const go = (id: string | null) => {
    setTrail((t) => (id === null ? [] : t.includes(id) ? t.slice(0, t.indexOf(id) + 1) : [...t, id]))
    onFocus(id)
  }
  const [query, setQuery] = useState('')
  const [blocks, setBlocks] = useState<Set<string>>(new Set())
  const node = focus ? NODE_BY_ID[focus] : null
  const q = normalize(query)
  const matches = NODES.filter((n) => (!q || normalize(`${n.name} ${n.explanation} ${n.id}`).includes(q)) && (blocks.size === 0 || blocks.has(n.block)))
  const highlight = q || blocks.size ? new Set(matches.map((n) => n.id)) : null
  const count = Object.keys(overrides).length

  return (
    <div className="brain" role="dialog" aria-modal="true" aria-label="Le cerveau du modèle">
      <header className="brain-top">
        <div>
          <h2>🧠 Le cerveau du modèle</h2>
          <p className="note">
            {NODES.length} variables, {LINKS.length} liens de cause à effet, {PARAM_ROWS.length} paramètres, chacun avec sa source ou déclaré comme hypothèse. Tout est modifiable.
          </p>
        </div>
        <nav className="tabs" aria-label="Vues">
          {(
            [
              ['graphe', 'Graphe des interactions'],
              ['parametres', 'Tous les paramètres'],
              ['sources', 'Sources'],
              ['passe', 'Face au passé (2000–2024)'],
              ['participer', 'Participer'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={view === id ? 'is-on' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <button type="button" className="close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </header>

      {count ? (
        <div className="variant">
          <strong>
            Variante du modèle : {count} paramètre{count > 1 ? 's' : ''} modifié{count > 1 ? 's' : ''}.
          </strong>
          {impact ? (
            <span className="variant-impact">
              En {impact.year} :{' '}
              {impact.rows.map((r) => (
                <span key={r.label} className={`tone-${r.tone}`}>
                  {r.label} {r.withChanges} <small>(au lieu de {r.original})</small>
                </span>
              ))}
            </span>
          ) : null}
          <button type="button" className="ghost small" onClick={onReset}>
            ↺ Revenir au modèle d’origine
          </button>
        </div>
      ) : null}

      {view === 'graphe' ? (
        <div className="brain-body">
          <aside className="brain-side">
            <input type="search" placeholder="Chercher une variable" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="chips">
              {BLOCKS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={blocks.has(b) ? 'chip small is-on' : 'chip small'}
                  style={{ borderColor: colorOf(b) }}
                  onClick={() => {
                    const next = new Set(blocks)
                    if (next.has(b)) {
                      next.delete(b)
                    } else {
                      next.add(b)
                    }
                    setBlocks(next)
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
            <ul className="node-list">
              {matches.map((n) => (
                <li key={n.id}>
                  <button type="button" className={focus === n.id ? 'is-on' : ''} onClick={() => go(n.id)}>
                    <i style={{ background: colorOf(n.block) }} />
                    {n.name}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className="brain-main">
            {node ? (
              <>
                <nav className="trail" aria-label="Chemin parcouru">
                  <button type="button" className="ghost small" onClick={() => go(null)}>
                    ← Vue d’ensemble
                  </button>
                  {trail.length > 1
                    ? trail.map((id) => (
                        <button key={id} type="button" className={id === node.id ? 'crumb is-on' : 'crumb'} onClick={() => go(id)}>
                          {NODE_BY_ID[id]?.name}
                        </button>
                      ))
                    : <span className="note">Cliquez sur une cause pour remonter la chaîne.</span>}
                </nav>
                <Focus key={node.id} node={node} overrides={overrides} onOverride={onOverride} onFocus={go} state={state} baseState={baseState} policy={policy} />
              </>
            ) : (
              <>
                <p className="panel-lead">
                  À gauche, vos décisions et le monde ; à droite, les résultats.{' '}
                  {phone
                    ? 'Faites glisser le graphe de côté ; touchez une variable pour comprendre ce qui la fait bouger et régler les paramètres.'
                    : 'Survolez une variable pour voir ses liens, cliquez pour comprendre ce qui la fait bouger et régler les paramètres.'} Liens <span className="sign sign-plus">+</span> : l’un monte, l’autre monte ; <span className="sign sign-minus">−</span> : l’un monte,
                  l’autre baisse.
                </p>
                <Overview highlight={highlight} onFocus={go} />
              </>
            )}
          </section>
        </div>
      ) : null}
      {view === 'parametres' ? <ParamTable key={paramQuery} overrides={overrides} onOverride={onOverride} onReset={onReset} initialQuery={paramQuery} /> : null}
      {view === 'sources' ? (
        <SourcesView
          onInspect={(id) => {
            setParamQuery(id)
            setView('parametres')
          }}
        />
      ) : null}
      {view === 'passe' ? <ReplayView overrides={overrides} /> : null}
      {view === 'participer' ? <Contribute /> : null}
    </div>
  )
}
