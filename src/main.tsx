import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { listenForInstall } from './ui/game/install'

listenForInstall()

// Le jeu hors ligne et installable : seulement dans la version construite (pas pendant le développement).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        // Sur téléphone, l'appli reste ouverte longtemps : on cherche une mise à jour à chaque retour dessus.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => undefined)
          }
        })
      })
      .catch(() => {
        // Sans service worker (navigation privée, site non sécurisé), le jeu marche quand même, en ligne.
      })
    // Une nouvelle version vient de s'installer (pas la toute première installation) : on propose de recharger.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        window.dispatchEvent(new Event('france-sim:update'))
      }
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
