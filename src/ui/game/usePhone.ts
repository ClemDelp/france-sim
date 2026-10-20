import { useSyncExternalStore } from 'react'

/** Les quatre écrans du jeu sur téléphone : on n'affiche qu'une zone à la fois, comme les onglets d'une appli. */
export type PhoneView = 'pays' | 'decider' | 'flux' | 'analyses'

const PHONE_QUERY = '(max-width: 760px)'

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Vrai sur un écran de téléphone (ou une fenêtre très étroite). */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}
