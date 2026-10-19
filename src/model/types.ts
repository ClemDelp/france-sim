/** Les cinq tranches de ménages, des 20 % les plus modestes aux 10 % les plus aisés. */
export type Group = 'g1' | 'g2' | 'g3' | 'g4' | 'g5'
export const GROUPS: Group[] = ['g1', 'g2', 'g3', 'g4', 'g5']

export const GROUP_LABEL: Record<Group, string> = {
  g1: '20 % les plus modestes',
  g2: 'Modestes',
  g3: 'Classes moyennes',
  g4: 'Aisés',
  g5: '10 % les plus riches',
}

export type ByGroup = Record<Group, number>

/** Les entreprises selon leur taille : PME (microentreprises comprises), ETI, grandes entreprises. */
export type Size = 'pme' | 'eti' | 'ge'
export const SIZES: Size[] = ['pme', 'eti', 'ge']
export const SIZE_LABEL: Record<Size, string> = { pme: 'PME et TPE', eti: 'Entreprises de taille intermédiaire', ge: 'Grandes entreprises' }
export type BySize = Record<Size, number>

/** Ce qu'on suit pour chaque taille d'entreprise (Md€ courants, millions d'emplois). */
export type FirmSize = { employment: number; investment: number; exports: number; profits: number; corporateTax: number }

/** Qui détient la dette publique. */
export type Holder = 'monde' | 'bce' | 'assureurs' | 'banques'
export const HOLDERS: Holder[] = ['monde', 'bce', 'assureurs', 'banques']
export const HOLDER_LABEL: Record<Holder, string> = {
  monde: 'Investisseurs étrangers',
  bce: 'Banque de France (BCE)',
  assureurs: 'Assurance-vie des ménages',
  banques: 'Banques françaises',
}

/** Les décisions du joueur. Les valeurs par défaut sont la politique de 2025. */
export type Policy = {
  // Impôts
  vat: number
  incomeTaxTop: number
  csg: number
  corporateTax: number
  wealthTax: number
  inheritanceTax: number
  productionTaxes: number
  // Dépenses (Md€ de 2025, en volume)
  health: number
  prevention: number
  education: number
  defence: number
  investment: number
  otherServices: number
  firmAid: number
  /** Part des aides aux entreprises qui va aux PME (le reste se répartit entre ETI et grands groupes). */
  firmAidSmeShare: number
  // Sécurité sociale
  retirementAge: number
  pensionIndexation: number
  unemploymentReplacement: number
  minima: number
  foodSecurity: number
  // Travail
  smicBoost: number
  // Énergie
  electrification: number
  nuclearShare: number
  // Commerce
  tariffs: number
  tariffChinaEV: number
  // Population
  netMigration: number
  // Monnaie et dette
  monetization: number
  savingsToFirms: number
  /** Face à une crise de la dette : 0 = accepter le plan d'aide européen (et ses économies imposées), 1 = le refuser. */
  crisisResponse: number
  /** Annulation ponctuelle : part de la dette détenue par `cancelHolder` effacée cette année-là. */
  cancelShare: number
  cancelHolder: Holder
}

export type PolicyKey = Exclude<keyof Policy, 'cancelHolder'>

/** Ce que le monde impose : croissance mondiale, pétrole, taux de la BCE, chocs. */
export type World = {
  growth: number
  oil: number
  ecbRate: number
  /** Choc de confiance (points de prime de risque ajoutés cette année). */
  panic: number
  /** Choc de demande (fraction de PIB perdue cette année, pandémie, crise). */
  demandShock: number
  /** Rachats de dette publique par la BCE (part du déficit rachetée, assouplissement quantitatif). */
  qe: number
}

/** Une décision prise une année donnée (le joueur bouge des leviers puis avance). */
export type Decision = { year: number; patch: Partial<Policy> }

/** Un événement mondial, déclenché à la main ou par le hasard. */
export type EventDef = {
  id: string
  label: string
  icon: string
  summary: string
  /** Effet sur le monde, année par année depuis le déclenchement. */
  effects: Partial<World>[]
}

export type FiredEvent = { year: number; id: string }

/** Un flux d'argent entre deux acteurs, pour la matrice et la carte des flux. */
export type Flow = { from: Actor; to: Actor; amount: number; label: string }

export type Actor = 'menages' | 'entreprises' | 'etat' | 'secu' | 'banques' | 'bce' | 'monde' | 'energie'

/** Les façons de perdre la partie. */
export type Ending = 'revolte' | 'faillite' | 'hyperinflation' | 'depression'

/** L'état de la France à la fin d'une année. Montants en milliards d'euros courants. */
export type YearState = {
  year: number
  // Macro
  gdp: number
  gdpReal: number
  growth: number
  inflation: number
  priceLevel: number
  unemployment: number
  employment: number
  laborForce: number
  productivity: number
  avgWage: number
  smic: number
  // Demande
  consumption: number
  investment: number
  housing: number
  publicSpendingGoods: number
  exports: number
  imports: number
  energyImports: number
  // Finances publiques
  revenue: number
  spending: number
  deficit: number
  debt: number
  debtRatio: number
  holders: Record<Holder, number>
  rate: number
  effectiveRate: number
  interest: number
  riskPremium: number
  budget: Record<string, number>
  taxes: Record<string, number>
  secu: Record<string, { revenue: number; spending: number }>
  // Ménages
  disposable: ByGroup
  disposablePerCapita: ByGroup
  wealth: ByGroup
  consumptionByGroup: ByGroup
  poverty: number
  gini: number
  ratioD9D1: number
  medianIncome: number
  // Démographie
  population: number
  workingAge: number
  retirees: number
  lifeExpectancy: number
  lifeGap: number
  // Énergie et monde
  oil: number
  fossilShare: number
  electricityPrice: number
  energyPrice: number
  currentAccount: number
  // Entreprises et banques
  profits: number
  firmDebt: number
  bankCapital: number
  creditCrunch: number
  firms: Record<Size, FirmSize>
  // Dette : tension sur les marchés
  /** Indice de tension sur la dette : à partir de 1, les marchés paniquent (crise de la dette). */
  marketStress: number
  /** Une crise de la dette a éclaté cette année. */
  debtCrisis: boolean
  /** Années restantes du plan d'aide européen (0 = pas de plan en cours). */
  rescueYears: number
  /** Effort imposé par les plans d'aide, cumulé (part du PIB). */
  rescueEffort: number
  // Société
  /** Recettes publiques en part du PIB. */
  taxBurden: number
  /** Part des impôts qui échappe au fisc (fraude, travail au noir). */
  evasion: number
  /** Mécontentement social : à 1, le pays se soulève. */
  discontent: number
  /** Ce qui rend la situation intenable cette année (la partie est perdue), ou null. */
  ending: Ending | null
  // Carte
  flows: Flow[]
  /** Somme des soldes de tous les acteurs : nulle si les comptes bouclent. */
  closure: number
  /** Ce qui s'est passé cette année et pourquoi, en phrases. */
  notes: string[]
}
