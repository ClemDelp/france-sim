import { P } from './calibration'
import type { EventDef, World, YearState } from './types'

/**
 * Ce que le monde (et le pays) vous réserve. Le jeu tire ces événements au sort chaque année : leur probabilité
 * dépend de la situation (plus il fait chaud, plus il y a de canicules ; plus la colère monte, plus il y a de grèves).
 * Chaque effet s'applique une année, à partir du déclenchement.
 */

const warm = (s: YearState) => Math.max(0, s.temperature - 1.3)
const pct = (v: number) => `${Math.round(v * 100)} %`
const deg = (v: number) => `${v.toFixed(1).replace('.', ',')} °C`

/** Un facteur de probabilité, en clair : « + parce que… » (ajouté) ou « × grâce à… » (multiplié). */
export type OddsFactor = { label: string; kind: 'add' | 'mult'; value: number }
export type Odds = { base: number; factors: OddsFactor[] }

const odds = (base: number, ...factors: OddsFactor[]): Odds => ({ base, factors: factors.filter((f) => (f.kind === 'add' ? Math.abs(f.value) > 0.0005 : Math.abs(f.value - 1) > 0.005)) })
const add = (label: string, value: number): OddsFactor => ({ label, kind: 'add', value })
const mult = (label: string, value: number): OddsFactor => ({ label, kind: 'mult', value })
const warming = (s: YearState, k: number) => add(`la planète a pris ${deg(warm(s))} de plus qu’au début du siècle`, k * warm(s))
const influence = (s: YearState, k: number) => mult(`l’influence de la France (indice ${Math.round(s.influence * 100)})`, Math.max(0.2, 1 + k * (s.influence - 1)))

/** La probabilité qui découle des facteurs (plafonnée à 60 % par an). */
export const chanceOf = (o: Odds) => Math.min(0.6, Math.max(0, (o.base + o.factors.filter((f) => f.kind === 'add').reduce((a, f) => a + f.value, 0)) * o.factors.filter((f) => f.kind === 'mult').reduce((a, f) => a * f.value, 1)))
const repeat = (n: number, effect: Partial<World>): Partial<World>[] => Array.from({ length: n }, () => effect)

export const EVENTS: EventDef[] = [
  // — Climat : de plus en plus fréquent à mesure que la planète se réchauffe
  {
    id: 'heatwave',
    label: 'Canicule meurtrière',
    icon: '🥵',
    category: 'climat',
    summary: 'Six semaines au-delà de 40 °C : surmortalité, hôpitaux saturés, centrales à l’arrêt faute d’eau froide.',
    // Les catastrophes coûtent surtout des biens détruits, peu d'activité : 2022, la pire année depuis 1999, ≈ 10 Md€ de dommages assurés (France Assureurs).
    effects: [{ heatShock: 0.15 }],
    chance: (s) => odds(0.08, warming(s, 0.3)),
    cooldown: 2,
  },
  {
    id: 'wildfires',
    label: 'Méga-feux',
    icon: '🔥',
    category: 'climat',
    summary: 'Les Landes, la Provence et les Pyrénées brûlent : des villages évacués, des forêts parties en fumée.',
    effects: [{ heatShock: 0.08, demandShock: 0.002 }],
    chance: (s) => odds(0.04, warming(s, 0.2)),
    cooldown: 3,
  },
  {
    id: 'floods',
    label: 'Inondations historiques',
    icon: '🌊',
    category: 'climat',
    summary: 'Des pluies diluviennes noient des vallées entières : routes coupées, maisons détruites, récoltes perdues.',
    effects: [{ heatShock: 0.1, demandShock: 0.003 }],
    chance: (s) => odds(0.06, warming(s, 0.15)),
    cooldown: 3,
  },
  {
    id: 'drought',
    label: 'Sécheresse et pénurie d’eau',
    icon: '🌾',
    category: 'climat',
    summary: 'Nappes à sec, restrictions d’eau, récoltes en chute : les prix alimentaires flambent.',
    effects: [{ heatShock: 0.12 }],
    chance: (s) => odds(0.05, warming(s, 0.25)),
    cooldown: 3,
  },
  {
    id: 'storm',
    label: 'Tempête du siècle',
    icon: '🌀',
    category: 'climat',
    summary: 'Des vents à 200 km/h balaient l’Ouest : toitures arrachées, millions de foyers sans électricité.',
    effects: [{ heatShock: 0.08 }],
    chance: (s) => odds(0.03, warming(s, 0.1)),
    cooldown: 4,
  },
  {
    id: 'climate-refugees',
    label: 'Vague de réfugiés climatiques',
    icon: '🧳',
    category: 'climat',
    summary: 'Sécheresses au Sahel et au Moyen-Orient : des centaines de milliers de personnes fuient vers l’Europe.',
    effects: [{ migrants: 60, conflict: 0.5 }, { migrants: 30 }],
    chance: (s) => odds(0, add(`le réchauffement dépasse +1,7 °C (${deg(s.temperature)})`, 0.4 * Math.max(0, s.temperature - 1.7))),
    cooldown: 6,
  },
  {
    id: 'climate-deal',
    label: 'Sursaut climatique mondial',
    icon: '🤝',
    category: 'climat',
    summary: 'Chine, États-Unis, Inde et Europe s’engagent ensemble : les émissions mondiales vont baisser beaucoup plus vite.',
    effects: repeat(40, { climateAmbition: -0.03 }),
    // Une France exemplaire rend un accord mondial plus probable.
    chance: (s, start) => odds(0.015, add(`la France a réduit ses émissions de ${pct(Math.max(0, 1 - s.frenchEmissions / start.frenchEmissions))} : elle montre l’exemple`, 0.08 * Math.max(0, 1 - s.frenchEmissions / start.frenchEmissions)), influence(s, P.influenceDiplomacy)),
    cooldown: 60,
  },
  {
    id: 'climate-backlash',
    label: 'Le monde renonce au climat',
    icon: '🏭',
    category: 'climat',
    summary: 'Les grandes puissances relancent le charbon et sortent de l’accord de Paris : les émissions repartent à la hausse.',
    effects: repeat(40, { climateAmbition: 0.012 }),
    chance: () => odds(0.012),
    cooldown: 60,
  },
  // — Économie
  {
    id: 'financial-crisis',
    label: 'Crise financière mondiale',
    icon: '🏦',
    category: 'economie',
    summary: 'Comme en 2008 : les banques se méfient, le crédit se tarit, le commerce mondial recule.',
    // La demande ne revient que peu à peu (crédit rare, ménages prudents) : pas de rebond magique l'année suivante.
    effects: [{ growth: -0.05, panic: 1, demandShock: 0.02, bankLoss: 0.3 }, { growth: -0.02, panic: 0.5, demandShock: 0.012 }, { growth: 0.01, demandShock: 0.005 }],
    chance: () => odds(0.025),
    cooldown: 10,
  },
  {
    id: 'recession',
    label: 'Récession mondiale',
    icon: '📉',
    category: 'economie',
    summary: 'Nos grands partenaires (Allemagne, États-Unis, Chine) ralentissent fortement.',
    effects: [{ growth: -0.035 }, { growth: -0.015 }],
    chance: () => odds(0.05),
    cooldown: 6,
  },
  {
    id: 'ormuz',
    label: 'Blocage du détroit d’Ormuz',
    icon: '🛢️',
    category: 'monde',
    summary: 'Le pétrole bondit de 60 $ le baril : l’énergie importée renchérit tous les prix.',
    effects: [{ oil: 88, growth: -0.01 }, { oil: 55, growth: -0.005 }, { oil: 20 }],
    chance: (s) => odds(0.025, mult(`la dépendance au pétrole et au gaz (${pct(s.fossilShare)} de l’énergie)`, s.fossilShare / 0.6)),
    cooldown: 8,
  },
  {
    id: 'oil-glut',
    label: 'Pétrole bon marché',
    icon: '⬇️',
    category: 'economie',
    summary: 'Surproduction mondiale : le baril s’effondre.',
    effects: [{ oil: -30 }, { oil: -25 }, { oil: -15 }],
    chance: () => odds(0.035),
    cooldown: 8,
  },
  {
    id: 'ecb-hike',
    label: 'La BCE remonte fortement ses taux',
    icon: '📈',
    category: 'economie',
    summary: 'Pour casser l’inflation en zone euro, la BCE ajoute 2 points à son taux directeur.',
    effects: [{ ecbRate: 0.02 }, { ecbRate: 0.02 }, { ecbRate: 0.01 }],
    // La BCE regarde toute la zone euro, dont la France ne pèse qu'environ un cinquième.
    chance: (s) => odds(0.02, add(`l’inflation en France dépasse 3 % (${pct(s.inflation)}), et la France pèse un cinquième de la zone euro`, 0.8 * Math.max(0, s.inflation - 0.03))),
    cooldown: 6,
  },
  {
    id: 'trade-war',
    label: 'Guerre commerciale',
    icon: '🚢',
    category: 'monde',
    summary: 'Washington et Pékin s’affrontent à coups de droits de douane : nos exportations trinquent.',
    effects: [{ growth: -0.02 }, { growth: -0.015 }, { growth: -0.005 }],
    chance: (s) => odds(0.04, influence(s, -P.influenceTrade)),
    cooldown: 6,
  },
  // — Les partenaires réagissent au programme : la probabilité suit ce que fait la France.
  {
    id: 'eu-procedure',
    label: 'Bruxelles sanctionne le déficit français',
    icon: '🇪🇺',
    category: 'monde',
    summary: 'Procédure pour déficit excessif durcie : amende, fonds européens gelés, et la BCE prévient qu’elle ne protégera pas la dette française.',
    effects: [{ panic: 0.4, demandShock: 0.002, unrest: 0.03 }],
    chance: (s) => odds(0.01, add(`le déficit atteint ${pct(s.deficit / s.gdp)} du PIB (la règle européenne fixe 3 %)`, 1.5 * Math.max(0, s.deficit / s.gdp - 0.04))),
    cooldown: 4,
  },
  {
    id: 'us-retaliation',
    label: 'Les États-Unis répliquent',
    icon: '🇺🇸',
    category: 'monde',
    summary: 'Washington relève ses droits de douane sur les produits français (vins, luxe, aéronautique) en représailles.',
    effects: [{ growth: -0.01, demandShock: 0.004 }, { growth: -0.005 }],
    chance: (s) => odds(0.01, add(`la France taxe les importations hors UE à ${pct(s.tariffs)}`, 0.8 * Math.max(0, s.tariffs - 0.05)), influence(s, -P.influenceTrade)),
    cooldown: 5,
  },
  {
    id: 'eu-support',
    label: 'L’Europe accompagne la France',
    icon: '🤝',
    category: 'monde',
    summary: 'Nouvel emprunt européen commun pour la transition et la défense : de l’investissement en France sans creuser le déficit.',
    effects: repeat(3, { growth: 0.004, productivity: 0.002 }),
    chance: (s, start) =>
      odds(
        0.01,
        add(`le déficit est sous 3 % du PIB (${pct(s.deficit / s.gdp)})`, s.deficit / s.gdp < 0.03 ? 0.03 : 0),
        add(`la France a réduit ses émissions de ${pct(Math.max(0, 1 - s.frenchEmissions / start.frenchEmissions))}`, 0.1 * Math.max(0, 1 - s.frenchEmissions / start.frenchEmissions)),
      ),
    cooldown: 10,
  },
  {
    id: 'cyberattack',
    label: 'Cyberattaque géante',
    icon: '💻',
    category: 'technologie',
    summary: 'Hôpitaux, banques et réseaux électriques paralysés plusieurs jours.',
    effects: [{ demandShock: 0.006, unrest: 0.05 }],
    chance: () => odds(0.03),
    cooldown: 5,
  },
  {
    id: 'ai-boom',
    label: 'Révolution de l’intelligence artificielle',
    icon: '🤖',
    category: 'technologie',
    summary: 'De nouveaux outils dopent la productivité… et bousculent des millions d’emplois de bureau.',
    effects: [...repeat(6, { productivity: 0.005 }), { unrest: 0.05 }],
    chance: () => odds(0.025),
    cooldown: 20,
  },
  {
    id: 'green-tech',
    label: 'Percée des batteries et du solaire',
    icon: '🔋',
    category: 'technologie',
    summary: 'Les prix s’effondrent : électrifier devient beaucoup moins cher partout dans le monde.',
    effects: repeat(20, { climateAmbition: -0.008 }),
    chance: () => odds(0.03),
    cooldown: 30,
  },
  // — Monde et géopolitique
  {
    id: 'war-europe',
    label: 'Guerre aux portes de l’Europe',
    icon: '⚔️',
    category: 'monde',
    summary: 'Le gaz et le pétrole flambent, les marchés s’affolent, les réfugiés affluent.',
    effects: [{ oil: 40, growth: -0.01, panic: 0.3, conflict: 1 }, { oil: 20 }],
    chance: () => odds(0.02),
    cooldown: 10,
  },
  {
    id: 'pandemic',
    label: 'Pandémie',
    icon: '🦠',
    category: 'monde',
    summary: 'Confinements : une partie de l’activité s’arrête net pendant un an.',
    effects: [
      // Comme en 2020, la BCE rachète massivement de la dette : les taux ne s'envolent pas.
      { growth: -0.04, demandShock: 0.07, qe: 1 },
      { growth: 0.02, demandShock: 0.025, qe: 0.6 },
      { demandShock: 0.01 },
    ],
    chance: () => odds(0.015),
    cooldown: 15,
  },
  {
    id: 'china-boom',
    label: 'La Chine relance son économie',
    icon: '🐉',
    category: 'monde',
    summary: 'Un grand plan de relance chinois dope le commerce mondial.',
    effects: [{ growth: 0.015 }, { growth: 0.01 }],
    chance: () => odds(0.03),
    cooldown: 8,
  },
  {
    id: 'sahel-war',
    label: 'Guerre civile au Sahel',
    icon: '🔫',
    category: 'monde',
    summary: 'Sécheresse, famine et groupes armés : des millions de personnes fuient, une partie vers l’Europe.',
    effects: [{ conflict: 1.2 }],
    // Le réchauffement attise les conflits ; l'aide au développement les prévient.
    chance: (s) => odds(0.03, warming(s, 0.12), mult(`l’aide au développement et à la paix (−${pct(s.peaceEffect)})`, 1 - s.peaceEffect)),
    cooldown: 8,
  },
  {
    id: 'famine',
    label: 'Famine dans la Corne de l’Afrique',
    icon: '🥣',
    category: 'climat',
    summary: 'Trois saisons des pluies ratées : la faim jette des familles entières sur les routes.',
    effects: [{ conflict: 0.6, migrants: 15 }],
    chance: (s) => odds(0.02, warming(s, 0.15), mult(`l’aide au développement et à la paix (−${pct(s.peaceEffect)})`, 1 - s.peaceEffect)),
    cooldown: 6,
  },
  {
    id: 'mediterranean',
    label: 'Drame en Méditerranée',
    icon: '🚤',
    category: 'monde',
    summary: 'Des milliers de personnes tentent la traversée : naufrages, camps débordés, l’Europe se divise sur l’accueil.',
    effects: [{ migrants: 35, unrest: 0.05 }],
    chance: (s) => odds(0.03, add('des guerres et famines en cours autour de l’Europe', 0.1 * s.conflict)),
    cooldown: 3,
  },
  {
    id: 'peace-deal',
    label: 'Accord de paix historique',
    icon: '🕊️',
    category: 'monde',
    summary: 'Sous l’égide de l’ONU et avec l’aide européenne, une guerre s’arrête : les réfugiés commencent à rentrer.',
    effects: [{ conflict: -1 }],
    // Plus la France investit dans la paix et le développement, plus un accord est probable.
    chance: (s) => (s.conflict > 0.3 ? odds(0.04, add('l’aide au développement et à la paix', 0.3 * s.peaceEffect), influence(s, P.influenceDiplomacy)) : odds(0)),
    cooldown: 8,
  },
  // — Société
  {
    id: 'general-strike',
    label: 'Grève générale',
    icon: '✊',
    category: 'societe',
    summary: 'Transports, raffineries, écoles à l’arrêt : le pays est bloqué.',
    effects: [{ unrest: 0.15, demandShock: 0.004 }],
    chance: (s) => odds(0.01, add(`la colère dans le pays (climat social ${s.discontent.toFixed(2).replace('.', ',')})`, 0.5 * Math.max(0, s.discontent - 0.35))),
    cooldown: 3,
  },
  {
    id: 'scandal',
    label: 'Scandale d’État',
    icon: '🗞️',
    category: 'societe',
    summary: 'Une affaire de corruption éclabousse le gouvernement.',
    effects: [{ unrest: 0.15 }],
    chance: () => odds(0.04),
    cooldown: 5,
  },
  {
    id: 'world-cup',
    label: 'Victoire en Coupe du monde',
    icon: '🏆',
    category: 'societe',
    summary: 'Les Bleus sont champions du monde : le pays fait la fête, la colère retombe un moment.',
    effects: [{ unrest: -0.15 }],
    chance: () => odds(0.04),
    cooldown: 4,
  },
  {
    id: 'medical-breakthrough',
    label: 'Percée médicale',
    icon: '💊',
    category: 'technologie',
    summary: 'Un vaccin contre plusieurs cancers est mis au point : un espoir immense.',
    effects: [{ unrest: -0.05 }],
    chance: () => odds(0.02),
    cooldown: 20,
  },
  // Les actes politiques : décidés par le joueur (les jokers du pouvoir), jamais tirés au sort. Leurs effets passent par le modèle
  // (paramètres forceAnger, forceContextAnger, instabilityPremium dans modele/comportements.csv).
  {
    id: 'force-493',
    label: 'Réforme adoptée par le 49.3',
    icon: '📜',
    category: 'societe',
    summary: 'Le gouvernement engage sa responsabilité : la réforme passe sans vote. La colère monte, d’autant plus que le pays était déjà en colère.',
    effects: [{ forced: 1 }],
    chance: () => odds(0),
    cooldown: 1,
    decided: 'Vous avez engagé le 49.3, et la motion de censure a échoué.',
  },
  {
    id: 'censure',
    label: 'Gouvernement renversé',
    icon: '🏛️',
    category: 'societe',
    summary: 'Une motion de censure est adoptée après un 49.3 : la réforme tombe, le gouvernement aussi. Les prêteurs s’inquiètent.',
    effects: [{ instability: 1 }],
    chance: () => odds(0),
    cooldown: 1,
    decided: 'Vous avez engagé le 49.3, et l’Assemblée a voté la censure.',
  },
  {
    id: 'dissolution',
    label: 'Assemblée dissoute',
    icon: '💥',
    category: 'societe',
    summary: 'Législatives anticipées : l’incertitude politique fait monter la prime de risque (juin 2024 : +0,3 point en trois semaines).',
    effects: [{ instability: 1 }],
    chance: () => odds(0),
    cooldown: 1,
    decided: 'Vous avez dissous l’Assemblée nationale.',
  },
]

/** Un tirage au sort reproductible : la même partie (même graine) produit les mêmes événements. */
export function random(seed: number, year: number, id: string): number {
  let h = (seed ^ (year * 2654435761)) >>> 0
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 2246822507) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
  }
  h = Math.imul(h ^ (h >>> 16), 3266489909) >>> 0
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

/** Les événements qui surviennent `year`, compte tenu de l'état du pays l'année d'avant. Deux au plus par an. */
/**
 * Un choc économique majeur : récession, krach, pandémie, flambée du pétrole. Reconnu à son effet la première année
 * (croissance mondiale −3 points ou plus, choc de demande d'au moins 1 % du PIB, pétrole +40 $ ou plus).
 */
export const isMajorShock = (e: EventDef) => {
  const first = e.effects[0] ?? {}
  return (first.growth ?? 0) <= -0.03 || (first.demandShock ?? 0) >= 0.01 || (first.oil ?? 0) >= 40
}

const BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]))

/**
 * Les événements de l'année, tirés au sort (la même graine donne la même partie). Deux règles d'équité pour le joueur :
 * pas de choc majeur la première année (il n'a pas encore pu agir), et au plus un choc majeur par an,
 * en comptant ceux que le scénario impose déjà cette année-là.
 */
export function rollEvents(seed: number, year: number, last: YearState, start: YearState, past: { year: number; id: string }[]): { year: number; id: string }[] {
  let majorAllowed = year > start.year + 1 && !past.some((p) => p.year === year && BY_ID[p.id] && isMajorShock(BY_ID[p.id]))
  const fired = EVENTS.filter((e) => {
    const previous = past.filter((p) => p.id === e.id).map((p) => p.year)
    if (previous.some((y) => year - y < e.cooldown)) {
      return false
    }
    return random(seed, year, e.id) < chanceOf(e.chance(last, start))
  }).filter((e) => {
    if (!isMajorShock(e)) {
      return true
    }
    const ok = majorAllowed
    majorAllowed = false
    return ok
  })
  return fired.slice(0, 2).map((e) => ({ year, id: e.id }))
}
