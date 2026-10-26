import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { BASE_POLICY } from './model/calibration'
import { EVENTS, rollEvents } from './model/events'
import type { Overrides } from './model/params'
import { policyAt, simulate } from './model/sim'
import type { Actor, Decision, FiredEvent, Policy, PolicyKey } from './model/types'
import { Brain, type Impact, type View } from './ui/Brain'
import { FlowMap } from './ui/FlowMap'
import { num } from './ui/format'
import { Kpis } from './ui/Kpis'
import { KPIS } from './ui/indicators'
import { formatLever, LEVER_GROUPS } from './ui/levers'
import { MISSIONS, type Mission } from './ui/missions'
import { BudgetPanel, ClimatePanel, DebtPanel, FirmsPanel, GroupsPanel, JournalPanel, MigrationPanel, WorldPanel } from './ui/Panels'
import { DOCTRINES } from './ui/doctrines'
import { ENDINGS } from './ui/endings'
import { focusLine } from './ui/story'
import { ACHIEVEMENTS } from './game/achievements'
import { adviseDraft, adviseState, type Advice } from './game/advisors'
import { adviceDetail } from './game/adviceDetail'
import { AdviceDetail } from './ui/game/AdviceDetail'
import { headline } from './game/headlines'
import { evaluate, SCENARIOS, type Scenario } from './game/scenarios'
import { electionAt, isElectionYear, nextElection, popularity } from './game/score'
import { loadGame, saveGame } from './game/savegame'
import { load, save } from './game/storage'
import { CANCEL_COST, politicalCapital, reformCost } from './game/capital'
import { Ambiance } from './ui/game/Ambiance'
import { Explain } from './ui/game/Explain'
import { Briefing, Home, Stars } from './ui/game/Home'
import { Confetti, Council, Counter, EventFeed, Newspaper, Objectives, Popularity, Toasts } from './ui/game/Hud'
import { PhoneNav } from './ui/game/Phone'
import { usePhone, type PhoneView } from './ui/game/usePhone'
import { Tour, type TourStep } from './ui/game/Tour'
import { UpdateBanner } from './ui/game/UpdateBanner'
import { candidateById, promisePatch, type Candidate, type Pledge } from './game/candidates'
import { eventsBeforeMandate, MANDATE_END, MANDATE_START } from './game/mandate'
import { CandidateBriefing, CompareMandates, MandateReport, PledgesPanel } from './ui/game/Candidates'
import { Robustness } from './ui/Robustness'
import { FOCUS_METRICS, KPI_FOCUS } from './ui/robustnessMetrics'
import { Trajectory } from './ui/Trajectory'

const START = 2025
const END = 2075
/** Au-delà, le simulateur montre des tendances (démographie, dette), pas des prévisions. */
const RELIABLE_UNTIL = 2040
/** L'horizon du long terme des idées reçues : avant que la France « sans rien changer » ne connaisse elle-même crise et révolte (vers 2047-2050), ce qui fausserait la comparaison. */
const LONG_RUN = 2040
const MISSION_YEARS = 10

type Tab = 'groupes' | 'courbes' | 'climat' | 'immigration' | 'budget' | 'dette' | 'entreprises' | 'monde' | 'journal'
const TABS: { id: Tab; label: string }[] = [
  { id: 'groupes', label: 'Qui gagne, qui perd' },
  { id: 'courbes', label: 'Courbes' },
  { id: 'climat', label: 'Climat' },
  { id: 'immigration', label: 'Immigration' },
  { id: 'budget', label: 'Budget' },
  { id: 'dette', label: 'Dette' },
  { id: 'entreprises', label: 'Entreprises' },
  { id: 'monde', label: 'Énergie et monde' },
  { id: 'journal', label: 'Journal' },
]

const ACTOR_TAB: Partial<Record<Actor, Tab>> = { menages: 'groupes', etat: 'budget', secu: 'budget', bce: 'dette', banques: 'dette', monde: 'climat', energie: 'monde', entreprises: 'entreprises' }

/** Un cran de plus ou de moins sur un levier, arrondi au pas du curseur (sans erreur d'arrondi qui s'accumule). */
const stepLever = (l: { min: number; max: number; step: number }, v: number, dir: 1 | -1) => {
  const n = Math.round((v - l.min) / l.step) + dir
  return Math.min(l.max, Math.max(l.min, Number((l.min + n * l.step).toFixed(6))))
}

type Verdict = { mission: Mission; start: number }

/** Un lien #idee=<id> lance directement une idée reçue (pratique pour la partager). */
const linked = MISSIONS.find((m) => m.id === new URLSearchParams(window.location.hash.slice(1)).get('idee'))

/** Comment on joue : partie libre (avec élections), idée reçue (10 ans, sans élection), ou scénario à objectifs. */
type Mode = { kind: 'free' } | { kind: 'myth' } | { kind: 'scenario'; scenario: Scenario } | { kind: 'candidate'; candidate: Candidate }

/** La partie laissée en cours à la dernière visite (sauf si un lien lance une idée reçue). */
const SAVED = linked ? null : loadGame(START, END)
const SAVED_SCENARIO = SCENARIOS.find((s) => s.id === SAVED?.mode)
const SAVED_CANDIDATE = SAVED?.mode.startsWith('candidat:') ? candidateById(SAVED.mode.slice('candidat:'.length)) : undefined
/** Un lien #candidat=<id> ouvre directement la présentation d'un candidat (pratique pour la partager). */
const linkedCandidate = candidateById(new URLSearchParams(window.location.hash.slice(1)).get('candidat'))

const STAR_TITLES = ['Mission échouée', 'Peut mieux faire', 'Beau mandat', 'Mandat historique !']

/** Les quatre chiffres qui résument l'effet d'une variante du modèle. */
const IMPACT_KPIS = ['gdp', 'unemployment', 'debt', 'poverty']

function App() {
  const [decisions, setDecisions] = useState<Decision[]>(linked ? [{ year: START + 1, patch: linked.patch }] : (SAVED?.decisions ?? []))
  const [events, setEvents] = useState<FiredEvent[]>(SAVED?.events ?? [])
  const [year, setYear] = useState(SAVED?.year ?? START)
  const [draft, setDraft] = useState<Partial<Policy>>(SAVED?.draft ?? {})
  const [tab, setTab] = useState<Tab>('groupes')
  const [missionsOpen, setMissionsOpen] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(linked ? { mission: linked, start: START + 1 } : null)
  const [target, setTarget] = useState<number | null>(linked ? START + 1 + MISSION_YEARS : null)
  const [leversOpen, setLeversOpen] = useState(false)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [brain, setBrain] = useState<{ focus: string | null; view?: View; query?: string } | null>(null)
  const [mode, setMode] = useState<Mode>(linked ? { kind: 'myth' } : SAVED_SCENARIO ? { kind: 'scenario', scenario: SAVED_SCENARIO } : SAVED_CANDIDATE ? { kind: 'candidate', candidate: SAVED_CANDIDATE } : { kind: 'free' })
  const [home, setHome] = useState(!linked)
  const [briefing, setBriefing] = useState<Scenario | null>(null)
  const [tour, setTour] = useState(false)
  const [playerName, setPlayerName] = useState(() => load('name', ''))
  const [stars, setStars] = useState<Record<string, number>>(() => load('stars', {}))
  const [seen, setSeen] = useState<string[]>(() => load('achievements', []))
  const [myths, setMyths] = useState(() => load('myths', 0))
  const [openedModel, setOpenedModel] = useState(() => load('openedModel', false))
  /** Les élections dont le joueur a vu le résultat. */
  const [electionsSeen, setElectionsSeen] = useState<number[]>(SAVED?.electionsSeen ?? [])
  /** La graine du tirage au sort des événements : une partie différente à chaque fois. */
  const [seed, setSeed] = useState(() => SAVED?.seed ?? Math.floor(Math.random() * 1e9))
  /** La fenêtre « Pourquoi ? » est ouverte. */
  const [why, setWhy] = useState(false)
  /** Les années de crise de la dette auxquelles le joueur a déjà répondu. */
  const [handled, setHandled] = useState<number[]>(SAVED?.handled ?? [])
  /** Le joueur a choisi de continuer après une défaite (mode bac à sable). */
  const [sandbox, setSandbox] = useState(SAVED?.sandbox ?? false)
  /** Le levier dont l'explication est ouverte (au clic, pas au survol : rien ne bouge sous la souris). */
  const [hint, setHint] = useState<string | null>(null)
  /** Sur téléphone, l'écran affiché (une zone à la fois). */
  const [view, setView] = useState<PhoneView>('pays')
  /** L'avis de ministre ouvert en détail. */
  const [adviceOpen, setAdviceOpen] = useState<Advice | null>(null)
  /** La présentation d'un candidat ouverte, et le comparateur des mandats. */
  const [candidateBriefing, setCandidateBriefing] = useState<Candidate | null>(linkedCandidate ?? null)
  const [compareOpen, setCompareOpen] = useState(false)
  const phone = usePhone()
  /** Sur téléphone, seul l'écran choisi est rendu (les autres coûteraient du calcul à chaque geste). */
  const shows = (v: PhoneView) => !phone || view === v

  const params = overrides

  // Chaque changement de la partie est sauvegardé : on la retrouve en rouvrant le jeu.
  useEffect(() => {
    if (mode.kind !== 'myth') {
      saveGame({ v: 1, mode: mode.kind === 'scenario' ? mode.scenario.id : mode.kind === 'candidate' ? `candidat:${mode.candidate.id}` : 'free', decisions, events, year, seed, draft, handled, electionsSeen, sandbox })
    }
  }, [mode, decisions, events, year, seed, draft, handled, electionsSeen, sandbox])
  const whyInput = useMemo(() => ({ decisions, events, params: overrides }), [decisions, events, overrides])
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
  // L'année prochaine sans le brouillon ne dépend pas des curseurs : calculée une fois par année.
  const nextWithout = useMemo(() => (year >= END ? null : simulate({ decisions, events, until: year + 1, params }).at(-1)!), [decisions, events, year, params])
  // L'aperçu suit le curseur avec un temps de retard si l'appareil est lent : le curseur, lui, reste fluide sous le doigt.
  const previewDraft = useDeferredValue(draft)
  const preview = useMemo(() => {
    if (Object.keys(previewDraft).length === 0 || !nextWithout) {
      return null
    }
    const without = nextWithout
    const withDraft = simulate({ decisions: [...decisions, { year: year + 1, patch: previewDraft }], events, until: year + 1, params }).at(-1)!
    return {
      deficit: withDraft.deficit - without.deficit,
      unemployment: withDraft.unemployment - without.unemployment,
      poverty: withDraft.poverty - without.poverty,
      discontent: withDraft.discontent,
      ending: withDraft.ending,
      inflation: withDraft.inflation - without.inflation,
      emissions: withDraft.frenchEmissions - without.frenchEmissions,
    }
  }, [nextWithout, decisions, events, year, previewDraft, params])

  // Avancer le temps, une année à la fois, pour voir la France changer.
  // Une crise de la dette met la partie en pause : le joueur doit choisir sa réponse.
  const lost = states.find((x) => x.ending)
  const gameOver = !sandbox && lost && year >= lost.year ? lost : null
  // Une élection tous les cinq ans (sauf pour les idées reçues et en bac à sable) : on regarde le résultat avant de continuer.
  const elections = mode.kind !== 'myth' && !sandbox
  const election = elections && isElectionYear(year) && year > START && !electionsSeen.includes(year) && !gameOver ? electionAt(s) : null
  const crisisPending = s.debtCrisis && !handled.includes(year) && !gameOver && !election
  const scenario = mode.kind === 'scenario' ? mode.scenario : null
  const candidate = mode.kind === 'candidate' ? mode.candidate : null
  const evaluation = scenario ? evaluate(scenario, states) : null
  const scenarioOver = !!scenario && !!evaluation && (evaluation.finished || !!gameOver || (!!election && !election.won))
  const running = target !== null && year < target && !crisisPending && !gameOver && !election
  // Les longs voyages vont plus vite : on voit défiler les années sans attendre.
  const delay = target !== null && target - year > 6 ? 140 : 380
  // Chaque année qui passe, le monde tire ses événements au sort (sauf pour les idées reçues, qu'on compare à monde constant).
  const randomEvents = mode.kind !== 'myth'
  useEffect(() => {
    if (!running) {
      return
    }
    const id = window.setTimeout(() => {
      if (randomEvents) {
        const fired = rollEvents(seed, year + 1, s, states[0], events)
        if (fired.length) {
          setEvents((es) => [...es, ...fired])
        }
      }
      setYear((y) => y + 1)
    }, delay)
    return () => window.clearTimeout(id)
  }, [running, year, delay, randomEvents, seed, s, states, events])

  // Une idée reçue jouée : le même scénario prolongé jusqu'en 2040, pour voir le long terme.
  const longRun = useMemo(() => {
    if (!verdict) {
      return null
    }
    return {
      s: simulate({ decisions: [{ year: verdict.start, patch: verdict.mission.patch }], events, until: LONG_RUN, params }).at(-1)!,
      b: simulate({ decisions: [], events, until: LONG_RUN, params }).at(-1)!,
    }
  }, [verdict, events, params])

  const pop = popularity(s)
  const upcoming = elections ? nextElection(year) : null
  const eventsThisYear = events.filter((e) => e.year === year).map((e) => EVENTS.find((d) => d.id === e.id)!).filter(Boolean)
  // Un candidat vient d'être élu en 2027 : c'est une élection, pas une réélection.
  const news =
    candidate && year === MANDATE_START
      ? {
          year,
          kicker: 'Présidentielle',
          title: `${candidate.name} élu·e avec ${num(electionAt(s).vote, 1)} % des voix`,
          subtitle: 'Un nouveau mandat commence : les Français attendent les promesses de campagne.',
          tone: 'good' as const,
        }
      : headline(s, states.at(-2), elections, eventsThisYear)

  // Le capital politique : combien de réformes le Parlement et l'opinion acceptent cette année.
  const current = policyAt(decisions, year + 1)
  const draftCost = Object.entries(draft).reduce((total, [key, value]) => {
    if (key === 'cancelShare') {
      return total + CANCEL_COST
    }
    const def = LEVER_GROUPS.flatMap((g) => g.levers).find((l) => l.key === key)
    return total + (def ? reformCost(def, current[def.key] as number, value as number) : 0)
  }, 0)
  const capital = mode.kind === 'myth' || sandbox ? null : politicalCapital(pop, year === START || (elections && isElectionYear(year)))
  const overBudget = capital !== null && draftCost > capital
  const advice = preview ? adviseDraft(preview) : adviseState(s, pop, upcoming ? upcoming - year : 99)
  // L'avis détaillé, recalculé si le brouillon change pendant qu'on le lit (il disparaît si on annule les changements).
  const detail = useMemo(
    () => (adviceOpen?.topic && hasDraft && year < END ? adviceDetail({ decisions, events, year, params, draft }, adviceOpen.topic) : null),
    [adviceOpen, hasDraft, decisions, events, year, params, draft],
  )

  // Les étoiles du scénario en cours comptent dès qu'il est terminé (et on garde le meilleur score).
  // Une partie perdue puis continuée en bac à sable ne rapporte pas d'étoile.
  const earnedStars = scenario && evaluation && scenarioOver ? (gameOver || sandbox || (election && !election.won) ? 0 : evaluation.stars) : null
  const allStars = useMemo(() => (scenario && earnedStars !== null ? { ...stars, [scenario.id]: Math.max(stars[scenario.id] ?? 0, earnedStars) } : stars), [scenario, earnedStars, stars])
  useEffect(() => {
    save('stars', allStars)
  }, [allStars])

  // Les succès : ceux de la partie en cours, plus ceux déjà gagnés. Les nouveaux s'affichent quelques secondes.
  const earnedNow = ACHIEVEMENTS.filter((a) => a.check({ states: candidate ? [states[0], ...states.filter((x) => x.year > MANDATE_START)] : states, elections: mode.kind !== 'myth', lost: !!gameOver || (!!election && !election.won), stars: allStars, myths, openedModel })).map((a) => a.id)
  const fresh = earnedNow.filter((id) => !seen.includes(id))
  const freshKey = fresh.join(',')
  const earned = [...new Set([...seen, ...earnedNow])]
  useEffect(() => {
    if (!freshKey) {
      return
    }
    const id = window.setTimeout(() => {
      setSeen((old) => {
        const next = [...new Set([...old, ...freshKey.split(',')])]
        save('achievements', next)
        return next
      })
    }, 4500)
    return () => window.clearTimeout(id)
  }, [freshKey])

  const openBrain = (b: { focus: string | null; view?: View; query?: string }) => {
    setBrain(b)
    if (!openedModel) {
      setOpenedModel(true)
      save('openedModel', true)
    }
  }

  const begin = (next: Mode, eventsAtStart: FiredEvent[] = [], options: { seed?: number; year?: number; electionsSeen?: number[] } = {}) => {
    setMode(next)
    setDecisions([])
    setEvents(eventsAtStart)
    setDraft({})
    setYear(options.year ?? START)
    setTarget(null)
    setVerdict(null)
    setHandled([])
    setSandbox(false)
    setElectionsSeen(options.electionsSeen ?? [])
    setSeed((x) => options.seed ?? (Math.imul(x, 1103515245) + 12345) >>> 0)
    setHome(false)
    setBriefing(null)
    setCandidateBriefing(null)
    setCompareOpen(false)
  }

  // Un candidat prend ses fonctions après l'élection de 2027 : la France a déjà vécu 2026 et 2027 (événements tirés au sort).
  const startCandidate = (c: Candidate) => {
    const nextSeed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    begin({ kind: 'candidate', candidate: c }, eventsBeforeMandate(nextSeed), { seed: nextSeed, year: MANDATE_START, electionsSeen: [MANDATE_START] })
  }

  // Inscrire une promesse au programme de l'année : ses leviers s'ajoutent à la décision en préparation.
  // Montrer les curseurs qu'une promesse vient de bouger : leur groupe s'ouvre, la liste défile jusqu'à eux, ils clignotent.
  const [flash, setFlash] = useState<string[]>([])
  const [openGroups, setOpenGroups] = useState<string[]>(['impots'])
  useEffect(() => {
    if (!flash.length) {
      return
    }
    const scroll = window.setTimeout(() => {
      const el = document.querySelector(`[data-lever="${flash[0]}"]`)
      const box = el?.closest('.levers')
      // Sur ordinateur, seule la colonne des leviers défile : le reste de l'écran ne bouge pas.
      if (el && box && box.scrollHeight > box.clientHeight + 1) {
        const r = el.getBoundingClientRect()
        const b = box.getBoundingClientRect()
        box.scrollBy({ top: r.top - b.top - (b.height - r.height) / 2, behavior: 'smooth' })
      } else {
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }, 80)
    const stop = window.setTimeout(() => setFlash([]), 2600)
    return () => {
      window.clearTimeout(scroll)
      window.clearTimeout(stop)
    }
  }, [flash])
  const showLevers = (keys: string[]) => {
    setOpenGroups((open) => [...open, ...LEVER_GROUPS.filter((g) => g.levers.some((l) => keys.includes(l.key)) || (keys.includes('cancelShare') && g.id === 'dette')).map((g) => g.id)])
    if (phone) {
      setView('decider')
    }
    setFlash([...keys])
  }
  const pledgeKeys = (p: Pledge) => Object.keys(promisePatch(p, policyAt(decisions, year + 1)).patch)
  const applyPledge = (p: Pledge) => {
    const patch = promisePatch(p, { ...policyAt(decisions, year + 1), ...draft }).patch
    setDraft((d) => ({ ...d, ...patch }))
    if (!phone) {
      showLevers(Object.keys(patch))
    }
  }
  // Retirer une promesse du programme de l'an prochain : ses leviers reviennent à la politique votée.
  const removePledge = (p: Pledge) =>
    setDraft((d) => {
      const keys = pledgeKeys(p)
      return Object.fromEntries(Object.entries(d).filter(([k]) => !keys.includes(k)))
    })

  const startScenario = (sc: Scenario) => begin({ kind: 'scenario', scenario: sc }, sc.events)

  const startTutorial = () => {
    begin({ kind: 'free' })
    setLeversOpen(true)
    setTour(true)
  }

  const recordStars = () => setStars(allStars)

  // Stable d'un rendu à l'autre : la visite ne repart pas à chaque image.
  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        title: `Bienvenue, ${playerName || 'Président·e'} !`,
        text: 'Vous venez d’arriver à l’Élysée. Chaque décision que vous prendrez fera bouger la France entière : l’emploi, les prix, la dette, la pauvreté, la colère… Voici comment piloter le pays.',
      },
      { target: '.kpis', view: 'pays', title: 'Votre tableau de bord', text: 'Les chiffres clés du pays, et leur évolution. Cliquez sur l’un d’eux pour comprendre ce qui le fait monter ou baisser.' },
      { target: '.popularity', view: 'pays', title: 'Votre popularité', text: 'Elle suit le climat social. Élection en 2027 puis tous les cinq ans : à 40 % de popularité ou moins, vous êtes battu.' },
      { target: '.levers', view: 'decider', title: 'Vos leviers', text: 'Impôts, dépenses, retraites, énergie, commerce, dette… Bougez un curseur : rien ne change tant que vous n’avancez pas dans le temps. Le ⓘ explique chaque levier.' },
      { target: '.council', view: 'decider', title: 'Le Conseil des ministres', text: 'Vos ministres réagissent à chaque décision avant que vous la preniez. Touchez un avis : vous verrez la part de chaque levier, par quels mécanismes, et qui paie. Et attention au capital politique : on ne peut pas tout réformer la même année. Plus vous êtes populaire, plus vous avez de points.' },
      { target: phone ? '.phone-play' : '.time-buttons', title: 'Le temps', text: phone ? 'Le grand bouton ▶ fait avancer d’un an. Pour plusieurs années d’un coup, ouvrez le Conseil des ministres (la ligne au-dessus).' : 'Avancez d’un an pour voir l’effet de vos choix, ou de plusieurs années d’un coup. Le jeu s’arrête de lui-même en cas de crise ou d’élection.' },
      { target: '.newspaper', view: 'pays', title: 'La une du jour', text: 'Chaque année, la presse résume ce qui s’est passé. Le journal complet est dans l’onglet « Journal ».' },
      { target: '.map-card', view: 'flux', title: 'L’argent du pays', text: 'Qui paie qui : ménages, entreprises, État, Sécu, banques, reste du monde. En vert ou rouge, ce que vos décisions ont changé.' },
      { target: '.event-feed', view: 'flux', title: 'Le monde ne vous attend pas', text: 'Canicules, guerres, krachs, percées technologiques, accords climatiques… Le jeu les tire au sort chaque année. Plus la planète chauffe, plus les catastrophes sont fréquentes.' },
      { target: '.side', view: 'analyses', title: 'Les analyses', text: 'Qui gagne, qui perd ; le budget ; la dette ; les entreprises ; les courbes sur toute la partie.' },
      { target: '.brain-button', view: 'pays', title: 'Sous le capot', text: 'Le graphe de toutes les causes, les 350 paramètres sourcés, et le modèle face au passé. Tout est ouvert et modifiable.' },
      { title: 'À vous de jouer !', text: 'Conseil : commencez par le scénario « Premier mandat » depuis le menu 🏠. Et souvenez-vous : on peut toujours revenir avant sa dernière décision.' },
    ],
    [playerName, phone],
  )

  const onTourStep = useCallback(
    (step: TourStep) => {
      if (phone && step.view) {
        setView(step.view)
      }
    },
    [phone],
  )

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

  const last = scenario ? scenario.end : candidate ? MANDATE_END : END
  const advance = (years: number) => {
    if (overBudget) {
      return
    }
    if (hasDraft) {
      setDecisions((ds) => [...ds, { year: year + 1, patch: draft }])
      setDraft({})
    }
    setTarget(Math.min(last, year + years))
    if (phone) {
      // Sur téléphone, on revient au pays pour voir ce que l'année a changé.
      setView('pays')
      window.scrollTo({ top: 0 })
    }
  }

  const reset = () => (scenario ? startScenario(scenario) : candidate ? startCandidate(candidate) : begin({ kind: 'free' }))

  const play = (m: Mission) => {
    setMissionsOpen(false)
    begin({ kind: 'myth' })
    setDecisions([{ year: START + 1, patch: m.patch }])
    setTarget(START + 1 + MISSION_YEARS)
    setVerdict({ mission: m, start: START + 1 })
    setMyths((n) => {
      save('myths', n + 1)
      return n + 1
    })
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
    const latest = [...decisions].sort((x, y) => y.year - x.year)[0]
    if (!latest) {
      return
    }
    setDecisions((ds) => ds.filter((d) => d !== latest))
    setYear(Math.max(START, latest.year - 1))
    setTarget(null)
    setHandled((h) => h.filter((y) => y < latest.year))
    setElectionsSeen((e) => e.filter((y) => y < latest.year))
    setVerdict(null)
  }

  const respond = (patch: Partial<Policy> | null) => {
    if (patch) {
      setDecisions((ds) => [...ds, { year: year + 1, patch }])
    }
    setHandled((h) => [...h, year])
  }

  const timeButtons = (
    <div className="time-buttons">
      {running ? (
        <button type="button" onClick={() => setTarget(year)}>
          ⏸ Pause
        </button>
      ) : (
        <>
          <button type="button" className="advance-main" onClick={() => advance(1)} disabled={year >= last || overBudget} title={overBudget ? "Trop de réformes d’un coup : le Parlement ne suivra pas." : undefined}>
            ▶ 1 an
          </button>
          <button type="button" onClick={() => advance(5)} disabled={year >= last || overBudget}>
            ⏩ 5 ans
          </button>
          {last - year > 5 ? (
            <button type="button" onClick={() => advance(10)} disabled={overBudget}>
              ⏩ 10 ans
            </button>
          ) : null}
          <button type="button" onClick={() => advance(last - year)} disabled={year >= last || overBudget} title={`Avancer jusqu’en ${last}`}>
            ⏭ {last}
          </button>
        </>
      )}
      <button type="button" className="ghost" onClick={reset} title={scenario ? 'Recommencer le scénario' : 'Recommencer en 2025'}>
        ↺
      </button>
    </div>
  )

  return (
    <div className="app">
      <header className="top">
        <button type="button" className="brand" onClick={() => setHome(true)} title="Menu">
          <span className="logo">🇫🇷</span>
          <div>
            <strong>France·Sim</strong>
            <small>{playerName ? `Président·e ${playerName}` : 'Comment marche vraiment un pays ?'}</small>
          </div>
        </button>
        <div className="clock">
          <span key={year} className="year year-pop" title={year > RELIABLE_UNTIL ? 'Au-delà de 2040, le simulateur montre des tendances, pas des prévisions.' : undefined}>
            {year}
            {year > RELIABLE_UNTIL ? <small className="year-tag">tendance</small> : null}
          </span>
          {phone ? null : timeButtons}
        </div>
        {elections ? <Popularity value={pop} nextElection={upcoming} year={year} /> : null}
        <div className="top-actions">
          <button type="button" className="primary" onClick={() => setHome(true)}>
            🏠 Menu
          </button>
          <button type="button" className="ghost brain-button" onClick={() => openBrain({ focus: null })}>
            <span aria-hidden="true">🧠</span>
            <span className="btn-label"> Le modèle</span>
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
          <button type="button" className="ghost small" onClick={() => openBrain({ focus: null })}>
            Voir
          </button>
          <button type="button" className="ghost small" onClick={() => setOverrides({})}>
            Revenir au modèle d’origine
          </button>
        </div>
      ) : null}

      <main className={phone ? `layout phone view-${view}` : 'layout'}>
        {shows('decider') ? (
          <aside className={leversOpen ? 'levers is-open' : 'levers'}>
            <div className="levers-head">
              <h2>Vos décisions</h2>
              <p>Bougez un levier, puis avancez d’un an : la décision s’applique en {year + 1}.</p>
            </div>
            {LEVER_GROUPS.map((g) => (
              <details key={g.id} className="lever-group" open={openGroups.includes(g.id)}>
                <summary>
                  <span>{g.icon}</span> {g.label}
                </summary>
                {g.id === 'modele' ? (
                  <div className="doctrines">
                    <p className="lever-note">Un programme complet : appliquez-le d’un coup (s’il reste du capital politique) ou petit à petit.</p>
                    {DOCTRINES.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className="doctrine"
                        title={d.text}
                        onClick={() => {
                          const base = policyAt(decisions, year + 1)
                          setDraft(Object.fromEntries(Object.entries(d.patch).filter(([k, v]) => Math.abs((base[k as PolicyKey] as number) - (v as number)) > 1e-9)))
                        }}
                      >
                        <span>{d.icon}</span>
                        <strong>{d.title}</strong>
                        <small>{d.text}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
                {g.levers.map((l) => {
                  const v = policy[l.key] as number
                  const moved = Math.abs(v - (BASE_POLICY[l.key] as number)) > 1e-9
                  const locked = scenario?.locked?.keys.includes(l.key)
                  return (
                    <label key={l.key} data-lever={l.key} className={`lever${l.key in draft ? ' is-draft' : moved ? ' is-moved' : ''}${hint === l.key ? ' show-hint' : ''}${flash.includes(l.key) ? ' is-flash' : ''}`}>
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
                      <span className="lever-input">
                        <button type="button" className="lever-step" aria-label={`${l.label} : moins`} disabled={locked || v <= l.min + 1e-9} onClick={(e) => {
                          e.preventDefault()
                          setLever(l.key, stepLever(l, v, -1))
                        }}>
                          −
                        </button>
                        <input type="range" min={l.min} max={l.max} step={l.step} value={v} disabled={locked} title={locked ? scenario?.locked?.why : undefined} onChange={(e) => setLever(l.key, Number(e.target.value))} />
                        <button type="button" className="lever-step" aria-label={`${l.label} : plus`} disabled={locked || v >= l.max - 1e-9} onClick={(e) => {
                          e.preventDefault()
                          setLever(l.key, stepLever(l, v, 1))
                        }}>
                          +
                        </button>
                      </span>
                      {hint === l.key ? <small>{l.hint}</small> : null}
                    </label>
                  )
                })}
              </details>
            ))}
            <details className="lever-group" open={openGroups.includes('dette')} data-lever="cancelShare">
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
                    disabled={scenario?.locked?.keys.includes('cancelShare')}
                  title={scenario?.locked?.keys.includes('cancelShare') ? scenario.locked.why : undefined}
                  onClick={() => setDraft((d) => ({ ...d, cancelHolder: h, cancelShare: h === 'monde' ? 0.5 : 1 }))}
                  >
                    {h === 'bce' ? 'Celle de la BCE' : h === 'monde' ? 'La moitié de celle des étrangers' : h === 'assureurs' ? 'Celle de l’assurance-vie' : 'Celle des banques'}
                  </button>
                ))}
              </div>
            </details>
          </aside>
        ) : null}

        {shows('pays') || shows('flux') ? (
          <section className="center">
            {shows('pays') && candidate ? <PledgesPanel candidate={candidate} decisions={decisions} draft={draft} year={year} capital={capital} onApply={applyPledge} onRemove={removePledge} onShow={(p) => showLevers(pledgeKeys(p))} /> : null}
            {shows('pays') && scenario && evaluation ? <Objectives scenario={scenario} year={year} start={START} evaluation={evaluation} onAbandon={() => setHome(true)} /> : null}
            {shows('pays') ? <Newspaper headline={news} onWhy={year > START ? () => setWhy(true) : undefined} /> : null}
            {shows('pays') ? <Kpis states={states} base={base} changed={changed} onPick={(node) => openBrain({ focus: node })} /> : null}
            {shows('flux') ? (
              <>
                <div className="map-card">
                  <div className="map-head">
                    <h2>Où circule l’argent en {year}</h2>
                    <p>Plus un trait est épais et rapide, plus le flux est gros. {phone ? 'Touchez' : 'Cliquez sur'} un acteur pour voir ce qui entre et ce qui sort.</p>
                  </div>
                  <FlowMap state={s} base={changed ? b : null} portrait={phone} onOpen={(a) => {
                    setTab(ACTOR_TAB[a] ?? 'budget')
                    if (phone) {
                      setView('analyses')
                      window.scrollTo({ top: 0 })
                    } else {
                      document.querySelector('.side')?.scrollIntoView({ behavior: 'smooth' })
                    }
                  }} />
                </div>
                <EventFeed events={events} year={year} states={states} scenarioEvents={scenario?.events ?? []} />
              </>
            ) : null}
          </section>
        ) : null}

        {shows('analyses') ? (
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
                      onInspect={(id) => openBrain({ focus: null, view: 'parametres', query: id })}
                    />
                  ) : null
                }
              />
            ) : null}
            {tab === 'climat' ? <ClimatePanel s={s} b={b} changed={changed} /> : null}
            {tab === 'immigration' ? <MigrationPanel s={s} b={b} changed={changed} /> : null}
            {tab === 'budget' ? <BudgetPanel s={s} b={b} changed={changed} /> : null}
            {tab === 'dette' ? <DebtPanel s={s} b={b} changed={changed} /> : null}
            {tab === 'entreprises' ? <FirmsPanel s={s} b={b} changed={changed} /> : null}
            {tab === 'monde' ? <WorldPanel s={s} b={b} changed={changed} /> : null}
            {tab === 'journal' ? <JournalPanel states={states} base={base} /> : null}
          </section>
        ) : null}
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
              <button type="button" className="ghost" onClick={() => openBrain({ focus: 'ending' })}>
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
              onInspect={(id) => openBrain({ focus: null, view: 'parametres', query: id })}
            />
            <div className="verdict-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setVerdict(null)
                  setMode({ kind: 'free' })
                }}
              >
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
      {election ? (
        <div className="modal-backdrop" role="presentation">
          <div className={`modal election ${election.won ? 'is-won' : 'is-lost'}`} role="dialog" aria-modal="true" aria-label="Soirée électorale">
            <p className="eyebrow">🗳️ Soirée électorale · {election.year}</p>
            <h2>{election.won ? (playerName ? `${playerName}, réélu·e !` : 'Réélu·e !') : 'Battu…'}</h2>
            <div className="vote">
              <strong>
                <Counter value={election.vote} /> %
              </strong>
              <div className="vote-bar">
                <span style={{ width: `${election.vote}%` }} />
                <i />
              </div>
              <small>des voix au second tour · popularité {election.popularity} %</small>
            </div>
            <p>
              {election.won
                ? 'Les Français vous renouvellent leur confiance pour cinq ans. Votre popularité suit le climat social : continuez à ménager le pouvoir d’achat, l’emploi et la paix sociale.'
                : 'Les Français ont choisi l’alternance. Votre popularité était trop basse : le climat social (baisse du niveau de vie, impôts, chômage, inflation, pauvreté, austérité) a pesé dans les urnes.'}
            </p>
            <div className="verdict-actions">
              {candidate && election.year === MANDATE_END ? (
                // Le mandat d'un candidat s'achève à cette élection, gagnée ou perdue : place au bilan.
                <button type="button" className="primary big" onClick={() => setElectionsSeen((e) => [...e, election.year])}>
                  Voir le bilan du mandat
                </button>
              ) : election.won ? (
                <button type="button" className="primary big" onClick={() => setElectionsSeen((e) => [...e, election.year])}>
                  Entamer un nouveau mandat
                </button>
              ) : (
                <>
                  {decisions.length ? (
                    <button type="button" className="primary" onClick={undoLast}>
                      ↶ Revenir avant ma dernière décision
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      recordStars()
                      reset()
                    }}
                  >
                    ↺ Recommencer
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setSandbox(true)
                      setElectionsSeen((e) => [...e, election.year])
                    }}
                  >
                    Continuer quand même (bac à sable)
                  </button>
                </>
              )}
            </div>
          </div>
          {election.won ? <Confetti /> : null}
        </div>
      ) : null}

      {scenario && evaluation && scenarioOver && !election && !gameOver && !running && earnedStars !== null ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal scenario-end" role="dialog" aria-modal="true" aria-label="Fin du scénario">
            <p className="eyebrow">
              {scenario.icon} {scenario.title} · {START}–{scenario.end}
            </p>
            <h2>{STAR_TITLES[earnedStars]}</h2>
            <Stars n={earnedStars} size="big" />
            <ul className="end-objectives">
              {evaluation.results.map((r) => (
                <li key={r.objective.label} className={r.status === 'ok' ? 'good' : 'bad'}>
                  <span>{r.status === 'ok' ? '✅' : '❌'}</span>
                  <span>{r.objective.label}</span>
                  <strong>{r.objective.show(r.value)}</strong>
                </li>
              ))}
            </ul>
            {(stars[scenario.id] ?? 0) < earnedStars ? <p className="good">🎉 Nouveau record !</p> : null}
            <div className="verdict-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  recordStars()
                  startScenario(scenario)
                }}
              >
                ↺ Rejouer
              </button>
              {SCENARIOS[SCENARIOS.indexOf(scenario) + 1] ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    recordStars()
                    setBriefing(SCENARIOS[SCENARIOS.indexOf(scenario) + 1])
                  }}
                >
                  Scénario suivant →
                </button>
              ) : null}
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  recordStars()
                  setMode({ kind: 'free' })
                }}
              >
                Continuer en partie libre
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  recordStars()
                  setHome(true)
                }}
              >
                🏠 Menu
              </button>
            </div>
          </div>
          {earnedStars >= 2 ? <Confetti /> : null}
        </div>
      ) : null}

      {home ? (
        <Home
          name={playerName}
          onName={(n) => {
            setPlayerName(n)
            save('name', n)
          }}
          stars={allStars}
          earned={earned}
          canResume={year > START || decisions.length > 0}
          onResume={() => setHome(false)}
          onTutorial={startTutorial}
          onScenario={(sc) => {
            recordStars()
            setBriefing(sc)
          }}
          onFree={() => begin({ kind: 'free' })}
          onMyths={() => {
            setHome(false)
            setMissionsOpen(true)
          }}
          onModel={() => {
            setHome(false)
            openBrain({ focus: null })
          }}
          onCandidate={setCandidateBriefing}
          onCompare={() => setCompareOpen(true)}
        />
      ) : null}

      {briefing ? <Briefing scenario={briefing} best={allStars[briefing.id] ?? 0} onStart={() => startScenario(briefing)} onBack={() => setBriefing(null)} /> : null}

      {candidateBriefing ? <CandidateBriefing candidate={candidateBriefing} onStart={() => startCandidate(candidateBriefing)} onBack={() => setCandidateBriefing(null)} /> : null}

      {compareOpen ? (
        <CompareMandates
          onClose={() => setCompareOpen(false)}
          onPick={(c) => {
            setCompareOpen(false)
            setCandidateBriefing(c)
          }}
        />
      ) : null}

      {candidate && year >= MANDATE_END && electionsSeen.includes(MANDATE_END) && !gameOver && !running && !home && !candidateBriefing && !compareOpen ? (
        <MandateReport
          candidate={candidate}
          states={states}
          base={base}
          decisions={decisions}
          onReplay={() => startCandidate(candidate)}
          onCompare={() => setCompareOpen(true)}
          onMenu={() => setHome(true)}
        />
      ) : null}

      {tour ? <Tour steps={tourSteps} onClose={() => setTour(false)} onStep={onTourStep} /> : null}

      <Council
        advice={advice}
        preview={preview}
        year={year}
        cost={draftCost}
        capital={capital}
        onCancel={() => setDraft({})}
        endingTitle={preview?.ending ? ENDINGS[preview.ending].title : null}
        phone={phone}
        controls={phone ? timeButtons : null}
        onAdvice={setAdviceOpen}
        slow={LEVER_GROUPS.flatMap((g) => g.levers).filter((l) => l.key in draft && l.delay).map((l) => l.delay!)}
      />

      {adviceOpen && detail ? (
        <AdviceDetail
          advice={adviceOpen}
          detail={detail}
          onClose={() => setAdviceOpen(null)}
          onGraph={(node) => {
            setAdviceOpen(null)
            openBrain({ focus: node })
          }}
        />
      ) : null}

      {phone ? (
        <PhoneNav
          view={view}
          onView={(v) => {
            setView(v)
            window.scrollTo({ top: 0 })
          }}
          drafts={Object.keys(draft).length}
          play={{ running, disabled: year >= last || overBudget, label: overBudget ? 'Trop de réformes' : `Passer en ${Math.min(last, year + 1)}`, onPlay: () => advance(1), onPause: () => setTarget(year) }}
        />
      ) : null}

      <Ambiance state={s} start={states[0]} eventsThisYear={eventsThisYear} />

      {why ? <Explain input={whyInput} year={year} onClose={() => setWhy(false)} /> : null}

      <Toasts items={ACHIEVEMENTS.filter((a) => fresh.includes(a.id))} />

      <UpdateBanner />

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
