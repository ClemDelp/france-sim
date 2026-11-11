import { CONTRIBUTING_URL, DOCS_URL, ISSUES_URL, modelFileUrl, REPO_URL } from '../links'

/** Les fichiers du modèle qu'on peut lire et corriger, et ce que chacun contient. */
const FILES: { file: string; what: string }[] = [
  { file: 'comportements.csv', what: 'les comportements : chaque paramètre, sa valeur, sa fourchette, sa fiabilité et sa source' },
  { file: 'liens.csv', what: 'le graphe des causes : qui fait bouger quoi, dans quel sens, et pourquoi' },
  { file: 'mesures.csv', what: 'les mesures (les cartes) et leurs obstacles' },
  { file: 'mesures-leviers.csv', what: 'comment chaque mesure bouge les leviers du modèle' },
  { file: 'candidats.csv', what: 'les candidats (parodiques)' },
  { file: 'promesses.csv', what: 'leurs promesses, chacune avec sa source' },
  { file: 'note-pays.csv', what: 'la note de santé d’un pays : ses critères et leurs poids' },
  { file: 'sources.csv', what: 'les organismes cités (Insee, Banque de France, Cour des comptes…)' },
]

/**
 * À propos du jeu : d'où il vient, comment marche le modèle derrière les cartes, et comment aider à l'améliorer.
 * C'est d'ici (et seulement d'ici) qu'on ouvre le modèle : le jeu, lui, reste un jeu.
 */
export function About({ onBack, onModel, onCards }: { onBack: () => void; onModel: () => void; onCards: () => void }) {
  return (
    <div className="home about" role="dialog" aria-modal="true" aria-label="À propos du jeu">
      <div className="home-inner">
        <button type="button" className="ghost small" onClick={onBack}>
          ← Accueil
        </button>
        <header className="home-hero">
          <h1>À propos</h1>
          <p>Un jeu de cartes, et derrière chaque carte un vrai modèle de l’économie française.</p>
        </header>
        <section className="about-block">
          <h2>🃏 Le jeu</h2>
          <p>
            Deux présidents, deux France, la même au départ. Les mesures, les crises, les scandales et les coups de théâtre passent tous par le même modèle : quand une carte fait
            monter le chômage ou baisser la dette, c’est le modèle qui le calcule, et la carte vous explique pourquoi. Les candidats sont des parodies, mais leurs promesses viennent de
            leurs programmes publiés, chacune avec sa source. Seuls les deux candidats fantaisie (🎭 Teddy Rêneur et Sylvain Dhurif) ont un programme imaginé pour le jeu : ils ne se
            présentent pas, et leurs promesses le disent.
          </p>
          <p>
            On joue contre l’IA, ou avec un ami : en ligne, le téléphone de celui qui crée la partie fait l’arbitre, et les deux navigateurs se parlent en direct (WebRTC). Le service
            public de PeerJS ne sert qu’à les mettre en relation : pas de compte, pas de serveur à nous, aucune partie gardée ailleurs que sur le téléphone de l’hôte.
          </p>
        </section>
        <section className="about-block">
          <h2>🧠 Le modèle</h2>
          <p>
            Un modèle stock-flux de la France : ménages par tranche de revenu, entreprises par taille, État, Sécurité sociale, banques, BCE et reste du monde. Il est calé sur 2025 et
            rejoue le passé (2000-2024) pour vérifier qu’il tient la route. Des centaines de paramètres, chacun avec sa source. C’est un simulateur, pas une prévision : il montre des
            mécanismes et des ordres de grandeur.
          </p>
          <button type="button" className="primary big" onClick={onModel}>
            🧠 Explorer le modèle : le graphe des causes, les paramètres, les sources
          </button>
          <button type="button" className="ghost big" onClick={onCards}>
            🃏 Toutes les cartes du jeu : coût, budget, effets, et dans quelles parties elles sont
          </button>
        </section>
        <section className="about-block">
          <h2>🤝 Contribuer</h2>
          <p>
            Tout le modèle tient dans des fichiers texte lisibles (des CSV, dans le dossier <code>modele/</code>) : pas besoin d’être développeur pour proposer une meilleure valeur, une
            meilleure source ou un lien de cause à effet qui manque.
          </p>
          <ul className="about-files">
            {FILES.map((f) => (
              <li key={f.file}>
                <a href={modelFileUrl(f.file)} target="_blank" rel="noreferrer">
                  <code>{f.file}</code>
                </a>{' '}
                : {f.what}
              </li>
            ))}
          </ul>
          <ol className="about-steps">
            <li>Repérez une valeur, une source ou un lien qui vous semble faux (le modèle les montre tous, avec leur source).</li>
            <li>
              Ouvrez une{' '}
              <a href={ISSUES_URL} target="_blank" rel="noreferrer">
                proposition sur GitHub
              </a>{' '}
              avec votre source, ou modifiez directement le fichier CSV.
            </li>
            <li>
              Le guide{' '}
              <a href={CONTRIBUTING_URL} target="_blank" rel="noreferrer">
                CONTRIBUER.md
              </a>{' '}
              explique comment, et la{' '}
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                documentation
              </a>{' '}
              détaille chaque équation.
            </li>
          </ol>
          <p>
            Le code, le modèle et sa documentation sont libres :{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              github.com/ClemDelp/france-sim
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
