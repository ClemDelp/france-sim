import type { EventDef, World, YearState } from './types'

/**
 * Ce que le monde (et le pays) vous réserve. Le jeu tire ces événements au sort chaque année : leur probabilité
 * dépend de la situation (plus il fait chaud, plus il y a de canicules ; plus la colère monte, plus il y a de grèves).
 * Chaque effet s'applique une année, à partir du déclenchement.
 */

const warm = (s: YearState) => Math.max(0, s.temperature - 1.3)
const repeat = (n: number, effect: Partial<World>): Partial<World>[] => Array.from({ length: n }, () => effect)

export const EVENTS: EventDef[] = [
  // — Climat : de plus en plus fréquent à mesure que la planète se réchauffe
  {
    id: 'heatwave',
    label: 'Canicule meurtrière',
    icon: '🥵',
    category: 'climat',
    summary: 'Six semaines au-delà de 40 °C : surmortalité, hôpitaux saturés, centrales à l’arrêt faute d’eau froide.',
    effects: [{ heatShock: 0.6, unrest: 0.05 }],
    chance: (s) => 0.08 + 0.3 * warm(s),
    cooldown: 2,
  },
  {
    id: 'wildfires',
    label: 'Méga-feux',
    icon: '🔥',
    category: 'climat',
    summary: 'Les Landes, la Provence et les Pyrénées brûlent : des villages évacués, des forêts parties en fumée.',
    effects: [{ heatShock: 0.35, demandShock: 0.002 }],
    chance: (s) => 0.04 + 0.2 * warm(s),
    cooldown: 3,
  },
  {
    id: 'floods',
    label: 'Inondations historiques',
    icon: '🌊',
    category: 'climat',
    summary: 'Des pluies diluviennes noient des vallées entières : routes coupées, maisons détruites, récoltes perdues.',
    effects: [{ heatShock: 0.45, demandShock: 0.003 }],
    chance: (s) => 0.06 + 0.15 * warm(s),
    cooldown: 3,
  },
  {
    id: 'drought',
    label: 'Sécheresse et pénurie d’eau',
    icon: '🌾',
    category: 'climat',
    summary: 'Nappes à sec, restrictions d’eau, récoltes en chute : les prix alimentaires flambent.',
    effects: [{ heatShock: 0.5, unrest: 0.05 }],
    chance: (s) => 0.05 + 0.25 * warm(s),
    cooldown: 3,
  },
  {
    id: 'storm',
    label: 'Tempête du siècle',
    icon: '🌀',
    category: 'climat',
    summary: 'Des vents à 200 km/h balaient l’Ouest : toitures arrachées, millions de foyers sans électricité.',
    effects: [{ heatShock: 0.3 }],
    chance: (s) => 0.03 + 0.1 * warm(s),
    cooldown: 4,
  },
  {
    id: 'climate-refugees',
    label: 'Vague de réfugiés climatiques',
    icon: '🧳',
    category: 'climat',
    summary: 'Sécheresses au Sahel et au Moyen-Orient : des centaines de milliers de personnes fuient vers l’Europe.',
    effects: [{ migrants: 60, conflict: 0.5 }, { migrants: 30 }],
    chance: (s) => 0.4 * Math.max(0, s.temperature - 1.7),
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
    chance: (s, start) => 0.015 + 0.08 * Math.max(0, 1 - s.frenchEmissions / start.frenchEmissions),
    cooldown: 60,
  },
  {
    id: 'climate-backlash',
    label: 'Le monde renonce au climat',
    icon: '🏭',
    category: 'climat',
    summary: 'Les grandes puissances relancent le charbon et sortent de l’accord de Paris : les émissions repartent à la hausse.',
    effects: repeat(40, { climateAmbition: 0.012 }),
    chance: () => 0.012,
    cooldown: 60,
  },
  // — Économie
  {
    id: 'financial-crisis',
    label: 'Crise financière mondiale',
    icon: '🏦',
    category: 'economie',
    summary: 'Comme en 2008 : les banques se méfient, le crédit se tarit, le commerce mondial recule.',
    effects: [{ growth: -0.05, panic: 1, demandShock: 0.02 }, { growth: -0.02, panic: 0.5 }, { growth: 0.01 }],
    chance: () => 0.025,
    cooldown: 10,
  },
  {
    id: 'recession',
    label: 'Récession mondiale',
    icon: '📉',
    category: 'economie',
    summary: 'Nos grands partenaires (Allemagne, États-Unis, Chine) ralentissent fortement.',
    effects: [{ growth: -0.035 }, { growth: -0.015 }],
    chance: () => 0.05,
    cooldown: 6,
  },
  {
    id: 'ormuz',
    label: 'Blocage du détroit d’Ormuz',
    icon: '🛢️',
    category: 'monde',
    summary: 'Le pétrole bondit de 60 $ le baril : l’énergie importée renchérit tous les prix.',
    effects: [{ oil: 60, growth: -0.01 }, { oil: 40, growth: -0.005 }, { oil: 15 }],
    chance: (s) => 0.025 * (s.fossilShare / 0.6),
    cooldown: 8,
  },
  {
    id: 'oil-glut',
    label: 'Pétrole bon marché',
    icon: '⬇️',
    category: 'economie',
    summary: 'Surproduction mondiale : le baril s’effondre.',
    effects: [{ oil: -30 }, { oil: -25 }, { oil: -15 }],
    chance: () => 0.035,
    cooldown: 8,
  },
  {
    id: 'ecb-hike',
    label: 'La BCE remonte fortement ses taux',
    icon: '📈',
    category: 'economie',
    summary: 'Pour casser l’inflation en zone euro, la BCE ajoute 2 points à son taux directeur.',
    effects: [{ ecbRate: 0.02 }, { ecbRate: 0.02 }, { ecbRate: 0.01 }],
    chance: (s) => 0.02 + 4 * Math.max(0, s.inflation - 0.03),
    cooldown: 6,
  },
  {
    id: 'trade-war',
    label: 'Guerre commerciale',
    icon: '🚢',
    category: 'monde',
    summary: 'Washington et Pékin s’affrontent à coups de droits de douane : nos exportations trinquent.',
    effects: [{ growth: -0.02 }, { growth: -0.015 }, { growth: -0.005 }],
    chance: () => 0.04,
    cooldown: 6,
  },
  {
    id: 'cyberattack',
    label: 'Cyberattaque géante',
    icon: '💻',
    category: 'technologie',
    summary: 'Hôpitaux, banques et réseaux électriques paralysés plusieurs jours.',
    effects: [{ demandShock: 0.006, unrest: 0.05 }],
    chance: () => 0.03,
    cooldown: 5,
  },
  {
    id: 'ai-boom',
    label: 'Révolution de l’intelligence artificielle',
    icon: '🤖',
    category: 'technologie',
    summary: 'De nouveaux outils dopent la productivité… et bousculent des millions d’emplois de bureau.',
    effects: [...repeat(6, { productivity: 0.005 }), { unrest: 0.05 }],
    chance: () => 0.025,
    cooldown: 20,
  },
  {
    id: 'green-tech',
    label: 'Percée des batteries et du solaire',
    icon: '🔋',
    category: 'technologie',
    summary: 'Les prix s’effondrent : électrifier devient beaucoup moins cher partout dans le monde.',
    effects: repeat(20, { climateAmbition: -0.008 }),
    chance: () => 0.03,
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
    chance: () => 0.02,
    cooldown: 10,
  },
  {
    id: 'pandemic',
    label: 'Pandémie',
    icon: '🦠',
    category: 'monde',
    summary: 'Confinements : une partie de l’activité s’arrête net pendant un an.',
    effects: [
      { growth: -0.04, demandShock: 0.07 },
      { growth: 0.02, demandShock: 0.01 },
    ],
    chance: () => 0.015,
    cooldown: 15,
  },
  {
    id: 'china-boom',
    label: 'La Chine relance son économie',
    icon: '🐉',
    category: 'monde',
    summary: 'Un grand plan de relance chinois dope le commerce mondial.',
    effects: [{ growth: 0.015 }, { growth: 0.01 }],
    chance: () => 0.03,
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
    chance: (s) => (0.03 + 0.12 * warm(s)) * (1 - s.peaceEffect),
    cooldown: 8,
  },
  {
    id: 'famine',
    label: 'Famine dans la Corne de l’Afrique',
    icon: '🥣',
    category: 'climat',
    summary: 'Trois saisons des pluies ratées : la faim jette des familles entières sur les routes.',
    effects: [{ conflict: 0.6, migrants: 15 }],
    chance: (s) => (0.02 + 0.15 * warm(s)) * (1 - s.peaceEffect),
    cooldown: 6,
  },
  {
    id: 'mediterranean',
    label: 'Drame en Méditerranée',
    icon: '🚤',
    category: 'monde',
    summary: 'Des milliers de personnes tentent la traversée : naufrages, camps débordés, l’Europe se divise sur l’accueil.',
    effects: [{ migrants: 35, unrest: 0.05 }],
    chance: (s) => 0.03 + 0.1 * s.conflict,
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
    chance: (s) => (s.conflict > 0.3 ? 0.04 + 0.3 * s.peaceEffect : 0),
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
    chance: (s) => 0.01 + 0.5 * Math.max(0, s.discontent - 0.35),
    cooldown: 3,
  },
  {
    id: 'scandal',
    label: 'Scandale d’État',
    icon: '🗞️',
    category: 'societe',
    summary: 'Une affaire de corruption éclabousse le gouvernement.',
    effects: [{ unrest: 0.15 }],
    chance: () => 0.04,
    cooldown: 5,
  },
  {
    id: 'world-cup',
    label: 'Victoire en Coupe du monde',
    icon: '🏆',
    category: 'societe',
    summary: 'Les Bleus sont champions du monde : le pays fait la fête, la colère retombe un moment.',
    effects: [{ unrest: -0.15 }],
    chance: () => 0.04,
    cooldown: 4,
  },
  {
    id: 'medical-breakthrough',
    label: 'Percée médicale',
    icon: '💊',
    category: 'technologie',
    summary: 'Un vaccin contre plusieurs cancers est mis au point : un espoir immense.',
    effects: [{ unrest: -0.05 }],
    chance: () => 0.02,
    cooldown: 20,
  },
]

/** Un tirage au sort reproductible : la même partie (même graine) produit les mêmes événements. */
function random(seed: number, year: number, id: string): number {
  let h = (seed ^ (year * 2654435761)) >>> 0
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 2246822507) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
  }
  h = Math.imul(h ^ (h >>> 16), 3266489909) >>> 0
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

/** Les événements qui surviennent `year`, compte tenu de l'état du pays l'année d'avant. Deux au plus par an. */
export function rollEvents(seed: number, year: number, last: YearState, start: YearState, past: { year: number; id: string }[]): { year: number; id: string }[] {
  const fired = EVENTS.filter((e) => {
    const previous = past.filter((p) => p.id === e.id).map((p) => p.year)
    if (previous.some((y) => year - y < e.cooldown)) {
      return false
    }
    return random(seed, year, e.id) < Math.min(0.6, e.chance(last, start))
  })
  return fired.slice(0, 2).map((e) => ({ year, id: e.id }))
}
