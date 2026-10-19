import { useEffect, useMemo, useState } from 'react'
import { BASE_POLICY } from './model/calibration'
import { EVENTS } from './model/events'
import type { Overrides } from './model/params'
import { policyAt, simulate } from './model/sim'
import type { Actor, Decision, FiredEvent, Policy, PolicyKey } from './model/types'
import { Brain, type Impact } from './ui/Brain'
import { FlowMap } from './ui/FlowMap'
import { num, sbn } from './ui/format'
import { Kpis } from './ui/Kpis'
import { KPIS } from './ui/indicators'
import { formatLever, LEVER_GROUPS } from './ui/levers'
import { MISSIONS, type Mission } from './ui/missions'
import { BudgetPanel, DebtPanel, GroupsPanel, JournalPanel, WorldPanel } from './ui/Panels'
import { focusLine } from './ui/story'
import { Trajectory } from './ui/Trajectory'

const START = 2025
const END = 2075
/** Au-delà, le simulateur montre des tendances (démographie, dette), pas des prévisions. */
const RELIABLE_UNTIL = 2040
const LONG_RUN = 2050
const MISSION_YEARS = 10
const INTRO_KEY = 'france-sim:intro-vue'

type Tab = 'groupes' | 'courbes' | 'budget' | 'dette' | 'monde' | 'journal'
const TABS: { id: Tab; label: string }[] = [
  { id: 'groupes', label: 'Qui gagne, qui perd' },
  { id: 'courbes', label: 'Courbes' },
  { id: 'budget', label: 'Budget' },
  { id: 'dette', label: 'Dette' },
  { id: 'monde', label: 'Énergie et monde' },
  { id: 'journal', label: 'Journal' },
]

const ACTOR_TAB: Partial<Record<Actor, Tab>> = { menages: 'groupes', etat: 'budget', secu: 'budget', bce: 'dette', banques: 'dette', monde: 'monde', energie: 'monde', entreprises: 'budget' }

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
  const [brain, setBrain] = useState<{ focus: string | null } | null>(null)
  const [intro, setIntro] = useState(() => !linked && !introSeen())

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
    }
  }, [hasDraft, decisions, events, year, draft, params])

  // Avancer le temps, une année à la fois, pour voir la France changer.
  const running = target !== null && year < target
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

  const showVerdict = verdict && !running && year >= verdict.start + MISSION_YEARS

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
                  <label key={l.key} className={l.key in draft ? 'lever is-draft' : moved ? 'lever is-moved' : 'lever'} title={l.hint}>
                    <span className="lever-top">
                      <span>{l.label}</span>
                      <strong>{formatLever(l, v)}</strong>
                    </span>
                    <input type="range" min={l.min} max={l.max} step={l.step} value={v} onChange={(e) => setLever(l.key, Number(e.target.value))} />
                    <small>{l.hint}</small>
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
              <p>Plus un trait est épais et rapide, plus le flux est gros. Touchez un acteur pour le détail.</p>
            </div>
            <FlowMap state={s} onPick={(a) => setTab(ACTOR_TAB[a] ?? 'budget')} />
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
          {tab === 'courbes' ? <Trajectory states={states} base={base} decisions={decisions} events={events} reliableUntil={RELIABLE_UNTIL} /> : null}
          {tab === 'budget' ? <BudgetPanel s={s} b={b} changed={changed} /> : null}
          {tab === 'dette' ? <DebtPanel s={s} b={b} changed={changed} /> : null}
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
          onClose={() => setBrain(null)}
        />
      ) : null}
    </div>
  )
}

export default App
