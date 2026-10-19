import type { ByGroup, Holder, Policy } from './types'

/**
 * La France de 2025, en ordres de grandeur (Md€ courants, millions de personnes).
 * Sources principales : INSEE (comptes nationaux base 2020), Banque de France, AFT, DREES, COR.
 * Chaque valeur est un point de départ ; le simulateur raisonne ensuite en dynamique.
 */
export const BASE = {
  year: 2025,
  gdp: 2990,
  // Demande
  consumption: 1531,
  housing: 160,
  investment: 473,
  exports: 1009,
  importsNonEnergy: 978,
  energyImports: 46,
  // Partage de la valeur ajoutée
  productionTaxesOther: 190,
  vatRevenue: 209,
  grossWages: 1180,
  employerContribRate: 0.24,
  mixedIncome: 330,
  // Entreprises
  corporateTaxRevenue: 70,
  firmDebt: 2100,
  firmLoanSpread: 0.012,
  dividendPayout: 0.42,
  dividendsAbroad: 0.25,
  foreignIncome: 160,
  // Banques
  bankCapital: 420,
  householdDebt: 1400,
  deposits: 2000,
  // Ménages : transferts (Md€)
  pensions: 418,
  unemploymentBenefits: 49,
  familyBenefits: 60,
  minima: 65,
  otherTransfers: 100,
  employeeContribRate: 0.137,
  incomeTaxRevenue: 104,
  csgRevenue: 166,
  otherHouseholdTaxes: 40,
  ifiRevenue: 2.7,
  inheritanceFlows: 300,
  inheritanceTaxRevenue: 21,
  householdFinancialWealth: 6300,
  // État : dépenses de biens et services (Md€ 2025)
  nonTaxRevenue: 115,
  euContribution: 25,
  // Dette
  debt: 3460,
  holders: { monde: 0.56, bce: 0.2, assureurs: 0.135, banques: 0.105 } as Record<Holder, number>,
  effectiveRate: 0.019,
  ecbRate: 0.02,
  termPremium: 0.6,
  // Population
  population: 69.1,
  workingAge: 37.5,
  participation: 0.83,
  retirees: 17.0,
  retirementEntrants: 0.84,
  youthEntrants: 0.8,
  lifeExpectancy: 83.2,
  lifeGap: 13,
  avgPension: 24.6,
  // Énergie
  oil: 70,
  fossilShare: 0.6,
  electricityPrice: 1,
  energyWeightCPI: 0.09,
  // Prix et salaires
  inflationAnchor: 0.02,
  productivityGrowth: 0.008,
  naturalUnemployment: 0.07,
  smic: 1823,
}

/** La politique de 2025 : le point de départ de toute partie. */
export const BASE_POLICY: Policy = {
  vat: 0.2,
  incomeTaxTop: 0,
  csg: 0.092,
  corporateTax: 0.25,
  wealthTax: 0,
  inheritanceTax: 0.067,
  productionTaxes: 190,
  health: 230,
  prevention: 6,
  education: 160,
  defence: 60,
  investment: 130,
  otherServices: 260,
  firmAid: 75,
  retirementAge: 64,
  pensionIndexation: 1,
  unemploymentReplacement: 0.57,
  minima: 0,
  foodSecurity: 0,
  smicBoost: 0,
  electrification: 0.01,
  nuclearShare: 0.68,
  tariffs: 0,
  tariffChinaEV: 0.35,
  netMigration: 176,
  monetization: 0,
  savingsToFirms: 0,
  cancelShare: 0,
  cancelHolder: 'bce',
}

/**
 * Les ménages en cinq tranches de niveau de vie. Parts de chaque revenu reçu ou impôt payé,
 * propension à consommer un euro de plus, dispersion à l'intérieur de la tranche.
 */
export const GROUP_PARAMS: Record<string, ByGroup> = {
  population: { g1: 0.2, g2: 0.2, g3: 0.2, g4: 0.3, g5: 0.1 },
  wages: { g1: 0.041, g2: 0.108, g3: 0.167, g4: 0.405, g5: 0.279 },
  mixed: { g1: 0.065, g2: 0.109, g3: 0.14, g4: 0.331, g5: 0.355 },
  dividends: { g1: 0.03, g2: 0.051, g3: 0.076, g4: 0.261, g5: 0.582 },
  wealth: { g1: 0.005, g2: 0.02, g3: 0.06, g4: 0.315, g5: 0.6 },
  pensions: { g1: 0.084, g2: 0.177, g3: 0.208, g4: 0.364, g5: 0.167 },
  unemployment: { g1: 0.3, g2: 0.24, g3: 0.18, g4: 0.2, g5: 0.08 },
  family: { g1: 0.276, g2: 0.208, g3: 0.17, g4: 0.241, g5: 0.105 },
  minima: { g1: 0.68, g2: 0.23, g3: 0.06, g4: 0.03, g5: 0 },
  incomeTax: { g1: 0, g2: 0.005, g3: 0.037, g4: 0.29, g5: 0.668 },
  /** Part supplémentaire de chaque euro qui part en consommation. */
  mpc: { g1: 0.97, g2: 0.9, g3: 0.82, g4: 0.72, g5: 0.45 },
  /** Dispersion des revenus à l'intérieur de la tranche (écart-type du logarithme). */
  sigma: { g1: 0.62, g2: 0.1, g3: 0.1, g4: 0.2, g5: 0.6 },
  /** Espérance de vie : écart à la moyenne (ans). */
  lifeOffset: { g1: -4.5, g2: -1.5, g3: 0, g4: 1.5, g5: 3.5 },
}
