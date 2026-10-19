import type { EventDef } from './types'

/** Les chocs que le monde peut nous envoyer. Chaque effet s'applique une année, à partir du déclenchement. */
export const EVENTS: EventDef[] = [
  {
    id: 'ormuz',
    label: 'Blocage du détroit d’Ormuz',
    icon: '🛢️',
    summary: 'Le pétrole bondit à 140 $ le baril pendant deux ans : l’énergie importée renchérit tous les prix.',
    effects: [{ oil: 60, growth: -0.01 }, { oil: 40, growth: -0.005 }, { oil: 15 }],
  },
  {
    id: 'financial-crisis',
    label: 'Crise financière mondiale',
    icon: '🏦',
    summary: 'Comme en 2008 : les banques se méfient, le crédit se tarit, le commerce mondial recule.',
    effects: [{ growth: -0.05, panic: 1, demandShock: 0.02 }, { growth: -0.02, panic: 0.5 }, { growth: 0.01 }],
  },
  {
    id: 'pandemic',
    label: 'Pandémie',
    icon: '🦠',
    summary: 'Confinements : une partie de l’activité s’arrête net pendant un an.',
    effects: [{ growth: -0.04, demandShock: 0.07 }, { growth: 0.02, demandShock: 0.01 }],
  },
  {
    id: 'recession',
    label: 'Récession mondiale',
    icon: '🌍',
    summary: 'Nos grands partenaires (Allemagne, États-Unis, Chine) ralentissent fortement.',
    effects: [{ growth: -0.035 }, { growth: -0.015 }],
  },
  {
    id: 'ecb-hike',
    label: 'La BCE remonte fortement ses taux',
    icon: '📈',
    summary: 'Pour casser l’inflation en zone euro, la BCE ajoute 2 points à son taux directeur.',
    effects: [{ ecbRate: 0.02 }, { ecbRate: 0.02 }, { ecbRate: 0.01 }],
  },
  {
    id: 'oil-glut',
    label: 'Pétrole bon marché',
    icon: '⬇️',
    summary: 'Surproduction mondiale : le baril retombe à 45 $.',
    effects: [{ oil: -30 }, { oil: -25 }, { oil: -15 }],
  },
]
