import { EVENTS } from '../model/events'
import type { World } from '../model/types'
import { num } from '../ui/format'
import { ACTIONS, cardArt, cardName, CRISES, crisisEvent, inModel, type Card } from './cards'
import type { Game, Side } from './engine'
import { CRITERION_NODE, leverChanges, type Impact, type Indicator } from './why'

/**
 * « En bref » : une carte expliquée en trois ou quatre lignes simples. Ce qu'elle fait d'abord, puis ce qui en découle
 * pour les indicateurs qui pèsent le plus, avec la cause que le modèle a vraiment calculée (le poste qui pousse
 * dans le même sens que le total, jamais l'inverse), et le bilan sur la note.
 */

const EMOJI: Record<string, string> = {
  unemployment: '👷',
  gdp: '📈',
  inflation: '🏷️',
  deficit: '💶',
  debt: '🏦',
  disposableIncome: '🛒',
  poverty: '🥖',
  discontent: '😡',
  frenchEmissions: '🌍',
}

/** Le nom de l'indicateur au fil d'une phrase. */
const LOWER: Record<string, string> = {
  unemployment: 'chômage',
  gdp: 'croissance',
  inflation: 'inflation',
  deficit: 'déficit',
  debt: 'dette',
  disposableIncome: 'pouvoir d’achat',
  poverty: 'pauvreté',
  discontent: 'colère',
  frenchEmissions: 'émissions',
}

/** Ce qu'un événement du modèle fait d'abord, en clair (la première année). */
const WORLD_CAUSE: Partial<Record<keyof World, (v: number) => string>> = {
  growth: (v) => (v < 0 ? '🌍 Le monde ralentit' : '🌍 Le monde accélère'),
  oil: (v) => (v > 0 ? `🛢️ Pétrole plus cher (+${num(v, 0)} $)` : `🛢️ Pétrole moins cher (−${num(-v, 0)} $)`),
  ecbRate: (v) => (v > 0 ? '🏦 Le crédit coûte plus cher' : '🏦 Le crédit coûte moins cher'),
  panic: () => '😱 Panique sur les marchés',
  demandShock: (v) => (v > 0 ? '🛒 Activité perdue' : '🛒 Activité en plus'),
  bankLoss: () => '🏦 Banques en difficulté',
  heatShock: () => '🔥 Dégâts, hôpitaux saturés',
  unrest: (v) => (v > 0 ? '😡 Le pays se fâche' : '😌 Le pays s’apaise'),
  priceShock: (v) => (v > 0 ? '🏷️ Les prix flambent' : '🏷️ Les prix baissent'),
  productivity: (v) => (v > 0 ? '⚙️ On produit plus par heure' : '⚙️ On produit moins par heure'),
  forced: () => '🏛️ Une réforme passée sans vote',
  instability: () => '🌀 Crise politique',
}

const signedMd = (v: number) => `${v > 0 ? '+' : '−'}${num(Math.abs(v), Math.abs(v) < 10 ? 1 : 0)} Md€`

/** Sans la parenthèse d'un libellé (« Achats publics (services, investissement) » → « Achats publics »). */
const short = (label: string) => label.replace(/\s*\(.*\)\s*/, '').trim()

/** La première chose que fait un événement du modèle, en une ligne. */
function eventLine(id: string | null): string | null {
  const first = EVENTS.find((e) => e.id === id)?.effects[0] ?? {}
  const causes = (Object.keys(first) as (keyof World)[]).flatMap((k) => (WORLD_CAUSE[k] && typeof first[k] === 'number' && first[k] !== 0 ? [WORLD_CAUSE[k]!(first[k] as number)] : []))
  return causes.length ? causes.slice(0, 2).join(' · ') : null
}

/** Une conjoncture en bref : ce qu'elle déclenche dans les deux France (rien pour une conjoncture purement politique). */
export const contextBrief = (event: string | undefined) => (event ? eventLine(event) : null) ?? '🗳️ Rien dans l’économie : seulement les règles de l’année'

/** Ce que fait la carte, d'abord : le levier qu'elle bouge, ou ce que l'événement déclenche. */
function firstLine(g: Game, side: Side, card: Card): string | null {
  if (card.kind === 'mesure') {
    const l = leverChanges(g, side, card)[0]
    return l ? `${cardArt(card)} ${l.label} : ${l.from} → ${l.to}` : null
  }
  if (card.kind === 'crise') {
    return eventLine(crisisEvent(card.crisis))
  }
  const def = ACTIONS[card.action]
  const spend = def.spend ? `${def.art} ${signedMd(def.spend.amount)} d’argent public cette année` : null
  return [spend, eventLine(def.events?.[0] ?? null)].filter(Boolean).join(' · ') || null
}

/**
 * Pourquoi un indicateur bouge, en quelques mots : le poste calculé par le modèle qui pousse le plus dans le sens du total.
 * Null si aucun ne va dans ce sens (plusieurs effets se compensent) : on n'avance pas une cause qui dirait l'inverse.
 */
function cause(ind: Indicator, impact: Impact, name: string): string | null {
  if (ind.node === 'deficit') {
    // Un poste du budget qui creuse le déficit : une dépense en plus, ou une recette en moins (et l'inverse).
    // Aucun poste assez gros à lui seul : les dépenses ou les recettes, au total.
    const { spending, revenue } = impact.budget
    const total = spending > 0 === ind.up && Math.abs(spending) >= Math.abs(revenue) ? { label: 'dépenses', delta: spending, spending: true } : { label: 'recettes', delta: revenue, spending: false }
    const line = impact.budget.lines.find((l) => (l.spending ? l.delta : -l.delta) > 0 === ind.up) ?? ((total.spending ? total.delta : -total.delta) > 0 === ind.up ? total : null)
    if (!line) {
      return null
    }
    const verb = line.spending ? (line.delta > 0 ? 'L’État dépense plus' : 'L’État dépense moins') : line.delta > 0 ? 'L’État encaisse plus' : 'L’État encaisse moins'
    return `${verb} (${short(line.label)} ${signedMd(line.delta)})`
  }
  const lines = impact.details[ind.node]?.lines ?? []
  // Le total monte (delta > 0) : on cherche ce qui pousse vers le haut. Les postes de la croissance comptent en Md€ de production.
  // La pauvreté monte quand le revenu des plus modestes baisse : là, on cherche ce qui pousse en sens inverse.
  const line = lines.find((l) => l.delta > 0 === (ind.node === 'poverty' ? ind.delta < 0 : ind.delta > 0))
  if (!line) {
    return null
  }
  switch (ind.node) {
    case 'unemployment':
      // Les emplois pèsent à l'envers sur le taux : un apport négatif, ce sont des emplois en plus.
      return line.label === 'Emplois' ? (line.delta < 0 ? 'Plus d’emplois' : 'Moins d’emplois') : line.delta > 0 ? 'Plus de gens cherchent du travail' : 'Moins de gens cherchent du travail'
    case 'debt':
      return line.label.startsWith('Dette') ? (line.delta > 0 ? 'Le déficit s’ajoute à la dette' : 'Moins de déficit, moins de dette') : line.delta > 0 ? 'L’économie rapetisse' : 'L’économie grandit'
    case 'discontent':
      // Les « événements de l'année », c'est la carte elle-même (une crise, un coup) : on la nomme.
      return line.label.startsWith('Événements') ? name : line.delta > 0 ? short(line.label) : `Moins de « ${short(line.label).toLowerCase()} »`
    case 'gdp':
      // Ce qu'on achète à l'étranger compte en moins : un apport négatif, ce sont des achats en plus.
      return line.label === 'Importations' || line.label.startsWith('Pétrole')
        ? `${line.delta < 0 ? 'Plus' : 'Moins'} d’achats à l’étranger (${line.value.replace(/^[−+]/, '')})`
        : `${short(line.label)} ${line.value}`
    case 'poverty':
      return `Revenu des plus modestes : ${line.label === 'Prix' ? `prix en ${line.delta < 0 ? 'hausse' : 'baisse'}` : short(line.label).toLowerCase()} ${line.value}`
    case 'disposableIncome':
      // Les prix pèsent à l'envers sur le revenu réel : un apport négatif, ce sont des prix en hausse.
      return line.label === 'Prix' ? `Prix en ${line.delta < 0 ? 'hausse' : 'baisse'} (${line.value})` : `${short(line.label)} ${line.value}`
    default:
      return `${short(line.label)} ${line.value}`
  }
}

/** Le poids d'un indicateur pour choisir de quoi parler : ce qu'il fait à la note, puis sa taille. */
function weight(ind: Indicator, impact: Impact, card: Card): number {
  const part = impact.parts.find((p) => CRITERION_NODE[p.id] === ind.node)
  const scale = ind.node === 'deficit' ? 10 : ind.node === 'frenchEmissions' ? 5 : 1
  // Ce que la carte fait au budget se dit toujours, dès que ça compte (un demi-milliard) : d'abord pour une mesure.
  const cost = ind.node === 'deficit' && Math.abs(ind.delta) >= 0.5 ? (card.kind === 'mesure' ? 10 : 1) : 0
  return cost + Math.abs(part?.delta ?? 0) + (0.1 * Math.abs(ind.delta)) / scale
}

/** Le bilan sur la note, avec ce qui l'emporte. */
function verdict(impact: Impact, whose: string): string {
  const best = impact.parts.find((p) => p.delta > 0)
  const worst = impact.parts.find((p) => p.delta < 0)
  const note = `📊 ${whose} : note ${impact.health > 0 ? '+' : impact.health < 0 ? '−' : '±'}${Math.abs(impact.health)}`
  if (impact.health > 0) {
    return `${note}, surtout grâce ${best ? `au critère « ${best.label.toLowerCase()} »` : 'à plusieurs petits gains'}`
  }
  if (impact.health < 0) {
    return `${note}, surtout à cause du critère « ${worst ? worst.label.toLowerCase() : '…'} »`
  }
  return best && worst ? `${note} : « ${best.label.toLowerCase()} » compense « ${worst.label.toLowerCase()} »` : `${note} : trop peu pour bouger la note la 1re année`
}

/**
 * Les lignes « En bref » d'une carte : ce qu'elle fait, `effects` conséquences (les plus lourdes pour la note), le bilan.
 * Une carte qui ne passe pas par le modèle dit simplement ce qu'elle change aux règles.
 */
export function brief(g: Game, side: Side, card: Card, impact: Impact | null, effects = 2): string[] {
  if (!inModel(card)) {
    const rule = card.kind === 'crise' ? CRISES[card.crisis].rule : card.kind === 'action' ? ACTIONS[card.action].short : null
    return [`🎴 ${rule ?? 'Change les règles du duel.'}`, '🧮 Rien dans l’économie : seulement la partie.']
  }
  const out: string[] = []
  const first = firstLine(g, side, card)
  if (first) {
    out.push(first)
  }
  if (!impact) {
    return out
  }
  const whose = impact.target === 'player' ? 'Votre France' : `Chez ${g.seats[impact.target].name}`
  const ranked = [...impact.indicators].sort((a, b) => weight(b, impact, card) - weight(a, impact, card))
  for (const ind of ranked) {
    if (out.length >= effects + (first ? 1 : 0)) {
      break
    }
    const why = cause(ind, impact, cardName(card))
    if (why) {
      out.push(`${ind.node === 'discontent' && !ind.up ? '😌' : (EMOJI[ind.node] ?? '•')} ${why} → ${LOWER[ind.node] ?? ind.label} ${ind.text}`)
    }
  }
  out.push(verdict(impact, whose))
  return out
}
