import type { PhoneView } from './usePhone'

const VIEWS: { id: PhoneView; icon: string; label: string }[] = [
  { id: 'pays', icon: '🇫🇷', label: 'Le pays' },
  { id: 'decider', icon: '🎛️', label: 'Décider' },
  { id: 'flux', icon: '💶', label: 'L’argent' },
  { id: 'analyses', icon: '📊', label: 'Analyses' },
]

type PlayProps = {
  running: boolean
  disabled: boolean
  label: string
  onPlay: () => void
  onPause: () => void
}

/**
 * La barre d'onglets du téléphone, avec au centre le grand bouton pour avancer d'un an,
 * à portée de pouce.
 */
export function PhoneNav({ view, onView, drafts, play }: { view: PhoneView; onView: (v: PhoneView) => void; drafts: number; play: PlayProps }) {
  const tab = (v: (typeof VIEWS)[number]) => (
    <button key={v.id} type="button" className={view === v.id ? 'is-on' : ''} aria-current={view === v.id ? 'page' : undefined} onClick={() => onView(v.id)}>
      <span className="phone-tab-icon" aria-hidden="true">
        {v.icon}
        {v.id === 'decider' && drafts > 0 ? <i className="phone-badge">{drafts}</i> : null}
      </span>
      <span>{v.label}</span>
    </button>
  )
  return (
    <nav className="phone-nav" aria-label="Écrans du jeu">
      {VIEWS.slice(0, 2).map(tab)}
      <button
        type="button"
        className={`phone-play${play.running ? ' is-running' : ''}`}
        onClick={play.running ? play.onPause : play.onPlay}
        disabled={!play.running && play.disabled}
        aria-label={play.running ? 'Pause' : play.label}
      >
        <span aria-hidden="true">{play.running ? '⏸' : '▶'}</span>
        <small>{play.running ? 'Pause' : play.label}</small>
      </button>
      {VIEWS.slice(2).map(tab)}
    </nav>
  )
}
