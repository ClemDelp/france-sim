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
  type PolicyKey,
  type World,
  type YearState,
} from './types'


/**
 * Les réformes qui fâchent au moment du vote, avant tout effet économique (la colère vient de l'annonce) :
 * le levier, le paramètre de colère par unité, et le sens impopulaire (+1 : monter fâche, −1 : baisser fâche).
 */
const VOTE_ANGER: { key: PolicyKey; perUnit: () => number; direction: 1 | -1 }[] = [
  { key: 'retirementAge', perUnit: () => P.retirementReformAnger, direction: 1 },
  { key: 'carbonTax', perUnit: () => P.carbonTaxAnger, direction: 1 },
  { key: 'pensionIndexation', perUnit: () => P.pensionFreezeAnger, direction: -1 },
  { key: 'regulation', perUnit: () => P.regulationReformAnger, direction: -1 },
  { key: 'publicOwnership', perUnit: () => P.privatisationAnger, direction: -1 },
]

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
  return known ? { ...known } : { growth: BASE.worldGrowth, oil: BASE.oilLongRun, ecbRate: BASE.ecbLongRun, panic: 0, demandShock: 0, qe: 0, climateAmbition: 0, heatShock: 0, unrest: 0, productivity: 0, migrants: 0, conflict: 0, bankLoss: 0, forced: 0, instability: 0, jobRetention: 0 }
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
  /** Pouvoir d'achat d'une pension déjà liquidée, par rapport à l'année de départ (1 = intact) : seule l'indexation le fait bouger. */
  pensionPower: number
  smic: number
  smicBoost: number
  vat: number
  tariffs: number
  tariffChinaEV: number
  inflation: number
  /** La part de l'inflation de l'an dernier due à un changement de TVA (un saut de prix ponctuel). */
  vatInflation: number
  /** Le niveau des prix dû aux changements de TVA depuis le départ (1 = aucun). */
  vatPrice: number
  unemployment: number
  gap: number
  /** Le taux d'emploi « proportionnel » de l'an dernier (si l'emploi suivait l'activité un pour un). */
  proportionalRate: number
  /** L'écart (en log) entre l'emploi réel et l'emploi proportionnel l'an dernier : les salariés gardés ou pas encore embauchés. */
  employmentGap: number
  gdpReal: number
  gdp: number
  energyPrice: number
  fossilShare: number
  /** La part du nucléaire réellement atteinte (on ne construit pas un réacteur en un an). */
  nuclearShare: number
  /** L'année où de nouveaux réacteurs ont été commandés (0 si aucun) : ils ne produisent qu'une douzaine d'années plus tard. */
  nuclearOrder: number
  /** La baisse de consommation d'énergies fossiles déjà obtenue par la taxe carbone (elle rejoint peu à peu son niveau de long terme). */
  carbonCut: number
  /** La part de l'écart de revenu déjà passée dans la consommation, par tranche (elle rejoint peu à peu la propension à consommer). */
  consumptionResponse: ByGroup
  workingAge: number
  retirees: number
  young: number
  lifeExpectancy: number
  retirementAge: number
  debtRatio: number
  deficitRatio: number
  /** Le déficit de l'année d'avant (part du PIB) : un dérapage soudain inquiète plus qu'un déficit installé. */
  deficitRatioBefore: number
  /** L'an dernier était une année de crise mondiale (récession ou choc de demande) : un déficit qui s'y creuse n'inquiète pas. */
  worldCrisis: boolean
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
  /** Influence de la France dans le monde (1 = 2025). */
  influence: number
  // Immigration
  conflict: number
  aidStock: number
  recentMigrants: number
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
  /** Niveau de vie des 20 % les plus modestes l'an dernier (euros de 2025 par personne). */
  lowIncome: number
  /** L'âge de départ visé par la loi l'an dernier : le relever (même pour plus tard) met le pays dans la rue dès le vote. */
  retirementTarget: number
  /** Les leviers votés l'an dernier : certaines réformes fâchent dès le vote, avant tout effet économique. */
  voted: Partial<Record<PolicyKey, number>>
  /** Prélèvements ressentis par la majorité (hors impôts sur les plus aisés et les grandes entreprises), l'an dernier et en 2025. */
  feltBurden: number
  feltBurden0: number
  /** Impôts sur les plus aisés (fortune, surtaxe sur les hauts revenus), en part du PIB, l'an dernier. */
  richTaxRatio: number
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
    pensionPower: 1,
    smic: BASE.smic,
    smicBoost: 0,
    vat: REF.vat,
    tariffs: REF.tariffs,
    tariffChinaEV: REF.tariffChinaEV,
    inflation: BASE.inflationAnchor,
    vatInflation: 0,
    vatPrice: 1,
    unemployment: BASE.unemployment,
    proportionalRate: 1 - BASE.unemployment,
    employmentGap: 0,
    gap: 0,
    gdpReal: BASE.gdp,
    gdp: BASE.gdp,
    energyPrice: 1,
    fossilShare: BASE.fossilShare,
    nuclearShare: REF.nuclearShare,
    nuclearOrder: 0,
    carbonCut: 0,
    consumptionResponse: byGroup(() => 0),
    workingAge: BASE.workingAge,
    retirees: BASE.retirees,
    young: BASE.population - BASE.workingAge - BASE.retirees,
    lifeExpectancy: BASE.lifeExpectancy,
    retirementAge: BASE.retirementAgeEffective,
    debtRatio: BASE.debt / BASE.gdp,
    deficitRatio: BASE.deficitRatio,
    deficitRatioBefore: BASE.deficitRatio,
    worldCrisis: false,
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
    influence: 1,
    conflict: 0,
    aidStock: BASE_POLICY.developmentAid / P.aidDecay,
    recentMigrants: (BASE_POLICY.netMigration + P.asylumPressure * (1 - (P.controlMax * BASE_POLICY.borderControl) / (BASE_POLICY.borderControl + P.controlHalf))) / 1000 / 0.2,
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
    lowIncome: 0,
    retirementTarget: 0,
    voted: {},
    feltBurden: 0,
    feltBurden0: 0,
    richTaxRatio: 0,
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
  // Une crise politique (censure, dissolution) inquiète aussi les prêteurs : la prime de risque monte, puis l'inquiétude s'estompe.
  let panic = prev.panic * P.panicMemory + world.panic + P.instabilityPremium * world.instability
  // Un déficit qui dérape soudain, en temps normal, fait paniquer les prêteurs (Royaume-Uni 2022, Italie 2018) ;
  // en pleine crise mondiale (2009, 2020), tous les déficits se creusent ensemble et les prêteurs le comprennent.
  if (!init && !prev.worldCrisis) {
    panic += P.deficitJumpPremium * Math.max(0, (prev.deficitRatio - prev.deficitRatioBefore) * 100 - P.deficitJumpThreshold)
  }
  let shun = prev.shun * P.shunMemory
  // Mémoire d'un défaut : les prêteurs se souviennent plusieurs années (écarts de taux élevés 3 à 5 ans).
  let stigma = prev.stigma * P.stigmaMemory
  let bankCapital = prev.bankCapital
  const wealth = { ...prev.wealth }

  // — 1. Annulation de dette, au début de l'année
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

  // — 2. Nationalisations et privatisations : l'État rachète (en obligations) ou revend des grandes entreprises.
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
  let naturalUnemployment = BASE.naturalUnemployment - P.regulationNairu * deregulation
  // Une assurance chômage plus généreuse allonge un peu la recherche d'emploi (et l'inverse).
  naturalUnemployment += P.replacementNairu * (policy.unemploymentReplacement - REF.unemploymentReplacement)

  // Un krach ou la faillite d'une grande banque ampute les fonds propres des banques : si leur coussin devient trop mince, elles prêtent moins.
  bankCapital -= bankCapital * world.bankLoss

  // — 3. Crise de la dette : quand la tension accumulée atteint 1, les prêteurs paniquent.
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
  // Pendant le plan, les économies s'additionnent ; ensuite, elles sont levées peu à peu (elles ne s'empilent pas d'un plan à l'autre pour toujours).
  const rescueEffort = rescueYears > 0 ? prev.rescueEffort + rescueStep : prev.rescueEffort * (1 - P.rescueUnwind)
  const demandShock = world.demandShock + (debtCrisis ? P.crisisDemandShock : 0)

  // — 4. Démographie et espérance de vie
  const yearsIn = year - BASE.year
  const healthRatio = (policy.health + policy.prevention) / (REF.health + REF.prevention)
  const healthStock = prev.healthStock + P.healthStockSpeed * (Math.log(healthRatio) - prev.healthStock)
  const preventionStock = prev.preventionStock + P.preventionStockSpeed * ((policy.prevention - REF.prevention) - prev.preventionStock)
  const lifeTrend = BASE.lifeExpectancy + P.lifeTrend * yearsIn
  // L'âge effectif rejoint la cible progressivement : +3 mois par an au plus (la réforme de 2023 reprend en 2028), −1 an par an au plus.
  // Baisser l'âge se fait aussi progressivement : un an par an au plus (sinon des millions de départs la même année).
  const ageFloor = prev.retirementAge - 1
  const retirementAge = init ? BASE.retirementAgeEffective : clamp(policy.retirementAge, ageFloor, year < BASE.reformPauseUntil ? prev.retirementAge : prev.retirementAge + P.retirementPhaseIn)
  const ageChange = retirementAge - prev.retirementAge
  // Les générations du baby-boom finissent de partir vers 2040 ; ensuite, les générations qui arrivent à la retraite sont un peu moins nombreuses.
  const cohort = Math.max(
    P.retirementCohortLongRun,
    BASE.retirementEntrants * (1 + P.retirementCohortGrowth * Math.min(yearsIn, P.babyBoomYears)) - P.retirementCohortDecline * Math.max(0, yearsIn - P.babyBoomYears),
  )
  const entrants = Math.max(0.1, cohort - cohort * ageChange)
  // — 5. Influence : la puissance (armée, économie, culture, aide, exemplarité, stabilité) se traduit en poids dans le monde.
  const root = (x: number) => Math.sqrt(Math.max(0.05, x))
  const influenceParts = {
    military: root(policy.defence / REF.defence),
    // L'économie mondiale grandit : si la France croît moins vite, son poids relatif s'érode.
    economy: root(prev.gdpReal / BASE.gdp / Math.pow(1 + BASE.worldGrowth, yearsIn)),
    culture: root(policy.softPower / REF.softPower),
    aid: root(policy.developmentAid / REF.developmentAid),
    climate: 1 + Math.max(0, 1 - prev.frenchEmissions / (BASE.fossilEmissions + BASE.electricityEmissions + BASE.otherEmissions)),
    stability: Math.max(0.1, 1 - clamp(prev.discontent, 0, 0.9) - (prev.rescueYears > 0 ? 0.2 : 0)),
  }
  const weights = { military: P.influenceMilitary, economy: P.influenceEconomy, culture: P.influenceCulture, aid: P.influenceAid, climate: P.influenceClimate, stability: P.influenceStability }
  const totalWeight = Object.values(weights).reduce((a, w) => a + w, 0)
  const influenceTarget = (Object.keys(weights) as (keyof typeof weights)[]).reduce((a, k) => a + weights[k] * influenceParts[k], 0) / totalWeight
  const influence = init ? 1 : prev.influence + P.influenceSpeed * (influenceTarget - prev.influence)
  const clout = influence - 1

  // — 6. Migrations : la pression vient du monde (conflits, réchauffement) ; la politique n'en filtre qu'une partie.
  const warmingSoFar = Math.max(0, prev.temperature - BASE.temperature)
  const aidStock = init ? prev.aidStock : prev.aidStock * (1 - P.aidDecay) + policy.developmentAid
  const aidExtra = Math.max(0, aidStock - REF.developmentAid / P.aidDecay)
  const peaceEffect = (P.aidMax * aidExtra) / (aidExtra + P.aidHalf)
  const conflict = init ? 0 : Math.max(0, prev.conflict * P.conflictDecay + world.conflict)
  // Une France influente aide à apaiser les conflits (médiation, dissuasion).
  const effectiveConflict = (conflict + P.climateConflict * warmingSoFar) * (1 - peaceEffect) * clamp(1 - P.influencePeace * clout, 0.3, 1.7)
  const migrationPressure = {
    base: P.asylumPressure,
    climate: P.climateMigration * warmingSoFar * (1 - peaceEffect),
    conflict: P.conflictMigration * effectiveConflict,
  }
  const controlOf = (spend: number) => (P.controlMax * spend) / (spend + P.controlHalf)
  const controlEffect = controlOf(policy.borderControl)
  const migrationIrregular = (migrationPressure.base + migrationPressure.climate + migrationPressure.conflict) * (1 - controlEffect) + world.migrants
  const migrationLegal = policy.netMigration
  const migrants = (migrationLegal + migrationIrregular) / 1000
  const irregularStart = P.asylumPressure * (1 - controlOf(REF.borderControl))
  const integrationOf = (spend: number) => (P.integrationMax * spend) / (spend + P.integrationHalf)
  const integrationCoverage = integrationOf(policy.integration)
  // Les arrivées des cinq dernières années, à intégrer ; leurs difficultés pèsent moins si l'accueil suit.
  const recentMigrants = init ? prev.recentMigrants : prev.recentMigrants * 0.8 + migrants
  const welcomeGap = (1 - integrationCoverage) / (1 - integrationOf(REF.integration))
  naturalUnemployment += P.migrantNairu * (recentMigrants - initialCarry().recentMigrants) * welcomeGap
  const extraArrivals = migrationLegal + migrationIrregular - (REF.netMigration + irregularStart)
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

  // — 7. Climat : le monde émet, la planète se réchauffe, la France encaisse (et s'adapte)
  // La France pèse environ 0,8 % du CO2 mondial : son effet direct est faible, mais son exemple et son aide comptent un peu.
  const startEmissions = BASE.fossilEmissions + BASE.electricityEmissions + BASE.otherEmissions
  const worldBaseEmissions = init ? BASE.worldCO2 : prev.worldBaseEmissions * (1 + P.worldEmissionsTrend + world.climateAmbition)
  const frenchCut = Math.max(0, 1 - prev.frenchEmissions / startEmissions)
  const aidAvoided = Math.max(0, policy.climateAid - REF.climateAid) / P.climateAidCost
  const tipping = prev.temperature > P.tippingTemperature ? P.tippingEmissions : 0
  const worldEmissions = Math.max(0, worldBaseEmissions * (1 - P.franceInfluence * frenchCut * Math.max(0, influence)) - aidAvoided + tipping)
  const cumulativeCO2 = init ? 0 : prev.cumulativeCO2 + worldEmissions
  const temperature = BASE.temperature + (P.tcre * cumulativeCO2) / 1000
  // Les dégâts se comptent par rapport au climat de l'année de départ (déjà inclus dans les chiffres de cette année-là).
  const warming = temperature - BASE.temperature + world.heatShock
  const adaptStock = init ? prev.adaptStock : prev.adaptStock * (1 - P.adaptationDecay) + policy.adaptation
  const adaptationCoverage = (P.adaptationMax * adaptStock) / (adaptStock + P.adaptationHalf)
  const exposure = 1 - adaptationCoverage
  const climateDamage = init ? 0 : (P.damageLinear * warming + P.damageQuadratic * warming * Math.max(0, warming)) * exposure
  const damageStep = climateDamage - prev.climateDamage

  // — 8. Énergie, prix et salaires
  // Des droits de douane élevés sur les voitures électriques chinoises ralentissent un peu l'électrification (véhicules plus chers).
  // Une taxe carbone plus forte rend la pompe à chaleur et la voiture électrique plus rentables.
  const carbonExtra = policy.carbonTax - REF.carbonTax
  const electrifyPace = policy.electrification * (1 - P.evTariffSlowdown * Math.max(0, policy.tariffChinaEV - REF.tariffChinaEV)) + (P.carbonElectrify * Math.max(0, carbonExtra)) / 100
  const fossilShare = init ? prev.fossilShare : prev.fossilShare * (1 - electrifyPace)
  // Le parc nucléaire suit l'objectif avec retard : construire un réacteur prend plus de dix ans, en fermer va plus vite.
  // Le parc existant peut produire un peu plus (meilleure disponibilité, Flamanville 3) jusqu'à un plafond ; au-delà, il faut de nouveaux réacteurs,
  // commandés une année et mis en service une douzaine d'années plus tard, pas avant le premier EPR2 (2038).
  const nuclearOrder = init ? 0 : prev.nuclearOrder || (policy.nuclearShare > P.nuclearFleetMax + 1e-9 ? year : 0)
  const newBuildFrom = nuclearOrder ? Math.max(P.nuclearFirstNew, nuclearOrder + P.nuclearLeadTime) : Infinity
  const nuclearCeiling = year >= newBuildFrom ? 1 : Math.max(P.nuclearFleetMax, prev.nuclearShare)
  const nuclearShare = init
    ? REF.nuclearShare
    : clamp(policy.nuclearShare, prev.nuclearShare - P.nuclearCloseRate, Math.min(nuclearCeiling, prev.nuclearShare + P.nuclearBuildRate))
  const electricityPrice = 1 + P.nuclearElectricityPrice * (REF.nuclearShare - nuclearShare) + P.electrificationElectricityPrice * (BASE.fossilShare - fossilShare) + P.oilElectricityPrice * (world.oil / BASE.oil - 1)
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
      P.ownershipEfficiency * ownershipStep -
      // Les droits de douane renchérissent les biens intermédiaires importés et abritent les moins efficaces : la production en pâtit.
      P.tariffSupplyCost * (policy.tariffs - prev.tariffs) +
      world.productivity -
      // Les dégâts climatiques détruisent une part de la capacité de production.
      damageStep
  const productivity = prev.productivity * (1 + productivityGrowth)
  const smicStep = policy.smicBoost - prev.smicBoost
  const wageGrowth = init
    ? 0
    : P.wageInertia * prev.inflation + (1 - P.wageInertia) * BASE.inflationAnchor + productivityGrowth + P.wageUnemployment * (naturalUnemployment - prev.unemployment) + P.smicWageSpillover * smicStep
  // Un droit de douane ne renchérit que la part importée de ce qu'on achète (≈ un tiers), pas tous les prix.
  const tariffStep = (policy.tariffs - prev.tariffs) * P.tariffPriceShare * (BASE.importsNonEnergy / BASE.gdp) + (policy.tariffChinaEV - prev.tariffChinaEV) * P.evTariffPrice
  // Un changement de TVA se répercute en grande partie dans les prix, une seule fois.
  // Seuls les produits au taux normal changent de prix ; une hausse est vite répercutée, une baisse beaucoup moins (restauration, 2009).
  const vatPass = (change: number) => P.vatStandardShare * (change >= 0 ? P.vatPassThrough : P.vatCutPassThrough)
  const vatInflation = init ? 0 : (vatPass(policy.vat - prev.vat) * (policy.vat - prev.vat)) / (1 + prev.vat)
  const vatPrice = prev.vatPrice * (1 + vatInflation)
  const inflation = init
    ? BASE.inflationAnchor
    : clamp(
        P.priceWagePass * (wageGrowth - productivityGrowth) +
          (1 - P.priceWagePass) * BASE.inflationAnchor +
          P.energyInflationPass * energyInflation +
          P.tariffInflation * tariffStep +
          vatInflation +
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
  const worldIndex = init ? 1 : prev.worldIndex * (1 + world.growth - P.exportShareLoss + P.influenceExports * clout)

  // — 9. Taux d'intérêt : le prix de la confiance
  const debtPct = prev.debtRatio * 100
  const riskPremium = Math.max(0, P.premiumBase + P.premiumPerDebtPoint * Math.max(0, debtPct - P.debtThreshold) + P.premiumPerDeficitPoint * Math.max(0, prev.deficitRatio * 100 - P.deficitThreshold) + panic + stigma - P.influencePremium * clout - P.monetizationCredibility * policy.monetization + P.monetizationFear * policy.monetization * policy.monetization) / 100
  const premium = rescueYears > 0 ? Math.min(riskPremium, P.rescueSpread / 100) : riskPremium
  // Le taux à 10 ans reflète les taux de la BCE attendus pour les années à venir : il ne suit qu'en partie un changement soudain.
  const ecbExpected = init ? world.ecbRate : prev.ecbExpected + P.rateExpectationSpeed * (world.ecbRate - prev.ecbExpected)
  // Quand la BCE rachète massivement de la dette, les taux longs baissent.
  const rate = ecbExpected + (BASE.termPremium - P.qeTermPremium * world.qe) / 100 + premium + P.inflationRatePass * Math.max(0, prev.inflation - prev.vatInflation - P.inflationRateThreshold)
  const effectiveRate = init ? prev.effectiveRate : prev.effectiveRate + (rate - prev.effectiveRate) / P.debtRollover
  const loanRate = world.ecbRate + BASE.firmLoanSpread + P.firmPremiumPass * premium
  const baseRate = P.neutralLoanRate
  // Des banques à court de fonds propres prêtent moins ; et l'année d'un krach, la peur fige le crédit, à proportion des pertes.
  const creditCrunch = clamp(Math.max(0, (P.bankCapitalMin - bankCapital / (prev.firmDebt + prev.householdDebt)) * P.creditCrunchSensitivity) + P.lossCrunch * world.bankLoss, 0, P.creditCrunchMax)

  // — 10. Demande, revenus et emploi : on cherche le PIB qui boucle
  const trend = priceLevel * (productivity / initialCarry().productivity)
  const popIndex = population / BASE.population
  /**
   * La taille « normale » de l'économie suit le nombre d'actifs, pas la population : quand le pays vieillit,
   * il produit moins, et la demande habituelle (consommation, logement, services publics) doit suivre,
   * sinon l'économie manquerait de bras et s'emballerait (chômage nul, inflation).
   */
  const scale = laborForce / (BASE.workingAge * BASE.participation)
  /** Une dépense publique fixée en Md€ de 2025 suit la croissance de l'économie et des prix : à politique inchangée, son poids dans le PIB reste stable. */
  // Les budgets publics sont votés en euros : ils suivent les prix, mais pas le saut ponctuel dû à une hausse de TVA.
  const g = (bn: number) => (bn * trend * scale) / vatPrice
  // Le rayonnement culturel au-delà de celui de 2025 (audiovisuel extérieur, réseau diplomatique, universités) est un service public de plus.
  const plannedPublicGoods = g(policy.health + policy.prevention + policy.education + policy.defence + policy.investment + policy.otherServices + policy.softPower - REF.softPower)
  // Les économies imposées par un plan d'aide : une part en dépenses publiques en moins, une part en impôts en plus.
  const rescueBase = rescueEffort * BASE.gdp * trend * scale
  // Adaptation au-delà de l'effort de départ, et reconstruction après les catastrophes : des travaux publics en plus.
  const climateSpending = g(policy.adaptation - REF.adaptation) + P.reconstructionShare * climateDamage * BASE.gdp * trend * scale
  // Contrôle, intégration et accueil des demandeurs d'asile : des dépenses publiques en plus (ou en moins).
  const migrationSpending = g(policy.borderControl - REF.borderControl) + g(policy.integration - REF.integration) + ((P.receptionCost * (migrationIrregular - irregularStart)) / 1000) * trend
  const publicGoods = Math.max(0, plannedPublicGoods + climateSpending + migrationSpending - (1 - P.rescueTaxShare) * rescueBase)
  const publicFactor = plannedPublicGoods > 0 ? publicGoods / plannedPublicGoods : 1
  const rescueTax = P.rescueTaxShare * rescueBase
  // La taxe carbone en plus (ou en moins) de celle de 2025, sur les émissions fossiles de l'an dernier.
  // Une partie des émissions échappe à la taxe carbone (aérien, transport routier de marchandises, industrie soumise aux quotas européens).
  const carbonRevenue = init ? 0 : ((carbonExtra * prev.fossilEmissions * P.carbonTaxedShare) / 1000) * priceLevel
  // On ne change pas de voiture ni de chaudière en un an : la baisse de consommation due à la taxe arrive peu à peu.
  const carbonCut = init ? 0 : prev.carbonCut + P.carbonAdjust * ((P.carbonDemandCut * carbonExtra) / 100 - prev.carbonCut)
  // L'aide climat aux pays du Sud, au-delà de celle de départ (versée au reste du monde, comme la contribution à l'UE).
  const climateAidOut = g(policy.climateAid - REF.climateAid) + g(policy.developmentAid - REF.developmentAid)
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
    // Une partie des aides aux entreprises allège le coût du travail (CICE, aides à l'embauche) : les supprimer coûte des emplois.
    const aidJobs = 1 + P.firmAidJobs * clamp((policy.firmAid - REF.firmAid) / REF.firmAid, -1, 1)
    const proportional = (real / (productivity * (1 + P.smicJobLoss * policy.smicBoost))) * aidJobs
    // Loi d'Okun : les entreprises gardent une partie de leurs salariés quand l'activité baisse et embauchent moins vite
    // qu'elles ne produisent quand elle monte. L'emploi ne suit qu'une partie de l'écart de l'année ; le retard se résorbe ensuite.
    // Avec le chômage partiel (2020), l'État fait garder aux entreprises la plupart des emplois menacés, et paie une grande partie des salaires.
    const gapWith = (retention: number) =>
      init ? 0 : P.okunPersistence * prev.employmentGap + (P.okunElasticity * (1 - retention) - 1) * Math.log(proportional / laborForce / prev.proportionalRate)
    const employmentGap = gapWith(world.jobRetention)
    const employment = Math.min(laborForce * P.maxEmployment, proportional * Math.exp(employmentGap))
    const jobsRetained = Math.max(0, employment - Math.min(laborForce * P.maxEmployment, proportional * Math.exp(gapWith(0))))
    const unemployment = clamp(1 - employment / laborForce, 0.015, 0.45)
    const grossWages = avgWage * employment
    const employerContrib = grossWages * BASE.employerContribRate
    const mixed = BASE.mixedIncome * trend * scale
    const otherProd = g(policy.productionTaxes) * (productivity / initialCarry().productivity)
    const firmAid = g(policy.firmAid) + P.retentionPay * avgWage * jobsRetained
    // Le taux normal ne pèse que sur une partie de l'assiette (taux réduits sur l'alimentation, l'énergie, la restauration…).
    const vatRevenue = vatRatio * REF.vat * (1 - P.vatStandardShare + (P.vatStandardShare * policy.vat) / REF.vat) * lastConsumption * declared
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
    // Les dividendes des entreprises nationalisées (au-delà de celles de 2025) reviennent à l'État : on ne nationalise que des grands groupes,
    // l'État ne touche donc qu'une part de leurs dividendes, pas de ceux des PME et des ETI.
    const publicDividends = dividends * FS.valueAdded.ge * (ownership - REF.publicOwnership)
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
    // Les emplois en plus (ou en moins) par rapport au chômage de l'année de départ : ce sont surtout des chômeurs, souvent modestes,
    // qui les trouvent (ou les perdent), à un salaire plus bas que la moyenne. Leurs salaires vont aux tranches où sont les chômeurs.
    const marginalWages = (employment - laborForce * (1 - BASE.unemployment)) * avgWage * P.hireWageRatio
    const wagesOf = (k: keyof ByGroup) => ((grossWages - marginalWages) * wageShare[k]) / wageNorm + marginalWages * GP.unemployment[k]
    const income = byGroup((k) => {
      const wages = wagesOf(k)
      const capital = (dividendsHome + bankDividends) * GP.dividends[k] + (interestBy.assureurs + depositInterest) * GP.wealth[k]
      const transfers =
        pensions * GP.pensions[k] + unemploymentBenefits * GP.unemployment[k] + family * GP.family[k] + minima * GP.minima[k] + otherTransfers * GP.population[k] + foodTransfer * GP.population[k]
      return wages + mixed * GP.mixed[k] + capital + transfers
    })
    const employeeContrib = byGroup((k) => wagesOf(k) * BASE.employeeContribRate)
    const csgBase = byGroup((k) => wagesOf(k) + mixed * GP.mixed[k] + pensions * GP.pensions[k] * BASE.csgPensionShare)
    const csgRatio = BASE.csgRevenue / (BASE.grossWages + BASE.mixedIncome + BASE.pensions * BASE.csgPensionShare) / REF.csg
    const csg = byGroup((k) => csgBase[k] * policy.csg * csgRatio * declared)
    const taxable = byGroup((k) => wagesOf(k) + mixed * GP.mixed[k] + pensions * GP.pensions[k] + (dividendsHome + bankDividends) * GP.dividends[k])
    // Le taux moyen d'impôt sur le revenu de chaque tranche est calé pour retrouver la recette et sa répartition de l'année de départ.
    const irRate = anchors ? anchors.irRate : byGroup((k) => (BASE.incomeTaxRevenue * GP.incomeTax[k]) / Math.max(1, taxable[k]))
    // La surtaxe des plus aisés ne touche qu'une partie de leurs revenus : les dividendes paient le prélèvement forfaitaire unique (depuis 2018).
    const incomeTax = byGroup((k) => taxable[k] * (irRate[k] + policy.incomeTaxTop * GP.topRate[k] * P.topTaxBase) * declared)
    // La part qui vient de la surtaxe sur les plus aisés (pour la colère : un impôt sur les riches ne fâche pas la majorité).
    const topIncomeTax = sum(byGroup((k) => taxable[k] * policy.incomeTaxTop * GP.topRate[k] * P.topTaxBase * declared))
    const wealthTax = policy.wealthTax * wealthTaxBase(wealth.g5) + (BASE.ifiRevenue * trend)
    const inheritance = BASE.inheritanceFlows * trend
    // Au-delà d'un certain taux, l'assiette fond de plus en plus vite (donations anticipées, assurance-vie, départs) : les recettes plafonnent.
    const inheritanceTax = inheritance * policy.inheritanceTax * Math.exp(-P.inheritanceErosion * Math.max(0, policy.inheritanceTax - P.inheritanceErosionThreshold))
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
    // Les ménages lissent : la première année, ils ne dépensent qu'une partie de l'écart de revenu ; s'il dure, ils s'y ajustent peu à peu.
    const consumptionResponse = byGroup((k) => {
      const target = GP.mpc[k] * (disposable[k] - normal(k) - foodTransfer * GP.population[k])
      return init ? 0 : prev.consumptionResponse[k] + P.consumptionSmoothing * (target - prev.consumptionResponse[k])
    })
    const consumption = byGroup((k) => {
      if (!anchors) {
        // Répartition de la consommation de 2025 selon la propension à consommer de chaque tranche.
        const weight = GP.mpc[k] * P.consumptionSplitMpc + (1 - P.consumptionSplitMpc)
        const weights = sum(byGroup((j) => (GP.mpc[j] * P.consumptionSplitMpc + (1 - P.consumptionSplitMpc)) * disposable[j]))
        return (BASE.consumption * weight * disposable[k]) / weights
      }
      const food = foodTransfer * GP.population[k]
      const wealthEffect = P.wealthEffect * (wealth[k] - BASE.householdFinancialWealth * GP.wealth[k] * trend)
      // Les ménages lissent : seule une partie de l'écart de revenu passe tout de suite en consommation.
      return Math.max(0, (baseC[k] * trend * scale + consumptionResponse[k] + food + wealthEffect) * (1 - demandShock))
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
    // Une partie remplace des achats qui auraient eu lieu de toute façon (une chaudière, une voiture neuve) : seul le reste est une dépense en plus.
    // Le chantier se rétrécit à mesure qu'il reste moins de pétrole et de gaz à remplacer.
    const electrifyInvestment =
      P.electrificationInvestment * 100 * Math.max(0, policy.electrification - REF.electrification) * trend * (1 - P.electrificationSubstitution) * (fossilShare / BASE.fossilShare)
    const investmentBy = bySize((c) => BASE.investment * trend * FS.investment[c] * firmFactor[c] + aidInvestment[c] + electrifyInvestment * FS.investment[c])
    const investment = sumSize(investmentBy)
    const housing = BASE.housing * trend * scale * clamp(1 - P.housingRateSensitivity * (rate - baseRate), P.housingMin, P.housingMax) * (1 - creditCrunch)

    // Commerce extérieur et énergie
    // La TVA ne frappe pas les exportations, et frappe autant les produits importés que les nôtres : le commerce se joue sur les prix hors TVA.
    const competitiveness = Math.pow(priceLevel / vatPrice / worldPrice, -P.priceCompetitiveness)
    // Un pays influent subit moins de représailles commerciales.
    const retaliation = (P.tariffRetaliation * policy.tariffs + P.evRetaliation * (policy.tariffChinaEV - REF.tariffChinaEV)) * clamp(1 - P.influenceTrade * clout, 0.2, 2)
    const exports = BASE.exports * worldIndex * worldPrice * competitiveness * (1 - retaliation) * (1 - P.electricityExportLoss * (electricityPrice - 1))
    const absorption = totalConsumption + housing + investment + publicGoods + exports
    const importRatio = BASE.importsNonEnergy / (BASE.consumption + BASE.housing + BASE.investment + basePublicGoods() + BASE.exports)
    const overheating = 1 + P.overheatingImports * Math.max(0, real / potential - P.overheatingThreshold)
    // Pompes à chaleur, batteries, véhicules : l'électrification est plus importée que l'investissement moyen.
    const electrifyImports = electrifyInvestment * Math.max(0, P.electrificationImportShare - importRatio)
    const imports = importRatio * absorption * Math.pow(priceLevel / vatPrice / worldPrice, P.importPriceElasticity) * (1 - P.nonEuImportShare * P.tariffImportCut * policy.tariffs) * overheating + electrifyImports
    // On consomme un peu moins de pétrole quand il est cher (élasticité-prix ≈ −0,2).
    // Une taxe carbone plus forte fait consommer moins de pétrole et de gaz.
    const energyImports = (1 - carbonCut) * BASE.energyImports * Math.pow(world.oil / BASE.oil, P.oilElasticity) * (fossilShare / BASE.fossilShare) * Math.pow(real / BASE.gdp, P.energyGdpElasticity) * worldPrice

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
      topIncomeTax,
      consumptionResponse,
      proportional,
      employmentGap,
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

  // — 11. Financement de la dette : qui prête à l'État cette année ?
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

  // — 12. Bilans de fin d'année
  for (const k of GROUPS) {
    const saving = d.disposable[k] - d.consumption[k] - d.housing * GP.wealth[k]
    wealth[k] = (wealth[k] + (init ? 0 : saving) - (init ? 0 : d.inheritanceTaxBy[k])) * (init ? 1 : 1 + inflation * P.assetInflationShare)
  }
  const firmDebt = init ? prev.firmDebt : prev.firmDebt + d.investment - d.retained
  bankCapital = init ? bankCapital : bankCapital + d.bankProfit - d.bankDividends
  const householdDebt = init ? prev.householdDebt : prev.householdDebt * (1 + inflation) + P.housingDebtShare * d.housing - P.mortgageRepayment * prev.householdDebt
  const deposits = init ? prev.deposits : prev.deposits * (1 + inflation)
  const currentAccount = d.exports + d.foreignIncome - d.imports - d.energyImports - d.dividendsAbroad - d.interestBy.monde - d.euContribution

  // — 13. Inégalités, pauvreté, espérance de vie
  // Prix vus par chaque tranche : la TVA et l'énergie pèsent plus lourd quand on dépense tout son revenu.
  const groupPrice = byGroup((k) => {
    const spendShare = d.consumption[k] / Math.max(1, d.disposable[k])
    return priceLevel * (1 + ((vatPass(policy.vat - REF.vat) * (policy.vat - REF.vat)) / 1.2) * (spendShare - 0.83) + P.energyGroupPrice * (energyPrice - 1) * GP.energyExposure[k])
  })
  const perCapita = byGroup((k) => (d.disposable[k] / (population * GP.population[k])) * (1000 / groupPrice[k]))
  const dist = distribution(perCapita, GP.population, GP.sigma)
  if (!init) {
    lifeExpectancy -= P.povertyLifeLoss * (dist.poverty - BASE.poverty) * 100
    // Canicules et maladies liées au réchauffement (moins si l'on s'est adapté) ; moins de pollution de l'air si l'on sort du pétrole et du gaz.
    lifeExpectancy += -P.climateLifeLoss * Math.max(0, warming) * exposure + (P.airPollutionLife * (BASE.fossilShare - fossilShare)) / BASE.fossilShare
  }
  const lifeGap = BASE.lifeGap * Math.pow(perCapita.g5 / perCapita.g1 / BASE.incomeRatioTopBottom, P.lifeGapElasticity)

  // — 14. Matrice des flux (chaque euro a un payeur et un receveur)
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

  // — 15. Tension sur la dette : de combien le solde public est-il loin de ce qui stabiliserait la dette ?
  // Il faudrait un excédent primaire (hors intérêts) de (taux − croissance) × dette ; tout écart fait grossir la dette.
  // Les prêteurs jugent la soutenabilité sur la croissance de tendance, pas sur une seule année : une récession brève (2009) ne déclenche pas de crise à elle seule.
  const nominalGrowth = BASE.inflationAnchor + BASE.productivityGrowth
  const primaryBalance = -(deficit - d.interest) / gdp
  const stabilizing = ((effectiveRate - nominalGrowth) / (1 + nominalGrowth)) * (debt / gdp)
  const stabilityGap = stabilizing - primaryBalance
  const rawStress = Math.max(0, debt / gdp - P.crisisDebtThreshold) / P.crisisDebtRange + Math.max(0, stabilityGap) / P.crisisGapRange
  // Quand la BCE rachète massivement de la dette, elle sert de filet : les marchés s'affolent beaucoup moins.
  const shielded = rawStress * (1 - P.qeStressRelief * world.qe)
  const marketStress = init ? shielded : P.crisisSmoothing * shielded + (1 - P.crisisSmoothing) * prev.marketStress

  // — 16. La société : prélèvements, colère, et ce qui rendrait la situation intenable
  // Le poids des prélèvements ressenti : la cotisation alimentation, rendue à chacun sous forme d'une allocation égale, n'en fait pas partie
  // (comme le dit le levier : une mutualisation, pas un impôt de plus) ; elle ne nourrit donc ni la fraude ni la colère fiscale.
  const taxBurden = (d.revenue - d.taxes.foodContribution) / gdp
  const taxBurden0 = init ? taxBurden : prev.taxBurden0
  // Ce que ressent la majorité : sans les impôts sur les plus aisés et les grandes entreprises, que les Français approuvent
  // (ISF rétabli : 77 % pour, Ifop 2019 ; taxe Zucman : 86 %, Ifop 2025). Les baisser, en revanche, fâche (« président des riches », 2017).
  const richTaxes = d.taxes.wealthTax + d.topIncomeTax
  const feltBurden = (d.revenue - d.taxes.foodContribution - richTaxes - d.taxes.corporateTax) / gdp
  const feltBurden0 = init ? feltBurden : prev.feltBurden0
  const richTaxRatio = richTaxes / gdp
  // Les réformes qui fâchent dès le vote, avant tout effet économique : chaque cran voté dans le sens impopulaire.
  const voteAnger = init ? 0 : VOTE_ANGER.reduce((total, v) => total + v.perUnit() * Math.max(0, v.direction * ((policy[v.key] as number) - (prev.voted[v.key] ?? (policy[v.key] as number)))), 0)
  const richCutAnger = init ? 0 : P.richTaxCutAnger * Math.max(0, prev.richTaxRatio - richTaxRatio)
  const poverty0 = init ? dist.poverty : prev.poverty0
  const medianDrop = init ? 0 : Math.max(0, 1 - dist.median / prev.medianIncome)
  // Les plus modestes qui perdent du pouvoir d'achat (SMIC désindexé, minima rabotés) : la colère monte même si le revenu médian tient.
  const lowIncomeDrop = init ? 0 : Math.max(0, 1 - perCapita.g1 / prev.lowIncome)
  const pensionNow = prev.avgPension * (1 + inflation * policy.pensionIndexation + (init ? 0 : P.pensionRealGain))
  // Ce que perd (ou gagne) chaque retraité : la pension moyenne monte aussi parce que les nouveaux retraités ont de meilleures carrières,
  // mais celle de chacun ne suit les prix que selon l'indexation.
  const pensionPower = init ? 1 : (prev.pensionPower * (1 + inflation * policy.pensionIndexation)) / (1 + inflation)
  // Les services publics du quotidien, en volume, rapportés à ceux de l'année de départ (1 = autant qu'au départ).
  const servicesIndex = (policy.health + policy.prevention + policy.education + policy.otherServices) / (REF.health + REF.prevention + REF.education + REF.otherServices)
  // Les bonnes nouvelles comptent aussi, moins que les mauvaises (on remarque davantage ce qu'on perd) : un niveau de vie
  // qui progresse plus vite que d'habitude, des prélèvements en baisse, un chômage bas, une pauvreté qui recule.
  const medianRise = init ? 0 : Math.max(0, dist.median / prev.medianIncome - 1 - BASE.productivityGrowth)
  const goodNews =
    P.goodNewsWeight *
    (medianRise / P.unrestIncomeDrop +
      Math.max(0, feltBurden0 - feltBurden) / P.unrestTaxRange +
      Math.max(0, P.unrestUnemployment - d.unemployment) / P.unrestUnemploymentRange +
      Math.max(0, poverty0 - dist.poverty) / P.unrestPovertyRange)
  const angerBeforeForce =
    -goodNews +
    medianDrop / P.unrestIncomeDrop +
    lowIncomeDrop / P.unrestLowIncomeDrop +
    Math.max(0, feltBurden - feltBurden0) / P.unrestTaxRange +
    Math.max(0, d.unemployment - P.unrestUnemployment) / P.unrestUnemploymentRange +
    Math.max(0, inflation - P.unrestInflation) / P.unrestInflationRange +
    Math.max(0, dist.poverty - poverty0) / P.unrestPovertyRange +
    // L'austérité imposée nourrit la colère tant que le plan d'aide dure.
    (rescueYears > 0 ? rescueStep * (P.rescueYears - rescueYears + 1) : 0) / P.unrestAusterityRange +
    // Une crise de la dette (taux qui s'envolent, banques et épargnants touchés) fâche le pays, avec ou sans plan d'aide.
    (debtCrisis ? P.crisisAnger : 0) +
    // Catastrophes à répétition, pénuries d'eau : le réchauffement nourrit la colère, sauf si le pays s'est adapté.
    (Math.max(0, warming - world.heatShock) * exposure) / P.unrestClimateRange +
    // Une catastrophe ponctuelle (canicule, inondation) choque, mais moins qu'un réchauffement durable ; l'adaptation en atténue aussi la colère.
    world.heatShock * exposure * P.disasterAnger +
    world.unrest +
    // Précarité quand on allège fortement les règles.
    P.regulationAnger * Math.max(0, deregulation) +
    // Les réformes qui fâchent dès le vote (âge de départ, taxe carbone, gel des pensions, droit du travail, privatisations),
    // et les cadeaux fiscaux aux plus aisés.
    voteAnger +
    richCutAnger +
    // Des retraites qui perdent du pouvoir d'achat par rapport à l'année de départ : la colère dure tant que la perte dure.
    Math.max(0, 1 - pensionPower) / P.unrestPensionRange +
    // Des services publics qui reculent (santé, éducation, autres services), en volume, par rapport à l'année de départ.
    Math.max(0, 1 - servicesIndex) / P.unrestServicesRange +
    // La fierté d'un pays qui compte dans le monde (ou l'humiliation d'un pays qui décline).
    -P.influencePride * clout +
    // Un accueil débordé (bien plus d'arrivées qu'en 2025, sans moyens d'intégration) crée des tensions.
    (P.migrationAnger * Math.max(0, extraArrivals) * welcomeGap) / 100
  // Un passage en force (49.3) choque peu un pays calme (budget 2022), beaucoup un pays en colère cette année-là,
  // par exemple contre la réforme même qu'on fait passer (retraites 2023).
  const angryBefore = init ? 0 : P.unrestMemory * prev.discontent + (1 - P.unrestMemory) * angerBeforeForce
  const anger = angerBeforeForce + (init ? 0 : world.forced * (P.forceAnger + P.forceContextAnger * Math.max(0, angryBefore)))
  // Le climat social peut devenir serein (négatif), sans descendre sous un plancher : il y a toujours des mécontents.
  const discontent = init ? 0 : Math.max(P.serenityFloor, P.unrestMemory * prev.discontent + (1 - P.unrestMemory) * anger)
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

  // — 17. Les émissions françaises : pétrole et gaz (moins avec l'électrification et la taxe carbone), électricité, agriculture et déchets.
  const fossilEmissions =
    BASE.fossilEmissions * (fossilShare / BASE.fossilShare) * Math.pow(d.real / BASE.gdp, P.energyEmissionsGdp) * Math.max(0, 1 - carbonCut)
  const electricityEmissions = BASE.electricityEmissions * Math.max(0.2, 1 + P.gasForNuclear * (REF.nuclearShare - nuclearShare)) * (1 + (BASE.fossilShare - fossilShare))
  const frenchEmissions = (fossilEmissions + electricityEmissions + BASE.otherEmissions * Math.pow(1 - P.otherEmissionsDecline, yearsIn)) * (1 + P.regulationEmissions * deregulation)

  // — 18. Les entreprises par taille : qui investit, qui exporte, qui emploie
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
    retirementTarget: policy.retirementAge,
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
      'Autres services publics': g(policy.otherServices + policy.softPower - REF.softPower) * publicFactor,
      'Chômage, famille, minima': d.transfers.unemploymentBenefits + d.transfers.family + d.transfers.minima + d.transfers.otherTransfers,
      'Sécurité sociale de l’alimentation': d.transfers.foodTransfer,
      'Aides aux entreprises': d.firmAid,
      'Charge de la dette': d.interest,
      'Contribution à l’UE': d.euContribution - climateAidOut,
      'Aide climat et développement (en plus)': climateAidOut,
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
    nuclearShare,
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
    tariffs: policy.tariffs,
    influence,
    influenceParts,
    migrationLegal,
    migrationIrregular,
    migrationPressure,
    conflict,
    controlEffect,
    integrationCoverage,
    peaceEffect,
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
    avgPension: pensionNow,
    pensionPower,
    smic,
    smicBoost: policy.smicBoost,
    vat: policy.vat,
    tariffs: policy.tariffs,
    tariffChinaEV: policy.tariffChinaEV,
    inflation,
    vatInflation,
    vatPrice,
    unemployment: d.unemployment,
    gap: d.real / d.potential - 1,
    proportionalRate: d.proportional / laborForce,
    employmentGap: Math.log(d.employment / d.proportional),
    gdpReal,
    gdp,
    energyPrice,
    fossilShare,
    nuclearShare,
    nuclearOrder,
    carbonCut,
    consumptionResponse: d.consumptionResponse,
    workingAge,
    retirees,
    young,
    lifeExpectancy,
    retirementAge,
    debtRatio: debt / gdp,
    deficitRatio: deficit / gdp,
    deficitRatioBefore: prev.deficitRatio,
    worldCrisis: world.demandShock > 0 || world.growth < 0,
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
    influence,
    conflict,
    aidStock,
    recentMigrants,
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
    lowIncome: perCapita.g1,
    retirementTarget: policy.retirementAge,
    voted: Object.fromEntries(VOTE_ANGER.map((v) => [v.key, policy[v.key]])),
    feltBurden,
    feltBurden0,
    richTaxRatio,
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
    world.conflict += effect.conflict ?? 0
    world.bankLoss += effect.bankLoss ?? 0
    world.forced += effect.forced ?? 0
    world.instability += effect.instability ?? 0
    world.jobRetention += effect.jobRetention ?? 0
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
