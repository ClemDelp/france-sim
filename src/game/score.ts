import type { YearState } from '../model/types'

/** La première élection présidentielle de la partie, puis tous les cinq ans. */
export const FIRST_ELECTION = 2027
export const TERM = 5

export const isElectionYear = (year: number) => year >= FIRST_ELECTION && (year - FIRST_ELECTION) % TERM === 0
export const nextElection = (year: number) => (year < FIRST_ELECTION ? FIRST_ELECTION : year + ((TERM - ((year - FIRST_ELECTION) % TERM)) % TERM || TERM))

/** La popularité suit le mécontentement social du modèle : à 1 (révolte), plus personne ne vous soutient. */
export const popularity = (s: YearState) => Math.round(Math.min(92, Math.max(5, 62 - 55 * s.discontent)))

/** Le score au second tour : une popularité de 40 % suffit tout juste à passer la barre des 50 %. */
export const voteShare = (pop: number) => Math.round((30 + 0.5 * pop) * 10) / 10

export type Election = { year: number; popularity: number; vote: number; won: boolean }

export const electionAt = (s: YearState): Election => {
  const pop = popularity(s)
  const vote = voteShare(pop)
  return { year: s.year, popularity: pop, vote, won: vote > 50 }
}
