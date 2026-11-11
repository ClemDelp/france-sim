import { useEffect, useRef } from 'react'

/**
 * Le geste « retour » du téléphone (glisser depuis le bord sur iPhone, le bouton retour sur Android) ferme ce qui est ouvert
 * par-dessus la partie, au lieu de quitter le jeu : chaque fenêtre ouverte ajoute une étape à l'historique du navigateur
 * (même adresse), et le retour la referme. Fermer une fenêtre soi-même (la croix) retire son étape, sans bruit.
 */

type Layer = { id: number; href: string; close: () => void }

const stack: Layer[] = []
let nextId = 1
/** Les retours que l'on a demandés soi-même : leur `popstate` ne ferme rien. */
let silent = 0
/** Les étapes à retirer d'un coup (plusieurs fenêtres fermées dans le même instant). */
let pending = 0
/** Ce qu'on fait une fois toutes les étapes retirées (quitter la partie). */
let after: (() => void) | null = null
let listening = false

function onPop() {
  if (silent > 0) {
    silent -= 1
    const then = after
    after = null
    then?.()
    return
  }
  const top = stack.pop()
  top?.close()
}

function listen() {
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('popstate', onPop)
    listening = true
  }
}

function flush() {
  const n = pending
  pending = 0
  if (n > 0) {
    silent += 1
    window.history.go(-n)
  }
}

/** Ajoute une étape ; renvoie de quoi la retirer quand la fenêtre se ferme autrement que par le retour. */
export function pushLayer(close: () => void): () => void {
  listen()
  const layer: Layer = { id: nextId++, href: window.location.href, close }
  stack.push(layer)
  window.history.pushState({ ...(window.history.state as object | null), layer: layer.id }, '')
  return () => {
    const i = stack.indexOf(layer)
    if (i < 0) {
      // Déjà retirée par le retour.
      return
    }
    stack.splice(i, 1)
    // On a changé d'écran entre-temps (l'adresse n'est plus la même) : revenir en arrière nous ramènerait à l'ancien.
    if (window.location.href !== layer.href) {
      return
    }
    pending += 1
    if (pending === 1) {
      queueMicrotask(flush)
    }
  }
}

/** Retire toutes les étapes, puis fait `then` (quitter la partie sans laisser de retours fantômes derrière soi). */
export function unwind(then: () => void) {
  const n = stack.filter((l) => l.href === window.location.href).length + pending
  stack.length = 0
  pending = 0
  if (n === 0) {
    then()
    return
  }
  listen()
  silent += 1
  after = then
  window.history.go(-n)
}

/** Tant que `open` est vrai, le retour appelle `close` au lieu de quitter l'écran. */
export function useBack(open: boolean, close: () => void) {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!open) {
      return
    }
    return pushLayer(() => latest.current())
  }, [open])
}
