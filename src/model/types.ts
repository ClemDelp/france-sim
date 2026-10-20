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
  // Immigration
  /** Contrôle des frontières, reconduites (Md€ par an ; ≈ 2 en 2025). */
  borderControl: number
  /** Intégration : langue, formation, logement (Md€ par an ; ≈ 1,5 en 2025). */
  integration: number
  /** Aide au développement et à la paix (Md€ par an ; ≈ 15 en 2025). */
  developmentAid: number
  // Modèle économique
  /** Part des grandes entreprises contrôlées par l'État (≈ 10 % en 2025 : EDF, SNCF, La Poste…). */
  publicOwnership: number
  /** Intensité des règles : marché du travail, normes, concurrence (0 = ultra-libéral, 1 = très encadré ; 0,6 en 2025). */
  regulation: number
  // Climat
  /** Taxe carbone sur le pétrole et le gaz (€ par tonne de CO2 ; 44,6 € en 2025). */
  carbonTax: number
  /** Dépenses d'adaptation au réchauffement (Md€ par an). */
  adaptation: number
  /** Aide climat aux pays du Sud (Md€ par an). */
  climateAid: number
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
  /** Changement de rythme des émissions mondiales cette année (− = le monde agit, + = il renonce). */
  climateAmbition: number
  /** Canicule ou catastrophe exceptionnelle (en degrés de réchauffement équivalents, cette année seulement). */
  heatShock: number
  /** Colère ajoutée par un événement (grève, scandale ; négatif pour une liesse). */
  unrest: number
  /** Gains de productivité en plus (révolution technologique). */
  productivity: number
  /** Arrivées en plus (milliers de personnes, réfugiés). */
  migrants: number
  /** Conflits en plus dans le voisinage de l'Europe (1 = une grande guerre). */
  conflict: number
}

/** Une décision prise une année donnée (le joueur bouge des leviers puis avance). */
export type Decision = { year: number; patch: Partial<Policy> }

/** Un événement mondial, déclenché à la main ou par le hasard. */
export type EventCategory = 'climat' | 'economie' | 'monde' | 'societe' | 'technologie'

export type EventDef = {
  id: string
  label: string
  icon: string
  summary: string
  category: EventCategory
  /** Effet sur le monde, année par année depuis le déclenchement. */
  effects: Partial<World>[]
  /** Probabilité que l'événement survienne une année donnée, selon l'état du pays et du monde l'année d'avant. */
  chance: (s: YearState, start: YearState) => number
  /** Années minimum entre deux occurrences. */
  cooldown: number
}

export type FiredEvent = { year: number; id: string }

/** Un flux d'argent entre deux acteurs, pour la matrice et la carte des flux. */
export type Flow = { from: Actor; to: Actor; amount: number; label: string }

export type Actor = 'menages' | 'entreprises' | 'etat' | 'secu' | 'banques' | 'bce' | 'monde' | 'energie'

/** Les façons de perdre la partie. */
export type Ending = 'revolte' | 'faillite' | 'hyperinflation' | 'depression' | 'effondrement'

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
  // Immigration
  /** Arrivées par les voies légales (milliers). */
  migrationLegal: number
  /** Arrivées hors voies légales qui restent (milliers). */
  migrationIrregular: number
  /** Pression migratoire avant contrôle (milliers), et ses causes. */
  migrationPressure: { base: number; climate: number; conflict: number }
  /** Intensité des conflits dans le voisinage de l'Europe (1 = une grande guerre). */
  conflict: number
  /** Part des arrivées irrégulières empêchées par le contrôle. */
  controlEffect: number
  /** Part des difficultés d'accueil évitée par l'intégration. */
  integrationCoverage: number
  /** Part des conflits et départs évitée par l'aide au développement. */
  peaceEffect: number
  // Climat
  /** Réchauffement mondial par rapport à l'ère préindustrielle (°C). */
  temperature: number
  /** Émissions mondiales de CO2 (Gt par an). */
  worldEmissions: number
  /** Émissions françaises (Mt CO2e par an). */
  frenchEmissions: number
  /** Dégâts climatiques en France, en part du PIB (après adaptation). */
  climateDamage: number
  /** Part des dégâts évitée par l'adaptation. */
  adaptationCoverage: number
  /** CO2 émis dans le monde depuis le début de la partie (Gt). */
  cumulativeCO2: number
  // Carte
  flows: Flow[]
  /** Somme des soldes de tous les acteurs : nulle si les comptes bouclent. */
  closure: number
  /** Ce qui s'est passé cette année et pourquoi, en phrases. */
  notes: string[]
}
