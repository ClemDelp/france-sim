import candidatsCsv from '../../modele/candidats.csv?raw'
import promessesCsv from '../../modele/promesses.csv?raw'
import mesuresCsv from '../../modele/mesures.csv?raw'
import leviersCsv from '../../modele/mesures-leviers.csv?raw'
import { parseCsv, parseNumber } from '../model/params'
import { policyAt } from '../model/sim'
import type { Decision, Policy, PolicyKey } from '../model/types'
import { LEVER_GROUPS, type LeverDef } from '../ui/levers'
import { planCost } from './session'

/**
 * Incarner un candidat : des personnages parodiques, inspirés des programmes publiés pour 2027 (sources citées),
 * dont chaque promesse est traduite en leviers du modèle. Données dans modele/candidats.csv, promesses.csv,
 * mesures.csv et mesures-leviers.csv : modifiables comme le reste du modèle.
 */

export type Measure = {
  id: string
  name: string
  domain: string
  summary: string
  param: { label: string; unit: string; min: number; max: number; default: number } | null
  obstacles: string
  /** Comment la mesure agit sur les leviers ; vide si le moteur ne sait pas encore la représenter. */
  effects: { lever: PolicyKey | 'cancelHolder'; operation: 'fixe' | 'ajout'; base: 'valeur' | 'montant'; factor: number | string; years: number | null }[]
  /** Ce que le moteur approche ou ne représente pas encore. */
  notes: string[]
  /**
   * Le titre et le texte de la carte, avec le montant ({valeur}, ou {nombre} sans signe) : celui du dessous du pivot
   * (« moins ») quand la mesure va dans les deux sens (créer ou supprimer des postes…). Vide : le nom de la mesure.
   */
  card: { title: string; titleMinus: string; pivot: number; text: string; textMinus: string }
}

export type Pledge = {
  /** Identifiant stable dans le programme du candidat. */
  key: string
  measure: Measure | null
  amount: number | null
  quote: string
  source: string
}

export type Candidate = {
  id: string
  name: string
  family: string
  emblem: string
  color: string
  summary: string
  program: { label: string; url: string; date: string }
  caveats: string
  /** Un candidat fantaisie : un personnage connu qui ne se présente pas, au programme imaginé pour le jeu (sans source). */
  fantasy: boolean
  promises: Pledge[]
}

const LEVERS: Record<string, LeverDef> = Object.fromEntries(LEVER_GROUPS.flatMap((g) => g.levers.map((l) => [l.key, l])))
const opt = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : parseNumber(v))

const LINKS = parseCsv(leviersCsv)
export const MEASURES: Record<string, Measure> = Object.fromEntries(
  parseCsv(mesuresCsv).map((r) => {
    const rows = LINKS.filter((l) => l.mesure === r.id)
    const measure: Measure = {
      id: r.id,
      name: r.nom,
      domain: r.domaine,
      summary: r.resume,
      param: r.defaut ? { label: r.parametre, unit: r.unite, min: parseNumber(r.min), max: parseNumber(r.max), default: parseNumber(r.defaut) } : null,
      obstacles: r.obstacles ?? '',
      effects: rows
        .filter((l) => l.levier)
        .map((l) => ({
          lever: l.levier as PolicyKey | 'cancelHolder',
          operation: l.operation as 'fixe' | 'ajout',
          base: l.base as 'valeur' | 'montant',
          factor: l.levier === 'cancelHolder' ? l.facteur : parseNumber(l.facteur),
          years: opt(l.annees),
        })),
      notes: rows.map((l) => l.note).filter(Boolean),
      card: { title: r.titre ?? '', titleMinus: r.titre_moins ?? '', pivot: opt(r.pivot) ?? 0, text: r.texte ?? '', textMinus: r.texte_moins ?? '' },
    }
    return [r.id, measure]
  }),
)

export const CANDIDATES: Candidate[] = parseCsv(candidatsCsv).map((r) => ({
  id: r.id,
  name: r.nom,
  family: r.famille,
  emblem: r.embleme,
  color: r.couleur,
  summary: r.resume,
  program: { label: r.programme, url: r.lien, date: r.date },
  caveats: r.reserves ?? '',
  fantasy: r.fantaisie === 'oui',
  promises: parseCsv(promessesCsv)
    .filter((p) => p.candidat === r.id)
    .map((p, i) => ({ key: `${r.id}-${i}`, measure: p.mesure ? (MEASURES[p.mesure] ?? null) : null, amount: opt(p.montant), quote: p.citation, source: p.source })),
}))

/** La mention qui accompagne partout les personnages. */
export const PARODY_NOTE =
  'Personnages parodiques, inspirés des programmes réellement publiés pour 2027 : chaque promesse cite sa source. Les candidats fantaisie (🎭) ne se présentent pas : leur programme est imaginé pour le jeu. Tous jouent avec les mêmes règles, et le modèle reste un simulateur, pas une prévision.'

/** Ce que disent les promesses d'un candidat fantaisie à la place d'une source. */
export const FANTASY_SOURCE = 'programme imaginaire, personnage parodique'

export const candidateById = (id: string | null | undefined) => CANDIDATES.find((c) => c.id === id)

/** Le montant d'une promesse : le sien, sinon celui de la mesure par défaut. */
export const pledgeAmount = (p: Pledge) => p.amount ?? p.measure?.param?.default ?? null

/** Un montant dans l'unité de la mesure : les milliers en clair (« 100 000 »), le reste tel quel (« 2,5 »). */
function amountText(v: number, unit: string): string {
  return unit.startsWith('milliers') ? Math.round(v * 1000).toLocaleString('fr-FR') : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

/** Le gabarit de la carte rempli : dans le bon sens (au-dessus ou au-dessous du pivot), avec le montant. */
function filled(p: Pledge, plus: string, minus: string): string {
  const m = p.measure!
  const v = pledgeAmount(p)
  if (v === null || !plus) {
    return ''
  }
  const unit = m.param?.unit ?? ''
  const template = v < m.card.pivot && minus ? minus : plus
  return template.replace('{nombre}', amountText(Math.abs(v), unit)).replace('{valeur}', `${v < 0 ? '−' : ''}${amountText(Math.abs(v), unit)}`)
}

/** Le titre d'une promesse, dans son sens et avec son montant (« Supprimer 100 000 postes de fonctionnaires »). */
export const pledgeTitle = (p: Pledge) => (p.measure ? filled(p, p.measure.card.title, p.measure.card.titleMinus) || p.measure.name : '')

/** Le texte de la carte : la citation du candidat, sinon ce que fait la mesure dans son sens. */
export const pledgeText = (p: Pledge) => p.quote || (p.measure ? filled(p, p.measure.card.text, p.measure.card.textMinus) || p.measure.summary : '')

/** Une promesse (« pledge ») que le moteur sait jouer : au moins un levier. */
export const isPlayable = (p: Pledge) => !!p.measure && p.measure.effects.length > 0

const clampLever = (key: string, v: number) => {
  const def = LEVERS[key]
  return def ? Math.min(def.max, Math.max(def.min, Number(v.toFixed(6)))) : v
}

/**
 * Ce que la promesse change aux leviers, à partir de la politique en vigueur.
 * `revert` : les leviers à remettre l'année suivante pour une mesure temporaire (une « année blanche »).
 */
export function promisePatch(p: Pledge, current: Policy): { patch: Partial<Policy>; revert: Partial<Policy> | null } {
  const patch: Record<string, number | string> = {}
  const revert: Record<string, number | string> = {}
  if (!p.measure) {
    return { patch: {}, revert: null }
  }
  const amount = p.amount ?? p.measure.param?.default ?? 1
  for (const e of p.measure.effects) {
    if (e.lever === 'cancelHolder') {
      patch.cancelHolder = String(e.factor)
      continue
    }
    const value = e.base === 'montant' ? amount * (e.factor as number) : (e.factor as number)
    const now = (patch[e.lever] as number | undefined) ?? (current[e.lever] as number)
    patch[e.lever] = clampLever(e.lever, e.operation === 'ajout' ? now + value : value)
    if (e.years) {
      revert[e.lever] = current[e.lever] as number
    }
  }
  return { patch: patch as Partial<Policy>, revert: Object.keys(revert).length ? (revert as Partial<Policy>) : null }
}

/** Les leviers qui comptent pour savoir si une promesse est tenue (on ignore le créancier d'une annulation). */
const numericKeys = (patch: Partial<Policy>) => (Object.keys(patch) as PolicyKey[]).filter((k) => typeof patch[k] === 'number')

/**
 * Où en est une promesse : appliquée (les leviers ont atteint ce qu'elle demande), en partie, ou pas encore.
 * On compare la politique en vigueur à celle qu'aurait donnée la promesse appliquée à la politique de départ.
 */
export function promiseStatus(p: Pledge, start: Policy, now: Policy): 'tenue' | 'partielle' | 'a-faire' | 'hors-moteur' {
  if (!isPlayable(p)) {
    return 'hors-moteur'
  }
  const { patch } = promisePatch(p, start)
  const keys = numericKeys(patch)
  if (!keys.length) {
    return 'a-faire'
  }
  const progress = keys.map((k) => {
    const target = patch[k] as number
    const from = start[k] as number
    const span = target - from
    return Math.abs(span) < 1e-9 ? 1 : Math.max(0, Math.min(1, ((now[k] as number) - from) / span))
  })
  const mean = progress.reduce((a, v) => a + v, 0) / progress.length
  return mean >= 0.95 ? 'tenue' : mean > 0.05 ? 'partielle' : 'a-faire'
}

/**
 * Ce qu'il reste à faire pour tenir une promesse. Pas encore commencée : la promesse appliquée à la politique en vigueur
 * (elle s'ajoute aux autres). Commencée : aller jusqu'à ce qu'elle demande, sans recompter ce qui est déjà fait.
 */
export function promiseRemaining(p: Pledge, start: Policy, now: Policy): Partial<Policy> {
  if (promiseStatus(p, start, now) !== 'partielle') {
    return promisePatch(p, now).patch
  }
  const target = promisePatch(p, start).patch
  return Object.fromEntries(
    Object.entries(target).filter(([k, v]) => typeof v !== 'number' || Math.abs((now[k as PolicyKey] as number) - v) > 1e-9),
  ) as Partial<Policy>
}

/**
 * Commencer une promesse quand le capital politique ne suffit pas à la tenir d'un coup : on fait la plus grande part
 * possible (tous ses leviers avancent ensemble, au cran près), le reste attendra. Null si rien n'est faisable.
 */
export function partialPatch(patch: Partial<Policy>, current: Policy, budget: number): Partial<Policy> | null {
  const keys = Object.keys(patch) as PolicyKey[]
  if (keys.some((k) => !LEVERS[k])) {
    return null
  }
  for (let share = 0.95; share > 0.01; share -= 0.05) {
    const step: Record<string, number> = {}
    for (const k of keys) {
      const def = LEVERS[k]
      const from = current[k] as number
      const raw = from + ((patch[k] as number) - from) * share
      const v = clampLever(k, def.min + Math.round((raw - def.min) / def.step) * def.step)
      if (Math.abs(v - from) > 1e-9) {
        step[k] = v
      }
    }
    if (Object.keys(step).length && planCost(step as Partial<Policy>, current) <= budget) {
      return step as Partial<Policy>
    }
  }
  return null
}

/**
 * L'objectif d'un mandat : tenir au moins les deux tiers de ses promesses jouables avant l'élection suivante.
 * Tout tenir est rarement possible (le capital politique ne suffit pas toujours) : il faut choisir.
 */
export const PLEDGE_GOAL_SHARE = 2 / 3

export const pledgeGoal = (c: Candidate) => Math.ceil(c.promises.filter(isPlayable).length * PLEDGE_GOAL_SHARE - 1e-9)

/**
 * La politique votée jusqu'à `year`, pour juger des promesses : une annulation de dette est un coup unique
 * (absente de la politique en vigueur), mais une fois faite, la promesse est tenue.
 */
export function votedPolicy(decisions: Decision[], year: number): Policy {
  const policy = policyAt(decisions, year)
  const cancel = decisions.filter((d) => d.year <= year && (d.patch.cancelShare ?? 0) > 0).sort((a, b) => (b.patch.cancelShare ?? 0) - (a.patch.cancelShare ?? 0))[0]
  return cancel ? { ...policy, cancelShare: cancel.patch.cancelShare!, cancelHolder: cancel.patch.cancelHolder ?? policy.cancelHolder } : policy
}

/** La part des promesses jouables que les leviers en vigueur respectent. */
export function promisesKept(c: Candidate, decisions: Decision[], year: number, start: Policy): { kept: number; playable: number } {
  const now = votedPolicy(decisions, year)
  const playable = c.promises.filter(isPlayable)
  const kept = playable.filter((p) => promiseStatus(p, start, now) === 'tenue').length
  return { kept, playable: playable.length }
}
