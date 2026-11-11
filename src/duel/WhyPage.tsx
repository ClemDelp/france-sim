import { useMemo } from 'react'
import { num } from '../ui/format'
import { ACTIONS, cardArt, cardName, CRISES, crisisEvent, inModel, type Card } from './cards'
import { ALERT_AT, budgetCost, contextOf, marginLeft, overshootMalus, type Game, type Side } from './engine'
import { cardImpact, contextShift, CRITERION_NODE, crisisEffects, leverChanges, openModel, startNodes, whyTree, type Detail, type Impact, type Indicator, type WhyNode } from './why'

const signed = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v), digits)}`
const arrow = (up: boolean | null) => (up === null ? '↕' : up ? '↑' : '↓')

/**
 * « Pourquoi ? » : une page à part, hors de la table, pour qui veut comprendre une carte en détail.
 * Ce que la carte change, le budget, la note critère par critère, les indicateurs, et l'histoire dans le modèle.
 * La partie reste en dessous, telle quelle : « Retour » y ramène.
 */
export function WhyPage({ g, card, side, kind, onBack }: { g: Game; card: Card; side: Side; kind: { cls: string; label: string }; onBack: () => void }) {
  const impact = useMemo(() => cardImpact(g, side, card), [g, side, card])
  const levers = card.kind === 'mesure' ? leverChanges(g, side, card) : []
  const starts = startNodes(g, side, card)
  const whose = impact ? (impact.target === 'player' ? 'votre France' : `la France de ${g.seats[impact.target].name}`) : ''
  const description = card.kind === 'crise' ? CRISES[card.crisis].text : card.kind === 'action' ? ACTIONS[card.action].text : card.pledge.quote || card.pledge.measure!.summary
  const event = card.kind === 'crise' ? crisisEvent(card.crisis) : card.kind === 'action' ? (ACTIONS[card.action].events?.[0] ?? null) : null
  const effects = event ? crisisEffects(event) : null
  const shift = contextShift(g, card)
  const ctx = contextOf(g)
  const played = g.seats[side].played.some((p) => p.card.uid === card.uid)
  return (
    <div className="dl-whypage" role="dialog" aria-modal="true" aria-label={`Pourquoi : ${cardName(card)}`}>
      <header className="dlg-top">
        <button type="button" className="ghost small dl-back-btn" onClick={onBack}>
          ← Retour au jeu
        </button>
        <strong className="dl-year">🔍 Pourquoi ?</strong>
        <span />
      </header>
      <div className="dl-whypage-body dl-explain">
        <section className={`dl-whyhead ${kind.cls}`}>
          <span className="dl-whyhead-art" aria-hidden="true">
            {cardArt(card)}
          </span>
          <div>
            <small>{kind.label}</small>
            <h2>{cardName(card)}</h2>
            <p>{description}</p>
          </div>
        </section>

        {levers.length ? (
          <section>
            <h3>🎚️ Ce que la carte change</h3>
            <ul className="dl-levers">
              {levers.map((l) => (
                <li key={l.key}>
                  {l.label} : {l.from} → <b>{l.to}</b>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {card.kind === 'mesure' && side === 'player' ? <BudgetLine g={g} card={card} played={played} /> : null}
        {shift ? (
          <p className="dl-ctxnote">
            {ctx.art} {ctx.name} : {shift < 0 ? `${-shift} ⚡ de moins` : `${shift} ⚡ de plus`} cette année. {ctx.rule}
          </p>
        ) : null}
        {effects?.text.length ? (
          <section>
            <h3>🌍 Ce que la carte déclenche dans le modèle</h3>
            <p>
              {effects.text.join(', ')}
              {effects.years > 1 ? `, pendant ${effects.years} ans` : ''}.
              {card.kind === 'action' && card.action === 'tweet' ? ' Pile ou face : ci-dessous, le bon côté ; le mauvais fait l’inverse.' : ''}
              {card.kind === 'action' && card.action === 'alignement' ? ' 6 chances sur 10 d’harmonie (ci-dessous) ; sinon l’éclipse : −2 points de popularité.' : ''}
            </p>
          </section>
        ) : null}
        {impact && card.kind !== 'mesure' && Math.abs(impact.budget.spending - impact.budget.revenue) >= 0.1 ? <BudgetLines impact={impact} whose={whose} /> : null}
        {card.kind === 'action' && ACTIONS[card.action].spend ? (
          <section>
            <h3>💶 Le budget de l’État cette année</h3>
            <p>{ACTIONS[card.action].spend!.amount} Md€ d’argent public en plus cette année (comptés dans la marge budgétaire), puis plus rien.</p>
          </section>
        ) : null}
        {!inModel(card) ? (
          <section>
            <h3>{card.kind === 'crise' ? '🎯 Un coup qui change la partie' : '🎴 Une carte qui change la partie'}</h3>
            <p>
              {card.kind === 'crise' ? CRISES[card.crisis].rule : card.kind === 'action' ? ACTIONS[card.action].text : ''} Elle ne passe pas par le modèle : elle ne change ni l’économie ni la
              société, seulement les règles du duel.
            </p>
          </section>
        ) : null}
        {impact ? (
          <>
            <section>
              <h3>
                📊 Note de {whose} l’an prochain : {signed(impact.health)} point{Math.abs(impact.health) > 1 ? 's' : ''}
              </h3>
              <p className="note">En points de note (sur 100), critère par critère. Sous chaque critère, ce qui le fait bouger.</p>
              <div className="dl-parts">
                {impact.parts.map((p) => (
                  <details key={p.id} className="dl-part-row" open>
                    <summary className="dl-part">
                      <span>{p.label}</span>
                      <i className={p.delta >= 0 ? 'up' : 'down'} style={{ width: `${Math.min(100, Math.abs(p.delta) * 25)}%` }} />
                      <b className={p.delta >= 0 ? 'good' : 'bad'}>{signed(p.delta, 1)}</b>
                    </summary>
                    <DetailView detail={impact.details[CRITERION_NODE[p.id]]} />
                  </details>
                ))}
                {!impact.parts.length ? <p className="note">Presque rien la première année : l’effet est lent, ou trop petit pour bouger la note.</p> : null}
              </div>
            </section>
            <section>
              <h3>📈 Ce qui bouge dans {whose}</h3>
              <ul className="dl-moves">
                {impact.indicators.map((ind) => (
                  <Move key={ind.node} ind={ind} />
                ))}
              </ul>
              {!impact.indicators.length ? <p className="note">Rien ne bouge assez dès la première année : l’effet est lent ou très petit.</p> : null}
            </section>
            <Why starts={starts} impact={impact} />
          </>
        ) : null}
        <section className="dl-whyfoot">
          <p className="note">Calculé par le modèle : l’année qui vient, jouée avec et sans la carte (à côté des cartes déjà posées). Les liens de cause à effet viennent de modele/liens.csv.</p>
          <button type="button" className="ghost" onClick={() => openModel(starts[0]?.node ?? null)}>
            🧠 Explorer le modèle
          </button>
        </section>
      </div>
    </div>
  )
}

/** Ce que la mesure coûte au budget, et ce qu'il reste de la marge de l'année si on la joue. */
function BudgetLine({ g, card, played }: { g: Game; card: Card; played: boolean }) {
  const s = g.seats.player
  const md = played ? (s.played.find((p) => p.card.uid === card.uid)?.md ?? 0) : budgetCost(g, 'player', card)
  const after = played ? marginLeft(s) : marginLeft(s) - md
  return (
    <section>
      <h3>💶 Le budget de l’État cette année</h3>
      <p>
        La mesure {md > 0.05 ? 'coûte' : md < -0.05 ? 'rapporte' : 'ne change presque rien :'} <b className={md > 0.05 ? 'bad' : 'good'}>{num(Math.abs(md), Math.abs(md) < 10 ? 1 : 0)} Md€</b>
        {md > 0.05 ? ' de déficit en plus' : md < -0.05 ? ' (déficit en moins)' : ''}, selon le modèle. Marge restante {played ? '' : 'après elle '}:{' '}
        <b className={after < 0 ? 'bad' : 'good'}>{num(after, 0)} Md€</b>
        {after < 0 ? ` : au-delà de la marge, les marchés s’inquiètent (−${overshootMalus(-after)} ⚡ l’an prochain${-after >= ALERT_AT ? ', et Bruxelles sanctionne' : ''}).` : '.'}
      </p>
    </section>
  )
}

/**
 * Le budget de l'État d'une crise ou d'un événement : le déficit bouge par ses postes (moins d'activité, moins de recettes ;
 * plus de chômage, plus d'allocations), sans que personne n'ait rien voté.
 */
function BudgetLines({ impact, whose }: { impact: Impact; whose: string }) {
  const { spending, revenue, lines } = impact.budget
  const deficit = spending - revenue
  const md = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v), Math.abs(v) < 10 ? 1 : 0)} Md€`
  return (
    <section>
      <h3>💶 Le budget de l’État ({whose})</h3>
      <p>
        Le déficit {deficit > 0 ? 'se creuse' : 'se réduit'} de <b className={deficit > 0 ? 'bad' : 'good'}>{num(Math.abs(deficit), Math.abs(deficit) < 10 ? 1 : 0)} Md€</b> : recettes{' '}
        {md(revenue)}, dépenses {md(spending)}. Personne n’a rien voté : c’est l’économie qui bouge le budget (moins d’activité, moins d’impôts ; plus de chômage, plus d’allocations).
      </p>
      {lines.length ? (
        <ul className="dl-moves">
          {lines.slice(0, 6).map((l) => {
            // Une dépense en plus ou une recette en moins creuse le déficit.
            const worse = l.spending ? l.delta > 0 : l.delta < 0
            return (
              <li key={`${l.spending}-${l.label}`} className={worse ? 'bad' : 'good'}>
                {l.spending ? '🧾' : '💰'} {l.label} : <b>{md(l.delta)}</b>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

/** Un indicateur qui bouge : sa flèche, de combien, en vert si c'est bon pour le pays. */
function Move({ ind }: { ind: Indicator }) {
  return (
    <li className={ind.good ? 'good' : 'bad'}>
      {ind.label} {arrow(ind.up)} <b>{ind.amount}</b>
    </li>
  )
}

/** Pourquoi : une seule histoire, de la carte jusqu'aux indicateurs, les chemins communs montrés une fois. */
function Why({ starts, impact }: { starts: { node: string; up: boolean }[]; impact: Impact }) {
  const { roots, other } = whyTree(starts, impact)
  // Les indicateurs de la note sont déjà décomposés plus haut, critère par critère : ici, seulement les autres.
  const rest = other.filter((ind) => !impact.parts.some((p) => CRITERION_NODE[p.id] === ind.node))
  if (!roots.length && !rest.length) {
    return null
  }
  return (
    <section>
      <h3>🔗 L’histoire dans le modèle</h3>
      {roots.length ? <WhyList nodes={roots} /> : null}
      {rest.map((ind) => (
        <div key={ind.node} className="dl-other">
          <b className={ind.good ? 'good' : 'bad'}>
            {ind.label} {arrow(ind.up)} {ind.amount}
          </b>{' '}
          : plusieurs effets s’additionnent.
          <DetailView detail={impact.details[ind.node]} />
        </div>
      ))}
    </section>
  )
}

/** Pourquoi un indicateur bouge : une phrase, puis chaque contribution (en vert ce qui aide le pays). */
function DetailView({ detail }: { detail: Detail | undefined }) {
  if (!detail) {
    return null
  }
  return (
    <div className="dl-detail">
      <p>{detail.text}</p>
      {detail.lines.length ? (
        <ul>
          {detail.lines.map((l) => (
            <li key={l.label} className={l.good ? 'good' : 'bad'}>
              <span>{l.label}</span>
              <b>{l.value}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function WhyList({ nodes }: { nodes: WhyNode[] }) {
  return (
    <ul className="dl-tree">
      {nodes.map((n) => (
        <li key={`${n.node}-${String(n.up)}`}>
          <span className="dl-node">
            {n.name} {arrow(n.up)}
          </span>
          {n.hits.map((ind) => (
            <b key={ind.node} className={`dl-hit ${ind.good ? 'good' : 'bad'}`}>
              {ind.label} {arrow(ind.up)} {ind.amount}
            </b>
          ))}
          {n.explanation ? <small> {n.explanation}</small> : null}
          {n.children.length ? <WhyList nodes={n.children} /> : null}
        </li>
      ))}
    </ul>
  )
}
