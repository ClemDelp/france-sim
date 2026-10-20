import { useSyncExternalStore } from 'react'

/**
 * Installer le jeu comme une appli (écran d'accueil du téléphone, ou application de bureau).
 * Chrome, Edge et Android proposent l'installation par un événement qu'on garde pour plus tard ;
 * sur iPhone et iPad, il faut passer par le bouton Partager de Safari.
 */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPrompt | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** À appeler une fois au démarrage, avant que le navigateur ne propose l'installation. */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPrompt
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

/** Le jeu tourne-t-il déjà comme une appli installée ? */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone ou iPad (y compris les iPad qui se présentent comme un Mac). */
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)

export type InstallState = 'installed' | 'prompt' | 'ios' | 'unavailable'

const read = (): InstallState => (installed || isStandalone() ? 'installed' : deferred ? 'prompt' : isIos() ? 'ios' : 'unavailable')

let snapshot: InstallState | null = null
const subscribe = (l: () => void) => {
  const onChange = () => {
    snapshot = read()
    l()
  }
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** Ce qu'on peut proposer : rien (déjà installé, ou navigateur qui ne sait pas faire), le bouton, ou la marche à suivre sur iPhone. */
export function useInstall(): InstallState {
  return useSyncExternalStore(subscribe, () => (snapshot ??= read()), () => 'unavailable')
}

/** Ouvre la fenêtre d'installation du navigateur. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) {
    return false
  }
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}
