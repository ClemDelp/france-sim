import { useEffect, useState } from 'react'
import App from './App.tsx'
import { CardGame } from './cards/CardGame'

/** Le duel de cartes s'ouvre par le lien #duel (depuis l'accueil, ou partagé). */
export function Root() {
  const [duel, setDuel] = useState(() => window.location.hash === '#duel')
  useEffect(() => {
    const onHash = () => setDuel(window.location.hash === '#duel')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return duel ? <CardGame onExit={() => (window.location.hash = '')} /> : <App />
}
