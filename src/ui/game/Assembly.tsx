import { num } from '../format'
import { canDissolve, canForce, canReferendum, CENSURE_CHANCE, majorityOf, MAJORITY_CAPITAL, MAJORITY_LABEL, referendumChance, SEATS, type Politics } from '../../game/parliament'

export type Joker = 'force' | 'referendum'

/** Un demi-cercle de sièges : le camp présidentiel à gauche, l'opposition à droite (un point ≈ 6 députés). */
function Hemicycle({ seats, color }: { seats: number; color: string }) {
  const rows = [12, 15, 18, 21, 24, 27]
  const total = rows.reduce((a, n) => a + n, 0)
  // Les points sont rangés de gauche à droite, toutes rangées confondues, comme les groupes dans l'hémicycle.
  const dots = rows.flatMap((n, row) => Array.from({ length: n }, (_, i) => ({ row, a: Math.PI * (1 - (i + 0.5) / n) })))
  dots.sort((x, y) => y.a - x.a)
  const ours = Math.round((seats / SEATS) * total)
  return (
    <svg className="hemicycle" viewBox="0 0 200 106" role="img" aria-label={`${seats} sièges sur ${SEATS} pour le camp présidentiel`}>
      {dots.map((d, i) => {
        const r = 40 + d.row * 11
        return <circle key={i} cx={100 + r * Math.cos(d.a)} cy={100 - r * Math.sin(d.a)} r="3.3" fill={i < ours ? color : 'var(--opposition)'} />
      })}
      <path d="M100 30 V100" stroke="var(--muted)" strokeDasharray="2 3" />
    </svg>
  )
}

/**
 * L'Assemblée : la majorité du président, ce qu'elle change au capital politique, et les jokers du pouvoir
 * (49.3, référendum, dissolution), chacun avec son risque.
 */
export function Assembly({
  politics: p,
  year,
  popularity,
  color,
  over,
  cost,
  capital,
  forecast,
  armed,
  onArm,
  onDissolve,
}: {
  politics: Politics
  year: number
  popularity: number
  color: string
  /** Les réformes en préparation dépassent le capital politique. */
  over: boolean
  cost: number
  capital: number
  /** Ce qu'un 49.3 coûterait, selon le modèle : colère en plus, popularité en moins. */
  forecast: { anger: number; popularity: number; discontent: number } | null
  armed: Joker | null
  onArm: (j: Joker | null) => void
  onDissolve: () => void
}) {
  const m = majorityOf(p.seats)
  const shift = MAJORITY_CAPITAL[m]
  const censure = Math.round(CENSURE_CHANCE[m] * 100)
  const yes = Math.round(referendumChance(popularity) * 100)
  // Le 49.3 et le référendum ne servent qu'à une chose : faire passer des réformes qui dépassent le capital politique de l'année.
  const force = canForce(p, year + 1) && (over || armed === 'force')
  const ref = canReferendum(p, year + 1) && (over || armed === 'referendum')
  const usedForce = !canForce(p, year + 1)
  const usedRef = !canReferendum(p, year + 1)
  const dissolve = canDissolve(p, year)
  return (
    <section className={`assembly assembly-${m}`}>
      <div className="assembly-head">
        <Hemicycle seats={p.seats} color={color} />
        <div>
          <strong>🏛️ {MAJORITY_LABEL[m]}</strong>
          <span>
            {p.seats} sièges sur {SEATS} pour votre camp
          </span>
          <small>
            {shift > 0 ? `+${shift} ⚡ par an : vos réformes passent plus facilement.` : shift < 0 ? `${shift} ⚡ par an : l’opposition bloque tout.` : 'Il faut négocier chaque texte.'}
          </small>
        </div>
      </div>
      {over && !armed ? (
        <p className="assembly-alert">
          Vos réformes coûtent ⚡{cost} et vous n’avez que ⚡{capital} : le Parlement ne suivra pas. Retirez des mesures, ou forcez le passage avec un joker.
        </p>
      ) : null}
      <div className="jokers">
        <JokerCard
          art="📜"
          name="49.3"
          effect="Vos réformes passent sans vote"
          risk={`Censure : ${censure} %`}
          charges="1 par an"
          left={!usedForce}
          playable={force}
          armed={armed === 'force'}
          locked={usedForce ? 'Déjà joué cette année' : !over ? 'Utile quand vos réformes dépassent votre capital' : null}
          tone="force"
          onClick={() => onArm(armed === 'force' ? null : 'force')}
        />
        <JokerCard
          art="🗳️"
          name="Référendum"
          effect="Le peuple tranche"
          risk={`Oui ≈ ${yes} %`}
          charges="1 par mandat"
          left={!usedRef}
          playable={ref}
          armed={armed === 'referendum'}
          locked={usedRef ? 'Déjà joué ce mandat' : !over ? 'Utile quand vos réformes dépassent votre capital' : null}
          tone="referendum"
          onClick={() => onArm(armed === 'referendum' ? null : 'referendum')}
        />
        <JokerCard
          art="💥"
          name="Dissolution"
          effect="Rebattre les cartes"
          risk={`Selon votre popularité (${popularity} %)`}
          charges="1 par mandat"
          left={dissolve}
          playable={dissolve}
          armed={false}
          locked={dissolve ? null : 'Pas dans l’année qui suit des législatives, une fois par mandat'}
          tone="dissolution"
          onClick={() => {
            if (window.confirm(`Dissoudre l’Assemblée ? De nouvelles législatives ont lieu tout de suite, selon votre popularité (${popularity} %). Vous pouvez gagner une majorité… ou tout perdre.`)) {
              onDissolve()
            }
          }}
        />
      </div>
      {armed === 'force' ? (
        <div className="joker-deal">
          <strong>📜 Le 49.3, concrètement</strong>
          <ul>
            <li className="good">✅ Vos réformes (⚡{cost}) passent cette année malgré votre capital de ⚡{capital}, sans vote de l’Assemblée.</li>
            <li className="bad">
              ⚠️ Risque de motion de censure : <strong>{censure} %</strong> ({MAJORITY_LABEL[m].toLowerCase()}). Si elle passe : réformes rejetées, gouvernement renversé, taux d’intérêt +0,3 point, et 2 ⚡ de moins l’an prochain.
            </li>
            {forecast ? (
              <li className="bad">
                😠 La colère monte de {num(forecast.anger, 2)}, soit <strong>{forecast.popularity === 0 ? 'moins d’un point' : `${num(forecast.popularity, 0).replace('-', '−')} point${Math.abs(forecast.popularity) > 1 ? 's' : ''}`} de popularité</strong> :{' '}
                {forecast.discontent > 0.1 ? 'le pays est déjà en colère, le passage en force le choque d’autant plus (retraites 2023).' : 'le pays est plutôt calme, il le supporte (budget 2022) ; déjà en colère, il réagirait bien plus fort.'}
              </li>
            ) : null}
            <li className="bad">⚡ Même si tout se passe bien : 1 ⚡ de moins l’an prochain (le passage en force use votre crédit).</li>
          </ul>
          <small>Avancez d’un an pour jouer le coup, ou touchez à nouveau « 49.3 » pour y renoncer.</small>
        </div>
      ) : armed === 'referendum' ? (
        <div className="joker-deal">
          <strong>🗳️ Le référendum, concrètement</strong>
          <ul>
            <li className="good">✅ Si le oui l’emporte (chance ≈ {yes} %, selon votre popularité), vos réformes (⚡{cost}) passent malgré votre capital de ⚡{capital}.</li>
            <li className="bad">❌ Si le non l’emporte : réformes rejetées, et 2 ⚡ de moins l’an prochain.</li>
            <li>Une seule fois par mandat.</li>
          </ul>
          <small>Avancez d’un an pour que les Français votent, ou touchez à nouveau « Référendum » pour y renoncer.</small>
        </div>
      ) : !over ? (
        <p className="assembly-note">Le 49.3 et le référendum servent à faire passer, une année donnée, plus de réformes que votre capital politique ne le permet : ils s’activent quand vous en préparez trop.</p>
      ) : null}
    </section>
  )
}

/** Une carte joker, comme dans un jeu : elle brille quand on peut la jouer, se soulève quand elle est engagée. */
function JokerCard({
  art,
  name,
  effect,
  risk,
  charges,
  left,
  playable,
  armed,
  locked,
  tone,
  onClick,
}: {
  art: string
  name: string
  effect: string
  risk: string
  charges: string
  /** Il reste une charge (une fois par an, une fois par mandat). */
  left: boolean
  playable: boolean
  armed: boolean
  /** Pourquoi on ne peut pas la jouer maintenant. */
  locked: string | null
  tone: 'force' | 'referendum' | 'dissolution'
  onClick: () => void
}) {
  const state = armed ? 'is-armed' : playable ? 'is-playable' : 'is-locked'
  return (
    <button type="button" className={`joker-card joker-${tone} ${state}`} disabled={!playable && !armed} onClick={onClick} aria-pressed={armed} title={locked ?? effect}>
      <span className="jc-top">
        <span>Joker</span>
        <span className="jc-charges" aria-label={`${charges} : ${left ? 'disponible' : 'épuisé'}`}>
          <i className={left ? 'on' : ''} />
          {charges}
        </span>
      </span>
      <span className="jc-art" aria-hidden="true">
        {art}
      </span>
      <strong className="jc-name">{name}</strong>
      <span className="jc-effect">{effect}</span>
      <span className="jc-risk">{risk}</span>
      <span className="jc-foot">{armed ? '✓ Engagé · toucher pour annuler' : playable ? 'Jouer la carte' : `🔒 ${locked ?? ''}`}</span>
    </button>
  )
}
