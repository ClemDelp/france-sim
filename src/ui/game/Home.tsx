import { useState } from 'react'
import { ACHIEVEMENTS } from '../../game/achievements'
import { SCENARIOS, type Scenario } from '../../game/scenarios'
import type { Candidate } from '../../game/candidates'
import { CandidatePicker } from './Candidates'
import { VERSION_LABEL } from '../../version'
import { REPO_URL } from '../links'
import { promptInstall, useInstall } from './install'

type Props = {
  name: string
  onName: (name: string) => void
  stars: Record<string, number>
  earned: string[]
  /** Une partie est en cours : on peut la reprendre. */
  canResume: boolean
  onResume: () => void
  onTutorial: () => void
  onScenario: (s: Scenario) => void
  onFree: () => void
  onMyths: () => void
  onModel: () => void
  onCandidate: (c: Candidate) => void
  onCompare: () => void
}

const Difficulty = ({ level }: { level: number }) => (
  <span className="difficulty" aria-label={`Difficulté ${level} sur 4`}>
    {[1, 2, 3, 4].map((i) => (
      <i key={i} className={i <= level ? 'on' : ''} />
    ))}
  </span>
)

export const Stars = ({ n, size = 'small' }: { n: number; size?: 'small' | 'big' }) => (
  <span className={`stars stars-${size}`} aria-label={`${n} étoile${n > 1 ? 's' : ''} sur 3`}>
    {[1, 2, 3].map((i) => (
      <span key={i} className={i <= n ? 'on' : ''} style={{ animationDelay: `${i * 0.25}s` }}>
        ★
      </span>
    ))}
  </span>
)

/** Proposer d'installer le jeu comme une appli (écran d'accueil, plein écran, hors ligne). */
function InstallCard() {
  const state = useInstall()
  const [help, setHelp] = useState(false)
  if (state === 'installed' || state === 'unavailable') {
    return null
  }
  return (
    <div className="install-card">
      <button type="button" className="menu-card menu-install" onClick={() => (state === 'prompt' ? void promptInstall() : setHelp(!help))} aria-expanded={state === 'ios' ? help : undefined}>
        <span>📲</span>
        <strong>Installer l’appli</strong>
        <small>Sur l’écran d’accueil, en plein écran, et même sans réseau.</small>
      </button>
      {help ? (
        <ol className="install-steps">
          <li>
            Touchez <strong>Partager</strong> <span aria-hidden="true">⬆️</span> en bas de Safari (en haut sur iPad).
          </li>
          <li>
            Choisissez <strong>Sur l’écran d’accueil</strong> <span aria-hidden="true">➕</span>.
          </li>
          <li>
            Touchez <strong>Ajouter</strong> : France·Sim s’ouvre ensuite comme une appli.
          </li>
        </ol>
      ) : null}
    </div>
  )
}

/** L'écran d'accueil : choisir comment jouer. */
export function Home({ name, onName, stars, earned, canResume, onResume, onTutorial, onScenario, onFree, onMyths, onModel, onCandidate, onCompare }: Props) {
  const [showScenarios, setShowScenarios] = useState(false)
  const [showCandidates, setShowCandidates] = useState(false)
  const totalStars = Object.values(stars).reduce((a, n) => a + n, 0)
  return (
    <div className="home" role="dialog" aria-modal="true" aria-label="Accueil">
      <div className="home-inner">
        <header className="home-hero">
          <div className="home-flag" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <h1>France·Sim</h1>
          <p>Vous êtes à l’Élysée. Chaque décision a un prix : à vous de le découvrir.</p>
          <label className="home-name">
            <span>Votre nom de président·e</span>
            <input value={name} maxLength={30} placeholder="Ex. : Camille Martin" onChange={(e) => onName(e.target.value)} />
          </label>
        </header>

        {showCandidates ? (
          <section>
            <div className="home-section-head">
              <h2>🗳️ Incarner un candidat</h2>
              <button type="button" className="ghost small" onClick={() => setShowCandidates(false)}>
                ← Retour
              </button>
            </div>
            <CandidatePicker onPick={onCandidate} onCompare={onCompare} />
          </section>
        ) : showScenarios ? (
          <section>
            <div className="home-section-head">
              <h2>🎯 Scénarios</h2>
              <span className="home-total">⭐ {totalStars} / {SCENARIOS.length * 3}</span>
              <button type="button" className="ghost small" onClick={() => setShowScenarios(false)}>
                ← Retour
              </button>
            </div>
            <div className="scenario-grid">
              {SCENARIOS.map((s) => (
                <button key={s.id} type="button" className="scenario-card" onClick={() => onScenario(s)}>
                  <span className="scenario-icon">{s.icon}</span>
                  <strong>{s.title}</strong>
                  <small>{s.tagline}</small>
                  <span className="scenario-meta">
                    <Difficulty level={s.difficulty} />
                    <span>jusqu’en {s.end}</span>
                    <Stars n={stars[s.id] ?? 0} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="home-menu">
            {canResume ? (
              <button type="button" className="menu-card menu-resume" onClick={onResume}>
                <span>▶️</span>
                <strong>Reprendre la partie</strong>
                <small>Là où vous l’aviez laissée.</small>
              </button>
            ) : null}
            <button type="button" className="menu-card menu-tutorial" onClick={onTutorial}>
              <span>🎓</span>
              <strong>Apprendre à jouer</strong>
              <small>Une visite guidée de 2 minutes.</small>
            </button>
            <button type="button" className="menu-card menu-scenarios" onClick={() => setShowScenarios(true)}>
              <span>🎯</span>
              <strong>Scénarios</strong>
              <small>
                {SCENARIOS.length} défis avec objectifs et étoiles · ⭐ {totalStars}/{SCENARIOS.length * 3}
              </small>
            </button>
            <button type="button" className="menu-card menu-candidates" onClick={() => setShowCandidates(true)}>
              <span>🗳️</span>
              <strong>Incarner un candidat</strong>
              <small>Un mandat 2027–2032 avec le programme d’un candidat (version parodique) : tiendrez-vous vos promesses ?</small>
            </button>
            <button type="button" className="menu-card" onClick={onFree}>
              <span>🎮</span>
              <strong>Partie libre</strong>
              <small>Gouvernez jusqu’en 2075. Élection tous les 5 ans.</small>
            </button>
            <button type="button" className="menu-card" onClick={onMyths}>
              <span>💡</span>
              <strong>Idées reçues</strong>
              <small>« Taxons les riches », « annulons la dette »… testées en 10 ans.</small>
            </button>
            <button type="button" className="menu-card" onClick={onModel}>
              <span>🧠</span>
              <strong>Comprendre le modèle</strong>
              <small>Le graphe des causes, les 350 paramètres, le test face au passé.</small>
            </button>
            <InstallCard />
          </section>
        )}

        <section className="home-achievements">
          <h2>
            🏅 Succès <small>{earned.length} / {ACHIEVEMENTS.length}</small>
          </h2>
          <ul>
            {ACHIEVEMENTS.map((a) => (
              <li key={a.id} className={earned.includes(a.id) ? 'is-earned' : ''} title={`${a.title} : ${a.text}`}>
                <span>{earned.includes(a.id) ? a.icon : '🔒'}</span>
                <small>{a.title}</small>
              </li>
            ))}
          </ul>
        </section>
        <p className="note home-foot">
          Un simulateur, pas une boule de cristal : il montre des mécanismes et des ordres de grandeur, toutes ses hypothèses sont ouvertes.{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Le projet est libre sur GitHub
          </a>{' '}
          : venez le vérifier et l’améliorer.
        </p>
        <p className="home-version" title="Le numéro du jeu, le commit publié et la date de mise en ligne">
          France·Sim {VERSION_LABEL}
        </p>
      </div>
    </div>
  )
}

/** La présentation d'un scénario, avant de le lancer. */
export function Briefing({ scenario, best, onStart, onBack }: { scenario: Scenario; best: number; onStart: () => void; onBack: () => void }) {
  return (
    <div className="modal-backdrop on-top" role="presentation">
      <div className="modal briefing" role="dialog" aria-modal="true" aria-label={scenario.title}>
        <p className="eyebrow">
          Scénario · <Difficulty level={scenario.difficulty} /> · jusqu’en {scenario.end}
        </p>
        <h2>
          {scenario.icon} {scenario.title}
        </h2>
        <p className="briefing-story">{scenario.story}</p>
        <h3>🎯 Vos objectifs (une étoile chacun)</h3>
        <ul className="briefing-objectives">
          {scenario.objectives.map((o) => (
            <li key={o.label}>
              <span>{o.when === 'always' ? '🔁' : '🏁'}</span> {o.label}
              <small>{o.when === 'always' ? 'à tenir chaque année' : `en ${scenario.end}`}</small>
            </li>
          ))}
          <li className="briefing-rule">
            <span>⚠️</span> Sans perdre en route : révolte, faillite, élection perdue…
          </li>
        </ul>
        {scenario.locked ? <p className="limits">🔒 {scenario.locked.why}</p> : null}
        <p className="note">💡 {scenario.tip}</p>
        {best ? (
          <p className="note">
            Votre record : <Stars n={best} />
          </p>
        ) : null}
        <div className="verdict-actions">
          <button type="button" className="primary big" onClick={onStart}>
            Prendre les commandes
          </button>
          <button type="button" className="ghost" onClick={onBack}>
            Retour
          </button>
        </div>
      </div>
    </div>
  )
}
