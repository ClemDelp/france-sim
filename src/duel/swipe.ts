import { useEffect, useRef, useState } from 'react'

/**
 * Faire défiler les cartes d'un geste, comme un paquet qu'on feuillette : la carte suit le doigt, puis on passe à la
 * suivante (vers la gauche) ou à la précédente (vers la droite). Le défilement vertical reste au navigateur
 * (`touch-action: pan-y` sur la zone) : un geste plutôt vertical annule le glissement. Les flèches du clavier aussi.
 */

/** Au-delà de ce glissement (en px), on change de carte. */
const COMMIT = 60
/** En deçà, c'est un toucher, pas un glissement. */
const SLOP = 10

export type Swipe = {
  /** Le décalage de la carte qui suit le doigt (0 au repos). */
  dx: number
  /** D'où arrive la carte qu'on vient d'afficher (pour l'animation), ou null. */
  from: 'gauche' | 'droite' | null
  /** Change à chaque carte : pour rejouer l'animation d'arrivée. */
  turn: number
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: () => void
    onClickCapture: (e: React.MouseEvent) => void
  }
}

export function useSwipe(index: number, count: number, go: (index: number) => void): Swipe {
  const [dx, setDx] = useState(0)
  const [from, setFrom] = useState<'gauche' | 'droite' | null>(null)
  const [turn, setTurn] = useState(0)
  const start = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null)
  /** Un glissement vient de finir : le clic qui suit ne doit pas appuyer sur un bouton. */
  const swallow = useRef(false)

  const step = (delta: 1 | -1) => {
    const next = index + delta
    if (next < 0 || next >= count) {
      return false
    }
    setFrom(delta > 0 ? 'droite' : 'gauche')
    setTurn((t) => t + 1)
    go(next)
    return true
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        step(1)
      } else if (e.key === 'ArrowLeft') {
        step(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const end = () => {
    start.current = null
    setDx(0)
  }

  return {
    dx,
    from,
    turn,
    handlers: {
      onPointerDown: (e) => {
        if (count > 1 && e.isPrimary && (e.pointerType !== 'mouse' || e.button === 0)) {
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }
        }
      },
      onPointerMove: (e) => {
        const s = start.current
        if (!s || s.id !== e.pointerId) {
          return
        }
        const x = e.clientX - s.x
        const y = e.clientY - s.y
        if (!s.moved) {
          if (Math.abs(x) < SLOP) {
            return
          }
          // Plutôt vertical : c'est un défilement, pas un glissement.
          if (Math.abs(y) > Math.abs(x)) {
            start.current = null
            return
          }
          s.moved = true
        }
        // Au bout du paquet, la carte résiste.
        const edge = (x > 0 && index === 0) || (x < 0 && index === count - 1)
        setDx(edge ? x * 0.25 : x)
      },
      onPointerUp: (e) => {
        const s = start.current
        if (!s || s.id !== e.pointerId) {
          return
        }
        const x = e.clientX - s.x
        if (s.moved) {
          swallow.current = true
          window.setTimeout(() => (swallow.current = false), 0)
          if (Math.abs(x) > COMMIT) {
            step(x < 0 ? 1 : -1)
          }
        }
        end()
      },
      onPointerCancel: end,
      onClickCapture: (e) => {
        if (swallow.current) {
          e.stopPropagation()
          e.preventDefault()
          swallow.current = false
        }
      },
    },
  }
}
