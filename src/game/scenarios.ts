import type { FiredEvent, PolicyKey, YearState } from '../model/types'
import { num } from '../ui/format'
import { popularity } from './score'

/** Un objectif de scénario : une valeur à atteindre à la fin, ou à tenir chaque année. */
export type Objective = {
  label: string
  when: 'end' | 'always'
  get: (s: YearState) => number
  op: 'below' | 'above'
  target: number
  show: (v: number) => string
}

export type Scenario = {
  id: string
  icon: string
  title: string
  tagline: string
  /** Le récit de départ, lu au lancement. */
  story: string
  difficulty: 1 | 2 | 3 | 4
  end: number
  events: FiredEvent[]
  /** Des leviers qu'on ne peut pas toucher dans ce scénario (avec la raison). */
  locked?: { keys: PolicyKey[]; why: string }
  objectives: Objective[]
  tip: string
}

const pct = (v: number) => `${num(v * 100, 1)} %`
const pct0 = (v: number) => `${num(v * 100, 0)} %`

export const SCENARIOS: Scenario[] = [
  {
    id: 'premier-mandat',
    icon: '🎓',
    title: 'Premier mandat',
    tagline: 'Faire mieux que vos prédécesseurs, et être réélu.',
    story:
      'Vous voici à l’Élysée. Le chômage stagne autour de 7 %, le déficit dépasse 5 % du PIB, la pauvreté touche 15 % des Français. Vous avez jusqu’à l’élection de 2032 pour montrer que vous faites mieux, sans braquer le pays.',
    difficulty: 1,
    end: 2032,
    events: [],
    objectives: [
      { label: 'Popularité d’au moins 60 % en 2032', when: 'end', get: (s) => popularity(s), op: 'above', target: 59.5, show: (v) => `${num(v, 0)} %` },
      { label: 'Déficit sous 4 % du PIB en 2032', when: 'end', get: (s) => s.deficit / s.gdp, op: 'below', target: 0.04, show: pct },
      { label: 'Pauvreté sous 15 % en 2032', when: 'end', get: (s) => s.poverty, op: 'below', target: 0.15, show: pct },
    ],
    tip: 'Réduire le déficit sans casser l’activité : regardez l’aperçu de vos ministres avant d’avancer.',
  },
  {
    id: 'ormuz',
    icon: '🛢️',
    title: 'Le choc d’Ormuz',
    tagline: 'Le pétrole flambe : protéger les Français sans ruiner l’État.',
    story:
      'Le détroit d’Ormuz est bloqué : le baril s’envole à 160 $ en 2026. Les prix flambent, les entreprises souffrent, la colère monte. Tenez jusqu’en 2030 en protégeant l’emploi et le pouvoir d’achat.',
    difficulty: 2,
    end: 2030,
    events: [{ id: 'ormuz', year: 2026 }],
    objectives: [
      { label: 'Inflation toujours sous 3,5 %', when: 'always', get: (s) => s.inflation, op: 'below', target: 0.035, show: pct },
      { label: 'Chômage toujours sous 9 %', when: 'always', get: (s) => s.unemployment, op: 'below', target: 0.09, show: pct },
      { label: 'Déficit sous 5 % du PIB en 2030', when: 'end', get: (s) => s.deficit / s.gdp, op: 'below', target: 0.05, show: pct },
    ],
    tip: 'Moins dépendre du pétrole, alléger les prix (TVA ?), soutenir les plus modestes : chaque choix a un coût.',
  },
  {
    id: 'electrique',
    icon: '⚡',
    title: 'La France électrique',
    tagline: 'Sortir du pétrole et du gaz d’ici 2040.',
    story:
      'Le pétrole et le gaz pèsent encore 60 % de l’énergie consommée, et chaque crise au Moyen-Orient se paie au prix fort. Votre mission : électrifier le pays d’ici 2040 sans faire exploser le prix de l’électricité ni la dette.',
    difficulty: 2,
    end: 2040,
    events: [],
    objectives: [
      { label: 'Pétrole et gaz sous 35 % de l’énergie en 2040', when: 'end', get: (s) => s.fossilShare, op: 'below', target: 0.35, show: pct0 },
      { label: 'Prix de l’électricité sous l’indice 110 en 2040', when: 'end', get: (s) => s.electricityPrice * 100, op: 'below', target: 110, show: (v) => num(v, 0) },
      { label: 'Dette sous 145 % du PIB en 2040', when: 'end', get: (s) => s.debtRatio, op: 'below', target: 1.45, show: pct0 },
    ],
    tip: 'Le nucléaire existant rend l’électricité bon marché ; électrifier coûte cher au début.',
  },
  {
    id: 'retraites',
    icon: '🧓',
    title: 'Sauver les retraites',
    tagline: 'Le baby-boom part à la retraite : équilibrer les comptes d’ici 2040.',
    story:
      'D’ici 2040, il y aura un million de retraités de plus et presque autant d’actifs en moins. Ramenez le déficit public sous 3 % sans faire exploser la pauvreté ni perdre une élection.',
    difficulty: 2,
    end: 2040,
    events: [],
    objectives: [
      { label: 'Déficit sous 3,5 % du PIB en 2040', when: 'end', get: (s) => s.deficit / s.gdp, op: 'below', target: 0.035, show: pct },
      { label: 'Pauvreté sous 15,5 % en 2040', when: 'end', get: (s) => s.poverty, op: 'below', target: 0.155, show: pct },
      { label: 'Chômage sous 7,5 % en 2040', when: 'end', get: (s) => s.unemployment, op: 'below', target: 0.075, show: pct },
    ],
    tip: 'Âge de départ, indexation, cotisations, immigration : chaque levier a ses gagnants et ses perdants.',
  },
  {
    id: 'marches',
    icon: '📉',
    title: 'Sous l’œil des marchés',
    tagline: 'Faire baisser la dette sans déclencher de crise.',
    story:
      'Les agences de notation ont dégradé la France. Les prêteurs vous surveillent. La BCE est indépendante : pas de planche à billets. Ramenez la dette sous 115 % du PIB en 2035, sans jamais laisser les taux dépasser 4 %.',
    difficulty: 3,
    end: 2035,
    events: [],
    locked: { keys: ['monetization'], why: 'La BCE est indépendante : la France ne peut pas faire tourner la planche à billets.' },
    objectives: [
      { label: 'Dette sous 115 % du PIB en 2035', when: 'end', get: (s) => s.debtRatio, op: 'below', target: 1.15, show: pct0 },
      { label: 'Taux à 10 ans toujours sous 4 %', when: 'always', get: (s) => s.rate, op: 'below', target: 0.04, show: pct },
      { label: 'Jamais de tension sur la dette au-dessus de 0,7', when: 'always', get: (s) => s.marketStress, op: 'below', target: 0.7, show: (v) => num(v, 2) },
    ],
    tip: 'Couper trop vite casse la croissance, et la dette rapportée au PIB peut monter quand même.',
  },
  {
    id: 'pauvrete',
    icon: '❤️',
    title: 'Zéro pauvreté ?',
    tagline: 'Faire reculer la pauvreté de deux points en dix ans.',
    story:
      'Neuf millions de Français vivent sous le seuil de pauvreté. Vous avez promis de changer ça. D’ici 2035, ramenez la pauvreté sous 13 %, sans laisser filer le déficit ni la colère sociale.',
    difficulty: 3,
    end: 2035,
    events: [],
    objectives: [
      { label: 'Pauvreté sous 13 % en 2035', when: 'end', get: (s) => s.poverty, op: 'below', target: 0.13, show: pct },
      { label: 'Déficit toujours sous 6 % du PIB', when: 'always', get: (s) => s.deficit / s.gdp, op: 'below', target: 0.06, show: pct },
      { label: 'Climat social toujours calme (sous 0,6)', when: 'always', get: (s) => s.discontent, op: 'below', target: 0.6, show: (v) => num(v, 2) },
    ],
    tip: 'Minima sociaux, sécurité sociale de l’alimentation, SMIC, impôts : il faudra financer.',
  },
  {
    id: 'crise-2008',
    icon: '🏚️',
    title: '2008 recommence',
    tagline: 'Une crise financière mondiale éclate en 2027.',
    story:
      'En 2027, une grande banque américaine fait faillite et le crédit se fige dans le monde entier, puis une récession mondiale suit. Limitez la casse : protégez l’emploi, gardez la dette sous contrôle et survivez à l’élection de 2032.',
    difficulty: 3,
    end: 2033,
    events: [
      { id: 'financial-crisis', year: 2027 },
      { id: 'recession', year: 2028 },
    ],
    objectives: [
      { label: 'Chômage toujours sous 10 %', when: 'always', get: (s) => s.unemployment, op: 'below', target: 0.1, show: pct },
      { label: 'Dette sous 140 % du PIB en 2033', when: 'end', get: (s) => s.debtRatio, op: 'below', target: 1.4, show: pct0 },
      { label: 'Pas de crise de la dette', when: 'always', get: (s) => (s.debtCrisis ? 1 : 0), op: 'below', target: 0.5, show: (v) => (v ? 'crise' : 'non') },
    ],
    tip: 'En 2009, la France a soutenu l’économie, puis réduit le déficit. Le bon dosage et le bon moment comptent.',
  },
  {
    id: 'grand-chelem',
    icon: '👑',
    title: 'Le grand chelem',
    tagline: 'Dette, pauvreté, pétrole : tout réussir en vingt ans.',
    story:
      'Le défi ultime : d’ici 2045, ramener la dette sous 110 % du PIB, la pauvreté sous 14 % et la part du pétrole et du gaz sous 40 %, en gagnant les quatre élections. Aucun président n’y est arrivé. Et vous ?',
    difficulty: 4,
    end: 2045,
    events: [],
    objectives: [
      { label: 'Dette sous 110 % du PIB en 2045', when: 'end', get: (s) => s.debtRatio, op: 'below', target: 1.1, show: pct0 },
      { label: 'Pauvreté sous 14 % en 2045', when: 'end', get: (s) => s.poverty, op: 'below', target: 0.14, show: pct },
      { label: 'Pétrole et gaz sous 40 % de l’énergie en 2045', when: 'end', get: (s) => s.fossilShare, op: 'below', target: 0.4, show: pct0 },
    ],
    tip: 'Il faudra des réformes, du temps, et ménager l’opinion à chaque élection.',
  },
]

export type ObjectiveStatus = { objective: Objective; status: 'ok' | 'ko' | 'pending'; value: number }

const passes = (o: Objective, v: number) => (o.op === 'below' ? v < o.target : v > o.target)

/** Où en est-on des objectifs ? `states` va de 2025 à l'année en cours. */
export function evaluate(sc: Scenario, states: YearState[]): { results: ObjectiveStatus[]; finished: boolean; stars: number } {
  const current = states.at(-1)!
  const finished = current.year >= sc.end
  const played = states.filter((s) => s.year > states[0].year)
  const results = sc.objectives.map((o): ObjectiveStatus => {
    if (o.when === 'always') {
      const broken = played.find((s) => !passes(o, o.get(s)))
      return { objective: o, status: broken ? 'ko' : finished ? 'ok' : 'pending', value: broken ? o.get(broken) : o.get(current) }
    }
    const v = o.get(current)
    return { objective: o, status: finished ? (passes(o, v) ? 'ok' : 'ko') : 'pending', value: v }
  })
  return { results, finished, stars: results.filter((r) => r.status === 'ok').length }
}

/** En cours de partie : l'objectif est-il en bonne voie (la valeur actuelle passerait) ? */
export const onTrack = (r: ObjectiveStatus) => r.status !== 'ko' && passes(r.objective, r.value)
