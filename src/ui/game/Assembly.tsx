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
  hasDraft,
  over,
  armed,
  onArm,
  onDissolve,
}: {
  politics: Politics
  year: number
  popularity: number
  color: string
  hasDraft: boolean
  /** Les réformes en préparation dépassent le capital politique. */
  over: boolean
  armed: Joker | null
  onArm: (j: Joker | null) => void
  onDissolve: () => void
}) {
  const m = majorityOf(p.seats)
  const shift = MAJORITY_CAPITAL[m]
  const censure = Math.round(CENSURE_CHANCE[m] * 100)
  const yes = Math.round(referendumChance(popularity) * 100)
  const force = canForce(p, year + 1)
  const ref = canReferendum(p, year + 1)
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
      {over && !armed ? <p className="assembly-alert">Trop de réformes pour votre capital politique ? Jouez un joker, ou retirez des mesures.</p> : null}
      <div className="jokers">
        <button
          type="button"
          className={armed === 'force' ? 'joker is-armed' : 'joker'}
          disabled={!force || (!hasDraft && armed !== 'force')}
          onClick={() => onArm(armed === 'force' ? null : 'force')}
          title={force ? `Les réformes de l’année passent sans compter le capital politique. Risque de motion de censure : ${censure} %. Ensuite, −1 ⚡ l’an prochain (−2 si le gouvernement tombe).` : 'Déjà utilisé cette année.'}
        >
          <span>📜</span>
          <strong>49.3</strong>
          <small>{armed === 'force' ? 'Engagé ✓ (annuler)' : force ? `censure : ${censure} %` : 'déjà utilisé'}</small>
        </button>
        <button
          type="button"
          className={armed === 'referendum' ? 'joker is-armed' : 'joker'}
          disabled={!ref || (!hasDraft && armed !== 'referendum')}
          onClick={() => onArm(armed === 'referendum' ? null : 'referendum')}
          title={ref ? `Les Français votent les réformes de l’année : si le oui l’emporte (chance ≈ ${yes} %, selon votre popularité), elles passent sans compter le capital. Sinon, elles sont rejetées et vous perdez 2 ⚡. Une fois par mandat.` : 'Une fois par mandat : déjà utilisé.'}
        >
          <span>🗳️</span>
          <strong>Référendum</strong>
          <small>{armed === 'referendum' ? 'Convoqué ✓ (annuler)' : ref ? `oui ≈ ${yes} %` : 'déjà utilisé'}</small>
        </button>
        <button
          type="button"
          className="joker"
          disabled={!dissolve}
          onClick={() => {
            if (window.confirm(`Dissoudre l’Assemblée ? De nouvelles législatives ont lieu tout de suite, selon votre popularité (${popularity} %). Vous pouvez gagner une majorité… ou tout perdre.`)) {
              onDissolve()
            }
          }}
          title={dissolve ? 'De nouvelles législatives tout de suite, selon votre popularité du moment. Une fois par mandat.' : 'Pas dans l’année qui suit des législatives, et une fois par mandat.'}
        >
          <span>💥</span>
          <strong>Dissolution</strong>
          <small>{dissolve ? `popularité ${popularity} %` : 'pas maintenant'}</small>
        </button>
      </div>
      {!hasDraft && !armed ? <p className="assembly-note">Le 49.3 et le référendum s’appliquent aux réformes en préparation : bougez d’abord des leviers.</p> : null}
    </section>
  )
}
