import comportementsCsv from '../../modele/comportements.csv?raw'
import donneesCsv from '../../modele/donnees-2025.csv?raw'
import tranchesCsv from '../../modele/tranches.csv?raw'
import { GROUPS, type ByGroup } from './types'

/**
 * Les paramètres du modèle vivent dans des fichiers CSV du dossier `modele/`, lisibles et modifiables
 * dans un tableur : séparateur « ; », virgule décimale, une ligne par paramètre avec sa source.
 * Ce module les lit, et permet d'essayer d'autres valeurs le temps d'une simulation.
 */

/** Lit un CSV « à la française » : séparateur « ; », champs entre guillemets possibles. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ';') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') {
        i += 1
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [head, ...body] = rows.filter((r) => r.some((v) => v.trim()))
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

/** Un nombre écrit avec une virgule ou un point décimal. */
export function parseNumber(v: string): number {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) {
    throw new Error(`Valeur non numérique dans les paramètres : « ${v} »`)
  }
  return n
}

export type ParamKind = 'donnee' | 'comportement' | 'tranche'

/** Un paramètre tel qu'on le montre et qu'on l'édite. */
export type ParamRow = {
  id: string
  kind: ParamKind
  value: number
  unit: string
  block: string
  name: string
  explanation: string
  reliability: string
  source: string
}

function rowsOf(csv: string, kind: ParamKind): ParamRow[] {
  return parseCsv(csv).map((r) => ({
    id: r.id,
    kind,
    value: parseNumber(r.valeur),
    unit: r.unite ?? '',
    block: r.bloc ?? '',
    name: r.nom ?? r.id,
    explanation: r.explication ?? '',
    reliability: r.fiabilite ?? (kind === 'donnee' ? 'mesuré' : ''),
    source: r.source ?? '',
  }))
}

/** Les paramètres par tranche deviennent un paramètre par case : `mpc.g1`, `mpc.g2`… */
function groupRows(csv: string): ParamRow[] {
  return parseCsv(csv).flatMap((r) =>
    GROUPS.map((g) => ({
      id: `${r.id}.${g}`,
      kind: 'tranche' as const,
      value: parseNumber(r[g]),
      unit: 'part',
      block: 'Tranches de ménages',
      name: `${r.nom} (${g})`,
      explanation: r.explication ?? '',
      reliability: r.source?.toLowerCase().startsWith('hypoth') ? 'hypothèse' : 'mesuré',
      source: r.source ?? '',
    })),
  )
}

export const PARAM_ROWS: ParamRow[] = [...rowsOf(donneesCsv, 'donnee'), ...rowsOf(comportementsCsv, 'comportement'), ...groupRows(tranchesCsv)]
export const DEFAULTS: Readonly<Record<string, number>> = Object.fromEntries(PARAM_ROWS.map((r) => [r.id, r.value]))

/** Les valeurs en vigueur : celles des fichiers, ou une variante en cours d'essai. */
const active: Record<string, number> = { ...DEFAULTS }

export type Overrides = Record<string, number>

/** Fait tourner `run` avec d'autres valeurs pour certains paramètres, puis remet les valeurs des fichiers. */
export function withParams<T>(overrides: Overrides | undefined, run: () => T): T {
  if (!overrides || Object.keys(overrides).length === 0) {
    return run()
  }
  Object.assign(active, overrides)
  try {
    return run()
  } finally {
    Object.assign(active, DEFAULTS)
  }
}

/** Une vue typée sur des paramètres : chaque lecture renvoie la valeur en vigueur. */
export function view<K extends string>(keys: readonly K[]): Readonly<Record<K, number>> {
  const out = {} as Record<K, number>
  for (const k of keys) {
    if (!(k in DEFAULTS)) {
      throw new Error(`Paramètre « ${k} » absent des fichiers du dossier modele/`)
    }
    Object.defineProperty(out, k, { get: () => active[k], enumerable: true })
  }
  return out
}

/** Une ligne du fichier des tranches, vue comme une valeur par tranche. */
export function groupView(id: string): Readonly<ByGroup> {
  const out = {} as ByGroup
  for (const g of GROUPS) {
    const key = `${id}.${g}`
    if (!(key in DEFAULTS)) {
      throw new Error(`Paramètre « ${key} » absent de modele/tranches.csv`)
    }
    Object.defineProperty(out, g, { get: () => active[key], enumerable: true })
  }
  return out
}

/** Réécrit un fichier de paramètres avec d'autres valeurs (pour proposer une modification). */
export function exportCsv(kind: ParamKind, overrides: Overrides): string {
  const source = kind === 'donnee' ? donneesCsv : kind === 'comportement' ? comportementsCsv : tranchesCsv
  const fmt = (n: number) => String(n).replace('.', ',')
  const lines = source.replace(/^﻿/, '').split(/\r?\n/)
  const head = lines[0].split(';')
  return (
    '﻿' +
    lines
      .map((line, i) => {
        if (i === 0 || !line.trim()) {
          return line
        }
        const cells = line.split(';')
        const id = cells[0]
        if (kind === 'tranche') {
          for (const g of GROUPS) {
            const key = `${id}.${g}`
            if (key in overrides) {
              cells[head.indexOf(g)] = fmt(overrides[key])
            }
          }
        } else if (id in overrides) {
          cells[head.indexOf('valeur')] = fmt(overrides[id])
        }
        return cells.join(';')
      })
      .join('\n')
  )
}
