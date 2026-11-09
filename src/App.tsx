import { useEffect, useMemo, useState } from 'react'
import { BASE_POLICY } from './model/calibration'
import type { Overrides } from './model/params'
import { simulate } from './model/sim'
import { Brain, type View } from './ui/Brain'
import { Home } from './ui/game/Home'
import { UpdateBanner } from './ui/game/UpdateBanner'
import { Duel } from './duel/Duel'

/** Deux écrans (l'accueil, le duel : lien #duel), et le modèle par-dessus, ouvrable de partout sans perdre la partie. */
type Screen = 'accueil' | 'duel'

const fromHash = (): Screen => (window.location.hash === '#duel' ? 'duel' : 'accueil')

function App() {
  const [screen, setScreen] = useState<Screen>(fromHash)
  /** Le modèle ouvert, et la variable à montrer (ou null : la vue d'ensemble). */
  const [model, setModel] = useState<{ focus: string | null } | null>(() => (window.location.hash === '#modele' ? { focus: null } : null))
  useEffect(() => {
    const onHash = () => setScreen(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (s: Screen) => {
    window.location.hash = s === 'accueil' ? '' : s
    setScreen(s)
  }

  return (
    <>
      {screen === 'accueil' ? <Home onDuel={() => go('duel')} onModel={() => setModel({ focus: null })} /> : null}
      {screen === 'duel' ? <Duel onExit={() => go('accueil')} onModel={(focus) => setModel({ focus })} /> : null}
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
