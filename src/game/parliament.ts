import { random } from '../model/events'
import { isElectionYear } from './score'

/**
 * L'Assemblée nationale et les « jokers » du pouvoir. Les législatives suivent la présidentielle : plus le président
 * est élu largement et populaire, plus son camp a de sièges. Une majorité absolue fait passer plus de réformes ;
 * une cohabitation paralyse. Et quand le capital politique ne suffit pas, il reste le 49.3 (au risque de la censure),
 * le référendum (au risque du non) et la dissolution (au risque de tout perdre).
 */

export const SEATS = 577
export const MAJORITY = 289
/** En dessous, même avec des alliés, le président n'a plus de majorité : c'est la cohabitation. */
export const RELATIVE = 231

export type Politics = {
  /** Les sièges du camp présidentiel (avec ses alliés). */
  seats: number
  /** L'année des dernières législatives. */
  legislative: number
  /** Les années où une réforme est passée par le 49.3, et celles où la censure a renversé le gouvernement. */
  forced: number[]
  censured: number[]
  referendums: { year: number; won: boolean; yes: number }[]
  dissolutions: number[]
}

export type Majority = 'absolue' | 'relative' | 'cohabitation'

export const majorityOf = (seats: number): Majority => (seats >= MAJORITY ? 'absolue' : seats >= RELATIVE ? 'relative' : 'cohabitation')

export const MAJORITY_LABEL: Record<Majority, string> = { absolue: 'Majorité absolue', relative: 'Majorité relative', cohabitation: 'Cohabitation' }

/** Ce que la situation au Parlement ajoute (ou retire) au capital politique de chaque année. */
export const MAJORITY_CAPITAL: Record<Majority, number> = { absolue: 2, relative: 0, cohabitation: -2 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Les sièges gagnés aux législatives : le score du second tour de la présidentielle (ou, pour une dissolution,
 * la popularité du moment) amplifié par le scrutin majoritaire, plus un peu de hasard (reproductible).
 */
export function legislativeSeats(vote: number, popularity: number, seed: number, year: number, dissolution = false): number {
  const swing = dissolution ? 2 * (popularity - 50) : 1.2 * (vote - 50) + (popularity - 50)
  const noise = (random(seed, year, dissolution ? 'dissolution' : 'legislatives') - 0.5) * (dissolution ? 0.1 : 0.06)
  return Math.round(SEATS * clamp(0.5 + swing / 100 + noise, 0.15, 0.85))
}

/** La France de 2025 : une Assemblée sans majorité, mais un « socle commun » qui gouverne. */
export const START_POLITICS = (year: number): Politics => ({ seats: 250, legislative: year, forced: [], censured: [], referendums: [], dissolutions: [] })

/** Le premier mandat commence à la dernière présidentielle (avant ou pendant `year`). */
const mandateStart = (year: number) => {
  let y = year
  while (!isElectionYear(y) && y > 2000) {
    y -= 1
  }
  return y
}

/** Le capital politique gagné ou perdu à cause du Parlement et des jokers joués l'an dernier. */
export function capitalShift(p: Politics, year: number): { total: number; reasons: string[] } {
  const reasons: string[] = []
  const m = majorityOf(p.seats)
  let total = MAJORITY_CAPITAL[m]
  if (total) {
    reasons.push(`${MAJORITY_LABEL[m]} : ${total > 0 ? '+' : ''}${total}`)
  }
  if (p.forced.includes(year)) {
    total -= 1
    reasons.push('49.3 de l’an dernier : −1')
  }
  if (p.censured.includes(year)) {
    total -= 2
    reasons.push('Gouvernement renversé : −2')
  }
  if (p.referendums.some((r) => r.year === year && !r.won)) {
    total -= 2
    reasons.push('Référendum perdu : −2')
  }
  return { total, reasons }
}

/** La chance qu'une motion de censure renverse le gouvernement après un 49.3. */
export const CENSURE_CHANCE: Record<Majority, number> = { absolue: 0.03, relative: 0.3, cohabitation: 0.65 }

/** La chance que le oui l'emporte à un référendum : la popularité du président, plus que la question posée. */
export const referendumChance = (popularity: number) => clamp((popularity - 35) / 30, 0.05, 0.95)

/** Le 49.3 : une fois par an. La censure se joue au moment où la réforme s'appliquerait (`year`). */
export function canForce(p: Politics, year: number) {
  return !p.forced.includes(year) && !p.censured.includes(year)
}

export function force(p: Politics, year: number, seed: number): { politics: Politics; censured: boolean; chance: number } {
  const chance = CENSURE_CHANCE[majorityOf(p.seats)]
  const censured = random(seed, year, 'censure') < chance
  return { politics: censured ? { ...p, censured: [...p.censured, year] } : { ...p, forced: [...p.forced, year] }, censured, chance }
}

/** Le référendum : une fois par mandat. */
export function canReferendum(p: Politics, year: number) {
  const since = mandateStart(year - 1)
  return !p.referendums.some((r) => r.year > since)
}

export function referendum(p: Politics, year: number, seed: number, popularity: number): { politics: Politics; won: boolean; yes: number } {
  const chance = referendumChance(popularity)
  const draw = random(seed, year, 'referendum')
  const won = draw < chance
  // Le score affiché : autour de 50 %, d'autant plus net que le tirage est loin du seuil.
  const yes = Math.round((50 + (chance - draw) * 30) * 10) / 10
  return { politics: { ...p, referendums: [...p.referendums, { year, won, yes }] }, won, yes }
}

/** La dissolution : une fois par mandat, et pas dans l'année qui suit des législatives. */
export function canDissolve(p: Politics, year: number) {
  return year - p.legislative >= 1 && !p.dissolutions.some((d) => d > mandateStart(year) || d === year)
}

export function dissolve(p: Politics, year: number, seed: number, popularity: number): Politics {
  return { ...p, seats: legislativeSeats(popularity, popularity, seed, year, true), legislative: year, dissolutions: [...p.dissolutions, year] }
}

/** Les législatives qui suivent une présidentielle gagnée. */
export function afterPresidential(p: Politics, year: number, vote: number, popularity: number, seed: number): Politics {
  return { ...p, seats: legislativeSeats(vote, popularity, seed, year), legislative: year }
}

/** Relit l'état du Parlement d'une sauvegarde (ou rien s'il est abîmé). */
export function parsePolitics(raw: unknown): Politics | null {
  const p = raw as Partial<Politics> | null
  const nums = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'number')
  if (!p || typeof p.seats !== 'number' || typeof p.legislative !== 'number' || !nums(p.forced) || !nums(p.censured) || !nums(p.dissolutions) || !Array.isArray(p.referendums)) {
    return null
  }
  return p as Politics
}
