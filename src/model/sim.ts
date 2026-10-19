import { BASE, BASE_POLICY, GROUP_PARAMS as GP } from './calibration'
import { distribution } from './distribution'
import { EVENTS } from './events'
import {
  GROUPS,
  HOLDERS,
  type ByGroup,
  type Decision,
  type FiredEvent,
  type Flow,
  type Holder,
  type Policy,
  type World,
  type YearState,
} from './types'

const BASE_PUBLIC_GOODS = BASE_POLICY.health + BASE_POLICY.prevention + BASE_POLICY.education + BASE_POLICY.defence + BASE_POLICY.investment + BASE_POLICY.otherServices
/** Taux d'activité des 20–59 ans, calé pour retrouver 31,1 millions d'actifs en 2025. */
const CORE_PARTICIPATION = (BASE.workingAge * BASE.participation - BASE.retirementEntrants * 2.75 * 0.45) / (BASE.workingAge - BASE.retirementEntrants * 2.75)
const sum = (g: ByGroup) => GROUPS.reduce((acc, k) => acc + g[k], 0)
const byGroup = (f: (g: keyof ByGroup) => number): ByGroup => ({ g1: f('g1'), g2: f('g2'), g3: f('g3'), g4: f('g4'), g5: f('g5') })
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Ce que le monde fait sans nous : la crise d'Ormuz de 2026, puis un retour progressif au calme. */
export function baseWorld(year: number): World {
  const oil: Record<number, number> = { 2025: 70, 2026: 100, 2027: 90, 2028: 82 }
  const ecb: Record<number, number> = { 2025: 0.02, 2026: 0.024, 2027: 0.025, 2028: 0.024 }
  return { growth: 0.022, oil: oil[year] ?? 78, ecbRate: ecb[year] ?? 0.0225, panic: 0, demandShock: 0 }
}

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
}

function initialCarry(): Carry {
  return {
    year: BASE.year,
    priceLevel: 1,
    worldPrice: 1,
    worldIndex: 1,
    productivity: BASE.gdp / (BASE.workingAge * BASE.participation * (1 - 0.077)),
    avgWage: BASE.grossWages / (BASE.workingAge * BASE.participation * (1 - 0.077)),
    avgPension: BASE.avgPension,
    smic: BASE.smic,
    smicBoost: 0,
    vat: BASE_POLICY.vat,
    tariffs: BASE_POLICY.tariffs,
    tariffChinaEV: BASE_POLICY.tariffChinaEV,
    inflation: BASE.inflationAnchor,
    unemployment: 0.077,
    gap: 0,
    gdpReal: BASE.gdp,
    gdp: BASE.gdp,
    energyPrice: 1,
    fossilShare: BASE.fossilShare,
    workingAge: BASE.workingAge,
    retirees: BASE.retirees,
    young: BASE.population - BASE.workingAge - BASE.retirees,
    lifeExpectancy: BASE.lifeExpectancy,
    retirementAge: BASE_POLICY.retirementAge,
    debtRatio: BASE.debt / BASE.gdp,
    deficitRatio: 0.051,
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
  }
}

/** Le revenu disponible « normal » de 2025 par tranche, qui sert de repère aux comportements. */
type Anchors = { yd: ByGroup; c: ByGroup; ydTotal: number }

/** Une année de la France. `init` = l'année de départ, calée sur les chiffres de 2025. */
function step(prev: Carry, policy: Policy, world: World, anchors: Anchors | null, cancel: { share: number; holder: Holder } | null): { state: YearState; carry: Carry; anchors: Anchors } {
  const year = prev.year + (anchors ? 1 : 0)
  const init = anchors === null
  const notes: string[] = []
  const holders = { ...prev.holders }
  let panic = prev.panic * 0.6 + world.panic
  let shun = prev.shun * 0.85
  // Mémoire d'un défaut : les prêteurs se souviennent plusieurs années (écarts de taux élevés 3 à 5 ans).
  let stigma = prev.stigma * 0.8
  let bankCapital = prev.bankCapital
  const wealth = { ...prev.wealth }

  // — 0. Annulation de dette, au début de l'année
  if (cancel && cancel.share > 0) {
    const amount = holders[cancel.holder] * cancel.share
    holders[cancel.holder] -= amount
    const bn = Math.round(amount)
    if (cancel.holder === 'bce') {
      panic += 0.6
      notes.push(`${bn} Md€ de dette détenue par la Banque de France sont effacés. L’État ne paie plus ces intérêts… mais la Banque de France ne lui reverse plus les bénéfices qu’elle en tirait : le gain est quasi nul, et la rupture des traités européens inquiète les prêteurs.`)
    } else if (cancel.holder === 'assureurs') {
      for (const g of GROUPS) {
        wealth[g] -= amount * GP.wealth[g]
      }
      panic += 1
      stigma += 2
      notes.push(`${bn} Md€ de dette détenue par les assureurs sont effacés : ce sont les contrats d’assurance-vie des Français qui perdent cette somme, surtout ceux des ménages aisés. C’est un défaut : les prêteurs exigent une forte prime de risque.`)
    } else if (cancel.holder === 'banques') {
      bankCapital -= amount
      panic += 1
      stigma += 2
      notes.push(`${bn} Md€ de dette détenue par les banques françaises sont effacés : leurs fonds propres fondent, elles prêtent moins aux entreprises et aux ménages. C’est un défaut : les prêteurs exigent une forte prime de risque.`)
    } else {
      panic += 1.5
      stigma += 2.5
      shun += 1
      notes.push(`${bn} Md€ de dette détenue par les étrangers sont effacés. La France fait défaut : les investisseurs étrangers fuient, et il faut trouver en France l’argent qu’ils prêtaient.`)
    }
  }

  // — 1. Démographie et espérance de vie
  const yearsIn = year - BASE.year
  const healthRatio = (policy.health + policy.prevention) / (BASE_POLICY.health + BASE_POLICY.prevention)
  const healthStock = prev.healthStock + 0.2 * (Math.log(healthRatio) - prev.healthStock)
  const preventionStock = prev.preventionStock + 0.25 * ((policy.prevention - BASE_POLICY.prevention) - prev.preventionStock)
  const lifeTrend = BASE.lifeExpectancy + 0.1 * yearsIn
  // L'âge effectif rejoint la cible progressivement : +3 mois par an au plus (la réforme de 2023 reprend en 2028), −1 an par an au plus.
  const ageFloor = year < 2028 ? Math.min(prev.retirementAge, policy.retirementAge) : prev.retirementAge - 1
  const retirementAge = init ? 62.75 : clamp(policy.retirementAge, ageFloor, year < 2028 ? prev.retirementAge : prev.retirementAge + 0.25)
  const ageChange = retirementAge - prev.retirementAge
  const cohort = BASE.retirementEntrants
  const entrants = Math.max(0.1, cohort * (1 + 0.004 * yearsIn) - cohort * ageChange)
  const migrants = policy.netMigration / 1000
  const youthIn = BASE.youthEntrants - 0.005 * yearsIn
  const births = 0.64
  const workingAge = init ? prev.workingAge : prev.workingAge + youthIn - entrants + 0.85 * migrants - 0.12
  // L'espérance de vie dépend de la santé, de la prévention et de la pauvreté de l'année précédente (calculée plus bas).
  let lifeExpectancy = init ? BASE.lifeExpectancy : lifeTrend + 1.5 * healthStock + 0.05 * clamp(preventionStock, -10, 30)
  // Durée moyenne passée à la retraite ≈ espérance de vie − âge de départ + 3,5 ans (on vit plus longtemps une fois arrivé à 60 ans).
  const deaths = prev.retirees / Math.max(8, prev.lifeExpectancy - prev.retirementAge + 3.5)
  const retirees = init ? prev.retirees : prev.retirees + entrants - deaths
  const young = init ? prev.young : prev.young + births - youthIn + 0.15 * migrants - 0.01
  const population = workingAge + retirees + young
  // Les seniors restent plus longtemps en activité : le taux d'activité progresse lentement.
  // Les 60 ans et plus encore en âge de travailler sont moins souvent actifs (≈ 45 %) que les autres (≈ 85 %) :
  // reculer ou avancer l'âge de départ ne déplace donc pas des cohortes entières de travailleurs.
  const seniors = cohort * Math.max(0, retirementAge - 60)
  const laborForce = (workingAge - seniors) * Math.min(0.89, CORE_PARTICIPATION + 0.0015 * yearsIn) + seniors * 0.45

  // — 2. Énergie, prix et salaires
  // Des droits de douane élevés sur les voitures électriques chinoises ralentissent un peu l'électrification (véhicules plus chers).
  const electrifyPace = policy.electrification * (1 - 0.15 * Math.max(0, policy.tariffChinaEV - BASE_POLICY.tariffChinaEV))
  const fossilShare = init ? prev.fossilShare : prev.fossilShare * (1 - electrifyPace)
  const electricityPrice = 1 + 0.8 * (BASE_POLICY.nuclearShare - policy.nuclearShare) + 0.35 * (BASE.fossilShare - fossilShare) + 0.08 * (world.oil / BASE.oil - 1)
  const energyPrice = (fossilShare * (world.oil / BASE.oil) + (1 - fossilShare) * electricityPrice) / (BASE.fossilShare + (1 - BASE.fossilShare))
  const energyInflation = init ? 0 : energyPrice / prev.energyPrice - 1
  const productivityGrowth = init
    ? 0
    : BASE.productivityGrowth +
      0.006 * clamp(prev.educationStock, -1, 1) +
      0.00005 * (policy.investment - BASE_POLICY.investment) -
      0.01 * prev.capitalFlight
  const productivity = prev.productivity * (1 + productivityGrowth)
  const smicStep = policy.smicBoost - prev.smicBoost
  const wageGrowth = init
    ? 0
    : 0.6 * prev.inflation + 0.4 * BASE.inflationAnchor + productivityGrowth + 0.3 * (BASE.naturalUnemployment - prev.unemployment) + 0.12 * smicStep
  const tariffStep = (policy.tariffs - prev.tariffs) * 0.45 + (policy.tariffChinaEV - prev.tariffChinaEV) * 0.004
  const inflation = init
    ? BASE.inflationAnchor
    : clamp(
        0.6 * (wageGrowth - productivityGrowth) +
          0.4 * BASE.inflationAnchor +
          0.06 * energyInflation +
          0.6 * tariffStep +
          (0.7 * (policy.vat - prev.vat)) / (1 + prev.vat) +
          0.25 * prev.gap +
          0.02 * policy.monetization +
          0.003 * prev.panic,
        -0.03,
        0.4,
      )
  const priceLevel = init ? 1 : prev.priceLevel * (1 + inflation)
  const avgWage = init ? prev.avgWage : prev.avgWage * (1 + wageGrowth)
  const smic = init ? prev.smic : prev.smic * (1 + Math.max(0, inflation)) * (1 + smicStep)
  const worldPrice = init ? 1 : prev.worldPrice * 1.02
  const worldIndex = init ? 1 : prev.worldIndex * (1 + world.growth)

  // — 3. Taux d'intérêt : le prix de la confiance
  const debtPct = prev.debtRatio * 100
  const riskPremium = Math.max(0, 0.2 + 0.006 * Math.max(0, debtPct - 60) + 0.06 * Math.max(0, prev.deficitRatio * 100 - 3) + panic + stigma - 0.6 * policy.monetization + 1.2 * policy.monetization * policy.monetization) / 100
  const rate = world.ecbRate + BASE.termPremium / 100 + riskPremium + 0.4 * Math.max(0, prev.inflation - 0.03)
  const effectiveRate = init ? prev.effectiveRate : prev.effectiveRate + (rate - prev.effectiveRate) / 8
  const loanRate = world.ecbRate + BASE.firmLoanSpread + 0.5 * riskPremium
  const baseRate = 0.034
  const creditCrunch = clamp((0.09 - bankCapital / (prev.firmDebt + prev.householdDebt)) * 6, 0, 0.5)

  // — 4. Demande, revenus et emploi : on cherche le PIB qui boucle
  const trend = priceLevel * (productivity / initialCarry().productivity)
  const popIndex = population / BASE.population
  /** Une dépense publique fixée en Md€ de 2025 suit la croissance de l'économie et des prix : à politique inchangée, son poids dans le PIB reste stable. */
  const g = (bn: number) => bn * trend * popIndex
  const publicGoods = g(policy.health + policy.prevention + policy.education + policy.defence + policy.investment + policy.otherServices)
  const foodTransfer = (policy.foodSecurity * 12 * population) / 1000 * priceLevel
  const minimaBoost = g(policy.minima)
  const vatRatio = BASE.vatRevenue / BASE.consumption / BASE_POLICY.vat
  const isRatio = BASE.corporateTaxRevenue / (BASE_POLICY.corporateTax * 690)
  const wealthTaxBase = (w: number) => w * 0.35 * Math.exp(-6 * policy.wealthTax)
  const capitalFlight = clamp(prev.capitalFlight * 0.85 + 0.3 * Math.max(0, policy.wealthTax - 0.01) + 0.03 * Math.max(0, policy.inheritanceTax - 0.3) + 0.15 * Math.max(0, policy.corporateTax - 0.33), 0, 0.15)

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
    const potential = laborForce * (1 - BASE.naturalUnemployment) * productivity
    // Un SMIC plus cher pousse les entreprises à économiser du travail peu qualifié (élasticité modeste).
    const employment = Math.min(laborForce * 0.985, real / (productivity * (1 + 0.06 * policy.smicBoost)))
    const unemployment = clamp(1 - employment / laborForce, 0.015, 0.45)
    const grossWages = avgWage * employment
    const employerContrib = grossWages * BASE.employerContribRate
    const mixed = BASE.mixedIncome * trend * popIndex
    const otherProd = g(policy.productionTaxes) * (productivity / initialCarry().productivity)
    const firmAid = g(policy.firmAid)
    const vatRevenue = vatRatio * policy.vat * lastConsumption
    const gos = nominal - vatRevenue - otherProd - grossWages - employerContrib - mixed + firmAid
    const corporateTax = Math.max(0, policy.corporateTax * isRatio * gos)
    const firmInterest = prev.firmDebt * loanRate
    const foreignIncome = BASE.foreignIncome * worldIndex * worldPrice
    const dividends = Math.max(0, BASE.dividendPayout * (gos - corporateTax - firmInterest))
    const dividendsAbroad = dividends * BASE.dividendsAbroad
    const dividendsHome = dividends - dividendsAbroad
    const nonTax = BASE.nonTaxRevenue * trend
    const retained = gos - corporateTax - firmInterest + foreignIncome - dividends - nonTax

    // Banques
    const mortgageInterest = prev.householdDebt * (rate + 0.006)
    const depositInterest = prev.deposits * world.ecbRate * 0.5
    const interestBy = Object.fromEntries(HOLDERS.map((h) => [h, holders[h] * effectiveRate])) as Record<Holder, number>
    const bankProfit = firmInterest + mortgageInterest + interestBy.banques - depositInterest
    const bankDividends = 0.5 * Math.max(0, bankProfit)

    // Sécurité sociale et transferts
    const unemployed = laborForce - employment
    const pensions = retirees * prev.avgPension * (1 + inflation * policy.pensionIndexation)
    const unemploymentBenefits = (BASE.unemploymentBenefits / (BASE.workingAge * BASE.participation * 0.077)) * unemployed * (policy.unemploymentReplacement / BASE_POLICY.unemploymentReplacement) * (avgWage / initialCarry().avgWage)
    const family = BASE.familyBenefits * trend * popIndex
    const minima = BASE.minima * trend + minimaBoost
    const otherTransfers = BASE.otherTransfers * trend

    // Ménages, tranche par tranche
    const wageShare = byGroup((k) => GP.wages[k] * (1 + (k === 'g1' ? 0.6 : k === 'g2' ? 0.25 : k === 'g5' ? -0.12 : -0.08) * policy.smicBoost))
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
    const csgBase = byGroup((k) => wagesOf(k) + mixed * GP.mixed[k] + pensions * GP.pensions[k] * 0.8)
    const csgRatio = BASE.csgRevenue / (BASE.grossWages + BASE.mixedIncome + BASE.pensions * 0.8) / BASE_POLICY.csg
    const csg = byGroup((k) => csgBase[k] * policy.csg * csgRatio)
    const irBase = BASE.incomeTaxRevenue / (BASE.grossWages + BASE.mixedIncome + BASE.pensions + 180)
    const incomeTax = byGroup((k) => {
      const taxable = wagesOf(k) + mixed * GP.mixed[k] + pensions * GP.pensions[k] + (dividendsHome + bankDividends) * GP.dividends[k]
      const rate = irBase * 5 * GP.incomeTax[k] / GP.population[k] * 0.2
      const top = k === 'g5' ? policy.incomeTaxTop : k === 'g4' ? policy.incomeTaxTop * 0.25 : 0
      return taxable * (rate + top)
    })
    const wealthTax = policy.wealthTax * wealthTaxBase(wealth.g5) + (BASE.ifiRevenue * trend)
    const inheritance = BASE.inheritanceFlows * trend
    const inheritanceTax = inheritance * policy.inheritanceTax * (1 - 0.5 * Math.max(0, policy.inheritanceTax - 0.1))
    const otherHouseholdTaxes = BASE.otherHouseholdTaxes * trend
    const foodContribution = foodTransfer
    const disposable = byGroup((k) => {
      const share = GP.population[k]
      const taxes =
        employeeContrib[k] +
        csg[k] +
        incomeTax[k] +
        (k === 'g5' ? wealthTax : 0) +
        otherHouseholdTaxes * share +
        foodContribution * (csgBase[k] / sum(csgBase)) +
        mortgageInterest * GP.wages[k]
      return income[k] - taxes
    })
    // Les droits de succession sont prélevés sur le patrimoine transmis, pas sur le revenu.
    const inheritanceTaxBy = byGroup((k) => inheritanceTax * (k === 'g5' ? 0.6 : k === 'g4' ? 0.35 : 0.05 / 3))

    // Consommation : la tendance, plus la réaction à un revenu au-dessus ou en dessous de la normale
    const anchorsNow: Anchors = anchors ?? { yd: disposable, c: byGroup(() => 0), ydTotal: sum(disposable) }
    const normal = (k: keyof ByGroup) => anchorsNow.yd[k] * trend * (popIndex)
    const baseC = anchors ? anchors.c : byGroup(() => 0)
    const consumption = byGroup((k) => {
      if (!anchors) {
        // Répartition de la consommation de 2025 selon la propension à consommer de chaque tranche.
        const weight = GP.mpc[k] * 0.6 + 0.4
        const weights = sum(byGroup((j) => (GP.mpc[j] * 0.6 + 0.4) * disposable[j]))
        return (BASE.consumption * weight * disposable[k]) / weights
      }
      const food = foodTransfer * GP.population[k]
      const deviation = disposable[k] - normal(k) - food
      const wealthEffect = 0.01 * (wealth[k] - BASE.householdFinancialWealth * GP.wealth[k] * trend)
      // Les ménages lissent : seule une partie de l'écart de revenu passe tout de suite en consommation.
      return Math.max(0, (baseC[k] * trend * popIndex + 0.55 * GP.mpc[k] * deviation + food + wealthEffect) * (1 - world.demandShock))
    })
    const totalConsumption = sum(consumption)

    // Investissement des entreprises et des ménages
    const growthSignal = init ? 0 : real / prev.gdpReal - 1 - (BASE.productivityGrowth + 0.003)
    const investment =
      BASE.investment *
      trend *
      clamp(1 + 0.6 * growthSignal - 2 * (loanRate - baseRate) - 0.6 * (policy.corporateTax - BASE_POLICY.corporateTax) + 0.5 * policy.savingsToFirms - capitalFlight, 0.4, 1.6) *
      (1 - creditCrunch) *
      // Après un défaut, les entreprises investissent moins : tout actif français paraît plus risqué.
      (1 - 0.04 * stigma) *
      (1 - 1.5 * world.demandShock) +
      // Électrifier coûte : bornes, pompes à chaleur, réseaux, véhicules (≈ 15 Md€ par point de rythme en plus).
      15 * 100 * Math.max(0, policy.electrification - BASE_POLICY.electrification) * trend
    const housing = BASE.housing * trend * popIndex * clamp(1 - 4 * (rate - baseRate), 0.4, 1.4) * (1 - creditCrunch)

    // Commerce extérieur et énergie
    const competitiveness = Math.pow(priceLevel / worldPrice, -1)
    const retaliation = 0.5 * 0.4 * policy.tariffs + 0.01 * (policy.tariffChinaEV - BASE_POLICY.tariffChinaEV)
    const exports = BASE.exports * worldIndex * worldPrice * competitiveness * (1 - retaliation) * (1 - 0.12 * (electricityPrice - 1))
    const absorption = totalConsumption + housing + investment + publicGoods + exports
    const importRatio = BASE.importsNonEnergy / (BASE.consumption + BASE.housing + BASE.investment + BASE_PUBLIC_GOODS + BASE.exports)
    const overheating = 1 + 2 * Math.max(0, real / potential - 1.02)
    const imports = importRatio * absorption * (1 - 1.2 * 0.45 * policy.tariffs) * overheating
    // On consomme un peu moins de pétrole quand il est cher (élasticité-prix ≈ −0,2).
    const energyImports = BASE.energyImports * Math.pow(world.oil / BASE.oil, 0.8) * (fossilShare / BASE.fossilShare) * Math.pow(real / BASE.gdp, 0.6) * worldPrice

    const demand = totalConsumption + housing + investment + publicGoods + exports - imports - energyImports

    // État et Sécurité sociale
    const interest = sumRecord(interestBy)
    const bceDividend = interestBy.bce
    const euContribution = BASE.euContribution * trend
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
      foodContribution,
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
      inheritanceTaxBy,
      wealthTax,
      csgBase,
    }
  }

  const d = detail!
  // L'année de départ fixe les repères de comportement.
  const anchorsOut: Anchors = anchors ?? { yd: d.disposable, c: d.consumption, ydTotal: sum(d.disposable) }
  const deficit = d.spending - d.revenue

  // — 5. Financement de la dette : qui prête à l'État cette année ?
  const debtBefore = sumRecord(holders)
  const shareAbroad = 0.55 * Math.exp(-0.35 * (panic + stigma + 2 * shun))
  const qt = init ? 0 : holders.bce * 0.08
  const fromBce = policy.monetization * deficit - qt
  const fromAbroad = shareAbroad * (deficit - policy.monetization * deficit)
  const fromBanks = 0.1 * deficit * (1 - creditCrunch)
  holders.bce += init ? 0 : fromBce
  holders.monde += init ? 0 : fromAbroad
  holders.banques += init ? 0 : fromBanks
  holders.assureurs += init ? 0 : deficit - fromBce - fromAbroad - fromBanks
  const debt = init ? debtBefore : sumRecord(holders)

  // — 6. Bilans de fin d'année
  for (const k of GROUPS) {
    const saving = d.disposable[k] - d.consumption[k] - d.housing * GP.wealth[k]
    wealth[k] = (wealth[k] + (init ? 0 : saving) - (init ? 0 : d.inheritanceTaxBy[k])) * (init ? 1 : 1 + inflation * 0.5)
  }
  const firmDebt = init ? prev.firmDebt : prev.firmDebt + d.investment - d.retained
  bankCapital = init ? bankCapital : bankCapital + d.bankProfit - d.bankDividends
  const householdDebt = init ? prev.householdDebt : prev.householdDebt * (1 + inflation) + 0.2 * d.housing - 0.05 * prev.householdDebt
  const deposits = init ? prev.deposits : prev.deposits * (1 + inflation)
  const currentAccount = d.exports + d.foreignIncome - d.imports - d.energyImports - d.dividendsAbroad - d.interestBy.monde - d.euContribution

  // — 7. Inégalités, pauvreté, espérance de vie
  // Prix vus par chaque tranche : la TVA et l'énergie pèsent plus lourd quand on dépense tout son revenu.
  const groupPrice = byGroup((k) => {
    const spendShare = d.consumption[k] / Math.max(1, d.disposable[k])
    return priceLevel * (1 + (0.7 * (policy.vat - BASE_POLICY.vat)) / 1.2 * (spendShare - 0.83) + 0.04 * (energyPrice - 1) * (k === 'g1' ? 1 : k === 'g2' ? 0.6 : k === 'g5' ? -0.6 : 0))
  })
  const perCapita = byGroup((k) => (d.disposable[k] / (population * GP.population[k])) * (1000 / groupPrice[k]))
  const dist = distribution(perCapita, GP.population, GP.sigma)
  const basePoverty = 0.154
  if (!init) {
    lifeExpectancy -= 0.15 * (dist.poverty - basePoverty) * 100 * 0.1
  }
  const lifeGap = BASE.lifeGap * Math.pow(perCapita.g5 / perCapita.g1 / 4.6, 0.35)

  // — 8. Matrice des flux (chaque euro a un payeur et un receveur)
  const t = d.taxes
  const flowsList = ([
    { from: 'menages', to: 'entreprises', amount: d.totalConsumption + d.housing, label: 'Consommation et logement' },
    { from: 'entreprises', to: 'menages', amount: d.grossWages + d.mixed + d.dividendsHome, label: 'Salaires, revenus d’indépendants, dividendes' },
    { from: 'menages', to: 'etat', amount: t.incomeTax + t.wealthTax + t.inheritanceTax + t.otherHouseholdTaxes, label: 'Impôts des ménages' },
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
  const growth = init ? 0.008 : gdpReal / prev.gdpReal - 1
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
      Santé: g(policy.health + policy.prevention),
      Éducation: g(policy.education),
      Défense: g(policy.defence),
      'Investissement public': g(policy.investment),
      'Autres services publics': g(policy.otherServices),
      'Chômage, famille, minima': d.transfers.unemploymentBenefits + d.transfers.family + d.transfers.minima + d.transfers.otherTransfers,
      'Sécurité sociale de l’alimentation': d.transfers.foodTransfer,
      'Aides aux entreprises': d.firmAid,
      'Charge de la dette': d.interest,
      'Contribution à l’UE': d.euContribution,
    },
    taxes: {
      TVA: t.tva,
      'Cotisations sociales': t.employerContributions + t.employeeContributions,
      CSG: t.csg,
      'Impôt sur le revenu': t.incomeTax,
      'Impôt sur les sociétés': t.corporateTax,
      'Impôts de production': t.productionTaxes,
      'Patrimoine et succession': t.wealthTax + t.inheritanceTax,
      'Cotisation alimentation': t.foodContribution,
      'Autres recettes': t.otherHouseholdTaxes + t.nonTax + t.bceDividend,
    },
    secu: {
      Retraite: { revenue: (t.employerContributions + t.employeeContributions) * 0.55 + t.csg * 0.1, spending: d.transfers.pensions },
      Maladie: { revenue: (t.employerContributions + t.employeeContributions) * 0.33 + t.csg * 0.6 + t.tva * 0.25, spending: g(policy.health + policy.prevention) },
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
    avgPension: prev.avgPension * (1 + inflation * policy.pensionIndexation + (init ? 0 : 0.003)),
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
    educationStock: prev.educationStock + 0.1 * ((policy.education - BASE_POLICY.education) / BASE_POLICY.education - prev.educationStock),
    preventionStock,
    healthStock,
    capitalFlight,
    consumption: d.consumption,
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
}

/** La politique en vigueur une année donnée : la politique de 2025, puis les décisions dans l'ordre. */
export function policyAt(decisions: Decision[], year: number): Policy {
  let policy = { ...BASE_POLICY }
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
  }
  return world
}

/** Simule la France de 2025 jusqu'à `until`, en appliquant les décisions et les événements. */
export function simulate({ decisions, events, until }: SimulationInput): YearState[] {
  const states: YearState[] = []
  let carry = initialCarry()
  let anchors: Anchors | null = null
  for (let year = BASE.year; year <= until; year += 1) {
    const policy = policyAt(decisions, year)
    const cancelDecision = decisions.find((d) => d.year === year && (d.patch.cancelShare ?? 0) > 0)
    const cancel = cancelDecision ? { share: cancelDecision.patch.cancelShare ?? 0, holder: cancelDecision.patch.cancelHolder ?? policy.cancelHolder } : null
    const result = step(carry, policy, worldAt(events, year), anchors, year === BASE.year ? null : cancel)
    states.push(result.state)
    carry = result.carry
    anchors = result.anchors
  }
  return states
}
