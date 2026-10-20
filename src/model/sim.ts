import { BASE, BASE_POLICY, FIRM_PARAMS as FS, GROUP_PARAMS as GP, P } from './calibration'
import { distribution } from './distribution'
import { EVENTS } from './events'
import { withParams, type Overrides } from './params'
import { WORLD_PATH } from './world'
import {
  GROUPS,
  HOLDERS,
  SIZES,
  type ByGroup,
  type BySize,
  type Decision,
  type Ending,
  type FiredEvent,
  type Flow,
  type Holder,
  type Policy,
  type World,
  type YearState,
} from './types'

const basePublicGoods = () => REF.health + REF.prevention + REF.education + REF.defence + REF.investment + REF.otherServices
/** Taux d'activité des 20–59 ans, calé pour retrouver 31,1 millions d'actifs en 2025. */
const coreParticipation = () => {
  const seniors = BASE.retirementEntrants * (BASE.retirementAgeEffective - 60)
  return (BASE.workingAge * BASE.participation - seniors * P.seniorParticipation) / (BASE.workingAge - seniors)
}
const sum = (g: ByGroup) => GROUPS.reduce((acc, k) => acc + g[k], 0)
const byGroup = (f: (g: keyof ByGroup) => number): ByGroup => ({ g1: f('g1'), g2: f('g2'), g3: f('g3'), g4: f('g4'), g5: f('g5') })
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const bySize = (f: (c: keyof BySize) => number): BySize => ({ pme: f('pme'), eti: f('eti'), ge: f('ge') })
const fr = (v: number, digits: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: digits })
const sumSize = (r: BySize) => r.pme + r.eti + r.ge
/** Une sensibilité par taille, ramenée à 1 en moyenne (pondérée par `weights`) : l'effet total reste celui du modèle agrégé. */
const relative = (x: Readonly<BySize>, weights: Readonly<BySize>) => {
  const avg = sumSize(bySize((c) => x[c] * weights[c])) / sumSize(weights)
  return bySize((c) => x[c] / avg)
}
/** Part des aides aux entreprises qui va à chaque taille : `smeShare` aux PME, le reste aux ETI et aux grands groupes comme aujourd'hui. */
const aidShares = (smeShare: number): BySize => {
  const rest = FS.firmAidShare.eti + FS.firmAidShare.ge
  return { pme: smeShare, eti: ((1 - smeShare) * FS.firmAidShare.eti) / rest, ge: ((1 - smeShare) * FS.firmAidShare.ge) / rest }
}

/** Ce que le monde fait sans nous (modele/monde.csv) : l'histoire jusqu'en 2024, la crise d'Ormuz de 2026, puis la tendance de long terme. */
export function baseWorld(year: number): World {
  const known = WORLD_PATH[year]
  return known ? { ...known } : { growth: BASE.worldGrowth, oil: BASE.oilLongRun, ecbRate: BASE.ecbLongRun, panic: 0, demandShock: 0, qe: 0, climateAmbition: 0, heatShock: 0, unrest: 0, productivity: 0, migrants: 0 }
}

/**
 * Un point de départ : la politique en vigueur l'année de départ, et les données de cette année-là
 * (par défaut 2025 ; pour rejouer le passé, 2000).
 */
export type Scenario = { reference: Policy; params: Overrides }

/** La politique de référence de la simulation en cours (celle de l'année de départ). */
let REF: Policy = BASE_POLICY

/** Ce qu'on garde d'une année à l'autre (les stocks et la mémoire). */
type Carry = {
  year: number
  priceLevel: number
  worldPrice: number
  worldIndex: number
  productivity: number
  avgWage: number
  avgPension: number
  smic: number
  smicBoost: number
  vat: number
  tariffs: number
  tariffChinaEV: number
  inflation: number
  unemployment: number
  gap: number
  gdpReal: number
  gdp: number
  energyPrice: number
  fossilShare: number
  workingAge: number
  retirees: number
  young: number
  lifeExpectancy: number
  retirementAge: number
  debtRatio: number
  deficitRatio: number
  holders: Record<Holder, number>
  effectiveRate: number
  panic: number
  shun: number
  stigma: number
  firmDebt: number
  householdDebt: number
  deposits: number
  bankCapital: number
  wealth: ByGroup
  educationStock: number
  preventionStock: number
  healthStock: number
  capitalFlight: number
  consumption: ByGroup
  /** Prix du pétrole et de l'énergie fossile au détail, l'an dernier. */
  fossilPrice: number
  // Modèle économique
  publicOwnership: number
  /** Les règles en vigueur sur le terrain (elles s'appliquent progressivement). */
  regulation: number
  // Climat
  worldBaseEmissions: number
  cumulativeCO2: number
  temperature: number
  adaptStock: number
  climateDamage: number
  frenchEmissions: number
  fossilEmissions: number
  /** Le taux de la BCE que les marchés attendent en moyenne pour les années à venir. */
  ecbExpected: number
  /** Tension sur la dette, lissée sur les années. */
  marketStress: number
  /** Années avant qu'une nouvelle crise de la dette puisse éclater. */
  crisisCooldown: number
  /** Années restantes du plan d'aide européen. */
  rescueYears: number
  /** Économies imposées par les plans d'aide, cumulées (part du PIB). */
  rescueEffort: number
  /** Recettes publiques en part du PIB, l'an dernier et en 2025. */
  taxBurden: number
  taxBurden0: number
  poverty0: number
  medianIncome: number
  discontent: number
  /** Écart entre le solde public et celui qui stabiliserait la dette (part du PIB). */
  stabilityGap: number
  /** Économies demandées chaque année par le plan d'aide en cours (part du PIB). */
  rescueStep: number
}

function initialCarry(): Carry {
  return {
    year: BASE.year,
    priceLevel: 1,
    worldPrice: 1,
    worldIndex: 1,
    productivity: BASE.gdp / (BASE.workingAge * BASE.participation * (1 - BASE.unemployment)),
    avgWage: BASE.grossWages / (BASE.workingAge * BASE.participation * (1 - BASE.unemployment)),
    avgPension: BASE.avgPension,
    smic: BASE.smic,
    smicBoost: 0,
    vat: REF.vat,
    tariffs: REF.tariffs,
    tariffChinaEV: REF.tariffChinaEV,
    inflation: BASE.inflationAnchor,
    unemployment: BASE.unemployment,
    gap: 0,
    gdpReal: BASE.gdp,
    gdp: BASE.gdp,
    energyPrice: 1,
    fossilShare: BASE.fossilShare,
    workingAge: BASE.workingAge,
    retirees: BASE.retirees,
    young: BASE.population - BASE.workingAge - BASE.retirees,
    lifeExpectancy: BASE.lifeExpectancy,
    retirementAge: BASE.retirementAgeEffective,
    debtRatio: BASE.debt / BASE.gdp,
    deficitRatio: BASE.deficitRatio,
    holders: Object.fromEntries(HOLDERS.map((h) => [h, BASE.debt * BASE.holders[h]])) as Record<Holder, number>,
    effectiveRate: BASE.effectiveRate,
    panic: 0,
    shun: 0,
    stigma: 0,
    firmDebt: BASE.firmDebt,
    householdDebt: BASE.householdDebt,
    deposits: BASE.deposits,
    bankCapital: BASE.bankCapital,
    wealth: byGroup((g) => BASE.householdFinancialWealth * GP.wealth[g]),
    educationStock: 0,
    preventionStock: 0,
    healthStock: 0,
    capitalFlight: 0,
    consumption: byGroup(() => 0),
    fossilPrice: 1,
    publicOwnership: BASE_POLICY.publicOwnership,
    regulation: BASE_POLICY.regulation,
    worldBaseEmissions: BASE.worldCO2,
    cumulativeCO2: 0,
    temperature: BASE.temperature,
    adaptStock: BASE_POLICY.adaptation / P.adaptationDecay,
    climateDamage: 0,
    frenchEmissions: BASE.fossilEmissions + BASE.electricityEmissions + BASE.otherEmissions,
    fossilEmissions: BASE.fossilEmissions,
    ecbExpected: 0,
    marketStress: 0,
    crisisCooldown: 0,
    rescueYears: 0,
    rescueEffort: 0,
    taxBurden: 0,
    taxBurden0: 0,
    poverty0: 0,
    medianIncome: 0,
    discontent: 0,
    stabilityGap: 0,
    rescueStep: 0,
  }
}

/** Le revenu disponible « normal » de 2025 par tranche, qui sert de repère aux comportements. */
/** Les repères de l'année de départ : revenus et consommation « normaux », taux d'impôt implicites (calés pour retrouver les recettes de cette année-là). */
type Anchors = { yd: ByGroup; c: ByGroup; ydTotal: number; irRate: ByGroup; isRatio: number }

/** Une année de la France. `init` = l'année de départ, calée sur les chiffres de 2025. */
function step(prev: Carry, policy: Policy, world: World, anchors: Anchors | null, cancel: { share: number; holder: Holder } | null): { state: YearState; carry: Carry; anchors: Anchors } {
  const year = prev.year + (anchors ? 1 : 0)
  const init = anchors === null
  const notes: string[] = []
  const holders = { ...prev.holders }
  let panic = prev.panic * P.panicMemory + world.panic
  let shun = prev.shun * P.shunMemory
  // Mémoire d'un défaut : les prêteurs se souviennent plusieurs années (écarts de taux élevés 3 à 5 ans).
  let stigma = prev.stigma * P.stigmaMemory
  let bankCapital = prev.bankCapital
  const wealth = { ...prev.wealth }

  // — 0. Annulation de dette, au début de l'année
  if (cancel && cancel.share > 0) {
    const amount = holders[cancel.holder] * cancel.share
    holders[cancel.holder] -= amount
    const bn = Math.round(amount)
    if (cancel.holder === 'bce') {
      panic += P.cancelBcePanic
      notes.push(`${bn} Md€ de dette détenue par la Banque de France sont effacés. L’État ne paie plus ces intérêts… mais la Banque de France ne lui reverse plus les bénéfices qu’elle en tirait : le gain est quasi nul, et la rupture des traités européens inquiète les prêteurs.`)
    } else if (cancel.holder === 'assureurs') {
      for (const g of GROUPS) {
        wealth[g] -= amount * GP.wealth[g]
      }
      panic += P.defaultPanic
      stigma += P.defaultStigma
      notes.push(`${bn} Md€ de dette détenue par les assureurs sont effacés : ce sont les contrats d’assurance-vie des Français qui perdent cette somme, surtout ceux des ménages aisés. C’est un défaut : les prêteurs exigent une forte prime de risque.`)
    } else if (cancel.holder === 'banques') {
      bankCapital -= amount
      panic += P.defaultPanic
      stigma += P.defaultStigma
      notes.push(`${bn} Md€ de dette détenue par les banques françaises sont effacés : leurs fonds propres fondent, elles prêtent moins aux entreprises et aux ménages. C’est un défaut : les prêteurs exigent une forte prime de risque.`)
    } else {
      panic += P.foreignDefaultPanic
      stigma += P.foreignDefaultStigma
      shun += P.foreignDefaultShun
      notes.push(`${bn} Md€ de dette détenue par les étrangers sont effacés. La France fait défaut : les investisseurs étrangers fuient, et il faut trouver en France l’argent qu’ils prêtaient.`)
    }
  }

  // — 0 ter. Nationalisations et privatisations : l'État rachète (en obligations) ou revend des grandes entreprises.
  const ownership = init ? REF.publicOwnership : policy.publicOwnership
  const ownershipStep = init ? 0 : ownership - prev.publicOwnership
  const deal = ownershipStep * BASE.largeFirmsValue * (prev.gdp / BASE.gdp)
  if (deal > 0) {
    // Les anciens actionnaires reçoivent des obligations d'État (indemnisation) ; la part non indemnisée est une perte sèche.
    holders.assureurs += deal * P.compensationRate
    for (const g of GROUPS) {
      wealth[g] -= deal * (1 - P.compensationRate) * GP.dividends[g]
    }
    panic += 2 * P.nationalisationFlight * ownershipStep
    notes.push(`L’État nationalise ${Math.round(ownershipStep * 100)} % des grandes entreprises : ${Math.round(deal * P.compensationRate)} Md€ d’obligations versées aux anciens actionnaires. Les dividendes reviendront à l’État, mais les investisseurs s’inquiètent.`)
  } else if (deal < 0) {
    const proceeds = -deal
    const fromInsurers = Math.min(proceeds, holders.assureurs)
    holders.assureurs -= fromInsurers
    holders.monde -= proceeds - fromInsurers
    notes.push(`L’État privatise ${Math.round(-ownershipStep * 100)} % des grandes entreprises : ${Math.round(proceeds)} Md€ de recettes pour rembourser la dette, mais l’État perd leurs dividendes.`)
  }
  // Les règles (licenciement, normes, concurrence) changent sur le terrain en quelques années.
  const regulation = init ? REF.regulation : prev.regulation + 0.3 * (policy.regulation - prev.regulation)
  const deregulation = REF.regulation - regulation
  const naturalUnemployment = BASE.naturalUnemployment - P.regulationNairu * deregulation

  // — 0 bis. Crise de la dette : quand la tension accumulée atteint 1, les prêteurs paniquent.
  let crisisCooldown = Math.max(0, prev.crisisCooldown - 1)
  const debtCrisis = !init && prev.marketStress >= 1 && crisisCooldown === 0
  if (debtCrisis) {
    panic += P.crisisPanic
    shun += P.crisisShun
    // Les obligations françaises perdent de leur valeur : banques et contrats d'assurance-vie encaissent la perte.
    bankCapital -= holders.banques * P.crisisBondLoss
    for (const g of GROUPS) {
      wealth[g] -= holders.assureurs * P.crisisBondLoss * GP.wealth[g]
    }
    crisisCooldown = P.crisisCooldown
    notes.push(
      `Crise de la dette : les prêteurs doutent que la France puisse stabiliser sa dette (${Math.round(prev.debtRatio * 100)} % du PIB). Ils exigent ${fr(P.crisisPanic, 1)} points de plus, les étrangers achètent moins de titres, les banques et l’assurance-vie perdent ${fr(P.crisisBondLoss * 100, 0)} % de la valeur de leurs obligations.`,
    )
  }
  // Le plan d'aide européen : le MES et la BCE prêtent à taux modéré, en échange d'économies imposées chaque année.
  let rescueYears = policy.crisisResponse === 1 ? 0 : Math.max(0, prev.rescueYears - 1)
  let rescueStep = prev.rescueStep
  // Le plan démarre l'année qui suit la crise : le temps de le négocier (et pour la France, de l'accepter ou non).
  const crisisLastYear = !init && prev.crisisCooldown === P.crisisCooldown && prev.rescueYears === 0
  if (crisisLastYear && policy.crisisResponse !== 1) {
    rescueYears = P.rescueYears
    // Le plan vise à combler, en quelques années, l'écart qui fait grossir la dette.
    rescueStep = clamp(prev.stabilityGap / P.rescueYears, P.rescueEffort, P.rescueEffortMax)
    notes.push(
      `La France accepte le plan d’aide européen : pendant ${fr(P.rescueYears, 0)} ans, le Mécanisme européen de stabilité lui prête et la BCE rachète sa dette, mais en échange d’économies imposées de ${fr(rescueStep * 100, 1)} point de PIB par an (moins de dépenses, plus d’impôts).`,
    )
  } else if (crisisLastYear) {
    notes.push('La France refuse l’aide européenne : elle garde la main sur son budget, mais doit emprunter au prix fort.')
  }
  const rescueEffort = prev.rescueEffort + (rescueYears > 0 ? rescueStep : 0)
  const demandShock = world.demandShock + (debtCrisis ? P.crisisDemandShock : 0)

  // — 1. Démographie et espérance de vie
  const yearsIn = year - BASE.year
  const healthRatio = (policy.health + policy.prevention) / (REF.health + REF.prevention)
  const healthStock = prev.healthStock + P.healthStockSpeed * (Math.log(healthRatio) - prev.healthStock)
  const preventionStock = prev.preventionStock + P.preventionStockSpeed * ((policy.prevention - REF.prevention) - prev.preventionStock)
  const lifeTrend = BASE.lifeExpectancy + P.lifeTrend * yearsIn
  // L'âge effectif rejoint la cible progressivement : +3 mois par an au plus (la réforme de 2023 reprend en 2028), −1 an par an au plus.
  const ageFloor = year < BASE.reformPauseUntil ? Math.min(prev.retirementAge, policy.retirementAge) : prev.retirementAge - 1
  const retirementAge = init ? BASE.retirementAgeEffective : clamp(policy.retirementAge, ageFloor, year < BASE.reformPauseUntil ? prev.retirementAge : prev.retirementAge + P.retirementPhaseIn)
  const ageChange = retirementAge - prev.retirementAge
  // Les générations du baby-boom finissent de partir vers 2040 ; ensuite, les générations qui arrivent à la retraite sont un peu moins nombreuses.
  const cohort = Math.max(
    P.retirementCohortLongRun,
    BASE.retirementEntrants * (1 + P.retirementCohortGrowth * Math.min(yearsIn, P.babyBoomYears)) - P.retirementCohortDecline * Math.max(0, yearsIn - P.babyBoomYears),
  )
  const entrants = Math.max(0.1, cohort - cohort * ageChange)
  const migrants = (policy.netMigration + world.migrants) / 1000
  const births = BASE.births
  // Les jeunes qui arrivent à 20 ans reflètent les naissances d'il y a 20 ans : leur nombre baisse, puis rejoint celui des naissances d'aujourd'hui.
  const youthIn = Math.max(births + P.migrantYoungShare * migrants - P.youngOutflow, BASE.youthEntrants - P.youthDecline * yearsIn)
  const workingAge = init ? prev.workingAge : prev.workingAge + youthIn - entrants + P.migrantWorkingShare * migrants - P.workingAgeOutflow
  // L'espérance de vie dépend de la santé, de la prévention et de la pauvreté de l'année précédente (calculée plus bas).
  let lifeExpectancy = init ? BASE.lifeExpectancy : lifeTrend + P.healthLifeGain * healthStock + P.preventionLifeGain * clamp(preventionStock, -10, 30)
  // Durée moyenne passée à la retraite ≈ espérance de vie − âge de départ + 3,5 ans (on vit plus longtemps une fois arrivé à 60 ans).
  const deaths = prev.retirees / Math.max(8, prev.lifeExpectancy - prev.retirementAge + P.retirementExtraYears)
  const retirees = init ? prev.retirees : prev.retirees + entrants - deaths
  const young = init ? prev.young : prev.young + births - youthIn + P.migrantYoungShare * migrants - P.youngOutflow
  const population = workingAge + retirees + young
  // Les seniors restent plus longtemps en activité : le taux d'activité progresse lentement.
  // Les 60 ans et plus encore en âge de travailler sont moins souvent actifs (≈ 45 %) que les autres (≈ 85 %) :
  // reculer ou avancer l'âge de départ ne déplace donc pas des cohortes entières de travailleurs.
  const seniors = cohort * Math.max(0, retirementAge - 60)
  const laborForce = (workingAge - seniors) * Math.min(P.participationMax, coreParticipation() + P.participationTrend * yearsIn) + seniors * P.seniorParticipation

  // — 1 bis. Climat : le monde émet, la planète se réchauffe, la France encaisse (et s'adapte)
  // La France pèse environ 0,8 % du CO2 mondial : son effet direct est faible, mais son exemple et son aide comptent un peu.
  const startEmissions = BASE.fossilEmissions + BASE.electricityEmissions + BASE.otherEmissions
  const worldBaseEmissions = init ? BASE.worldCO2 : prev.worldBaseEmissions * (1 + P.worldEmissionsTrend + world.climateAmbition)
  const frenchCut = Math.max(0, 1 - prev.frenchEmissions / startEmissions)
  const aidAvoided = Math.max(0, policy.climateAid - REF.climateAid) / P.climateAidCost
  const tipping = prev.temperature > P.tippingTemperature ? P.tippingEmissions : 0
  const worldEmissions = Math.max(0, worldBaseEmissions * (1 - P.franceInfluence * frenchCut) - aidAvoided + tipping)
  const cumulativeCO2 = init ? 0 : prev.cumulativeCO2 + worldEmissions
  const temperature = BASE.temperature + (P.tcre * cumulativeCO2) / 1000
  // Les dégâts se comptent par rapport au climat de l'année de départ (déjà inclus dans les chiffres de cette année-là).
  const warming = temperature - BASE.temperature + world.heatShock
  const adaptStock = init ? prev.adaptStock : prev.adaptStock * (1 - P.adaptationDecay) + policy.adaptation
  const adaptationCoverage = (P.adaptationMax * adaptStock) / (adaptStock + P.adaptationHalf)
  const exposure = 1 - adaptationCoverage
  const climateDamage = init ? 0 : (P.damageLinear * warming + P.damageQuadratic * warming * Math.max(0, warming)) * exposure
  const damageStep = climateDamage - prev.climateDamage

  // — 2. Énergie, prix et salaires
  // Des droits de douane élevés sur les voitures électriques chinoises ralentissent un peu l'électrification (véhicules plus chers).
  // Une taxe carbone plus forte rend la pompe à chaleur et la voiture électrique plus rentables.
  const carbonExtra = policy.carbonTax - REF.carbonTax
  const electrifyPace = policy.electrification * (1 - P.evTariffSlowdown * Math.max(0, policy.tariffChinaEV - REF.tariffChinaEV)) + (P.carbonElectrify * Math.max(0, carbonExtra)) / 100
  const fossilShare = init ? prev.fossilShare : prev.fossilShare * (1 - electrifyPace)
  const electricityPrice = 1 + P.nuclearElectricityPrice * (REF.nuclearShare - policy.nuclearShare) + P.electrificationElectricityPrice * (BASE.fossilShare - fossilShare) + P.oilElectricityPrice * (world.oil / BASE.oil - 1)
  // Le prix payé pour le carburant et le gaz ne suit qu'une partie du baril : taxes fixes par litre, transport, distribution.
  const fossilPrice = 1 + P.oilRetailPass * (world.oil / BASE.oil - 1) + P.carbonRetailPass * carbonExtra
  const energyPrice = (fossilShare * fossilPrice + (1 - fossilShare) * electricityPrice) / (BASE.fossilShare + (1 - BASE.fossilShare))
  const energyInflation = init ? 0 : energyPrice / prev.energyPrice - 1
  const productivityGrowth = init
    ? 0
    : BASE.productivityGrowth +
      P.educationProductivity * clamp(prev.educationStock, -1, 1) +
      P.investmentProductivity * (policy.investment - REF.investment) -
      P.flightProductivity * prev.capitalFlight +
      P.regulationProductivity * deregulation -
      P.ownershipEfficiency * ownershipStep +
      world.productivity -
      // Les dégâts climatiques détruisent une part de la capacité de production.
      damageStep
  const productivity = prev.productivity * (1 + productivityGrowth)
  const smicStep = policy.smicBoost - prev.smicBoost
  const wageGrowth = init
    ? 0
    : P.wageInertia * prev.inflation + (1 - P.wageInertia) * BASE.inflationAnchor + productivityGrowth + P.wageUnemployment * (naturalUnemployment - prev.unemployment) + P.smicWageSpillover * smicStep
  const tariffStep = (policy.tariffs - prev.tariffs) * P.tariffPriceShare + (policy.tariffChinaEV - prev.tariffChinaEV) * P.evTariffPrice
  const inflation = init
    ? BASE.inflationAnchor
    : clamp(
        P.priceWagePass * (wageGrowth - productivityGrowth) +
          (1 - P.priceWagePass) * BASE.inflationAnchor +
          P.energyInflationPass * energyInflation +
          P.tariffInflation * tariffStep +
          (P.vatPassThrough * (policy.vat - prev.vat)) / (1 + prev.vat) +
          P.gapInflation * prev.gap +
          P.monetizationInflation * policy.monetization +
          P.panicInflation * prev.panic +
          P.climateInflation * Math.max(0, damageStep),
        -0.03,
        0.4,
      )
  const priceLevel = init ? 1 : prev.priceLevel * (1 + inflation)
  const avgWage = init ? prev.avgWage : prev.avgWage * (1 + wageGrowth)
  const smic = init ? prev.smic : prev.smic * (1 + Math.max(0, inflation)) * (1 + smicStep)
  // Un choc pétrolier touche aussi nos partenaires : leurs prix montent comme les nôtres (seul notre électricité nucléaire fait la différence).
  const fossilShock = init ? 0 : fossilPrice / prev.fossilPrice - 1
  const worldPrice = init ? 1 : prev.worldPrice * (1 + BASE.worldInflation + P.energyInflationPass * BASE.fossilShare * fossilShock)
  const worldIndex = init ? 1 : prev.worldIndex * (1 + world.growth - P.exportShareLoss)

  // — 3. Taux d'intérêt : le prix de la confiance
  const debtPct = prev.debtRatio * 100
  const riskPremium = Math.max(0, P.premiumBase + P.premiumPerDebtPoint * Math.max(0, debtPct - P.debtThreshold) + P.premiumPerDeficitPoint * Math.max(0, prev.deficitRatio * 100 - P.deficitThreshold) + panic + stigma - P.monetizationCredibility * policy.monetization + P.monetizationFear * policy.monetization * policy.monetization) / 100
  const premium = rescueYears > 0 ? Math.min(riskPremium, P.rescueSpread / 100) : riskPremium
  // Le taux à 10 ans reflète les taux de la BCE attendus pour les années à venir : il ne suit qu'en partie un changement soudain.
  const ecbExpected = init ? world.ecbRate : prev.ecbExpected + P.rateExpectationSpeed * (world.ecbRate - prev.ecbExpected)
  // Quand la BCE rachète massivement de la dette, les taux longs baissent.
  const rate = ecbExpected + (BASE.termPremium - P.qeTermPremium * world.qe) / 100 + premium + P.inflationRatePass * Math.max(0, prev.inflation - P.inflationRateThreshold)
  const effectiveRate = init ? prev.effectiveRate : prev.effectiveRate + (rate - prev.effectiveRate) / P.debtRollover
  const loanRate = world.ecbRate + BASE.firmLoanSpread + P.firmPremiumPass * premium
  const baseRate = P.neutralLoanRate
  const creditCrunch = clamp((P.bankCapitalMin - bankCapital / (prev.firmDebt + prev.householdDebt)) * P.creditCrunchSensitivity, 0, P.creditCrunchMax)

  // — 4. Demande, revenus et emploi : on cherche le PIB qui boucle
  const trend = priceLevel * (productivity / initialCarry().productivity)
  const popIndex = population / BASE.population
  /**
   * La taille « normale » de l'économie suit le nombre d'actifs, pas la population : quand le pays vieillit,
   * il produit moins, et la demande habituelle (consommation, logement, services publics) doit suivre,
   * sinon l'économie manquerait de bras et s'emballerait (chômage nul, inflation).
   */
  const scale = laborForce / (BASE.workingAge * BASE.participation)
  /** Une dépense publique fixée en Md€ de 2025 suit la croissance de l'économie et des prix : à politique inchangée, son poids dans le PIB reste stable. */
  const g = (bn: number) => bn * trend * scale
  const plannedPublicGoods = g(policy.health + policy.prevention + policy.education + policy.defence + policy.investment + policy.otherServices)
  // Les économies imposées par un plan d'aide : une part en dépenses publiques en moins, une part en impôts en plus.
  const rescueBase = rescueEffort * BASE.gdp * trend * scale
  // Adaptation au-delà de l'effort de départ, et reconstruction après les catastrophes : des travaux publics en plus.
  const climateSpending = g(policy.adaptation - REF.adaptation) + P.reconstructionShare * climateDamage * BASE.gdp * trend * scale
  const publicGoods = Math.max(0, plannedPublicGoods + climateSpending - (1 - P.rescueTaxShare) * rescueBase)
  const publicFactor = plannedPublicGoods > 0 ? publicGoods / plannedPublicGoods : 1
  const rescueTax = P.rescueTaxShare * rescueBase
  // La taxe carbone en plus (ou en moins) de celle de 2025, sur les émissions fossiles de l'an dernier.
  const carbonRevenue = init ? 0 : ((carbonExtra * prev.fossilEmissions) / 1000) * priceLevel
  // L'aide climat aux pays du Sud, au-delà de celle de départ (versée au reste du monde, comme la contribution à l'UE).
  const climateAidOut = g(policy.climateAid - REF.climateAid)
  const foodTransfer = (policy.foodSecurity * 12 * population) / 1000 * priceLevel
  const minimaBoost = g(policy.minima)
  const vatRatio = BASE.vatRevenue / BASE.consumption / REF.vat
  const wealthTaxBase = (w: number) => w * P.wealthTaxBase * Math.exp(-P.wealthTaxAvoidance * policy.wealthTax)
  // Quand les prélèvements dépassent de beaucoup ceux de 2025, la fraude et le travail au noir progressent.
  const evasion = init ? 0 : clamp(P.taxEvasion * Math.max(0, prev.taxBurden - prev.taxBurden0), 0, P.taxEvasionMax)
  const declared = 1 - evasion
  const capitalFlight = clamp(
    prev.capitalFlight * P.flightMemory +
      P.nationalisationFlight * Math.max(0, ownershipStep) +
      P.flightIncomeTax * Math.max(0, policy.incomeTaxTop - 0.05) +
      P.flightWealthTax * Math.max(0, policy.wealthTax - P.wealthTaxThreshold) +
      P.flightInheritance * Math.max(0, policy.inheritanceTax - P.inheritanceThreshold) +
      P.flightCorporate * Math.max(0, policy.corporateTax - P.corporateThreshold),
    0,
    P.flightMax,
  )

  const bankRel = relative(FS.bankDependence, FS.investment)
  const mobilityRel = relative(FS.mobility, FS.investment)

  let gdp = init ? BASE.gdp : prev.gdp * (1 + inflation + productivityGrowth)
  // La TVA dépend de la consommation, qui dépend des revenus : on reprend la consommation du tour précédent.
  let lastConsumption = prev.consumption.g1 ? sum(prev.consumption) * (1 + inflation) : BASE.consumption
  let detail = null as ReturnType<typeof flows> | null
  for (let i = 0; i < 60; i += 1) {
    const d = flows(gdp)
    const next = d.demand
    detail = d
    lastConsumption = d.totalConsumption
    if (Math.abs(next - gdp) < 0.005) {
      break
    }
    gdp = 0.5 * gdp + 0.5 * next
  }

  function flows(nominal: number) {
    const real = nominal / priceLevel
    const potential = laborForce * (1 - naturalUnemployment) * productivity
    // Un SMIC plus cher pousse les entreprises à économiser du travail peu qualifié (élasticité modeste).
    const employment = Math.min(laborForce * P.maxEmployment, real / (productivity * (1 + P.smicJobLoss * policy.smicBoost)))
    const unemployment = clamp(1 - employment / laborForce, 0.015, 0.45)
    const grossWages = avgWage * employment
    const employerContrib = grossWages * BASE.employerContribRate
    const mixed = BASE.mixedIncome * trend * scale
    const otherProd = g(policy.productionTaxes) * (productivity / initialCarry().productivity)
    const firmAid = g(policy.firmAid)
    const vatRevenue = vatRatio * policy.vat * lastConsumption * declared
    const gos = nominal - vatRevenue - otherProd - grossWages - employerContrib - mixed + firmAid
    // Les entreprises mobiles (surtout les grands groupes) déclarent une partie de leurs bénéfices ailleurs quand les capitaux fuient.
    const shifting = P.profitShifting * capitalFlight * sumSize(bySize((c) => FS.valueAdded[c] * mobilityRel[c]))
    // Le taux effectif de l'impôt sur les sociétés est calé sur les recettes de l'année de départ.
    const isRatio = anchors ? anchors.isRatio : BASE.corporateTaxRevenue / Math.max(1, REF.corporateTax * gos)
    const corporateTax = Math.max(0, policy.corporateTax * isRatio * gos * (1 - shifting) * declared)
    const firmInterest = prev.firmDebt * loanRate
    const foreignIncome = BASE.foreignIncome * worldIndex * worldPrice
    // Les entreprises distribuent plus quand elles sont peu endettées, moins quand elles le sont trop : leur dette reste proportionnée à l'économie.
    const payout = clamp(BASE.dividendPayout - P.payoutLeverage * (prev.firmDebt / prev.gdp - BASE.firmDebt / BASE.gdp), 0.1, 0.9)
    const dividends = Math.max(0, payout * (gos - corporateTax - firmInterest))
    // Les dividendes des entreprises nationalisées (au-delà de celles de 2025) reviennent à l'État.
    const publicDividends = dividends * (ownership - REF.publicOwnership)
    const dividendsAbroad = (dividends - publicDividends) * BASE.dividendsAbroad
    const dividendsHome = dividends - publicDividends - dividendsAbroad
    const nonTax = BASE.nonTaxRevenue * trend
    const retained = gos - corporateTax - firmInterest + foreignIncome - dividends - nonTax

    // Banques
    const mortgageInterest = prev.householdDebt * (rate + P.mortgageSpread)
    const depositInterest = prev.deposits * world.ecbRate * P.depositRateShare
    const interestBy = Object.fromEntries(HOLDERS.map((h) => [h, holders[h] * effectiveRate])) as Record<Holder, number>
    const bankProfit = firmInterest + mortgageInterest + interestBy.banques - depositInterest
    // Les banques distribuent la moitié de leurs bénéfices, plus quand leur coussin de fonds propres est épais, moins quand il est mince.
    const capitalTarget = (BASE.bankCapital / (BASE.firmDebt + BASE.householdDebt)) * (prev.firmDebt + prev.householdDebt) * (1 + inflation)
    const bankDividends = clamp(P.bankPayout * bankProfit - P.bankCapitalAdjust * (capitalTarget - bankCapital), 0, Math.max(0, bankProfit))

    // Sécurité sociale et transferts
    const unemployed = laborForce - employment
    const pensions = retirees * prev.avgPension * (1 + inflation * policy.pensionIndexation)
    const unemploymentBenefits = (BASE.unemploymentBenefits / (BASE.workingAge * BASE.participation * BASE.unemployment)) * unemployed * (policy.unemploymentReplacement / REF.unemploymentReplacement) * (avgWage / initialCarry().avgWage)
    const family = BASE.familyBenefits * trend * popIndex
    const minima = BASE.minima * trend + minimaBoost
    const otherTransfers = BASE.otherTransfers * trend

    // Ménages, tranche par tranche
    // Moins de règles : les salaires du bas décrochent ; plus de règles : ils sont mieux protégés.
    const wageShare = byGroup((k) => GP.wages[k] * (1 + GP.smicGain[k] * (policy.smicBoost - P.regulationWages * deregulation)))
    const wageNorm = sum(wageShare)
    const income = byGroup((k) => {
      const wages = (grossWages * wageShare[k]) / wageNorm
      const capital = (dividendsHome + bankDividends) * GP.dividends[k] + (interestBy.assureurs + depositInterest) * GP.wealth[k]
      const transfers =
        pensions * GP.pensions[k] + unemploymentBenefits * GP.unemployment[k] + family * GP.family[k] + minima * GP.minima[k] + otherTransfers * GP.population[k] + foodTransfer * GP.population[k]
      return wages + mixed * GP.mixed[k] + capital + transfers
    })
    const wagesOf = (k: keyof ByGroup) => (grossWages * wageShare[k]) / wageNorm
    const employeeContrib = byGroup((k) => wagesOf(k) * BASE.employeeContribRate)
    const csgBase = byGroup((k) => wagesOf(k) + mixed * GP.mixed[k] + pensions * GP.pensions[k] * BASE.csgPensionShare)
    const csgRatio = BASE.csgRevenue / (BASE.grossWages + BASE.mixedIncome + BASE.pensions * BASE.csgPensionShare) / REF.csg
    const csg = byGroup((k) => csgBase[k] * policy.csg * csgRatio * declared)
    const taxable = byGroup((k) => wagesOf(k) + mixed * GP.mixed[k] + pensions * GP.pensions[k] + (dividendsHome + bankDividends) * GP.dividends[k])
    // Le taux moyen d'impôt sur le revenu de chaque tranche est calé pour retrouver la recette et sa répartition de l'année de départ.
    const irRate = anchors ? anchors.irRate : byGroup((k) => (BASE.incomeTaxRevenue * GP.incomeTax[k]) / Math.max(1, taxable[k]))
    const incomeTax = byGroup((k) => taxable[k] * (irRate[k] + policy.incomeTaxTop * GP.topRate[k]) * declared)
    const wealthTax = policy.wealthTax * wealthTaxBase(wealth.g5) + (BASE.ifiRevenue * trend)
    const inheritance = BASE.inheritanceFlows * trend
    const inheritanceTax = inheritance * policy.inheritanceTax * (1 - P.inheritanceErosion * Math.max(0, policy.inheritanceTax - P.inheritanceErosionThreshold))
    const otherHouseholdTaxes = BASE.otherHouseholdTaxes * trend
    // Les autres impôts (carburants, taxe foncière, droits de mutation…) suivent la consommation, et pèsent selon les revenus.
    const otherTaxes = (BASE.otherTaxes / BASE.consumption) * lastConsumption * declared
    const foodContribution = foodTransfer
    const disposable = byGroup((k) => {
      const share = GP.population[k]
      const taxes =
        employeeContrib[k] +
        csg[k] +
        incomeTax[k] +
        (k === 'g5' ? wealthTax : 0) +
        otherHouseholdTaxes * share +
        (foodContribution + rescueTax + otherTaxes + carbonRevenue * declared) * (csgBase[k] / sum(csgBase)) +
        mortgageInterest * GP.wages[k]
      return income[k] - taxes
    })
    // Les droits de succession sont prélevés sur le patrimoine transmis, pas sur le revenu.
    const inheritanceTaxBy = byGroup((k) => inheritanceTax * GP.inheritanceTax[k])

    // Consommation : la tendance, plus la réaction à un revenu au-dessus ou en dessous de la normale
    const anchorsNow = anchors ?? { yd: disposable }
    const normal = (k: keyof ByGroup) => anchorsNow.yd[k] * trend * scale
    const baseC = anchors ? anchors.c : byGroup(() => 0)
    const consumption = byGroup((k) => {
      if (!anchors) {
        // Répartition de la consommation de 2025 selon la propension à consommer de chaque tranche.
        const weight = GP.mpc[k] * P.consumptionSplitMpc + (1 - P.consumptionSplitMpc)
        const weights = sum(byGroup((j) => (GP.mpc[j] * P.consumptionSplitMpc + (1 - P.consumptionSplitMpc)) * disposable[j]))
        return (BASE.consumption * weight * disposable[k]) / weights
      }
      const food = foodTransfer * GP.population[k]
      const deviation = disposable[k] - normal(k) - food
      const wealthEffect = P.wealthEffect * (wealth[k] - BASE.householdFinancialWealth * GP.wealth[k] * trend)
      // Les ménages lissent : seule une partie de l'écart de revenu passe tout de suite en consommation.
      return Math.max(0, (baseC[k] * trend * scale + P.consumptionSmoothing * GP.mpc[k] * deviation + food + wealthEffect) * (1 - demandShock))
    })
    const totalConsumption = sum(consumption)

    // Investissement des entreprises et des ménages
    const growthSignal = init ? 0 : real / prev.gdpReal - 1 - (BASE.productivityGrowth + P.acceleratorTrend)
    // Chaque taille d'entreprise réagit à sa façon : les PME dépendent de leur banque, les grands groupes peuvent partir.
    const firmFactor = bySize((c) =>
      clamp(
        1 +
          P.accelerator * growthSignal -
          P.investmentRateSensitivity * bankRel[c] * (loanRate - baseRate) -
          P.investmentCorporateTax * (policy.corporateTax - REF.corporateTax) +
          P.savingsToFirmsEffect * bankRel[c] * policy.savingsToFirms +
          P.ownershipInvestment * (ownership - REF.publicOwnership) -
          capitalFlight * mobilityRel[c],
        P.investmentMin,
        P.investmentMax,
      ) *
      (1 - Math.min(0.9, creditCrunch * bankRel[c])) *
      // Après un défaut, les entreprises investissent moins : tout actif français paraît plus risqué.
      (1 - P.stigmaInvestment * stigma) *
      (1 - P.demandShockInvestment * demandShock),
    )
    // Une aide en plus (ou en moins) se transforme en partie en investissement : beaucoup pour une PME, peu pour un grand groupe.
    const aidNow = aidShares(policy.firmAidSmeShare)
    const aidRef = aidShares(REF.firmAidSmeShare)
    const aidInvestment = bySize((c) => FS.cashFlowInvestment[c] * (firmAid * aidNow[c] - g(REF.firmAid) * aidRef[c]))
    // Électrifier coûte : bornes, pompes à chaleur, réseaux, véhicules (≈ 15 Md€ par point de rythme en plus).
    const electrifyInvestment = P.electrificationInvestment * 100 * Math.max(0, policy.electrification - REF.electrification) * trend
    const investmentBy = bySize((c) => BASE.investment * trend * FS.investment[c] * firmFactor[c] + aidInvestment[c] + electrifyInvestment * FS.investment[c])
    const investment = sumSize(investmentBy)
    const housing = BASE.housing * trend * scale * clamp(1 - P.housingRateSensitivity * (rate - baseRate), P.housingMin, P.housingMax) * (1 - creditCrunch)

    // Commerce extérieur et énergie
    const competitiveness = Math.pow(priceLevel / worldPrice, -P.priceCompetitiveness)
    const retaliation = P.tariffRetaliation * policy.tariffs + P.evRetaliation * (policy.tariffChinaEV - REF.tariffChinaEV)
    const exports = BASE.exports * worldIndex * worldPrice * competitiveness * (1 - retaliation) * (1 - P.electricityExportLoss * (electricityPrice - 1))
    const absorption = totalConsumption + housing + investment + publicGoods + exports
    const importRatio = BASE.importsNonEnergy / (BASE.consumption + BASE.housing + BASE.investment + basePublicGoods() + BASE.exports)
    const overheating = 1 + P.overheatingImports * Math.max(0, real / potential - P.overheatingThreshold)
    const imports = importRatio * absorption * Math.pow(priceLevel / worldPrice, P.importPriceElasticity) * (1 - P.tariffImportCut * policy.tariffs) * overheating
    // On consomme un peu moins de pétrole quand il est cher (élasticité-prix ≈ −0,2).
    // Une taxe carbone plus forte fait consommer moins de pétrole et de gaz.
    const energyImports = (1 - (P.carbonDemandCut * carbonExtra) / 100) * BASE.energyImports * Math.pow(world.oil / BASE.oil, P.oilElasticity) * (fossilShare / BASE.fossilShare) * Math.pow(real / BASE.gdp, P.energyGdpElasticity) * worldPrice

    const demand = totalConsumption + housing + investment + publicGoods + exports - imports - energyImports

    // État et Sécurité sociale
    const interest = sumRecord(interestBy)
    const bceDividend = interestBy.bce
    const euContribution = BASE.euContribution * trend + climateAidOut
    const taxes = {
      tva: vatRevenue,
      productionTaxes: otherProd,
      employerContributions: employerContrib,
      employeeContributions: sum(employeeContrib),
      csg: sum(csg),
      incomeTax: sum(incomeTax),
      corporateTax,
      wealthTax,
      inheritanceTax,
      otherHouseholdTaxes,
      otherTaxes,
      carbonTax: carbonRevenue * declared,
      publicDividends,
      foodContribution,
      rescueTax,
      nonTax,
      bceDividend,
    }
    const transfers = { pensions, unemploymentBenefits, family, minima, otherTransfers, foodTransfer }
    const spending =
      publicGoods + pensions + unemploymentBenefits + family + minima + otherTransfers + foodTransfer + firmAid + euContribution + interest
    const revenue = sumRecord(taxes)
    return {
      real,
      potential,
      employment,
      unemployment,
      grossWages,
      employerContrib,
      mixed,
      gos,
      corporateTax,
      firmInterest,
      foreignIncome,
      dividends,
      dividendsAbroad,
      dividendsHome,
      retained,
      mortgageInterest,
      depositInterest,
      interestBy,
      bankProfit,
      bankDividends,
      income,
      disposable,
      consumption,
      totalConsumption,
      investment,
      housing,
      exports,
      imports,
      energyImports,
      demand,
      interest,
      euContribution,
      taxes,
      transfers,
      spending,
      revenue,
      firmAid,
      irRate,
      isRatio,
      aidNow,
      investmentBy,
      retaliation,
      inheritanceTaxBy,
      wealthTax,
      csgBase,
    }
  }

  const d = detail!
  // L'année de départ fixe les repères de comportement.
  const anchorsOut: Anchors = anchors ?? { yd: d.disposable, c: d.consumption, ydTotal: sum(d.disposable), irRate: d.irRate, isRatio: d.isRatio }
  const deficit = d.spending - d.revenue

  // — 5. Financement de la dette : qui prête à l'État cette année ?
  const debtBefore = sumRecord(holders)
  const shareAbroad = P.foreignBuyerShare * Math.exp(-P.foreignBuyerFlight * (panic + stigma + 2 * shun))
  // La BCE rachète une part de la dette nouvelle (planche à billets décidée par la France, ou rachats décidés à Francfort) ; sinon elle réduit peu à peu son stock.
  const bought = Math.min(1, policy.monetization + world.qe)
  const qt = init || world.qe > 0 ? 0 : holders.bce * P.qtPace
  const fromBce = bought * deficit - qt
  const fromAbroad = shareAbroad * (deficit - bought * deficit)
  const fromBanks = P.bankBuyerShare * deficit * (1 - creditCrunch)
  holders.bce += init ? 0 : fromBce
  holders.monde += init ? 0 : fromAbroad
  holders.banques += init ? 0 : fromBanks
  holders.assureurs += init ? 0 : deficit - fromBce - fromAbroad - fromBanks
  const debt = init ? debtBefore : sumRecord(holders)

  // — 6. Bilans de fin d'année
  for (const k of GROUPS) {
    const saving = d.disposable[k] - d.consumption[k] - d.housing * GP.wealth[k]
    wealth[k] = (wealth[k] + (init ? 0 : saving) - (init ? 0 : d.inheritanceTaxBy[k])) * (init ? 1 : 1 + inflation * P.assetInflationShare)
  }
  const firmDebt = init ? prev.firmDebt : prev.firmDebt + d.investment - d.retained
  bankCapital = init ? bankCapital : bankCapital + d.bankProfit - d.bankDividends
  const householdDebt = init ? prev.householdDebt : prev.householdDebt * (1 + inflation) + P.housingDebtShare * d.housing - P.mortgageRepayment * prev.householdDebt
  const deposits = init ? prev.deposits : prev.deposits * (1 + inflation)
  const currentAccount = d.exports + d.foreignIncome - d.imports - d.energyImports - d.dividendsAbroad - d.interestBy.monde - d.euContribution

  // — 7. Inégalités, pauvreté, espérance de vie
  // Prix vus par chaque tranche : la TVA et l'énergie pèsent plus lourd quand on dépense tout son revenu.
  const groupPrice = byGroup((k) => {
    const spendShare = d.consumption[k] / Math.max(1, d.disposable[k])
    return priceLevel * (1 + ((P.vatPassThrough * (policy.vat - REF.vat)) / 1.2) * (spendShare - 0.83) + P.energyGroupPrice * (energyPrice - 1) * GP.energyExposure[k])
  })
  const perCapita = byGroup((k) => (d.disposable[k] / (population * GP.population[k])) * (1000 / groupPrice[k]))
  const dist = distribution(perCapita, GP.population, GP.sigma)
  if (!init) {
    lifeExpectancy -= P.povertyLifeLoss * (dist.poverty - BASE.poverty) * 100
    // Canicules et maladies liées au réchauffement (moins si l'on s'est adapté) ; moins de pollution de l'air si l'on sort du pétrole et du gaz.
    lifeExpectancy += -P.climateLifeLoss * Math.max(0, warming) * exposure + (P.airPollutionLife * (BASE.fossilShare - fossilShare)) / BASE.fossilShare
  }
  const lifeGap = BASE.lifeGap * Math.pow(perCapita.g5 / perCapita.g1 / BASE.incomeRatioTopBottom, P.lifeGapElasticity)

  // — 8. Matrice des flux (chaque euro a un payeur et un receveur)
  const t = d.taxes
  const flowsList = ([
    { from: 'menages', to: 'entreprises', amount: d.totalConsumption + d.housing, label: 'Consommation et logement' },
    { from: 'entreprises', to: 'menages', amount: d.grossWages + d.mixed + d.dividendsHome, label: 'Salaires, revenus d’indépendants, dividendes' },
    { from: 'menages', to: 'etat', amount: t.incomeTax + t.wealthTax + t.inheritanceTax + t.otherHouseholdTaxes + t.otherTaxes + t.carbonTax + t.rescueTax, label: 'Impôts des ménages' },
    { from: 'menages', to: 'secu', amount: t.employeeContributions + t.csg + t.foodContribution, label: 'Cotisations salariales et CSG' },
    { from: 'entreprises', to: 'secu', amount: t.employerContributions, label: 'Cotisations patronales' },
    { from: 'entreprises', to: 'etat', amount: t.tva + t.productionTaxes + t.corporateTax + t.nonTax, label: 'TVA, impôts de production, impôt sur les sociétés' },
    { from: 'secu', to: 'menages', amount: d.transfers.pensions + d.transfers.unemploymentBenefits + d.transfers.family + d.transfers.foodTransfer, label: 'Retraites, chômage, allocations' },
    { from: 'etat', to: 'menages', amount: d.transfers.minima + d.transfers.otherTransfers, label: 'Minima sociaux, aides' },
    { from: 'etat', to: 'entreprises', amount: d.firmAid + (d.spending - d.interest - d.euContribution - d.firmAid - sumRecord(d.transfers)), label: 'Achats publics et aides aux entreprises' },
    { from: 'etat', to: 'banques', amount: d.interestBy.banques, label: 'Intérêts de la dette (banques)' },
    { from: 'etat', to: 'menages', amount: d.interestBy.assureurs, label: 'Intérêts de la dette (assurance-vie)' },
    { from: 'etat', to: 'monde', amount: d.interestBy.monde + d.euContribution, label: 'Intérêts aux étrangers, contribution UE' },
    { from: 'etat', to: 'bce', amount: d.interestBy.bce, label: 'Intérêts à la Banque de France' },
    { from: 'bce', to: 'etat', amount: t.bceDividend, label: 'Bénéfices reversés par la Banque de France' },
    { from: 'entreprises', to: 'banques', amount: d.firmInterest, label: 'Intérêts des crédits aux entreprises' },
    { from: 'menages', to: 'banques', amount: d.mortgageInterest, label: 'Intérêts des crédits immobiliers' },
    { from: 'banques', to: 'menages', amount: d.depositInterest + d.bankDividends, label: 'Intérêts des dépôts, dividendes' },
    { from: 'entreprises', to: 'monde', amount: d.imports + d.dividendsAbroad, label: 'Importations, dividendes versés à l’étranger' },
    { from: 'monde', to: 'entreprises', amount: d.exports + d.foreignIncome, label: 'Exportations, revenus de l’étranger' },
    { from: 'entreprises', to: 'energie', amount: d.energyImports, label: 'Achats de pétrole et de gaz' },
    { from: 'energie', to: 'monde', amount: d.energyImports, label: 'Pétrole et gaz importés' },
  ] as Flow[]).filter((f) => f.amount > 0.5)

  // Bouclage : la somme des soldes de tous les acteurs doit être nulle.
  const households = sum(d.disposable) - d.totalConsumption - d.housing - d.taxes.inheritanceTax
  const firms = d.retained - d.investment
  const banks = d.bankProfit - d.bankDividends
  const government = d.revenue - d.spending
  const world_ = d.imports + d.energyImports + d.dividendsAbroad + d.interestBy.monde + d.euContribution - d.exports - d.foreignIncome
  const closure = households + firms + banks + government + world_

  const gdpReal = d.real
  const growth = init ? BASE.initialGrowth : gdpReal / prev.gdpReal - 1

  // — 9. Tension sur la dette : de combien le solde public est-il loin de ce qui stabiliserait la dette ?
  // Il faudrait un excédent primaire (hors intérêts) de (taux − croissance) × dette ; tout écart fait grossir la dette.
  const nominalGrowth = init ? BASE.inflationAnchor + BASE.productivityGrowth : gdp / prev.gdp - 1
  const primaryBalance = -(deficit - d.interest) / gdp
  const stabilizing = ((effectiveRate - nominalGrowth) / (1 + nominalGrowth)) * (debt / gdp)
  const stabilityGap = stabilizing - primaryBalance
  const rawStress = Math.max(0, debt / gdp - P.crisisDebtThreshold) / P.crisisDebtRange + Math.max(0, stabilityGap) / P.crisisGapRange
  // Quand la BCE rachète massivement de la dette, elle sert de filet : les marchés s'affolent beaucoup moins.
  const shielded = rawStress * (1 - P.qeStressRelief * world.qe)
  const marketStress = init ? shielded : P.crisisSmoothing * shielded + (1 - P.crisisSmoothing) * prev.marketStress

  // — 9 bis. La société : prélèvements, colère, et ce qui rendrait la situation intenable
  const taxBurden = d.revenue / gdp
  const taxBurden0 = init ? taxBurden : prev.taxBurden0
  const poverty0 = init ? dist.poverty : prev.poverty0
  const medianDrop = init ? 0 : Math.max(0, 1 - dist.median / prev.medianIncome)
  const anger =
    medianDrop / P.unrestIncomeDrop +
    Math.max(0, taxBurden - taxBurden0) / P.unrestTaxRange +
    Math.max(0, d.unemployment - P.unrestUnemployment) / P.unrestUnemploymentRange +
    Math.max(0, inflation - P.unrestInflation) / P.unrestInflationRange +
    Math.max(0, dist.poverty - poverty0) / P.unrestPovertyRange +
    // L'austérité imposée nourrit la colère tant que le plan d'aide dure.
    (rescueYears > 0 ? rescueStep * (P.rescueYears - rescueYears + 1) : 0) / P.unrestAusterityRange +
    // Catastrophes à répétition, pénuries d'eau : le réchauffement nourrit la colère, sauf si le pays s'est adapté.
    (Math.max(0, warming) * exposure) / P.unrestClimateRange +
    world.unrest +
    // Précarité quand on allège fortement les règles.
    P.regulationAnger * Math.max(0, deregulation)
  const discontent = init ? 0 : P.unrestMemory * prev.discontent + (1 - P.unrestMemory) * anger
  const ending: Ending | null = init
    ? null
    : climateDamage >= P.collapseDamage
      ? 'effondrement'
      : discontent >= 1
      ? 'revolte'
      : rescueYears === 0 && (premium >= P.bankruptcyPremium || d.interest / d.revenue >= P.bankruptcyInterestShare)
        ? 'faillite'
        : inflation >= P.hyperinflation
          ? 'hyperinflation'
          : d.unemployment >= P.depressionUnemployment
            ? 'depression'
            : null

  // — 9 ter. Les émissions françaises : pétrole et gaz (moins avec l'électrification et la taxe carbone), électricité, agriculture et déchets.
  const fossilEmissions =
    BASE.fossilEmissions * (fossilShare / BASE.fossilShare) * Math.pow(d.real / BASE.gdp, P.energyEmissionsGdp) * Math.max(0, 1 - (P.carbonDemandCut * carbonExtra) / 100)
  const electricityEmissions = BASE.electricityEmissions * Math.max(0.2, 1 + P.gasForNuclear * (REF.nuclearShare - policy.nuclearShare)) * (1 + (BASE.fossilShare - fossilShare))
  const frenchEmissions = (fossilEmissions + electricityEmissions + BASE.otherEmissions * Math.pow(1 - P.otherEmissionsDecline, yearsIn)) * (1 + P.regulationEmissions * deregulation)

  // — 10. Les entreprises par taille : qui investit, qui exporte, qui emploie
  const lowWageRel = relative(FS.lowWageExposure, FS.employment)
  const tariffRel = relative(FS.tariffExposure, FS.exports)
  const energyRel = relative(FS.energyIntensity, FS.exports)
  const normalize = (w: BySize, total: number) => bySize((c) => (w[c] / sumSize(w)) * total)
  const jobsBy = normalize(bySize((c) => FS.employment[c] * (1 - P.smicJobLoss * policy.smicBoost * lowWageRel[c])), d.employment)
  const exportsBy = normalize(
    bySize((c) => FS.exports[c] * (1 - d.retaliation * tariffRel[c]) * (1 - P.electricityExportLoss * (electricityPrice - 1) * energyRel[c])),
    d.exports,
  )
  const taxBy = normalize(bySize((c) => FS.corporateTaxShare[c] * (1 - P.profitShifting * capitalFlight * mobilityRel[c])), d.corporateTax)
  const firmsBySize = Object.fromEntries(
    SIZES.map((c) => [
      c,
      { employment: jobsBy[c], investment: d.investmentBy[c], exports: exportsBy[c], profits: (d.gos - d.firmAid) * FS.valueAdded[c] + d.firmAid * d.aidNow[c], corporateTax: taxBy[c] },
    ]),
  ) as YearState['firms']
  const state: YearState = {
    year,
    gdp,
    gdpReal,
    growth,
    inflation,
    priceLevel,
    unemployment: d.unemployment,
    employment: d.employment,
    laborForce,
    productivity,
    avgWage,
    smic,
    consumption: d.totalConsumption,
    investment: d.investment,
    housing: d.housing,
    publicSpendingGoods: publicGoods,
    exports: d.exports,
    imports: d.imports,
    energyImports: d.energyImports,
    revenue: d.revenue,
    spending: d.spending,
    deficit,
    debt,
    debtRatio: debt / gdp,
    holders: { ...holders },
    rate,
    effectiveRate,
    interest: d.interest,
    riskPremium,
    budget: {
      Retraites: d.transfers.pensions,
      Santé: g(policy.health + policy.prevention) * publicFactor,
      Éducation: g(policy.education) * publicFactor,
      Défense: g(policy.defence) * publicFactor,
      'Investissement public': g(policy.investment) * publicFactor,
      'Autres services publics': g(policy.otherServices) * publicFactor,
      'Chômage, famille, minima': d.transfers.unemploymentBenefits + d.transfers.family + d.transfers.minima + d.transfers.otherTransfers,
      'Sécurité sociale de l’alimentation': d.transfers.foodTransfer,
      'Aides aux entreprises': d.firmAid,
      'Charge de la dette': d.interest,
      'Contribution à l’UE': d.euContribution - climateAidOut,
      'Aide climat aux pays du Sud (en plus)': climateAidOut,
    },
    taxes: {
      TVA: t.tva,
      'Cotisations sociales': t.employerContributions + t.employeeContributions,
      CSG: t.csg,
      'Impôt sur le revenu': t.incomeTax,
      'Impôt sur les sociétés': t.corporateTax,
      'Impôts de production': t.productionTaxes,
      'Patrimoine et succession': t.wealthTax + t.inheritanceTax,
      'Autres impôts (carburants, foncier…)': t.otherTaxes + t.otherHouseholdTaxes,
      'Cotisation alimentation': t.foodContribution,
      'Plan d’aide : impôts en plus': t.rescueTax,
      'Taxe carbone (en plus de 2025)': t.carbonTax,
      'Autres recettes': t.nonTax + t.bceDividend,
      'Dividendes des entreprises publiques (en plus)': t.publicDividends,
    },
    secu: {
      Retraite: { revenue: (t.employerContributions + t.employeeContributions) * 0.55 + t.csg * 0.1, spending: d.transfers.pensions },
      Maladie: { revenue: (t.employerContributions + t.employeeContributions) * 0.33 + t.csg * 0.6 + t.tva * 0.25, spending: g(policy.health + policy.prevention) * publicFactor },
      Famille: { revenue: (t.employerContributions + t.employeeContributions) * 0.07 + t.csg * 0.1, spending: d.transfers.family },
      Chômage: { revenue: (t.employerContributions + t.employeeContributions) * 0.05 + t.csg * 0.05, spending: d.transfers.unemploymentBenefits },
      ...(t.foodContribution > 0 ? { Alimentation: { revenue: t.foodContribution, spending: d.transfers.foodTransfer } } : {}),
    },
    disposable: d.disposable,
    disposablePerCapita: perCapita,
    wealth: { ...wealth },
    consumptionByGroup: d.consumption,
    poverty: dist.poverty,
    gini: dist.gini,
    ratioD9D1: dist.ratioD9D1,
    medianIncome: dist.median,
    population,
    workingAge,
    retirees,
    lifeExpectancy,
    lifeGap,
    oil: world.oil,
    fossilShare,
    electricityPrice,
    energyPrice,
    currentAccount,
    profits: d.gos,
    firmDebt,
    bankCapital,
    creditCrunch,
    firms: firmsBySize,
    marketStress,
    debtCrisis,
    rescueYears,
    rescueEffort,
    taxBurden,
    evasion,
    discontent,
    ending,
    temperature,
    worldEmissions,
    frenchEmissions,
    climateDamage,
    adaptationCoverage,
    cumulativeCO2,
    flows: flowsList,
    closure,
    notes,
  }

  const carry: Carry = {
    year,
    priceLevel,
    worldPrice,
    worldIndex,
    productivity,
    avgWage,
    avgPension: prev.avgPension * (1 + inflation * policy.pensionIndexation + (init ? 0 : P.pensionRealGain)),
    smic,
    smicBoost: policy.smicBoost,
    vat: policy.vat,
    tariffs: policy.tariffs,
    tariffChinaEV: policy.tariffChinaEV,
    inflation,
    unemployment: d.unemployment,
    gap: d.real / d.potential - 1,
    gdpReal,
    gdp,
    energyPrice,
    fossilShare,
    workingAge,
    retirees,
    young,
    lifeExpectancy,
    retirementAge,
    debtRatio: debt / gdp,
    deficitRatio: deficit / gdp,
    holders,
    effectiveRate,
    panic,
    shun,
    stigma,
    firmDebt,
    householdDebt,
    deposits,
    bankCapital,
    wealth,
    educationStock: prev.educationStock + P.educationStockSpeed * ((policy.education - REF.education) / REF.education - prev.educationStock),
    preventionStock,
    healthStock,
    capitalFlight,
    consumption: d.consumption,
    fossilPrice,
    publicOwnership: ownership,
    regulation,
    worldBaseEmissions,
    cumulativeCO2,
    temperature,
    adaptStock,
    climateDamage,
    frenchEmissions,
    fossilEmissions,
    ecbExpected,
    marketStress,
    crisisCooldown,
    rescueYears,
    rescueEffort,
    taxBurden,
    taxBurden0,
    poverty0,
    medianIncome: dist.median,
    discontent,
    stabilityGap,
    rescueStep,
  }
  return { state, carry, anchors: anchorsOut }
}

function sumRecord(r: Record<string, number>): number {
  return Object.values(r).reduce((acc, v) => acc + v, 0)
}

export type SimulationInput = {
  decisions: Decision[]
  events: FiredEvent[]
  until: number
  /** D'autres valeurs pour certains paramètres du modèle (essai d'une variante). */
  params?: Overrides
  /** Un autre point de départ (par défaut, la France de 2025). */
  scenario?: Scenario
}

/** La politique en vigueur une année donnée : la politique de 2025, puis les décisions dans l'ordre. */
export function policyAt(decisions: Decision[], year: number, reference: Policy = BASE_POLICY): Policy {
  let policy = { ...reference }
  for (const d of [...decisions].sort((a, b) => a.year - b.year)) {
    if (d.year <= year) {
      const { cancelShare: _ignored, ...rest } = d.patch
      policy = { ...policy, ...rest }
    }
  }
  return policy
}

/** Le monde une année donnée : le monde de base, plus les événements déclenchés. */
export function worldAt(events: FiredEvent[], year: number): World {
  const world = baseWorld(year)
  for (const fired of events) {
    const def = EVENTS.find((e) => e.id === fired.id)
    const effect = def?.effects[year - fired.year]
    if (!def || !effect) {
      continue
    }
    world.oil += effect.oil ?? 0
    world.growth += effect.growth ?? 0
    world.ecbRate += effect.ecbRate ?? 0
    world.panic += effect.panic ?? 0
    world.demandShock += effect.demandShock ?? 0
    world.qe += effect.qe ?? 0
    world.climateAmbition += effect.climateAmbition ?? 0
    world.heatShock += effect.heatShock ?? 0
    world.unrest += effect.unrest ?? 0
    world.productivity += effect.productivity ?? 0
    world.migrants += effect.migrants ?? 0
  }
  return world
}

/** Simule la France de 2025 jusqu'à `until`, en appliquant les décisions et les événements. */
export function simulate({ decisions, events, until, params, scenario }: SimulationInput): YearState[] {
  return withParams({ ...scenario?.params, ...params }, () => {
    REF = scenario?.reference ?? BASE_POLICY
    try {
      return run(decisions, events, until)
    } finally {
      REF = BASE_POLICY
    }
  })
}

function run(decisions: Decision[], events: FiredEvent[], until: number): YearState[] {
  const states: YearState[] = []
  let carry = initialCarry()
  let anchors: Anchors | null = null
  for (let year = BASE.year; year <= until; year += 1) {
    const policy = policyAt(decisions, year, REF)
    const cancelDecision = decisions.find((d) => d.year === year && (d.patch.cancelShare ?? 0) > 0)
    const cancel = cancelDecision ? { share: cancelDecision.patch.cancelShare ?? 0, holder: cancelDecision.patch.cancelHolder ?? policy.cancelHolder } : null
    const result = step(carry, policy, worldAt(events, year), anchors, year === BASE.year ? null : cancel)
    states.push(result.state)
    carry = result.carry
    anchors = result.anchors
  }
  return states
}
