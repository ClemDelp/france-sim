import mondeCsv from '../../modele/monde.csv?raw'
import { parseCsv, parseNumber } from './params'
import type { World } from './types'

/**
 * Le monde année par année (modele/monde.csv) : prix du pétrole, taux de la BCE, croissance de nos partenaires,
 * panique sur les marchés, chocs de demande, rachats de dette par la BCE. De 2000 à 2024, c'est l'histoire ;
 * ensuite, un scénario. Au-delà de la dernière année, le monde reste sur sa tendance de long terme.
 */
export const WORLD_PATH: Readonly<Record<number, World>> = Object.fromEntries(
  parseCsv(mondeCsv).map((r) => [
    parseNumber(r.annee),
    {
      oil: parseNumber(r.petrole),
      ecbRate: parseNumber(r.tauxBce),
      growth: parseNumber(r.croissanceMonde),
      panic: parseNumber(r.panique),
      demandShock: parseNumber(r.chocDemande),
      qe: parseNumber(r.rachatsBce),
    },
  ]),
)

/** Ce qui s'est passé dans le monde une année donnée (colonne « commentaire »). */
export const WORLD_NOTES: Readonly<Record<number, string>> = Object.fromEntries(parseCsv(mondeCsv).filter((r) => r.commentaire).map((r) => [parseNumber(r.annee), r.commentaire]))
