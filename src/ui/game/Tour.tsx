import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import type { PhoneView } from './usePhone'

export type TourStep = {
  /** L'élément à mettre en lumière (sélecteur CSS), ou rien pour une bulle centrée. */
  target?: string
  title: string
  text: string
  /** Sur téléphone : l'écran à afficher pour que la zone soit visible. */
  view?: PhoneView
}

type Box = { top: number; left: number; width: number; height: number }

/** La visite guidée : un projecteur sur une zone de l'écran, et une bulle qui l'explique. */
export function Tour({ steps, onClose, onStep }: { steps: TourStep[]; onClose: () => void; onStep?: (step: TourStep) => void }) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = steps[index]
  const last = index === steps.length - 1

  // On amène la zone au centre de l'écran avant de la mesurer.
  // (Sur téléphone, on affiche d'abord le bon écran : la zone n'existe qu'à l'image suivante.)
  useLayoutEffect(() => {
    onStep?.(step)
    const frame = requestAnimationFrame(() => {
      const el = step.target ? document.querySelector(step.target) : null
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [step, onStep])

  // On suit la zone pendant le défilement et les changements de taille.
  useEffect(() => {
    let frame = 0
    const measure = () => {
      const el = step.target ? document.querySelector(step.target) : null
      const r = el?.getBoundingClientRect()
      const next = r && r.width > 0 ? { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 } : null
      setBox((b) => (b && next && Math.abs(b.top - next.top) + Math.abs(b.left - next.left) + Math.abs(b.width - next.width) + Math.abs(b.height - next.height) < 1 ? b : next))
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (last) {
          onClose()
        } else {
          setIndex((i) => i + 1)
        }
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(0, i - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last, onClose])

  // La bulle se place sous la zone s'il y a la place, sinon au-dessus, sinon au centre.
  const vh = window.innerHeight
  const vw = window.innerWidth
  const width = Math.min(360, vw - 24)
  const bubble: CSSProperties = box
    ? {
        width,
        left: Math.max(12, Math.min(vw - width - 12, box.left + box.width / 2 - width / 2)),
        ...(box.top + box.height + 220 < vh ? { top: box.top + box.height + 12 } : box.top > 240 ? { top: Math.max(12, box.top - 12), transform: 'translateY(-100%)' } : { top: vh / 2, transform: 'translateY(-50%)' }),
      }
    : { width, left: vw / 2 - width / 2, top: vh / 2, transform: 'translateY(-50%)' }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Visite guidée">
      {box ? <div className="tour-spot" style={box} /> : <div className="tour-dim" />}
      <div className="tour-bubble" style={bubble}>
        <p className="eyebrow">
          Visite guidée · {index + 1} / {steps.length}
        </p>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <i key={s.title} className={i === index ? 'on' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="ghost small" onClick={onClose}>
            Passer
          </button>
          {index > 0 ? (
            <button type="button" className="ghost small" onClick={() => setIndex(index - 1)}>
              ← Précédent
            </button>
          ) : null}
          <button type="button" className="primary small" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? 'À moi de jouer !' : 'Suivant →'}
          </button>
        </div>
      </div>
    </div>
  )
}
