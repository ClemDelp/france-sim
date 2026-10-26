import type { LeverDef } from '../ui/levers'

/**
 * Le capital politique : on ne peut pas tout réformer d'un coup. Chaque année, le Parlement et l'opinion acceptent
 * un nombre limité de réformes ; plus vous êtes populaire, plus vous pouvez en faire, surtout juste après une élection.
 */

/**
 * Le coût d'une réforme : un point par sixième de la plage du levier, pondéré par son poids politique (au moins un point).
 * Les poids suivent la difficulté réelle : taxe carbone (gilets jaunes, trajectoire gelée depuis 2018), TVA, droits de succession
 * (le plus impopulaire des impôts : 81 à 87 % contre une hausse), droit du travail et âge de départ (passés par le 49.3 en 2016 et 2023),
 * droits de douane (compétence européenne), création monétaire (interdite par les traités, article 123 du TFUE).
 */
export function reformCost(def: LeverDef, from: number, to: number): number {
  const change = Math.abs(to - from)
  if (change < 1e-9) {
    return 0
  }
  // Dans le sens populaire (baisser l'âge de départ, dégeler les pensions), la réforme passe deux fois plus facilement.
  const popular = def.unpopular !== undefined && Math.sign(to - from) !== def.unpopular
  return Math.max(1, Math.round((change / ((def.max - def.min) / 6)) * (def.weight ?? 1) * (popular ? 0.5 : 1)))
}

/** Annuler une partie de la dette : une décision lourde. */
export const CANCEL_COST = 3

/** Les points disponibles une année : 2 de base, plus selon la popularité, plus l'état de grâce après une élection. */
export function politicalCapital(popularity: number, honeymoon: boolean): number {
  return Math.min(8, Math.max(1, Math.round(2 + (popularity - 40) / 10) + (honeymoon ? 2 : 0)))
}
