import { useEffect, useState } from 'react'
import { ADVISORS, type Advice } from '../../game/advisors'
import type { Headline } from '../../game/headlines'
import { onTrack, type evaluate, type Scenario } from '../../game/scenarios'
import { num } from '../format'

/** La popularité et la prochaine élection, dans l'en-tête. */
export function Popularity({ value, nextElection, year }: { value: number; nextElection: number | null; year: number }) {
  const tone = value >= 50 ? 'good' : value >= 40 ? 'mid' : 'bad'
  return (
    <div className={`popularity pop-${tone}`} title="Votre popularité suit le climat social. À une élection, il faut au moins 40 % pour l’emporter.">
      <span className="pop-heart">❤️</span>
      <div>
        <strong>{value} %</strong>
        <span className="pop-bar">
          <span style={{ width: `${value}%` }} />
          <i style={{ left: '40%' }} />
        </span>
        {nextElection ? <small>{nextElection === year ? 'Élection cette année' : `Élection en ${nextElection}`}</small> : <small>Sans élection</small>}
      </div>
    </div>
  )
}

/** Les objectifs du scénario en cours, avec leur état. */
export function Objectives({ scenario, year, start, evaluation, onAbandon }: { scenario: Scenario; year: number; start: number; evaluation: ReturnType<typeof evaluate>; onAbandon: () => void }) {
  const progress = Math.min(1, (year - start) / (scenario.end - start))
  return (
    <div className="objectives">
      <div className="objectives-head">
        <strong>
          {scenario.icon} {scenario.title}
        </strong>
        <span>
          {year} → {scenario.end}
        </span>
        <button type="button" className="ghost small" onClick={onAbandon}>
          Abandonner
        </button>
      </div>
      <div className="objectives-progress">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <ul>
        {evaluation.results.map((r) => {
          const icon = r.status === 'ok' ? '✅' : r.status === 'ko' ? '❌' : onTrack(r) ? '🟢' : '🟠'
          return (
            <li key={r.objective.label} className={`obj-${r.status === 'pending' ? (onTrack(r) ? 'track' : 'off') : r.status}`}>
              <span>{icon}</span>
              <span className="obj-label">{r.objective.label}</span>
              <strong>{r.objective.show(r.value)}</strong>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Vos ministres réagissent. */
export function Advisors({ advice }: { advice: Advice[] }) {
  return (
    <div className="advisors">
      {advice.map((a) => {
        const who = ADVISORS[a.who]
        return (
          <div key={a.who + a.text} className={`advice advice-${a.mood}`}>
            <span className="advice-avatar" title={`${who.name}, ${who.role}`}>
              {who.avatar}
            </span>
            <p>
              <strong>{who.name}</strong> <small>{who.role}</small>
              <br />
              {a.text}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/** La une du journal de l'année. */
export function Newspaper({ headline }: { headline: Headline }) {
  return (
    <article key={headline.year} className={`newspaper news-${headline.tone}`}>
      <header>
        <span>Le Quotidien de la République</span>
        <span>{headline.year}</span>
      </header>
      <p className="news-kicker">{headline.kicker}</p>
      <h2>{headline.title}</h2>
      <p className="news-sub">{headline.subtitle}</p>
    </article>
  )
}

/** Des confettis, pour les victoires. */
export function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 90 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.2 + Math.random() * 1.6,
      color: ['#0055a4', '#ffffff', '#ef4135', '#f5b70a', '#2fbf71'][i % 5],
      rotate: Math.random() * 360,
    })),
  )
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, background: p.color, transform: `rotate(${p.rotate}deg)` }} />
      ))}
    </div>
  )
}

/** Un succès débloqué, qui s'affiche quelques secondes. */
export function Toasts({ items }: { items: { id: string; icon: string; title: string; text: string }[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((a) => (
        <div key={a.id} className="toast">
          <span>{a.icon}</span>
          <div>
            <small>Succès débloqué</small>
            <strong>{a.title}</strong>
            <p>{a.text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Un compteur qui monte jusqu'à sa valeur (pour la soirée électorale). */
export function Counter({ value, digits = 1 }: { value: number; digits?: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let frame = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1600)
      setShown(value * (1 - Math.pow(1 - k, 3)))
      if (k < 1) {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <>{num(shown, digits)}</>
}
