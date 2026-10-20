import { useEffect, useState } from 'react'
import { ADVISORS, type Advice, type Preview } from '../../game/advisors'
import { EVENTS } from '../../model/events'
import type { FiredEvent } from '../../model/types'
import type { Headline } from '../../game/headlines'
import { onTrack, type evaluate, type Scenario } from '../../game/scenarios'
import { num, sbn } from '../format'

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

/**
 * Le Conseil des ministres : un bandeau flottant en bas de l'écran (il ne déplace pas les curseurs).
 * Les réactions à la décision en préparation, son effet estimé, et le capital politique qu'elle consomme.
 */
export function Council({ advice, preview, year, cost, capital, onCancel, endingTitle }: { advice: Advice[]; preview: Preview | null; year: number; cost: number; capital: number | null; onCancel: () => void; endingTitle: string | null }) {
  const [open, setOpen] = useState(true)
  const over = capital !== null && cost > capital
  return (
    <aside className={`council${open ? '' : ' is-closed'}${preview ? ' has-draft' : ''}${over ? ' is-over' : ''}`} aria-label="Conseil des ministres">
      <div className="council-head">
        <button type="button" className="council-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          🏛️ Conseil des ministres {open ? '▾' : '▴'}
        </button>
        {capital !== null ? (
          <span className="capital" title="Le capital politique : les réformes que le Parlement et l’opinion acceptent cette année. Il dépend de votre popularité, et augmente juste après une élection.">
            ⚡ Capital politique
            <span className="capital-pips">
              {Array.from({ length: Math.min(12, Math.max(capital, cost)) }, (_, i) => (
                <i key={i} className={i < cost ? (i < capital ? 'used' : 'over') : ''} />
              ))}
            </span>
            <strong>
              {cost} / {capital}
            </strong>
          </span>
        ) : null}
        {preview ? (
          <button type="button" className="ghost small" onClick={onCancel}>
            Annuler les changements
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="council-body">
          {preview ? (
            <div className="council-preview">
              <strong>En {year + 1} :</strong>
              <span className={preview.deficit > 0 ? 'bad' : 'good'}>Déficit {sbn(preview.deficit)}</span>
              <span className={preview.unemployment > 0 ? 'bad' : 'good'}>Chômage {signedPts(preview.unemployment)}</span>
              <span className={preview.poverty > 0 ? 'bad' : 'good'}>Pauvreté {signedPts(preview.poverty)}</span>
              <span className={preview.emissions > 0 ? 'bad' : 'good'}>CO2 {preview.emissions > 0 ? '+' : ''}{num(preview.emissions, 0)} Mt</span>
              <span className={preview.discontent >= 0.6 ? 'bad' : ''}>Colère {num(preview.discontent, 2)}</span>
              {endingTitle ? <strong className="bad">⚠️ {endingTitle} : la partie serait perdue.</strong> : null}
            </div>
          ) : null}
          {over ? <p className="council-over">🏛️ Trop de réformes d’un coup : le Parlement ne votera pas tout cette année ({cost} points pour {capital}). Étalez-les sur plusieurs années.</p> : null}
          <div className="council-advice">
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
        </div>
      ) : null}
    </aside>
  )
}

const signedPts = (v: number) => `${v > 0 ? '+' : ''}${num(v * 100, 1)} pt`

/** Les dernières nouvelles du monde : ce que le jeu a tiré au sort. */
export function EventFeed({ events, year }: { events: FiredEvent[]; year: number }) {
  const recent = [...events].filter((e) => e.year <= year).sort((a, b) => b.year - a.year).slice(0, 6)
  return (
    <div className="events event-feed">
      <h2>📡 Le monde bouge</h2>
      {recent.length === 0 ? (
        <p className="note">Rien à signaler pour l’instant. Chaque année, le monde peut vous réserver une surprise : canicule, crise, guerre, découverte…</p>
      ) : (
        <ul>
          {recent.map((e) => {
            const def = EVENTS.find((d) => d.id === e.id)
            if (!def) {
              return null
            }
            return (
              <li key={`${e.id}-${e.year}`} className={`feed-${def.category}${e.year === year ? ' is-new' : ''}`}>
                <span className="feed-icon">{def.icon}</span>
                <div>
                  <strong>
                    {def.label} <small>{e.year}</small>
                  </strong>
                  <p>{def.summary}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
