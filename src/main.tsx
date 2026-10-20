import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { listenForInstall } from './ui/game/install'

listenForInstall()

// Le jeu hors ligne et installable : seulement dans la version construite (pas pendant le développement).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Sans service worker (navigation privée, site non sécurisé), le jeu marche quand même, en ligne.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
