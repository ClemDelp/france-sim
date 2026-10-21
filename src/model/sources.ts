import sourcesCsv from '../../modele/sources.csv?raw'
import referencesCsv from '../../modele/references.csv?raw'
import donnees2000Csv from '../../modele/donnees-2000.csv?raw'
import { PARAM_ROWS, parseCsv } from './params'

/**
 * Sur quoi repose le modèle : les organismes dont viennent les chiffres, les méthodes et les études,
 * les séries historiques, et les hypothèses propres au simulateur. Les listes sont dans
 * modele/sources.csv et modele/references.csv ; chaque paramètre y est rattaché par la colonne « source »
 * de son fichier (un organisme ou une étude est reconnu à ses mots-clés, colonne « motifs »).
 */

/** Un paramètre qui s'appuie sur une source. */
export type ParamUse = { id: string; name: string; file: string; source: string; reliability: string }

export type Organisation = { id: string; name: string; type: string; url: string; contribution: string; params: ParamUse[] }
export type Reference = { id: string; kind: 'methode' | 'etude' | 'donnees'; text: string; contribution: string; url: string; params: ParamUse[] }

type Matcher = { id: string; patterns: RegExp[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Un mot-clé reconnu comme mot entier (« cor » ne doit pas trouver « correction »). */
const wordPattern = (motif: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(motif.toLowerCase())}(?![\\p{L}\\p{N}])`, 'u')
const matcher = (id: string, motifs: string): Matcher => ({
  id,
  patterns: motifs
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
    .map(wordPattern),
})

const ORG_ROWS = parseCsv(sourcesCsv)
const REF_ROWS = parseCsv(referencesCsv)

/** Tous les paramètres qui citent une source : ceux du modèle (2025) et ceux du point de départ de 2000. */
function allUses(): ParamUse[] {
  const seen = new Set<string>()
  const uses: ParamUse[] = []
  const fileOf: Record<string, string> = { donnee: 'donnees-2025.csv', comportement: 'comportements.csv', tranche: 'tranches.csv', entreprise: 'entreprises.csv' }
  for (const r of PARAM_ROWS) {
    // Les tableaux (tranches, tailles d'entreprises) donnent une ligne par case : on n'en garde qu'une.
    const id = r.id.split('.')[0]
    const key = `${r.kind}:${id}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    uses.push({ id, name: r.name.replace(/ \((g\d|pme|eti|ge)\)$/, ''), file: fileOf[r.kind], source: r.source.trim(), reliability: r.reliability })
  }
  for (const r of parseCsv(donnees2000Csv)) {
    uses.push({ id: r.id, name: `${r.nom} (2000)`, file: 'donnees-2000.csv', source: (r.source ?? '').trim(), reliability: 'mesuré' })
  }
  return uses
}

export const PARAM_USES = allUses()

const ORG_MATCHERS = ORG_ROWS.map((r) => matcher(r.id, r.motifs ?? ''))
const REF_MATCHERS = REF_ROWS.map((r) => matcher(r.id, r.motifs ?? ''))

/** Les organismes et les études qu'une mention de source désigne. */
export function sourcesOf(source: string): string[] {
  const text = source.toLowerCase()
  return [...ORG_MATCHERS, ...REF_MATCHERS].filter((m) => m.patterns.some((p) => p.test(text))).map((m) => m.id)
}

const usesOf = (id: string) => PARAM_USES.filter((u) => u.source && sourcesOf(u.source).includes(id))

export const ORGANISATIONS: Organisation[] = ORG_ROWS.map((r) => ({
  id: r.id,
  name: r.nom,
  type: r.type,
  url: r.lien,
  contribution: r.apport,
  params: usesOf(r.id),
}))

export const REFERENCES: Reference[] = REF_ROWS.map((r) => ({
  id: r.id,
  kind: r.type as Reference['kind'],
  text: r.reference,
  contribution: r.apport,
  url: r.lien ?? '',
  params: r.motifs ? usesOf(r.id) : [],
}))

/** Les mentions qui ne renvoient à aucun organisme ni aucune étude : épisodes historiques, calages, définitions. */
export const OTHER_SOURCES: { source: string; params: ParamUse[] }[] = Object.entries(
  PARAM_USES.filter((u) => u.source && sourcesOf(u.source).length === 0).reduce<Record<string, ParamUse[]>>((acc, u) => {
    ;(acc[u.source] ??= []).push(u)
    return acc
  }, {}),
)
  .map(([source, params]) => ({ source, params }))
  .sort((a, b) => a.source.localeCompare(b.source, 'fr'))

/** Les hypothèses du simulateur : des comportements que les études ne fixent pas précisément. */
export const HYPOTHESES = PARAM_USES.filter((u) => u.reliability === 'hypothèse')
/** Les valeurs qui ne citent aucune source : des choix de modélisation (ou des calages), à vérifier en priorité. */
export const UNSOURCED = PARAM_USES.filter((u) => !u.source)
