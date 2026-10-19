import liensCsv from '../../modele/liens.csv?raw'
import variablesCsv from '../../modele/variables.csv?raw'
import { parseCsv, parseNumber } from './params'

/**
 * Le « cerveau » du modèle : quelles variables existent, et lesquelles en font bouger d'autres.
 * Il est décrit dans modele/variables.csv et modele/liens.csv, pour qu'on puisse le lire, le discuter et le corriger.
 * Le moteur (sim.ts) reste la référence : des tests vérifient que chaque lien cite des paramètres qui existent.
 */

export type GraphNode = {
  id: string
  name: string
  block: string
  /** Colonne dans la vue d'ensemble : 0 = décisions, à droite = résultats. */
  column: number
  explanation: string
}

export type GraphLink = {
  from: string
  to: string
  /** « + » : l'un monte, l'autre monte ; « − » : l'un monte, l'autre baisse ; « ± » : ça dépend. */
  sign: '+' | '-' | '±'
  params: string[]
  explanation: string
}

export const NODES: GraphNode[] = parseCsv(variablesCsv).map((r) => ({
  id: r.id,
  name: r.nom,
  block: r.bloc,
  column: parseNumber(r.colonne),
  explanation: r.explication,
}))

export const LINKS: GraphLink[] = parseCsv(liensCsv).map((r) => ({
  from: r.de,
  to: r.vers,
  sign: r.sens === '-' || r.sens === '−' ? '-' : r.sens === '±' ? '±' : '+',
  params: r.parametres.split(/\s+/).filter(Boolean),
  explanation: r.explication,
}))

export const NODE_BY_ID: Record<string, GraphNode> = Object.fromEntries(NODES.map((n) => [n.id, n]))

/** L'ordre des blocs, de gauche à droite. */
export const BLOCKS = [...new Set(NODES.map((n) => n.block))]
