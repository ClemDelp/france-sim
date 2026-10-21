import { groupView, sizeView, view } from './params'
import { type ByGroup, type BySize, type Holder, type Policy } from './types'

/**
 * La France de 2025, en ordres de grandeur (Md€ courants, millions de personnes).
 * Les valeurs et leurs sources sont dans modele/donnees-2025.csv : on peut les vérifier et les corriger dans un tableur.
 */
const DATA = view([
  'gdp', 'consumption', 'housing', 'investment', 'exports', 'importsNonEnergy', 'energyImports', 'vatRevenue', 'grossWages', 'employerContribRate',
  'mixedIncome', 'corporateTaxRevenue', 'firmDebt', 'firmLoanSpread', 'dividendPayout', 'dividendsAbroad', 'foreignIncome',
  'bankCapital', 'householdDebt', 'deposits', 'pensions', 'unemploymentBenefits', 'familyBenefits', 'minima', 'otherTransfers',
  'employeeContribRate', 'incomeTaxRevenue', 'csgRevenue', 'csgPensionShare', 'otherHouseholdTaxes', 'ifiRevenue',
  'inheritanceFlows', 'householdFinancialWealth', 'nonTaxRevenue', 'euContribution', 'debt', 'holderMonde', 'holderBce', 'holderAssureurs',
  'holderBanques', 'effectiveRate', 'termPremium', 'deficitRatio', 'population', 'workingAge', 'participation', 'unemployment', 'retirees',
  'retirementEntrants', 'youthEntrants', 'births', 'retirementAgeEffective', 'lifeExpectancy', 'lifeGap', 'avgPension', 'poverty',
  'incomeRatioTopBottom', 'oil', 'fossilShare', 'inflationAnchor', 'productivityGrowth', 'naturalUnemployment', 'smic', 'worldGrowth',
  'worldInflation', 'oilLongRun', 'ecbLongRun', 'startYear', 'otherTaxes', 'initialGrowth', 'reformPauseUntil', 'temperature', 'worldCO2', 'fossilEmissions', 'electricityEmissions', 'otherEmissions', 'emissionsTarget2030', 'largeFirmsValue',
] as const)

export const BASE_YEAR = 2025

/** Les données de 2025, plus la répartition de la dette entre ses détenteurs. */
export const BASE = Object.create(DATA, {
  year: { get: () => DATA.startYear, enumerable: true },
  holders: {
    get: (): Record<Holder, number> => ({ monde: DATA.holderMonde, bce: DATA.holderBce, assureurs: DATA.holderAssureurs, banques: DATA.holderBanques }),
    enumerable: true,
  },
}) as typeof DATA & { year: number; holders: Readonly<Record<Holder, number>> }

/**
 * Les comportements : comment chacun réagit (élasticités, délais, seuils).
 * Valeurs, explications, fiabilité et sources dans modele/comportements.csv.
 */
export const P = view([
  'panicMemory', 'shunMemory', 'stigmaMemory', 'cancelBcePanic', 'defaultPanic', 'defaultStigma', 'foreignDefaultPanic', 'foreignDefaultStigma',
  'foreignDefaultShun', 'foreignBuyerShare', 'foreignBuyerFlight', 'qtPace', 'bankBuyerShare', 'premiumBase', 'premiumPerDebtPoint', 'debtThreshold',
  'premiumPerDeficitPoint', 'deficitThreshold', 'monetizationCredibility', 'monetizationFear', 'inflationRatePass', 'inflationRateThreshold',
  'debtRollover', 'firmPremiumPass', 'neutralLoanRate', 'bankCapitalMin', 'creditCrunchSensitivity', 'creditCrunchMax', 'mortgageSpread',
  'depositRateShare', 'bankPayout', 'bankCapitalAdjust', 'payoutLeverage', 'lifeTrend', 'healthStockSpeed', 'preventionStockSpeed', 'healthLifeGain', 'preventionLifeGain',
  'povertyLifeLoss', 'lifeGapElasticity', 'retirementPhaseIn', 'retirementCohortGrowth', 'babyBoomYears', 'retirementCohortDecline', 'retirementCohortLongRun', 'youthDecline', 'migrantWorkingShare', 'migrantYoungShare',
  'workingAgeOutflow', 'youngOutflow', 'retirementExtraYears', 'seniorParticipation', 'participationTrend', 'participationMax', 'evTariffSlowdown',
  'nuclearElectricityPrice', 'electrificationElectricityPrice', 'oilElectricityPrice', 'electrificationInvestment', 'electricityExportLoss',
  'oilElasticity', 'energyGdpElasticity', 'energyInflationPass', 'energyGroupPrice', 'hireWageRatio', 'educationProductivity', 'investmentProductivity',
  'flightProductivity', 'educationStockSpeed', 'wageInertia', 'wageUnemployment', 'smicWageSpillover', 'priceWagePass', 'tariffPriceShare',
  'evTariffPrice', 'tariffInflation', 'vatPassThrough', 'gapInflation', 'monetizationInflation', 'panicInflation', 'pensionRealGain',
  'assetInflationShare', 'wealthTaxBase', 'wealthTaxAvoidance', 'flightMemory', 'flightWealthTax', 'wealthTaxThreshold', 'flightInheritance',
  'inheritanceThreshold', 'flightCorporate', 'corporateThreshold', 'flightMax', 'inheritanceErosion', 'inheritanceErosionThreshold',
  'smicJobLoss', 'maxEmployment', 'consumptionSmoothing', 'wealthEffect', 'consumptionSplitMpc', 'accelerator',
  'acceleratorTrend', 'investmentRateSensitivity', 'investmentCorporateTax', 'savingsToFirmsEffect', 'investmentMin', 'investmentMax',
  'stigmaInvestment', 'demandShockInvestment', 'housingRateSensitivity', 'housingMin', 'housingMax', 'housingDebtShare', 'mortgageRepayment',
  'priceCompetitiveness', 'importPriceElasticity', 'exportShareLoss', 'tariffRetaliation', 'evRetaliation', 'tariffImportCut', 'overheatingImports', 'overheatingThreshold', 'qeTermPremium', 'rateExpectationSpeed', 'qeStressRelief', 'oilRetailPass', 'profitShifting', 'crisisDebtThreshold', 'crisisDebtRange', 'crisisGapRange', 'crisisSmoothing', 'crisisPanic', 'crisisShun', 'crisisBondLoss', 'crisisDemandShock', 'crisisCooldown', 'rescueYears', 'rescueSpread', 'rescueEffort', 'rescueTaxShare', 'rescueEffortMax', 'tcre', 'worldEmissionsTrend', 'franceInfluence', 'climateAidCost', 'tippingTemperature', 'tippingEmissions', 'damageLinear', 'damageQuadratic', 'climateInflation', 'reconstructionShare', 'climateLifeLoss', 'airPollutionLife', 'unrestClimateRange', 'collapseDamage', 'adaptationMax', 'adaptationHalf', 'adaptationDecay', 'carbonRetailPass', 'carbonDemandCut', 'carbonElectrify', 'energyEmissionsGdp', 'otherEmissionsDecline', 'gasForNuclear', 'compensationRate', 'ownershipEfficiency', 'ownershipInvestment', 'nationalisationFlight', 'regulationNairu', 'regulationProductivity', 'regulationWages', 'regulationAnger', 'regulationEmissions', 'asylumPressure', 'climateMigration', 'conflictMigration', 'conflictDecay', 'climateConflict', 'controlMax', 'controlHalf', 'receptionCost', 'aidMax', 'aidHalf', 'aidDecay', 'integrationMax', 'integrationHalf', 'migrantNairu', 'migrationAnger', 'influenceSpeed', 'influenceMilitary', 'influenceEconomy', 'influenceCulture', 'influenceAid', 'influenceClimate', 'influenceStability', 'influenceDiplomacy', 'influenceTrade', 'influenceExports', 'influencePremium', 'influencePeace', 'influencePride', 'taxEvasion', 'taxEvasionMax', 'flightIncomeTax', 'unrestMemory', 'unrestIncomeDrop', 'unrestTaxRange', 'unrestUnemployment', 'unrestUnemploymentRange', 'unrestInflation', 'unrestInflationRange', 'unrestPovertyRange', 'unrestAusterityRange', 'bankruptcyPremium', 'bankruptcyInterestShare', 'hyperinflation', 'depressionUnemployment',
] as const)

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
  firmAidSmeShare: 0.45,
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
  netMigration: 120,
  borderControl: 2,
  integration: 1.5,
  developmentAid: 15,
  softPower: 6,
  monetization: 0,
  savingsToFirms: 0,
  crisisResponse: 0,
  publicOwnership: 0.1,
  regulation: 0.6,
  carbonTax: 44.6,
  adaptation: 3,
  climateAid: 6,
  cancelShare: 0,
  cancelHolder: 'bce',
}

/**
 * Les ménages en cinq tranches de niveau de vie : parts de chaque revenu reçu ou impôt payé,
 * propension à consommer, dispersion à l'intérieur de la tranche (modele/tranches.csv).
 */
const GROUP_KEYS = [
  'population', 'wages', 'mixed', 'dividends', 'wealth', 'pensions', 'unemployment', 'family', 'minima', 'incomeTax', 'mpc', 'sigma', 'lifeOffset',
  'smicGain', 'energyExposure', 'inheritanceTax', 'topRate',
] as const

export const GROUP_PARAMS = Object.fromEntries(GROUP_KEYS.map((k) => [k, groupView(k)])) as Record<(typeof GROUP_KEYS)[number], Readonly<ByGroup>>

/**
 * Les entreprises par taille : poids dans l'économie et sensibilités relatives (1 = moyenne), dans modele/entreprises.csv.
 */
const SIZE_KEYS = [
  'valueAdded', 'employment', 'exports', 'investment', 'corporateTaxShare', 'firmAidShare', 'bankDependence', 'mobility', 'lowWageExposure',
  'energyIntensity', 'tariffExposure', 'cashFlowInvestment',
] as const

export const FIRM_PARAMS = Object.fromEntries(SIZE_KEYS.map((k) => [k, sizeView(k)])) as Record<(typeof SIZE_KEYS)[number], Readonly<BySize>>
