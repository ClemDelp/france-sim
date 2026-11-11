import { useEffect, useMemo, useState } from 'react'
import { BASE_POLICY } from './model/calibration'
import type { Overrides } from './model/params'
import { simulate } from './model/sim'
import { Brain, type View } from './ui/Brain'
import { About } from './ui/game/About'
import { Home } from './ui/game/Home'
import { UpdateBanner } from './ui/game/UpdateBanner'
import { Duel } from './duel/Duel'
import { Friends, GuestScreen, HostScreen, HotSeat } from './duel/Friends'

/**
 * Les écrans : l'accueil, le duel contre l'IA (lien #duel), « À propos du jeu » (#apropos), et jouer avec un ami (#ami) :
 * créer une partie en ligne (#heberger/CODE), la rejoindre par le lien reçu (#rejoindre/CODE), ou à deux sur ce téléphone (#local).
 * Le modèle s'ouvre par-dessus, depuis « À propos » (ou le lien #modele) : le jeu, lui, reste un jeu.
 */
type Screen = 'accueil' | 'duel' | 'apropos' | 'ami' | 'heberger' | 'rejoindre' | 'local'
type Route = { screen: Screen; code: string }

const SCREENS: Screen[] = ['duel', 'apropos', 'ami', 'heberger', 'rejoindre', 'local']

function fromHash(): Route {
  const [name, code = ''] = window.location.hash.slice(1).split('/')
  const screen = SCREENS.find((s) => s === name) ?? 'accueil'
  // Une partie en ligne sans code n'existe pas : on revient au menu « Jouer avec un ami ».
  return (screen === 'heberger' || screen === 'rejoindre') && !code ? { screen: 'ami', code: '' } : { screen, code: code.toUpperCase() }
}

function App() {
  const [{ screen, code }, setRoute] = useState<Route>(fromHash)
  /** Le modèle ouvert, et la variable à montrer (ou null : la vue d'ensemble). */
  const [model, setModel] = useState<{ focus: string | null } | null>(() => (window.location.hash === '#modele' ? { focus: null } : null))
  useEffect(() => {
    const onHash = () => setRoute(fromHash())
    // Depuis la page « Pourquoi ? » d'une carte : le modèle s'ouvre par-dessus la partie, sans la quitter.
    const onModel = (e: Event) => setModel({ focus: (e as CustomEvent<string | null>).detail })
    window.addEventListener('hashchange', onHash)
    window.addEventListener('duel:modele', onModel)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('duel:modele', onModel)
    }
  }, [])
  const go = (s: Screen, c = '') => {
    window.location.hash = s === 'accueil' ? '' : c ? `${s}/${c}` : s
    setRoute({ screen: s, code: c })
  }

  return (
    <>
      {screen === 'accueil' ? <Home onDuel={() => go('duel')} onFriends={() => go('ami')} onAbout={() => go('apropos')} /> : null}
      {screen === 'duel' ? <Duel onExit={() => go('accueil')} /> : null}
      {screen === 'ami' ? <Friends onExit={() => go('accueil')} onHost={(c) => go('heberger', c)} onJoin={(c) => go('rejoindre', c)} onLocal={() => go('local')} /> : null}
      {screen === 'heberger' ? <HostScreen key={code} code={code} onExit={() => go('accueil')} /> : null}
      {screen === 'rejoindre' ? <GuestScreen key={code} code={code} onExit={() => go('accueil')} /> : null}
      {screen === 'local' ? <HotSeat onExit={() => go('accueil')} /> : null}
      {screen === 'apropos' ? <About onBack={() => go('accueil')} onModel={() => setModel({ focus: null })} /> : null}
      {model ? <Model focus={model.focus} onClose={() => setModel(null)} /> : null}
      <UpdateBanner />
    </>
  )
}

/** Le cerveau du modèle, sur la France de 2025 : le graphe des causes, les paramètres (modifiables), les sources, le test face au passé. */
function Model({ focus: initial, onClose }: { focus: string | null; onClose: () => void }) {
  const [focus, setFocus] = useState<string | null>(initial)
  const [view] = useState<View>('graphe')
  const [overrides, setOverrides] = useState<Overrides>({})
  const state = useMemo(() => simulate({ decisions: [], events: [], until: 2025, params: overrides }).at(-1)!, [overrides])
  return (
    <Brain
      focus={focus}
      onFocus={setFocus}
      overrides={overrides}
      onOverride={(id, value) =>
        setOverrides((o) => {
          const next = { ...o }
          if (value === null) {
            delete next[id]
          } else {
            next[id] = value
          }
          return next
        })
      }
      onReset={() => setOverrides({})}
      impact={null}
      state={state}
      baseState={null}
      policy={BASE_POLICY}
      initialView={view}
      onClose={onClose}
    />
  )
}

export default App
