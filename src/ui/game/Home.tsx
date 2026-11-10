import { useState } from 'react'
import { VERSION_LABEL } from '../../version'
import { REPO_URL } from '../links'
import { promptInstall, useInstall } from './install'

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

/** L'écran d'accueil : jouer un duel, ou lire « À propos du jeu » (d'où l'on ouvre le modèle). */
export function Home({ onDuel, onAbout }: { onDuel: () => void; onAbout: () => void }) {
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
          <p>Deux présidents, deux France, un jeu de cartes. Derrière chaque carte, un vrai modèle de l’économie française.</p>
        </header>
        <section className="home-menu">
          <button type="button" className="menu-card menu-duel" onClick={onDuel}>
            <span>🃏</span>
            <strong>Jouer un duel</strong>
            <small>Contre un candidat (version parodique) ou contre le Bot. Mesures pour votre France, crises pour la sienne : le meilleur bilan gagne.</small>
          </button>
          <button type="button" className="menu-card" onClick={onAbout}>
            <span>ℹ️</span>
            <strong>À propos du jeu</strong>
            <small>D’où vient le jeu, le modèle derrière les cartes, et comment aider à l’améliorer.</small>
          </button>
          <InstallCard />
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
