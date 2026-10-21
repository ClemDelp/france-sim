import { useState } from 'react'
import { modelFileUrl, REPO_URL } from './links'
import { HYPOTHESES, ORGANISATIONS, OTHER_SOURCES, PARAM_USES, REFERENCES, UNSOURCED, type ParamUse } from '../model/sources'

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')

/** Les valeurs qui s'appuient sur une source : on les touche pour les retrouver dans « Tous les paramètres ». */
function ParamChips({ params, onInspect, limit = 12 }: { params: ParamUse[]; onInspect: (id: string) => void; limit?: number }) {
  const [all, setAll] = useState(false)
  if (!params.length) {
    return null
  }
  const shown = all ? params : params.slice(0, limit)
  return (
    <div className="source-params">
      {shown.map((p) => (
        <button key={`${p.file}:${p.id}`} type="button" className="chip" title={`${p.file} · ${p.id}${p.source ? ` · source : ${p.source}` : ''}`} onClick={() => onInspect(p.id)}>
          {p.name}
        </button>
      ))}
      {params.length > limit ? (
        <button type="button" className="chip chip-more" onClick={() => setAll(!all)}>
          {all ? 'Moins' : `+ ${params.length - limit} autres`}
        </button>
      ) : null}
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Sur quoi repose le modèle : méthodes, organismes, études, séries historiques et hypothèses. */
export function SourcesView({ onInspect }: { onInspect: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const q = normalize(query.trim())
  const hit = (...texts: string[]) => !q || normalize(texts.join(' ')).includes(q)
  const methods = REFERENCES.filter((r) => r.kind === 'methode' && hit(r.text, r.contribution))
  const studies = REFERENCES.filter((r) => r.kind === 'etude' && hit(r.text, r.contribution, ...r.params.map((p) => p.name)))
  const series = REFERENCES.filter((r) => r.kind === 'donnees' && hit(r.text, r.contribution))
  const organisations = ORGANISATIONS.filter((o) => hit(o.name, o.type, o.contribution, ...o.params.map((p) => `${p.name} ${p.source}`))).sort(
    (a, b) => b.params.length - a.params.length,
  )
  const others = OTHER_SOURCES.filter((o) => hit(o.source, ...o.params.map((p) => p.name)))
  const sourced = PARAM_USES.filter((u) => u.source).length

  return (
    <div className="sources">
      <section className="sources-intro">
        <h3>Sur quoi repose ce modèle</h3>
        <p>
          Chaque chiffre du simulateur est relié à son origine : un organisme de statistique publique, une institution, une étude publiée, ou une hypothèse déclarée comme
          telle. Touchez un paramètre pour le retrouver, le modifier et voir son effet.
        </p>
        <ul className="sources-counts">
          <li>
            <strong>{ORGANISATIONS.length}</strong> organismes
          </li>
          <li>
            <strong>{REFERENCES.filter((r) => r.kind === 'etude').length}</strong> études
          </li>
          <li>
            <strong>{REFERENCES.filter((r) => r.kind === 'methode').length}</strong> méthodes
          </li>
          <li>
            <strong>{sourced}</strong> valeurs sourcées
          </li>
          <li>
            <strong>{HYPOTHESES.length}</strong> hypothèses
          </li>
        </ul>
        <div className="note sources-how">
          <p>
            <strong>Comment il a été construit.</strong> France·Sim a été conçu avec l’aide d’une intelligence artificielle (Claude, d’Anthropic), à partir des publications
            listées ici, telles qu’elles étaient connues au moment de la conception. Les chiffres n’ont pas été téléchargés automatiquement : ce sont des ordres de grandeur, qui
            peuvent contenir des erreurs ou dater un peu. Les comportements (comment chacun réagit) viennent de la littérature économique quand elle existe, et sont sinon des
            hypothèses, marquées comme telles et accompagnées d’une plage plausible.
          </p>
          <p>
            C’est pourquoi le modèle est entièrement ouvert : chaque valeur cite sa source, les hypothèses sont testées (« Ce résultat est-il solide ? »), le modèle est confronté à
            25 ans d’histoire (onglet « Face au passé »), et tout peut être corrigé (onglet « Participer »).
          </p>
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une source, un organisme, un paramètre (ex. : INSEE, GIEC, TVA)…" aria-label="Chercher une source" />
      </section>

      {methods.length ? (
        <section>
          <h3>📐 Les fondements : les méthodes</h3>
          <p className="panel-lead">Les grands principes de construction du moteur, issus de la macroéconomie et de la science du climat.</p>
          <ul className="source-list">
            {methods.map((r) => (
              <li key={r.id}>
                <p className="source-ref">{r.text}</p>
                <p>{r.contribution}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {organisations.length ? (
        <section>
          <h3>🏛️ D’où viennent les chiffres : les organismes</h3>
          <p className="panel-lead">Les données de la France (2025 et 2000) et les ordres de grandeur des comportements, par producteur.</p>
          <div className="source-orgs">
            {organisations.map((o) => (
              <article key={o.id} className="source-org">
                <header>
                  <a href={o.url} target="_blank" rel="noreferrer">
                    {o.name} ↗
                  </a>
                  <span className="badge">{o.type}</span>
                </header>
                <p>{o.contribution}</p>
                <small className="source-used">Utilisé pour {plural(o.params.length, 'valeur')} :</small>
                <ParamChips params={o.params} onInspect={onInspect} limit={8} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {studies.length ? (
        <section>
          <h3>📚 Les études scientifiques</h3>
          <p className="panel-lead">Les travaux publiés dont viennent certaines élasticités et certains seuils.</p>
          <ul className="source-list">
            {studies.map((r) => (
              <li key={r.id}>
                <p className="source-ref">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.text} ↗</a> : r.text}</p>
                <p>{r.contribution}</p>
                <ParamChips params={r.params} onInspect={onInspect} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {series.length ? (
        <section>
          <h3>📈 Les séries historiques</h3>
          <p className="panel-lead">Ce qui permet de rejouer 2000–2024 et de juger le modèle sur pièces.</p>
          <ul className="source-list">
            {series.map((r) => (
              <li key={r.id}>
                <p className="source-ref">{r.text}</p>
                <p>{r.contribution}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {others.length ? (
        <section>
          <h3>🗓️ Repères historiques, textes et calages</h3>
          <p className="panel-lead">Des valeurs tirées d’un épisode passé (crise grecque, nationalisations de 1982…), d’un texte, ou calées pour retrouver un chiffre observé.</p>
          <ul className="source-list">
            {others.map((o) => (
              <li key={o.source}>
                <p className="source-ref">{o.source}</p>
                <ParamChips params={o.params} onInspect={onInspect} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!q || 'hypothese'.includes(q) || UNSOURCED.some((u) => hit(u.name)) ? (
        <section>
          <h3>🧪 Les hypothèses du simulateur</h3>
          <p className="panel-lead">
            {HYPOTHESES.length} comportements sont des hypothèses : les études ne les fixent pas précisément. Chacun a une plage plausible, et l’analyse « Ce résultat est-il
            solide ? » montre lesquels décident d’un résultat. Les {UNSOURCED.length} valeurs ci-dessous ne citent aucune source : ce sont des choix de modélisation, à vérifier en
            priorité.
          </p>
          <ParamChips params={q ? UNSOURCED.filter((u) => hit(u.name)) : UNSOURCED} onInspect={onInspect} limit={24} />
        </section>
      ) : null}

      <p className="note">
        Ces listes sont dans les fichiers{' '}
        <a href={modelFileUrl('sources.csv')} target="_blank" rel="noreferrer">
          modele/sources.csv
        </a>{' '}
        et{' '}
        <a href={modelFileUrl('references.csv')} target="_blank" rel="noreferrer">
          modele/references.csv
        </a>{' '}
        du <a href={REPO_URL} target="_blank" rel="noreferrer">projet sur GitHub</a> : une source manque, un lien est mort ? Proposez une correction.
      </p>
    </div>
  )
}
