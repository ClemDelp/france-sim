import { useEffect, useMemo, useState } from 'react'
import { BASE_POLICY } from './model/calibration'
import { EVENTS } from './model/events'
import type { Overrides } from './model/params'
import { policyAt, simulate } from './model/sim'
import type { Actor, Decision, FiredEvent, Policy, PolicyKey } from './model/types'
import { Brain, type Impact, type View } from './ui/Brain'
import { FlowMap } from './ui/FlowMap'
import { num, sbn } from './ui/format'
import { Kpis } from './ui/Kpis'
import { KPIS } from './ui/indicators'
import { formatLever, LEVER_GROUPS } from './ui/levers'
import { MISSIONS, type Mission } from './ui/missions'
import { BudgetPanel, DebtPanel, FirmsPanel, GroupsPanel, JournalPanel, WorldPanel } from './ui/Panels'
import { ENDINGS } from './ui/endings'
import { focusLine } from './ui/story'
import { Robustness } from './ui/Robustness'
import { FOCUS_METRICS, KPI_FOCUS } from './ui/robustnessMetrics'
import { Trajectory } from './ui/Trajectory'

const START = 2025
const END = 2075
/** Au-delà, le simulateur montre des tendances (démographie, dette), pas des prévisions. */
const RELIABLE_UNTIL = 2040
const LONG_RUN = 2050
const MISSION_YEARS = 10
const INTRO_KEY = 'france-sim:intro-vue'

type Tab = 'groupes' | 'courbes' | 'budget' | 'dette' | 'entreprises' | 'monde' | 'journal'
const TABS: { id: Tab; label: string }[] = [
  { id: 'groupes', label: 'Qui gagne, qui perd' },
  { id: 'courbes', label: 'Courbes' },
  { id: 'budget', label: 'Budget' },
  { id: 'dette', label: 'Dette' },
  { id: 'entreprises', label: 'Entreprises' },
  { id: 'monde', label: 'Énergie et monde' },
  { id: 'journal', label: 'Journal' },
]

const ACTOR_TAB: Partial<Record<Actor, Tab>> = { menages: 'groupes', etat: 'budget', secu: 'budget', bce: 'dette', banques: 'dette', monde: 'monde', energie: 'monde', entreprises: 'entreprises' }

type Verdict = { mission: Mission; start: number }

/** Un lien #idee=<id> lance directement une idée reçue (pratique pour la partager). */
const linked = MISSIONS.find((m) => m.id === new URLSearchParams(window.location.hash.slice(1)).get('idee'))

function introSeen(): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
  }
}

/** Les quatre chiffres qui résument l'effet d'une variante du modèle. */
const IMPACT_KPIS = ['gdp', 'unemployment', 'debt', 'poverty']

function App() {
  const [decisions, setDecisions] = useState<Decision[]>(linked ? [{ year: START + 1, patch: linked.patch }] : [])
  const [events, setEvents] = useState<FiredEvent[]>([])
  const [year, setYear] = useState(START)
  const [draft, setDraft] = useState<Partial<Policy>>({})
  const [tab, setTab] = useState<Tab>('groupes')
  const [missionsOpen, setMissionsOpen] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(linked ? { mission: linked, start: START + 1 } : null)
  const [target, setTarget] = useState<number | null>(linked ? START + 1 + MISSION_YEARS : null)
  const [leversOpen, setLeversOpen] = useState(false)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [brain, setBrain] = useState<{ focus: string | null; view?: View; query?: string } | null>(null)
  const [intro, setIntro] = useState(() => !linked && !introSeen())
  /** Les années de crise de la dette auxquelles le joueur a déjà répondu. */
  const [handled, setHandled] = useState<number[]>([])
  /** Le joueur a choisi de continuer après une défaite (mode bac à sable). */
  const [sandbox, setSandbox] = useState(false)
  /** Le levier dont l'explication est ouverte (au clic, pas au survol : rien ne bouge sous la souris). */
  const [hint, setHint] = useState<string | null>(null)

  const params = overrides
  const states = useMemo(() => simulate({ decisions, events, until: year, params }), [decisions, events, year, params])
  const base = useMemo(() => simulate({ decisions: [], events, until: year, params }), [events, year, params])
  const variant = Object.keys(overrides).length > 0
  // Avec une variante du modèle : la même partie avec le modèle d'origine, pour montrer l'effet de la variante.
  const original = useMemo(() => (variant ? simulate({ decisions, events, until: year }) : null), [variant, decisions, events, year])
  const impact: Impact | null = original
    ? {
        year,
        rows: KPIS.filter((k) => IMPACT_KPIS.includes(k.id)).map((k) => {
          const a = k.value(states.at(-1)!)
          const o = k.value(original.at(-1)!)
          return { label: k.label, withChanges: k.show(a), original: k.show(o), tone: Math.abs(a - o) < 1e-4 ? 'flat' : a > o === k.goodWhenUp ? 'good' : 'bad' }
        }),
      }
    : null
  const s = states[states.length - 1]
  const b = base[base.length - 1]
  const changed = decisions.length > 0
  const policy: Policy = { ...policyAt(decisions, year + 1), ...draft }
  const hasDraft = Object.keys(draft).length > 0

  // Aperçu : ce que la décision en préparation changerait l'an prochain.
  const preview = useMemo(() => {
    if (!hasDraft || year >= END) {
      return null
    }
    const without = simulate({ decisions, events, until: year + 1, params }).at(-1)!
    const withDraft = simulate({ decisions: [...decisions, { year: year + 1, patch: draft }], events, until: year + 1, params }).at(-1)!
    return {
      deficit: withDraft.deficit - without.deficit,
      unemployment: withDraft.unemployment - without.unemployment,
      poverty: withDraft.poverty - without.poverty,
      discontent: withDraft.discontent,
      ending: withDraft.ending,
    }
  }, [hasDraft, decisions, events, year, draft, params])

  // Avancer le temps, une année à la fois, pour voir la France changer.
  // Une crise de la dette met la partie en pause : le joueur doit choisir sa réponse.
  const lost = states.find((x) => x.ending)
  const gameOver = !sandbox && lost && year >= lost.year ? lost : null
  const crisisPending = s.debtCrisis && !handled.includes(year) && !gameOver
  const running = target !== null && year < target && !crisisPending && !gameOver
  // Les longs voyages vont plus vite : on voit défiler les années sans attendre.
  const delay = target !== null && target - year > 6 ? 140 : 380
  useEffect(() => {
    if (!running) {
      return
    }
    const id = window.setTimeout(() => setYear((y) => y + 1), delay)
    return () => window.clearTimeout(id)
  }, [running, year, delay])

  // Une idée reçue jouée : le même scénario prolongé jusqu'en 2050, pour voir le long terme.
  const longRun = useMemo(() => {
    if (!verdict) {
      return null
    }
    return {
      s: simulate({ decisions: [{ year: verdict.start, patch: verdict.mission.patch }], events, until: LONG_RUN, params }).at(-1)!,
      b: simulate({ decisions: [], events, until: LONG_RUN, params }).at(-1)!,
    }
  }, [verdict, events, params])

  const closeIntro = () => {
    setIntro(false)
    try {
      window.localStorage.setItem(INTRO_KEY, '1')
    } catch {
      // Le navigateur refuse le stockage : on reverra simplement l'introduction.
    }
  }

  const setOverride = (id: string, value: number | null) =>
    setOverrides((o) => {
      const next = { ...o }
      if (value === null) {
        delete next[id]
      } else {
        next[id] = value
      }
      return next
    })

  const advance = (years: number) => {
    if (hasDraft) {
      setDecisions((ds) => [...ds, { year: year + 1, patch: draft }])
      setDraft({})
    }
    setTarget(Math.min(END, year + years))
  }

  const reset = () => {
    setDecisions([])
    setEvents([])
    setDraft({})
    setYear(START)
    setTarget(null)
    setVerdict(null)
    setHandled([])
    setSandbox(false)
  }

  const fire = (id: string) => {
    setEvents((es) => [...es, { year: year + 1, id }])
    setTarget(Math.min(END, year + 1))
  }

  const play = (m: Mission) => {
    setMissionsOpen(false)
    setDecisions([{ year: START + 1, patch: m.patch }])
    setEvents([])
    setDraft({})
    setYear(START)
    setTarget(START + 1 + MISSION_YEARS)
    setHandled([])
    setSandbox(false)
    setVerdict({ mission: m, start: START + 1 })
  }

  const setLever = (key: PolicyKey, value: number) => {
    const current = policyAt(decisions, year + 1)[key]
    setDraft((d) => {
      const next = { ...d }
      if (Math.abs(value - (current as number)) < 1e-9) {
        delete next[key]
      } else {
        next[key] = value
      }
      return next
    })
  }

  const showVerdict = verdict && !running && !crisisPending && !gameOver && year >= verdict.start + MISSION_YEARS

  // Revenir juste avant la dernière décision, pour tenter autre chose.
  const undoLast = () => {
    const last = [...decisions].sort((x, y) => y.year - x.year)[0]
    if (!last) {
      return
    }
    setDecisions((ds) => ds.filter((d) => d !== last))
    setYear(Math.max(START, last.year - 1))
    setTarget(null)
    setHandled((h) => h.filter((y) => y < last.year))
    setVerdict(null)
  }

  const respond = (patch: Partial<Policy> | null) => {
    if (patch) {
      setDecisions((ds) => [...ds, { year: year + 1, patch }])
    }
    setHandled((h) => [...h, year])
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">🇫🇷</span>
          <div>
            <strong>France·Sim</strong>
            <small>Comment marche vraiment un pays ?</small>
          </div>
        </div>
        <div className="clock">
          <span className="year" title={year > RELIABLE_UNTIL ? 'Au-delà de 2040, le simulateur montre des tendances, pas des prévisions.' : undefined}>
            {year}
            {year > RELIABLE_UNTIL ? <small className="year-tag">tendance</small> : null}
          </span>
          <div className="time-buttons">
            {running ? (
              <button type="button" onClick={() => setTarget(year)}>
                ⏸ Pause
              </button>
            ) : (
              <>
                <button type="button" onClick={() => advance(1)} disabled={year >= END}>
                  ▶ 1 an
                </button>
                <button type="button" onClick={() => advance(5)} disabled={year >= END}>
                  ⏩ 5 ans
                </button>
                <button type="button" onClick={() => advance(10)} disabled={year >= END}>
                  ⏩ 10 ans
                </button>
                <button type="button" onClick={() => advance(END - year)} disabled={year >= END} title={`Avancer jusqu’en ${END}`}>
                  ⏭ {END}
                </button>
              </>
            )}
            <button type="button" className="ghost" onClick={reset} title="Recommencer en 2025">
              ↺
            </button>
          </div>
        </div>
        <div className="top-actions">
          <button type="button" className="primary" onClick={() => setMissionsOpen(true)}>
            💡 Idées reçues
          </button>
          <button type="button" className="ghost" onClick={() => setBrain({ focus: null })}>
            🧠 Le modèle
          </button>
          <button type="button" className="ghost levers-toggle" onClick={() => setLeversOpen(!leversOpen)}>
            🎛️ Leviers
          </button>
        </div>
      </header>

      {variant ? (
        <div className="variant-bar">
          🧪 Vous jouez avec une variante du modèle ({Object.keys(overrides).length} paramètre{Object.keys(overrides).length > 1 ? 's' : ''} modifié
          {Object.keys(overrides).length > 1 ? 's' : ''}).
          <button type="button" className="ghost small" onClick={() => setBrain({ focus: null })}>
            Voir
          </button>
          <button type="button" className="ghost small" onClick={() => setOverrides({})}>
            Revenir au modèle d’origine
          </button>
        </div>
      ) : null}

      <main className="layout">
        <aside className={leversOpen ? 'levers is-open' : 'levers'}>
          <div className="levers-head">
            <h2>Vos décisions</h2>
            <p>Bougez un levier, puis avancez d’un an : la décision s’applique en {year + 1}.</p>
          </div>
          {preview ? (
            <div className="preview">
              <strong>Effet estimé en {year + 1}</strong>
              <span className={preview.deficit > 0 ? 'bad' : 'good'}>Déficit {sbn(preview.deficit)}</span>
              <span className={preview.unemployment > 0 ? 'bad' : 'good'}>Chômage {num(preview.unemployment * 100, 2)} pt</span>
              <span className={preview.poverty > 0 ? 'bad' : 'good'}>Pauvreté {num(preview.poverty * 100, 2)} pt</span>
              <span className={preview.discontent >= 0.6 ? 'bad' : ''}>
                Climat social {preview.discontent >= 1 ? 'explosif' : preview.discontent >= 0.6 ? 'tendu' : 'calme'} ({num(preview.discontent, 2)})
              </span>
              {preview.ending ? <strong className="bad">⚠️ {ENDINGS[preview.ending].title} : la partie serait perdue en {year + 1}.</strong> : null}
              <button type="button" className="ghost small" onClick={() => setDraft({})}>
                Annuler les changements
              </button>
            </div>
          ) : null}
          {LEVER_GROUPS.map((g) => (
            <details key={g.id} className="lever-group" open={g.id === 'impots'}>
              <summary>
                <span>{g.icon}</span> {g.label}
              </summary>
              {g.levers.map((l) => {
                const v = policy[l.key] as number
                const moved = Math.abs(v - (BASE_POLICY[l.key] as number)) > 1e-9
                return (
                  <label key={l.key} className={`lever${l.key in draft ? ' is-draft' : moved ? ' is-moved' : ''}${hint === l.key ? ' show-hint' : ''}`}>
                    <span className="lever-top">
                      <span>{l.label}</span>
                      <span className="lever-value">
                        <strong>{formatLever(l, v)}</strong>
                        <button
                          type="button"
                          className="hint-toggle"
                          aria-label={`Explication : ${l.label}`}
                          aria-expanded={hint === l.key}
                          onClick={(e) => {
                            e.preventDefault()
                            setHint(hint === l.key ? null : l.key)
                          }}
                        >
                          ⓘ
                        </button>
                      </span>
                    </span>
                    <input type="range" min={l.min} max={l.max} step={l.step} value={v} onChange={(e) => setLever(l.key, Number(e.target.value))} />
                    {hint === l.key ? <small>{l.hint}</small> : null}
                  </label>
                )
              })}
            </details>
          ))}
          <details className="lever-group">
            <summary>
              <span>✂️</span> Annuler une partie de la dette
            </summary>
            <p className="lever-note">Une annulation est un coup unique, appliqué l’an prochain.</p>
            <div className="cancel-buttons">
              {(['bce', 'monde', 'assureurs', 'banques'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  className={draft.cancelHolder === h ? 'chip is-on' : 'chip'}
                  onClick={() => setDraft((d) => ({ ...d, cancelHolder: h, cancelShare: h === 'monde' ? 0.5 : 1 }))}
                >
                  {h === 'bce' ? 'Celle de la BCE' : h === 'monde' ? 'La moitié de celle des étrangers' : h === 'assureurs' ? 'Celle de l’assurance-vie' : 'Celle des banques'}
                </button>
              ))}
            </div>
          </details>
        </aside>

        <section className="center">
          {intro ? (
            <div className="intro">
              <div>
                <h2>Bienvenue : vous gouvernez la France à partir de 2025</h2>
                <ol>
                  <li>
                    <strong>Décidez</strong> : bougez les leviers (impôts, dépenses, retraites, énergie…), ou testez une <em>idée reçue</em>.
                  </li>
                  <li>
                    <strong>Avancez</strong> d’un an, de 5, de 10, ou jusqu’en {END} : le pays réagit, année après année.
                  </li>
                  <li>
                    <strong>Comprenez</strong> : chaque chiffre est comparé à « si on n’avait rien changé ». Cliquez sur un indicateur pour voir ce qui le fait bouger.
                  </li>
                </ol>
                <p className="note">
                  Un simulateur, pas une boule de cristal : il montre des mécanismes et des ordres de grandeur. Toutes ses hypothèses sont visibles et modifiables dans « 🧠 Le
                  modèle ».
                </p>
              </div>
              <button type="button" className="primary" onClick={closeIntro}>
                C’est parti
              </button>
            </div>
          ) : null}
          <Kpis states={states} base={base} changed={changed} onPick={(node) => setBrain({ focus: node })} />
          <div className="map-card">
            <div className="map-head">
              <h2>Où circule l’argent en {year}</h2>
              <p>Plus un trait est épais et rapide, plus le flux est gros. Cliquez sur un acteur pour voir ce qui entre et ce qui sort.</p>
            </div>
            <FlowMap state={s} base={changed ? b : null} onOpen={(a) => {
              setTab(ACTOR_TAB[a] ?? 'budget')
              document.querySelector('.side')?.scrollIntoView({ behavior: 'smooth' })
            }} />
          </div>
          <div className="events">
            <h2>Le monde réagit</h2>
            <div className="event-buttons">
              {EVENTS.map((e) => (
                <button key={e.id} type="button" className="event" onClick={() => fire(e.id)} disabled={year >= END || running} title={e.summary}>
                  <span>{e.icon}</span>
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="side">
          <nav className="tabs" aria-label="Analyses">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'groupes' ? <GroupsPanel s={s} b={b} changed={changed} /> : null}
          {tab === 'courbes' ? (
            <Trajectory
              states={states}
              base={base}
              decisions={decisions}
              events={events}
              reliableUntil={RELIABLE_UNTIL}
              extra={(kpiId) =>
                changed && KPI_FOCUS[kpiId] && year > START ? (
                  <Robustness
                    key={`${kpiId}-${year}-${decisions.length}`}
                    input={{ decisions, events, until: year, params }}
                    metrics={[FOCUS_METRICS[KPI_FOCUS[kpiId]]]}
                    onInspect={(id) => setBrain({ focus: null, view: 'parametres', query: id })}
                  />
                ) : null
              }
            />
          ) : null}
          {tab === 'budget' ? <BudgetPanel s={s} b={b} changed={changed} /> : null}
          {tab === 'dette' ? <DebtPanel s={s} b={b} changed={changed} /> : null}
          {tab === 'entreprises' ? <FirmsPanel s={s} b={b} changed={changed} /> : null}
          {tab === 'monde' ? <WorldPanel s={s} b={b} changed={changed} /> : null}
          {tab === 'journal' ? <JournalPanel states={states} base={base} /> : null}
        </section>
      </main>

      {missionsOpen ? (
        <div className="modal-backdrop" onClick={() => setMissionsOpen(false)} role="presentation">
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Idées reçues">
            <header>
              <h2>Idées reçues : et si on essayait ?</h2>
              <button type="button" className="close" onClick={() => setMissionsOpen(false)} aria-label="Fermer">
                ✕
              </button>
            </header>
            <p className="modal-lead">Choisissez une idée : le jeu l’applique en {START + 1}, fait tourner la France pendant {MISSION_YEARS} ans, puis vous dit ce qui se passe vraiment.</p>
            <div className="missions">
              {MISSIONS.map((m) => (
                <button key={m.id} type="button" className="mission" onClick={() => play(m)}>
                  <span className="mission-icon">{m.icon}</span>
                  <strong>{m.title}</strong>
                  <small>« {m.belief} »</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {verdict && running ? (
        <div className="playing-banner">
          {verdict.mission.icon} {verdict.mission.title} — la France avance… {year}
        </div>
      ) : null}

      {gameOver && gameOver.ending ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal ending" role="dialog" aria-modal="true" aria-label="Partie perdue">
            <header>
              <div>
                <p className="eyebrow">
                  {ENDINGS[gameOver.ending].icon} Partie perdue · {gameOver.year}
                </p>
                <h2>{ENDINGS[gameOver.ending].title}</h2>
              </div>
            </header>
            <p className="belief">{ENDINGS[gameOver.ending].text}</p>
            <h3>Comment on en est arrivé là</h3>
            <ul className="mechanism">
              {ENDINGS[gameOver.ending].chain.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <dl className="facts ending-facts">
              <div>
                <dt>Climat social (1 = révolte)</dt>
                <dd>{num(gameOver.discontent, 2)}</dd>
              </div>
              <div>
                <dt>Prélèvements publics</dt>
                <dd>
                  {num(gameOver.taxBurden * 100, 1)} % du PIB ({num((gameOver.taxBurden - states[0].taxBurden) * 100, 1)} pt depuis 2025)
                </dd>
              </div>
              <div>
                <dt>Niveau de vie médian</dt>
                <dd>{num(((gameOver.medianIncome / states[0].medianIncome) - 1) * 100, 1)} % depuis 2025</dd>
              </div>
              <div>
                <dt>Chômage · inflation</dt>
                <dd>
                  {num(gameOver.unemployment * 100, 1)} % · {num(gameOver.inflation * 100, 1)} %
                </dd>
              </div>
              <div>
                <dt>Dette · taux à 10 ans</dt>
                <dd>
                  {num(gameOver.debtRatio * 100, 0)} % du PIB · {num(gameOver.rate * 100, 1)} %
                </dd>
              </div>
              {gameOver.evasion > 0.01 ? (
                <div>
                  <dt>Impôts qui échappent au fisc</dt>
                  <dd>{num(gameOver.evasion * 100, 0)} %</dd>
                </div>
              ) : null}
            </dl>
            <div className="verdict-actions">
              {decisions.length ? (
                <button type="button" className="primary" onClick={undoLast}>
                  ↶ Revenir avant ma dernière décision
                </button>
              ) : null}
              <button type="button" className={decisions.length ? 'ghost' : 'primary'} onClick={reset}>
                ↺ Recommencer en 2025
              </button>
              <button type="button" className="ghost" onClick={() => setSandbox(true)}>
                Continuer quand même (bac à sable)
              </button>
              <button type="button" className="ghost" onClick={() => setBrain({ focus: 'ending' })}>
                🧠 Voir ce qui y mène
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {crisisPending ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal crisis" role="dialog" aria-modal="true" aria-label="Crise de la dette">
            <header>
              <div>
                <p className="eyebrow">⚠️ Crise de la dette · {year}</p>
                <h2>Les prêteurs ne suivent plus</h2>
              </div>
            </header>
            <p>
              La dette atteint {num(s.debtRatio * 100, 0)} % du PIB et le solde public est trop loin de ce qui la stabiliserait. Les marchés exigent{' '}
              {num(s.rate * 100, 1)} % pour prêter à 10 ans, les banques et l’assurance-vie perdent une partie de la valeur de leurs obligations. Que faites-vous ?
            </p>
            <div className="crisis-options">
              <button type="button" className="crisis-option" onClick={() => respond(policyAt(decisions, year + 1).crisisResponse === 1 ? { crisisResponse: 0 } : null)}>
                <strong>🇪🇺 Accepter le plan d’aide européen</strong>
                <small>
                  Le MES prête et la BCE rachète la dette : les taux redescendent. En échange, des économies imposées pendant 3 ans (dépenses en moins, impôts en plus). C’est ce
                  qu’ont vécu la Grèce, l’Irlande et le Portugal.
                </small>
              </button>
              <button type="button" className="crisis-option" onClick={() => respond({ crisisResponse: 1 })}>
                <strong>✋ Refuser l’aide et garder la main</strong>
                <small>Pas d’économies imposées, mais la France continue d’emprunter au prix fort : la dette grossit plus vite, et une nouvelle crise peut suivre.</small>
              </button>
              <button type="button" className="crisis-option" onClick={() => respond({ crisisResponse: 1, cancelShare: 0.5, cancelHolder: 'monde' })}>
                <strong>✂️ Faire défaut sur la moitié de la dette étrangère</strong>
                <small>La dette baisse d’un coup, mais la France perd la confiance des prêteurs pour des années et devra trouver en France l’argent qu’ils prêtaient.</small>
              </button>
              <button type="button" className="crisis-option" onClick={() => respond({ crisisResponse: 1, cancelShare: 0.3, cancelHolder: 'assureurs' })}>
                <strong>🏦 Faire payer les épargnants (comme Chypre en 2013)</strong>
                <small>30 % de la dette détenue par l’assurance-vie est effacée : ce sont les économies des ménages, surtout aisés, qui paient.</small>
              </button>
            </div>
            <p className="note">Votre choix s’applique dès {year + 1}. Sans réponse de votre part (idées reçues, simulations), le modèle suppose que la France accepte le plan. Le journal et l’onglet « Dette » montrent la suite.</p>
          </div>
        </div>
      ) : null}

      {showVerdict && verdict ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal verdict" role="dialog" aria-modal="true" aria-label="Ce qui se passe vraiment">
            <header>
              <div>
                <p className="eyebrow">
                  {verdict.mission.icon} Idée reçue · {verdict.start}–{verdict.start + MISSION_YEARS}
                </p>
                <h2>{verdict.mission.title}</h2>
              </div>
              <button type="button" className="close" onClick={() => setVerdict(null)} aria-label="Fermer">
                ✕
              </button>
            </header>
            <p className="belief">On pense que : « {verdict.mission.belief} »</p>
            <h3>Ce qui se passe vraiment</h3>
            <ul className="mechanism">
              {verdict.mission.mechanism.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <div className="verdict-grid">
              {[
                { label: 'Après 2 ans', t: verdict.start + 1 - START },
                { label: `Après ${MISSION_YEARS} ans`, t: verdict.start + MISSION_YEARS - START },
              ].map((h) => (
                <div key={h.label}>
                  <h4>{h.label}</h4>
                  <ul className="lines">
                    {verdict.mission.focus.map((f) => {
                      const line = focusLine(f, states[h.t], base[h.t])
                      return (
                        <li key={f} className={`tone-${line.tone}`}>
                          <span>{line.label}</span>
                          <strong>{line.delta}</strong>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
            {longRun ? (
              <div className="long-run">
                <h4>Et en {LONG_RUN} ? (tendance)</h4>
                <ul className="lines">
                  {verdict.mission.focus.map((f) => {
                    const line = focusLine(f, longRun.s, longRun.b)
                    return (
                      <li key={f} className={`tone-${line.tone}`}>
                        <span>{line.label}</span>
                        <strong>{line.delta}</strong>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            <p className="note">Écarts par rapport à la même France sans cette décision. Pour voir toute la trajectoire, continuez la partie et ouvrez l’onglet « Courbes ».</p>
            {verdict.mission.limits ? <p className="limits">⚠️ {verdict.mission.limits}</p> : null}
            <Robustness
              input={{ decisions: [{ year: verdict.start, patch: verdict.mission.patch }], events, until: verdict.start + MISSION_YEARS, params }}
              metrics={verdict.mission.focus.map((f) => FOCUS_METRICS[f])}
              onInspect={(id) => setBrain({ focus: null, view: 'parametres', query: id })}
            />
            <div className="verdict-actions">
              <button type="button" className="primary" onClick={() => setVerdict(null)}>
                Continuer la partie
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setVerdict(null)
                  setMissionsOpen(true)
                }}
              >
                Tester une autre idée
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {brain ? (
        <Brain
          focus={brain.focus}
          onFocus={(focus) => setBrain({ focus })}
          overrides={overrides}
          onOverride={setOverride}
          onReset={() => setOverrides({})}
          impact={impact}
          state={s}
          baseState={changed ? b : null}
          policy={policyAt(decisions, year)}
          initialView={brain.view}
          initialQuery={brain.query}
          onClose={() => setBrain(null)}
        />
      ) : null}
    </div>
  )
}

export default App
