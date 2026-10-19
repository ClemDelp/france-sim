import { GROUP_PARAMS } from '../model/calibration'
import { GROUPS, GROUP_LABEL, HOLDERS, HOLDER_LABEL, type Holder, type YearState } from '../model/types'
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
                <span>{num(monthly, 0)} € / mois</span>
              </div>
              {changed ? (
                <div className="group-bar">
                  <span className={d >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(d) / max) * 50}%`, [d >= 0 ? 'left' : 'right']: '50%' }} />
                  <em className={d >= 0 ? 'good' : 'bad'}>{`${signed(d * 100, 1)} %`}</em>
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
  return (
    <div className="panel">
      <h3>Dépenses publiques</h3>
      <Bars items={Object.entries(s.budget)} total={s.spending} gdp={s.gdp} />
      <h3>Recettes</h3>
      <Bars items={Object.entries(s.taxes)} total={s.revenue} gdp={s.gdp} />
      <p className={s.deficit > 0 ? 'callout bad' : 'callout good'}>
        {s.deficit > 0 ? `Il manque ${num(s.deficit, 0)} Md€ : c’est le déficit, emprunté et ajouté à la dette.` : `Il reste ${num(-s.deficit, 0)} Md€ : la dette peut baisser.`}
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
              <td>{num(v.revenue, 0)}</td>
              <td>{num(v.spending, 0)}</td>
              <td className={v.revenue - v.spending < 0 ? 'bad' : 'good'}>{signed(v.revenue - v.spending, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">En Md€. Répartition des cotisations entre branches simplifiée ; l’État comble les écarts.</p>
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
            {num(total, 0)}
          </text>
          <text x="70" y="84" textAnchor="middle" className="donut-unit">
            Md€
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
            <dd>{num(s.interest, 0)} Md€ par an</dd>
          </div>
        </dl>
      </div>
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
export function WorldPanel({ s }: PanelProps) {
  return (
    <div className="panel">
      <dl className="facts">
        <div>
          <dt>Prix du pétrole</dt>
          <dd>{num(s.oil, 0)} $ le baril</dd>
        </div>
        <div>
          <dt>Pétrole et gaz importés</dt>
          <dd>{num(s.energyImports, 0)} Md€ par an</dd>
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
          <dd>{num(s.exports, 0)} Md€</dd>
        </div>
        <div>
          <dt>Importations (hors énergie)</dt>
          <dd>{num(s.imports, 0)} Md€</dd>
        </div>
        <div>
          <dt>Solde avec le reste du monde</dt>
          <dd className={s.currentAccount < 0 ? 'bad' : 'good'}>{signed(s.currentAccount, 0)} Md€</dd>
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
