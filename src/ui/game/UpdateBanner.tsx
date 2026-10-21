import { useEffect, useState } from 'react'

/** Une nouvelle version du jeu est installée : un bandeau propose de recharger (la partie en cours est sauvegardée). */
export function UpdateBanner() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const onUpdate = () => setReady(true)
    window.addEventListener('france-sim:update', onUpdate)
    return () => window.removeEventListener('france-sim:update', onUpdate)
  }, [])
  if (!ready) {
    return null
  }
  return (
    <div className="update-banner" role="status">
      <span>✨ Nouvelle version du jeu disponible.</span>
      <button type="button" className="primary small" onClick={() => window.location.reload()}>
        Recharger
      </button>
      <small>Votre partie est sauvegardée.</small>
    </div>
  )
}
