import { ADVISORS, type Advice } from '../../game/advisors'
import { amount, money, type AdviceDetail as Detail, type Mechanism } from '../../game/adviceDetail'

/** Bon ou mauvais pour le pays : un indicateur qui baisse est une bonne nouvelle s'il vaut mieux qu'il soit bas. */
const tone = (value: number, goodWhenUp: boolean, eps: number) => (Math.abs(value) < eps ? 'flat' : value > 0 === goodWhenUp ? 'good' : 'bad')

function MechanismList({ items }: { items: Mechanism[] }) {
  return (
    <ul className="detail-mechanisms">
      {items.map((m) => (
        <li key={m.id}>
          <p>
            <strong>{m.name}</strong> <span className="detail-delta">{m.delta}</span> <small>({m.now})</small>
          </p>
          {m.explanation ? <p className="detail-why">{m.explanation}</p> : null}
          {m.causes.length ? <MechanismList items={m.causes} /> : null}
        </li>
      ))}
    </ul>
  )
}

/** L'avis détaillé d'un ministre : la part de chaque levier, les mécanismes, et pour le budget, qui paie. */
export function AdviceDetail({ advice, detail, onClose, onGraph }: { advice: Advice; detail: Detail; onClose: () => void; onGraph: (node: string) => void }) {
  const who = ADVISORS[advice.who]
  const { metric } = detail
  // Un écart négligeable, selon l'unité de l'indicateur.
  const eps = detail.topic === 'deficit' || detail.topic === 'emissions' ? 0.5 : detail.topic === 'discontent' ? 0.005 : 0.0002
  const max = Math.max(eps, ...detail.levers.map((l) => Math.abs(l.value)), Math.abs(detail.combination))
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal advice-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Avis de ${who.name}`}>
        <header>
          <div>
            <p className="eyebrow">
              {who.avatar} {who.name}, {who.role}
            </p>
            <h2>
              {metric.label} en {detail.year} : <span className={`tone-${tone(detail.total, metric.goodWhenUp, eps)}`}>{metric.show(detail.total)}</span>
            </h2>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <p className="belief">« {advice.text} »</p>

        <h3>Ce qui le fait bouger</h3>
        <p className="modal-lead">Chaque levier rejoué seul, l’an prochain, par rapport à « sans ce changement ».</p>
        <ul className="detail-levers">
          {detail.levers.map((l) => (
            <li key={l.key}>
              <span>
                <strong>{l.label}</strong> <small>{l.change}</small>
              </span>
              <span className="detail-bar">
                <i className={`tone-${tone(l.value, metric.goodWhenUp, eps)}`} style={{ width: `${(Math.abs(l.value) / max) * 100}%` }} />
              </span>
              <b className={`tone-${tone(l.value, metric.goodWhenUp, eps)}`}>{metric.show(l.value)}</b>
            </li>
          ))}
          {Math.abs(detail.combination) >= eps ? (
            <li>
              <span>
                <strong>Effet de combinaison</strong> <small>les leviers se renforcent ou se compensent</small>
              </span>
              <span className="detail-bar">
                <i className={`tone-${tone(detail.combination, metric.goodWhenUp, eps)}`} style={{ width: `${(Math.abs(detail.combination) / max) * 100}%` }} />
              </span>
              <b className={`tone-${tone(detail.combination, metric.goodWhenUp, eps)}`}>{metric.show(detail.combination)}</b>
            </li>
          ) : null}
        </ul>

        {detail.money ? (
          <>
            <h3>Comment c’est financé</h3>
            <p className="modal-lead">Ce qui change l’an prochain dans les comptes publics (euros courants).</p>
            <div className="detail-money">
              <div>
                <h4>Recettes</h4>
                {detail.money.revenue.length ? (
                  <ul>
                    {detail.money.revenue.slice(0, 6).map((r) => (
                      <li key={r.label}>
                        <span>{r.label}</span>
                        <b className={r.value > 0 ? 'good' : 'bad'}>{money(r.value)}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="note">Pas de changement notable.</p>
                )}
              </div>
              <div>
                <h4>Dépenses</h4>
                {detail.money.spending.length ? (
                  <ul>
                    {detail.money.spending.slice(0, 6).map((r) => (
                      <li key={r.label}>
                        <span>{r.label}</span>
                        <b className={r.value > 0 ? 'bad' : 'good'}>{money(r.value)}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="note">Pas de changement notable.</p>
                )}
              </div>
            </div>
            {Math.abs(detail.money.privateInvestment) >= 1 ? (
              <p className="note">
                {detail.money.privateInvestment > 0
                  ? `Hors budget public : les entreprises et les ménages investissent ${amount(detail.money.privateInvestment)} de plus${
                      detail.money.firmDebt >= 1 ? `, en partie à crédit (la dette des entreprises augmente de ${amount(detail.money.firmDebt)})` : ''
                    }. Ce sont eux qui paient ces équipements, pas l’État : cette dépense fait tourner l’économie, d’où plus de recettes publiques et moins de chômage à indemniser.`
                  : `Hors budget public : les entreprises et les ménages investissent ${amount(detail.money.privateInvestment)} de moins, ce qui freine l’activité.`}
              </p>
            ) : null}
          </>
        ) : null}

        <h3>Par quels mécanismes</h3>
        {detail.mechanisms.length ? (
          <>
            <p className="modal-lead">Les causes directes de « {metric.label.toLowerCase()} » dans le modèle qui bougent avec votre décision, et leurs propres causes.</p>
            <MechanismList items={detail.mechanisms} />
          </>
        ) : (
          <p className="note">Aucune cause directe ne bouge assez pour être montrée : l’effet passe par de nombreux petits canaux.</p>
        )}

        <div className="verdict-actions">
          <button type="button" className="ghost" onClick={() => onGraph(metric.node)}>
            🧠 Voir « {metric.label} » dans le graphe du modèle
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Compris
          </button>
        </div>
        <p className="note">Calculé par la simulation : chaque levier est rejoué seul, le reste vient de leur combinaison.</p>
      </div>
    </div>
  )
}
