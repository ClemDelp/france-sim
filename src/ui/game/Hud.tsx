import { useEffect, useState, type ReactNode } from 'react'
import { ADVISORS, type Advice, type Preview } from '../../game/advisors'
import { chanceOf, EVENTS } from '../../model/events'
import type { EventDef, FiredEvent, YearState } from '../../model/types'
import { briefs, cartoon, type Headline } from '../../game/headlines'
import { onTrack, type evaluate, type Scenario } from '../../game/scenarios'
import { num, sbn } from '../format'
import { Illustration } from './illustrations'

/** La popularité et la prochaine élection, dans l'en-tête. */
export function Popularity({ value, nextElection, year }: { value: number; nextElection: number | null; year: number }) {
  const tone = value >= 50 ? 'good' : value >= 40 ? 'mid' : 'bad'
  return (
    <div className={`popularity pop-${tone}`} title="Votre popularité suit le climat social. À une élection, il faut plus de 40 % pour l’emporter.">
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
export function Newspaper({ headline, state: s, prev, start, events = [], onWhy }: { headline: Headline; state: YearState; prev?: YearState; start: YearState; events?: EventDef[]; onWhy?: () => void }) {
  const date = new Date(headline.year, 11, 31).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  // Le prix du journal suit l'inflation depuis 2025.
  const price = num(1.8 * (s.priceLevel / start.priceLevel), 2)
  const items = briefs(s, prev, events)
  const joke = cartoon(s, start)
  return (
    <article key={headline.year} className={`newspaper news-${headline.tone}`}>
      <div className="news-ears">
        <span>N° {num((headline.year - 1944) * 312, 0)}</span>
        <span>Édition nationale</span>
        <span>{price} €</span>
      </div>
      <header className="news-masthead">Le Quotidien de la République</header>
      <div className="news-dateline">
        <span>{date.charAt(0).toUpperCase() + date.slice(1)}</span>
        <span>Liberté · Égalité · Fraternité</span>
      </div>
      <div className="news-body">
        <div className="news-main">
          <p className="news-kicker">{headline.kicker}</p>
          <h2>{headline.title}</h2>
          <figure className="news-figure">
            <Illustration art={headline.art} label={headline.title} />
          </figure>
          <p className="news-sub">{headline.subtitle}</p>
          {onWhy ? (
            <button type="button" className="news-why" onClick={onWhy}>
              🔍 Pourquoi en est-on là ?
            </button>
          ) : null}
        </div>
        <aside className="news-side">
          <h3>En bref</h3>
          <ul>
            {items.map((b) => (
              <li key={b.label} className={b.good === null ? '' : b.good ? 'good' : 'bad'}>
                <span>{b.label}</span>
                {b.value ? (
                  <strong>
                    {b.trend === 'up' ? '▲ ' : b.trend === 'down' ? '▼ ' : ''}
                    {b.value}
                  </strong>
                ) : null}
              </li>
            ))}
          </ul>
          <figure className="news-cartoon">
            <Cartoon />
            <figcaption>
              <span>— {joke.them}</span>
              <span>— {joke.you}</span>
              <small>Dessin de Plantoux</small>
            </figcaption>
          </figure>
        </aside>
      </div>
    </article>
  )
}

/** Le dessin du jour : un conseiller affolé, un président imperturbable. */
function Cartoon() {
  return (
    <svg viewBox="0 0 160 70" aria-hidden="true" fill="none" stroke="#1c1a17" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 66 H156" />
      <g transform="translate(46 0)">
        <circle cx="0" cy="22" r="9" fill="#f4efe3" />
        <path d="M-4 18 v2 M4 18 v2 M-4 27 q4 -3 8 0" />
        <path d="M-9 14 q2 -8 9 -8 q8 0 9 8" />
        <path d="M0 31 V50 M0 36 L-14 24 M0 36 L14 26 M0 50 L-7 66 M0 50 L7 66" />
        <path d="M14 26 l6 -8 h8 v10 h-8 Z" fill="#f4efe3" />
        <path d="M-18 20 l-4 -4 M-18 26 h-6" />
      </g>
      <g transform="translate(112 0)">
        <circle cx="0" cy="22" r="10" fill="#f4efe3" />
        <path d="M-4 20 h2 M3 20 h2 M-3 27 q3 2 6 0" />
        <path d="M-10 18 q0 -12 10 -12 q10 0 10 12 q-4 -6 -10 -6 q-6 0 -10 6 Z" fill="#1c1a17" />
        <path d="M-12 34 h24 l2 32 h-28 Z" fill="#1c1a17" />
        <path d="M0 34 l-2 6 l2 14 l2 -14 Z" fill="#f4efe3" />
        <path d="M-12 38 L-20 52 M12 38 L18 50 l-4 4" />
      </g>
    </svg>
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
type CouncilProps = {
  advice: Advice[]
  preview: Preview | null
  year: number
  cost: number
  capital: number | null
  onCancel: () => void
  endingTitle: string | null
  /** Sur téléphone : une ligne en bas de l'écran, qui s'ouvre en panneau (avec les commandes du temps). */
  phone?: boolean
  controls?: ReactNode
  /** Ouvre l'avis détaillé d'un ministre (pour un avis sur la décision en préparation). */
  onAdvice?: (advice: Advice) => void
  /** Les leviers bougés dont l'effet est lent, et pourquoi. */
  slow?: string[]
}

export function Council({ advice, preview, year, cost, capital, onCancel, endingTitle, phone = false, controls, onAdvice, slow = [] }: CouncilProps) {
  const [desktopOpen, setDesktopOpen] = useState(true)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const open = phone ? phoneOpen : desktopOpen
  const setOpen = phone ? setPhoneOpen : setDesktopOpen
  const over = capital !== null && cost > capital
  const first = advice[0]
  if (phone && !open) {
    // La ligne repliée : le conseil le plus important, et le capital politique.
    return (
      <button type="button" className={`council council-line${preview ? ' has-draft' : ''}${over ? ' is-over' : ''}`} onClick={() => setOpen(true)} aria-expanded={false} aria-label="Ouvrir le Conseil des ministres">
        <span className="advice-avatar" aria-hidden="true">
          {first ? ADVISORS[first.who].avatar : '🏛️'}
        </span>
        <span className="council-line-text">
          {endingTitle ? <strong className="bad">⚠️ {endingTitle} </strong> : over ? <strong className="bad">Trop de réformes d’un coup. </strong> : null}
          {first?.text}
        </span>
        {capital !== null ? (
          <span className="council-line-capital">
            ⚡ {cost}/{capital}
          </span>
        ) : null}
        <span aria-hidden="true">▴</span>
      </button>
    )
  }
  return (
    <>
      {phone ? <div className="sheet-backdrop" onClick={() => setOpen(false)} role="presentation" /> : null}
      <aside className={`council${open ? '' : ' is-closed'}${preview ? ' has-draft' : ''}${over ? ' is-over' : ''}${phone ? ' is-sheet' : ''}`} aria-label="Conseil des ministres">
        {phone ? <button type="button" className="sheet-handle" onClick={() => setOpen(false)} aria-label="Fermer le Conseil des ministres" /> : null}
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
            {slow.map((note) => (
              <p key={note} className="council-slow">
                ⏳ {note}
              </p>
            ))}
            {controls ? (
              // Avancer referme le panneau : on voit tout de suite ce que l'année a changé.
              <div className="council-controls" onClick={(e) => ((e.target as HTMLElement).closest('button') ? setOpen(false) : null)} role="presentation">
                {controls}
              </div>
            ) : null}
            {over ? <p className="council-over">🏛️ Trop de réformes d’un coup : le Parlement ne votera pas tout cette année ({cost} points pour {capital}). Étalez-les sur plusieurs années.</p> : null}
            <div className="council-advice">
              {advice.map((a) => {
                const who = ADVISORS[a.who]
                const body = (
                  <>
                    <span className="advice-avatar" title={`${who.name}, ${who.role}`}>
                      {who.avatar}
                    </span>
                    <p>
                      <strong>{who.name}</strong> <small>{who.role}</small>
                      <br />
                      {a.text}
                      {a.topic && onAdvice ? <span className="advice-more">Pourquoi ? Comment ? ›</span> : null}
                    </p>
                  </>
                )
                // Un avis sur la décision en préparation s'ouvre en détail : la part de chaque levier, les mécanismes, qui paie.
                return a.topic && onAdvice ? (
                  <button key={a.who + a.text} type="button" className={`advice advice-${a.mood} is-clickable`} onClick={() => onAdvice(a)}>
                    {body}
                  </button>
                ) : (
                  <div key={a.who + a.text} className={`advice advice-${a.mood}`}>
                    {body}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </aside>
    </>
  )
}

const signedPts = (v: number) => `${v > 0 ? '+' : ''}${num(v * 100, 1)} pt`

const pctOf = (v: number) => `${num(v * 100, v < 0.1 ? 1 : 0)} %`

/** Pourquoi cet événement est arrivé : sa probabilité cette année-là, et ce qui l'a fait monter ou baisser. */
function EventWhy({ event, states, forced }: { event: FiredEvent; states: YearState[]; forced: boolean }) {
  const def = EVENTS.find((d) => d.id === event.id)!
  const before = states.find((x) => x.year === event.year - 1)
  if (forced || !before) {
    return <p className="why">📜 Prévu par le scénario : c’est le point de départ de votre mission.</p>
  }
  const o = def.chance(before, states[0])
  return (
    <div className="why">
      <p>
        Probabilité en {event.year} : <strong>{pctOf(chanceOf(o))}</strong>, puis le tirage au sort l’a déclenché.
      </p>
      <ul>
        <li>{pctOf(o.base)} de base : le hasard du monde, que personne ne contrôle.</li>
        {o.factors.map((f) => (
          <li key={f.label} className={f.kind === 'add' ? (f.value > 0 ? 'up' : 'down') : f.value > 1 ? 'up' : 'down'}>
            {f.kind === 'add' ? `${f.value > 0 ? '+' : '−'}${pctOf(Math.abs(f.value))}` : `×${num(f.value, 2)}`} : {f.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Les dernières nouvelles du monde : ce que le jeu a tiré au sort. */
export function EventFeed({ events, year, states, scenarioEvents }: { events: FiredEvent[]; year: number; states: YearState[]; scenarioEvents: FiredEvent[] }) {
  const [open, setOpen] = useState<string | null>(null)
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
                  <button type="button" className="link" onClick={() => setOpen(open === `${e.id}-${e.year}` ? null : `${e.id}-${e.year}`)} aria-expanded={open === `${e.id}-${e.year}`}>
                    {open === `${e.id}-${e.year}` ? 'Masquer' : 'Pourquoi ?'}
                  </button>
                  {open === `${e.id}-${e.year}` ? <EventWhy event={e} states={states} forced={scenarioEvents.some((x) => x.id === e.id && x.year === e.year)} /> : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
