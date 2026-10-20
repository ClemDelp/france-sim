import { BASE, GROUP_PARAMS, P } from '../model/calibration'
import { GROUPS, GROUP_LABEL, HOLDERS, HOLDER_LABEL, SIZES, SIZE_LABEL, type Holder, type YearState } from '../model/types'
import { num, pct, signed } from './format'
import { yearStory } from './story'

type PanelProps = { s: YearState; b: YearState; changed: boolean }

/** Qui gagne, qui perd : le revenu de chaque tranche, la pauvreté, les inégalités, l'espérance de vie. */
export function GroupsPanel({ s, b, changed }: PanelProps) {
  const max = Math.max(...GROUPS.map((g) => Math.abs(s.disposablePerCapita[g] / b.disposablePerCapita[g] - 1)), 0.01)
  return (
    <div className="panel">
      <p className="panel-lead">
        Revenu disponible mensuel moyen par personne (enfants compris), en euros de 2025
        {changed ? ', et l’écart avec « si on n’avait rien changé »' : ''}.
      </p>
      <ul className="groups">
        {GROUPS.map((g) => {
          const monthly = s.disposablePerCapita[g] / 12
          const d = s.disposablePerCapita[g] / b.disposablePerCapita[g] - 1
          const life = s.lifeExpectancy + (GROUP_PARAMS.lifeOffset[g] * s.lifeGap) / 13
          return (
            <li key={g}>
              <div className="group-head">
                <strong>{GROUP_LABEL[g]}</strong>
                <span>
                  {num(monthly, 0)} € / mois
                  {changed ? <em className={d >= 0 ? 'good' : 'bad'}>{` ${signed(d * 100, 1)} %`}</em> : null}
                </span>
              </div>
              {changed ? (
                <div className="group-bar" title="La barre part du milieu : à droite on gagne, à gauche on perd, par rapport à « si on n’avait rien changé ».">
                  <span className={d >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(d) / max) * 50}%`, [d >= 0 ? 'left' : 'right']: '50%' }} />
                </div>
              ) : null}
              <small>Espérance de vie ≈ {num(life, 1)} ans</small>
            </li>
          )
        })}
      </ul>
      <dl className="facts">
        <div>
          <dt>Pauvreté</dt>
          <dd>
            {pct(s.poverty)} · {num(s.poverty * s.population, 1)} millions de personnes
          </dd>
        </div>
        <div>
          <dt>Rapport entre les 10 % du haut et du bas</dt>
          <dd>{num(s.ratioD9D1, 2)}</dd>
        </div>
        <div>
          <dt>Indice de Gini</dt>
          <dd>{num(s.gini, 3)}</dd>
        </div>
        <div>
          <dt>Écart d’espérance de vie riches / pauvres</dt>
          <dd>{num(s.lifeGap, 1)} ans</dd>
        </div>
      </dl>
    </div>
  )
}

function Bars({ items, total, gdp }: { items: [string, number][]; total: number; gdp: number }) {
  const max = Math.max(...items.map(([, v]) => v))
  return (
    <ul className="bars">
      {items
        .filter(([, v]) => v > 0.5)
        .sort((a, b) => b[1] - a[1])
        .map(([label, v]) => (
          <li key={label}>
            <span className="bar-label">{label}</span>
            <span className="bar-track">
              <span style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="bar-value">
              {num(v, 0)} Md€ <small>· {num((v / gdp) * 100, 1)} % PIB</small>
            </span>
          </li>
        ))}
      <li className="bar-total">
        <span className="bar-label">Total</span>
        <span />
        <span className="bar-value">
          {num(total, 0)} Md€ <small>· {num((total / gdp) * 100, 1)} % PIB</small>
        </span>
      </li>
    </ul>
  )
}

/** Où va l'argent public, d'où il vient, et les comptes de la Sécu. */
export function BudgetPanel({ s }: PanelProps) {
  // Tous les montants en euros de 2025 : on retire l'inflation pour comparer les années entre elles.
  const k = 1 / s.priceLevel
  const real = (r: Record<string, number>) => Object.entries(r).map(([label, v]) => [label, v * k] as [string, number])
  return (
    <div className="panel">
      <p className="panel-lead">En milliards d’euros de 2025 (inflation retirée), et en part de la richesse produite.</p>
      <h3>Dépenses publiques</h3>
      <Bars items={real(s.budget)} total={s.spending * k} gdp={s.gdp * k} />
      <h3>Recettes</h3>
      <Bars items={real(s.taxes)} total={s.revenue * k} gdp={s.gdp * k} />
      <p className={s.deficit > 0 ? 'callout bad' : 'callout good'}>
        {s.deficit > 0
          ? `Il manque ${num(s.deficit * k, 0)} Md€ (${num((s.deficit / s.gdp) * 100, 1)} % du PIB) : c’est le déficit, emprunté et ajouté à la dette.`
          : `Il reste ${num(-s.deficit * k, 0)} Md€ : la dette peut baisser.`}
      </p>
      <h3>Sécurité sociale, par branche</h3>
      <table className="secu">
        <thead>
          <tr>
            <th>Branche</th>
            <th>Recettes</th>
            <th>Dépenses</th>
            <th>Solde</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(s.secu).map(([branch, v]) => (
            <tr key={branch}>
              <td>{branch}</td>
              <td>{num(v.revenue * k, 0)}</td>
              <td>{num(v.spending * k, 0)}</td>
              <td className={v.revenue - v.spending < 0 ? 'bad' : 'good'}>{signed((v.revenue - v.spending) * k, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">En Md€ de 2025. Répartition des cotisations entre branches simplifiée ; l’État comble les écarts.</p>
    </div>
  )
}

const HOLDER_COLOR: Record<Holder, string> = { monde: '#5b8def', bce: '#f5b70a', assureurs: '#2fbf71', banques: '#e5484d' }
const HOLDER_LOSS: Record<Holder, string> = {
  monde: 'Effacer leur part = un défaut : la France perd la confiance des marchés et emprunte beaucoup plus cher.',
  bce: 'Effacer sa part ne rapporte presque rien : ses bénéfices revenaient déjà à l’État. Et c’est contraire aux traités.',
  assureurs: 'Effacer leur part, c’est faire perdre leur épargne aux millions de détenteurs d’assurance-vie.',
  banques: 'Effacer leur part fragilise les banques : elles prêtent moins aux entreprises et aux ménages.',
}

/** Qui détient la dette, combien elle coûte, et qui perdrait si on l'annulait. */
export function DebtPanel({ s }: PanelProps) {
  const total = HOLDERS.reduce((acc, h) => acc + s.holders[h], 0)
  const shares = HOLDERS.map((h) => s.holders[h] / total)
  const arcs = HOLDERS.map((h, i) => {
    const share = shares[i]
    const a0 = -Math.PI / 2 + shares.slice(0, i).reduce((acc, v) => acc + v, 0) * 2 * Math.PI
    const a1 = a0 + share * 2 * Math.PI
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (a: number, r: number) => `${(70 + r * Math.cos(a)).toFixed(1)} ${(70 + r * Math.sin(a)).toFixed(1)}`
    return { h, share, d: `M${p(a0, 64)} A64 64 0 ${large} 1 ${p(a1, 64)} L${p(a1, 38)} A38 38 0 ${large} 0 ${p(a0, 38)} Z` }
  })
  return (
    <div className="panel">
      <div className="debt-head">
        <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="Détenteurs de la dette">
          {arcs.map((a) => (
            <path key={a.h} d={a.d} fill={HOLDER_COLOR[a.h]} />
          ))}
          <text x="70" y="68" textAnchor="middle" className="donut-value">
            {num(total / s.priceLevel, 0)}
          </text>
          <text x="70" y="84" textAnchor="middle" className="donut-unit">
            Md€ de 2025
          </text>
        </svg>
        <dl className="facts">
          <div>
            <dt>Dette</dt>
            <dd>{pct(s.debtRatio, 0)} du PIB</dd>
          </div>
          <div>
            <dt>Taux à 10 ans</dt>
            <dd>{pct(s.rate, 2)}</dd>
          </div>
          <div>
            <dt>Taux moyen payé</dt>
            <dd>{pct(s.effectiveRate, 2)}</dd>
          </div>
          <div>
            <dt>Charge des intérêts</dt>
            <dd>
              {num(s.interest / s.priceLevel, 0)} Md€ par an ({num((s.interest / s.gdp) * 100, 1)} % du PIB)
            </dd>
          </div>
        </dl>
      </div>
      <StressGauge s={s} />
      <h3>Qui nous prête, et qui perdrait si on annulait</h3>
      <ul className="holders">
        {HOLDERS.map((h) => (
          <li key={h}>
            <i style={{ background: HOLDER_COLOR[h] }} />
            <div>
              <strong>
                {HOLDER_LABEL[h]} · {pct(s.holders[h] / total, 0)}
              </strong>
              <p>{HOLDER_LOSS[h]}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="note">
        La dette n’est pas un problème en soi : elle finance des dépenses étalées dans le temps et sert de placement sûr à l’épargne. Elle devient dangereuse quand le taux
        payé dépasse durablement la croissance, ou quand les prêteurs doutent d’être remboursés.
      </p>
    </div>
  )
}

/** Énergie et commerce extérieur. */
const INFLUENCE_PARTS: [keyof YearState['influenceParts'], string][] = [
  ['military', 'Force militaire'],
  ['economy', 'Poids économique'],
  ['culture', 'Rayonnement culturel'],
  ['aid', 'Aide au développement'],
  ['climate', 'Exemplarité climatique'],
  ['stability', 'Stabilité intérieure'],
]

export function WorldPanel({ s, b, changed }: PanelProps) {
  return (
    <div className="panel">
      <h3>🌐 Influence de la France : indice {num(s.influence * 100, 0)}</h3>
      <p className="panel-lead">
        100 = 2025{changed ? ` · sans vos décisions : ${num(b.influence * 100, 0)}` : ''}. Elle facilite les accords (climat, paix), réduit les guerres commerciales et les
        représailles, aide les exportations et rassure les prêteurs. Elle évolue lentement.
      </p>
      <ul className="influence-parts">
        {INFLUENCE_PARTS.map(([k, label]) => {
          const v = s.influenceParts[k]
          return (
            <li key={k}>
              <span>{label}</span>
              <span className="bar-track">
                <span style={{ width: `${Math.min(100, (v / 2) * 100)}%` }} className={v >= 1 ? 'up' : 'down'} />
              </span>
              <strong className={v >= 1.005 ? 'good' : v <= 0.995 ? 'bad' : ''}>{num(v * 100, 0)}</strong>
            </li>
          )
        })}
      </ul>
      <p className="panel-lead">Montants en milliards d’euros de 2025 (inflation retirée).</p>
      <dl className="facts">
        <div>
          <dt>Prix du pétrole</dt>
          <dd>{num(s.oil, 0)} $ le baril</dd>
        </div>
        <div>
          <dt>Pétrole et gaz importés</dt>
          <dd>{num(s.energyImports / s.priceLevel, 0)} Md€ par an</dd>
        </div>
        <div>
          <dt>Part du pétrole et du gaz dans l’énergie</dt>
          <dd>{pct(s.fossilShare, 0)}</dd>
        </div>
        <div>
          <dt>Prix de l’électricité</dt>
          <dd>indice {num(s.electricityPrice * 100, 0)} (100 = 2025)</dd>
        </div>
        <div>
          <dt>Exportations</dt>
          <dd>{num(s.exports / s.priceLevel, 0)} Md€</dd>
        </div>
        <div>
          <dt>Importations (hors énergie)</dt>
          <dd>{num(s.imports / s.priceLevel, 0)} Md€</dd>
        </div>
        <div>
          <dt>Solde avec le reste du monde</dt>
          <dd className={s.currentAccount < 0 ? 'bad' : 'good'}>
            {signed(s.currentAccount / s.priceLevel, 0)} Md€ ({signed((s.currentAccount / s.gdp) * 100, 1)} % du PIB)
          </dd>
        </div>
      </dl>
      <p className="note">
        L’énergie est la pierre angulaire : chaque produit en contient. Quand le pétrole flambe, tous les prix montent, sans que le pays produise plus : c’est de l’inflation
        sans croissance, et l’argent part chez les pays producteurs. Électrifier avec une électricité produite en France réduit cette dépendance.
      </p>
    </div>
  )
}

/** Le journal de la partie : ce qui s'est passé, année par année, et pourquoi. */
export function JournalPanel({ states, base }: { states: YearState[]; base: YearState[] }) {
  const entries = states
    .map((s, i) => ({ year: s.year, lines: yearStory(s, states[i - 1], base[i]) }))
    .filter((e) => e.lines.length)
    .reverse()
  return (
    <div className="panel">
      {entries.length === 0 ? <p className="panel-lead">Rien de notable pour l’instant. Bougez un levier, déclenchez un événement ou testez une idée reçue.</p> : null}
      <ol className="journal">
        {entries.map((e) => (
          <li key={e.year}>
            <strong>{e.year}</strong>
            <ul>
              {e.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** La tension sur la dette : à 1, les prêteurs paniquent et la crise éclate. */
function StressGauge({ s }: { s: YearState }) {
  const level = s.marketStress
  const zone = level >= 1 ? 'crise' : level >= 0.7 ? 'tendu' : 'calme'
  return (
    <div className={`stress stress-${zone}`}>
      <div className="stress-head">
        <strong>Tension sur la dette</strong>
        <span>{zone === 'crise' ? 'Crise' : zone === 'tendu' ? 'Les marchés s’inquiètent' : 'Calme'}</span>
      </div>
      <div className="stress-track" role="meter" aria-valuemin={0} aria-valuemax={1.5} aria-valuenow={level} aria-label="Tension sur la dette">
        <span style={{ width: `${Math.min(100, (level / 1.5) * 100)}%` }} />
        <i style={{ left: `${(1 / 1.5) * 100}%` }} />
      </div>
      <p className="note">
        Les prêteurs regardent deux choses : le niveau de la dette, et l’écart entre le solde public et ce qu’il faudrait pour qu’elle cesse d’augmenter (compte tenu du taux payé
        et de la croissance). Quand l’indice atteint 1, la crise éclate.
      </p>
      {s.rescueYears > 0 ? (
        <p className="callout bad">
          Plan d’aide européen en cours ({s.rescueYears} an{s.rescueYears > 1 ? 's' : ''} restant{s.rescueYears > 1 ? 's' : ''}) : taux plafonnés, économies imposées ({num(s.rescueEffort * 100, 1)} point
          {s.rescueEffort > 0.015 ? 's' : ''} de PIB au total).
        </p>
      ) : s.rescueEffort > 0 ? (
        <p className="note">Économies imposées par les plans d’aide passés : {num(s.rescueEffort * 100, 1)} points de PIB.</p>
      ) : null}
    </div>
  )
}

/** Les entreprises par taille : qui emploie, investit, exporte, et comment chacune réagit aux décisions. */
export function FirmsPanel({ s, b, changed }: PanelProps) {
  const k = 1 / s.priceLevel
  const kb = 1 / b.priceLevel
  const rows: { label: string; get: (f: YearState['firms']['pme']) => number; unit: 'jobs' | 'bn' }[] = [
    { label: 'Emplois salariés', get: (f) => f.employment, unit: 'jobs' },
    { label: 'Investissement', get: (f) => f.investment, unit: 'bn' },
    { label: 'Exportations', get: (f) => f.exports, unit: 'bn' },
    { label: 'Profits avant impôt', get: (f) => f.profits, unit: 'bn' },
    { label: 'Impôt sur les sociétés', get: (f) => f.corporateTax, unit: 'bn' },
  ]
  return (
    <div className="panel">
      <p className="panel-lead">
        Montants en milliards d’euros de 2025{changed ? ', et l’écart avec « si on n’avait rien changé »' : ''}. Les PME dépendent de leur banque et emploient beaucoup de
        salariés au SMIC ; les grands groupes exportent et peuvent déplacer leurs bénéfices.
      </p>
      <div className="firms">
        {SIZES.map((c) => (
          <div key={c} className="firm-card">
            <h3>{SIZE_LABEL[c]}</h3>
            <dl className="facts">
              {rows.map((r) => {
                const v = r.get(s.firms[c])
                const ref = r.get(b.firms[c])
                const d = r.unit === 'jobs' ? v / ref - 1 : (v * k) / (ref * kb) - 1
                return (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>
                      {r.unit === 'jobs' ? `${num(v, 2)} M` : `${num(v * k, 0)} Md€`}
                      {changed && Math.abs(d) > 0.0005 ? <em className={d > 0 === (r.label !== 'Impôt sur les sociétés') ? 'good' : 'bad'}>{` ${signed(d * 100, 1)} %`}</em> : null}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        ))}
      </div>
      <p className="note">
        PME et TPE : moins de 250 salariés. ETI : de 250 à 4 999. Grandes entreprises : 5 000 et plus. Le modèle répartit l’activité totale selon le poids de chaque taille et
        ses sensibilités propres (modele/entreprises.csv).
      </p>
    </div>
  )
}

/** Le climat : la planète (que la France ne pilote pas seule), et ce que la France émet, subit et prépare. */
export function ClimatePanel({ s, b, changed }: PanelProps) {
  const t = s.temperature
  // Le thermomètre va de +1 °C à +4 °C.
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - 1) / 3) * 100))}%`
  const zone = t >= 3 ? 'Danger extrême' : t >= 2 ? 'Au-delà de l’accord de Paris' : t >= 1.5 ? 'Au-delà de 1,5 °C' : 'Sous 1,5 °C'
  // Budget carbone restant pour rester sous 1,5 °C et 2 °C (GIEC, à partir de 2025 : ≈ 130 et ≈ 900 Gt).
  const budget15 = Math.max(0, 130 - s.cumulativeCO2)
  const budget2 = Math.max(0, 900 - s.cumulativeCO2)
  const frenchShare = s.frenchEmissions / 1000 / s.worldEmissions
  return (
    <div className="panel">
      <h3>🌍 La planète</h3>
      <div className="thermo">
        <div className="thermo-track">
          <span className="thermo-fill" style={{ width: pos(t) }} />
          {[1.5, 2, 3].map((v) => (
            <i key={v} style={{ left: pos(v) }}>
              <small>{num(v, 1)} °C</small>
            </i>
          ))}
        </div>
        <strong className={t >= 2 ? 'bad' : t >= 1.5 ? 'warn' : ''}>
          +{num(t, 2)} °C <small>{zone}</small>
        </strong>
      </div>
      <dl className="facts">
        <div>
          <dt>Émissions mondiales de CO2</dt>
          <dd>{num(s.worldEmissions, 1)} Gt par an</dd>
        </div>
        <div>
          <dt>Budget carbone restant pour 1,5 °C</dt>
          <dd className={budget15 === 0 ? 'bad' : ''}>{budget15 === 0 ? 'épuisé' : `${num(budget15, 0)} Gt (${num(budget15 / s.worldEmissions, 0)} ans au rythme actuel)`}</dd>
        </div>
        <div>
          <dt>Budget carbone restant pour 2 °C</dt>
          <dd className={budget2 === 0 ? 'bad' : ''}>{budget2 === 0 ? 'épuisé' : `${num(budget2, 0)} Gt (${num(budget2 / s.worldEmissions, 0)} ans)`}</dd>
        </div>
      </dl>
      <h3>🇫🇷 La France</h3>
      <dl className="facts">
        <div>
          <dt>Émissions françaises</dt>
          <dd>
            {num(s.frenchEmissions, 0)} Mt par an
            {changed ? <em className={s.frenchEmissions < b.frenchEmissions ? 'good' : 'bad'}>{` ${signed((s.frenchEmissions / b.frenchEmissions - 1) * 100, 0)} %`}</em> : null}
          </dd>
        </div>
        <div>
          <dt>Objectif 2030 (−55 % par rapport à 1990)</dt>
          <dd className={s.frenchEmissions <= BASE.emissionsTarget2030 ? 'good' : 'bad'}>{num(BASE.emissionsTarget2030, 0)} Mt</dd>
        </div>
        <div>
          <dt>Part de la France dans le CO2 mondial</dt>
          <dd>{num(frenchShare * 100, 1)} %</dd>
        </div>
        <div>
          <dt>Dégâts climatiques en France</dt>
          <dd className={s.climateDamage > 0.02 ? 'bad' : ''}>{num(s.climateDamage * 100, 1)} % du PIB par an</dd>
        </div>
        <div>
          <dt>Dégâts évités par l’adaptation</dt>
          <dd>{num(s.adaptationCoverage * 100, 0)} %</dd>
        </div>
        <div>
          <dt>Pétrole et gaz dans l’énergie</dt>
          <dd>{num(s.fossilShare * 100, 0)} %</dd>
        </div>
      </dl>
      <p className="note">
        La température dépend des émissions du monde entier : la France n’en émet que {num(frenchShare * 100, 1)} %. Ses choix comptent surtout pour sa propre
        vulnérabilité (adaptation, dépendance au pétrole), la santé de ses habitants (pollution de l’air), et par l’exemple et l’aide aux pays du Sud.
        Au-delà de {num(P.tippingTemperature, 1)} °C, des points de bascule (pergélisol, forêts) relâchent du carbone et accélèrent le réchauffement. Sources : GIEC AR6,
        Global Carbon Budget, ONU Environnement, Citepa.
      </p>
    </div>
  )
}

/** L'immigration : d'où vient la pression, ce que la politique filtre, et à quel prix. */
export function MigrationPanel({ s, b, changed }: PanelProps) {
  const p = s.migrationPressure
  const pressure = p.base + p.climate + p.conflict
  const total = s.migrationLegal + s.migrationIrregular
  /** En milliers : « 56 000 », et « 0 » plutôt que « 0 000 ». */
  const k = (v: number) => (Math.abs(v) < 0.5 ? '0' : `${num(v, 0)} 000`)
  const parts: [string, number, string][] = [
    ['Arrivées de base (asile, irrégulier)', p.base, '#5b8def'],
    ['Dues au réchauffement', p.climate, '#ff7a2f'],
    ['Dues aux guerres et famines', p.conflict, '#e5484d'],
  ]
  return (
    <div className="panel">
      <p className="panel-lead">En milliers de personnes par an (solde : arrivées moins départs).</p>
      <dl className="facts">
        <div>
          <dt>Immigration légale (travail, études, famille)</dt>
          <dd>{k(s.migrationLegal)}</dd>
        </div>
        <div>
          <dt>Arrivées hors voies légales qui restent</dt>
          <dd>
            {k(s.migrationIrregular)}
            {changed ? <em className={s.migrationIrregular < b.migrationIrregular ? 'good' : 'bad'}>{` ${s.migrationIrregular > b.migrationIrregular ? '+' : '−'}${k(Math.abs(s.migrationIrregular - b.migrationIrregular))}`}</em> : null}
          </dd>
        </div>
        <div>
          <dt>Solde migratoire total</dt>
          <dd>{k(total)}</dd>
        </div>
      </dl>
      <h3>D’où vient la pression ({k(pressure)} avant contrôle)</h3>
      <div className="stack-bar" role="img" aria-label="Causes de la pression migratoire">
        {parts.map(([label, v, color]) => (v > 0.5 ? <span key={label} style={{ width: `${(v / pressure) * 100}%`, background: color }} title={`${label} : ${k(v)}`} /> : null))}
      </div>
      <ul className="stack-legend">
        {parts.map(([label, v, color]) => (
          <li key={label}>
            <i style={{ background: color }} />
            {label} <strong>{k(v)}</strong>
          </li>
        ))}
      </ul>
      <h3>Ce que fait votre politique</h3>
      <dl className="facts">
        <div>
          <dt>Arrivées irrégulières empêchées par le contrôle</dt>
          <dd>{num(s.controlEffect * 100, 0)} % (au mieux {num(P.controlMax * 100, 0)} %)</dd>
        </div>
        <div>
          <dt>Conflits et départs évités par l’aide au développement</dt>
          <dd>{num(s.peaceEffect * 100, 0)} %</dd>
        </div>
        <div>
          <dt>Difficultés d’accueil évitées par l’intégration</dt>
          <dd>{num(s.integrationCoverage * 100, 0)} %</dd>
        </div>
        <div>
          <dt>Conflits autour de l’Europe</dt>
          <dd className={s.conflict > 0.5 ? 'bad' : ''}>{s.conflict > 0.05 ? `indice ${num(s.conflict, 2)}` : 'calme'}</dd>
        </div>
      </dl>
      <p className="note">
        Le contrôle des frontières coûte de plus en plus cher pour un effet de plus en plus faible : renvoyer quelqu’un dépend de son pays d’origine, et la pression revient
        tant que guerres, misère et réchauffement poussent au départ. L’aide au développement et à la paix agit sur les causes, mais lentement. L’intégration ne change pas
        le nombre d’arrivées : elle aide les arrivants à travailler et évite les tensions d’un accueil débordé. Hypothèses dans modele/comportements.csv (bloc Immigration).
      </p>
    </div>
  )
}
