import { describe, expect, it } from 'vitest'
import { simulate } from './sim'

const base = simulate({ decisions: [], events: [], until: 2040 })

describe('baseline', () => {
  it('closes the accounts every year: what one actor pays, another receives', () => {
    for (const s of base) {
      expect(Math.abs(s.closure), String(s.year)).toBeLessThan(0.5)
    }
  })

  it('starts close to France in 2025', () => {
    const s = base[0]
    console.log('2025', { gdp: s.gdp, deficit: s.deficit / s.gdp, debt: s.debtRatio, u: s.unemployment, poverty: s.poverty, gini: s.gini, d9d1: s.ratioD9D1, cons: s.consumption, rev: s.revenue, spend: s.spending })
    expect(s.gdp).toBeGreaterThan(2900)
    expect(s.gdp).toBeLessThan(3100)
  })

  it('prints the baseline path', () => {
    for (const s of base) {
      console.log(s.year, 'g', (s.growth * 100).toFixed(2), 'π', (s.inflation * 100).toFixed(2), 'u', (s.unemployment * 100).toFixed(1), 'def', ((s.deficit / s.gdp) * 100).toFixed(2), 'debt', (s.debtRatio * 100).toFixed(1), 'rate', (s.rate * 100).toFixed(2), 'pov', (s.poverty * 100).toFixed(1), 'gini', s.gini.toFixed(3), 'LE', s.lifeExpectancy.toFixed(1), 'ret', s.retirees.toFixed(1), 'wa', s.workingAge.toFixed(1))
    }
  })
})

describe('mechanisms', () => {
  const at = (patch: Parameters<typeof simulate>[0]['decisions'][0]['patch'], year = 2035) => {
    const s = simulate({ decisions: [{ year: 2026, patch }], events: [], until: year })
    return { s: s[s.length - 1], b: base.find((x) => x.year === year)! }
  }

  it('taxing the rich to give to the poor lowers poverty and inequality', () => {
    const { s, b } = at({ wealthTax: 0.02, incomeTaxTop: 0.05, minima: 30 })
    expect(s.poverty).toBeLessThan(b.poverty - 0.005)
    expect(s.gini).toBeLessThan(b.gini - 0.01)
  })

  it('defaulting on foreign holders costs growth and raises deficits for years', () => {
    const run = simulate({ decisions: [{ year: 2026, patch: { cancelShare: 0.5, cancelHolder: 'monde' } }], events: [], until: 2035 })
    const s = run[run.length - 1]
    const b = base.find((x) => x.year === 2035)!
    const cancelled = (base[1].holders.monde * 0.5) / base[1].gdp
    const avgDeficit = (states: typeof base) => states.filter((x) => x.year >= 2026 && x.year <= 2030).reduce((acc, x) => acc + x.deficit / x.gdp, 0) / 5
    // La dette baisse moins que ce qui a été effacé ; les premières années, taux et déficit montent et le PIB recule.
    expect(b.debtRatio - s.debtRatio).toBeLessThan(cancelled * 0.8)
    expect(avgDeficit(run)).toBeGreaterThan(avgDeficit(base))
    expect(run[1].gdpReal).toBeLessThan(base[1].gdpReal * 0.985)
    expect(run[3].rate).toBeGreaterThan(base[3].rate + 0.01)
    expect(s.debtRatio).toBeLessThan(b.debtRatio)
  })

  it('cancelling central-bank debt brings almost no budget gain', () => {
    const { s, b } = at({ cancelShare: 1, cancelHolder: 'bce' })
    expect(Math.abs(s.deficit / s.gdp - b.deficit / b.gdp)).toBeLessThan(0.005)
  })

  it('retiring at 60 costs money and output', () => {
    const { s, b } = at({ retirementAge: 60 })
    expect(s.gdpReal).toBeLessThan(b.gdpReal)
    expect(s.deficit / s.gdp).toBeGreaterThan(b.deficit / b.gdp + 0.008)
  })

  it('zero migration shrinks the economy over time', () => {
    const { s, b } = at({ netMigration: 0 })
    expect(s.gdpReal).toBeLessThan(b.gdpReal * 0.98)
  })

  it('stays finite under every extreme', () => {
    const { s } = at({ wealthTax: 0.05, inheritanceTax: 1, corporateTax: 0, vat: 0.3, monetization: 1, tariffs: 0.4, netMigration: -100, retirementAge: 60, foodSecurity: 300, smicBoost: 0.5 })
    for (const v of [s.gdp, s.debt, s.unemployment, s.inflation, s.poverty, s.gini]) {
      expect(Number.isFinite(v)).toBe(true)
    }
    expect(Math.abs(s.closure)).toBeLessThan(0.5)
  })
})

describe('crises, colère et fin de partie', () => {
  const run = (patch: Parameters<typeof simulate>[0]['decisions'][0]['patch'], until = 2075) => simulate({ decisions: [{ year: 2026, patch }], events: [], until })

  it('sans rien changer : le pays tient vingt ans, puis crises de la dette, austérité et réchauffement finissent par le faire craquer', () => {
    const s = simulate({ decisions: [], events: [], until: 2075 })
    const first = s.find((x) => x.debtCrisis)
    expect(first?.year).toBeGreaterThan(2040)
    expect(Math.max(...s.map((x) => x.debtRatio))).toBeLessThan(2.3)
    expect(s.find((x) => x.ending)?.year ?? 2100).toBeGreaterThan(2045)
  })

  it('la rigueur évite la crise de la dette', () => {
    expect(run({ otherServices: 230, investment: 120, pensionIndexation: 0.8 }).some((x) => x.debtCrisis)).toBe(false)
  })

  it('tous les impôts au maximum : le pays se soulève dès la première année', () => {
    const s = run({ vat: 0.3, incomeTaxTop: 0.15, csg: 0.14, corporateTax: 0.4 }, 2030)
    expect(s.find((x) => x.ending)?.ending).toBe('revolte')
    expect(s.find((x) => x.ending)?.year).toBe(2026)
  })

  it('des impôts massifs rapportent moins que prévu : la fraude progresse', () => {
    const s = run({ vat: 0.3, csg: 0.14 }, 2030).at(-1)!
    expect(s.evasion).toBeGreaterThan(0.035)
  })

  it('refuser toute aide européenne en creusant les déficits mène à la faillite', () => {
    expect(run({ crisisResponse: 1, retirementAge: 60 }).find((x) => x.ending)?.ending).toBe('faillite')
  })

  it('orienter les aides vers les PME fait investir davantage, à budget égal', () => {
    const base = simulate({ decisions: [], events: [], until: 2030 }).at(-1)!
    const s = run({ firmAidSmeShare: 0.9 }, 2030).at(-1)!
    expect(s.firms.pme.investment).toBeGreaterThan(base.firms.pme.investment * 1.02)
    expect(s.firms.ge.investment).toBeLessThan(base.firms.ge.investment)
    expect(s.investment / s.priceLevel).toBeGreaterThan(base.investment / base.priceLevel)
  })

  it('un resserrement du crédit frappe d’abord les PME', () => {
    const base = simulate({ decisions: [], events: [], until: 2028 }).at(-1)!
    const s = run({ cancelShare: 1, cancelHolder: 'banques' }, 2028).at(-1)!
    const drop = (c: 'pme' | 'ge') => s.firms[c].investment / base.firms[c].investment - 1
    expect(drop('pme')).toBeLessThan(drop('ge'))
  })
})

describe('immigration : tout est cause et effet', () => {
  const at = (s: ReturnType<typeof simulate>, y: number) => s.find((x) => x.year === y)!

  it('le réchauffement fait monter la pression migratoire au fil des décennies', () => {
    const s = simulate({ decisions: [], events: [], until: 2060 })
    expect(at(s, 2060).migrationPressure.climate).toBeGreaterThan(20)
    expect(at(s, 2060).migrationIrregular).toBeGreaterThan(at(s, 2025).migrationIrregular * 1.4)
  })

  it('une guerre fait bondir les arrivées, puis la pression retombe', () => {
    const s = simulate({ decisions: [], events: [{ id: 'war-europe', year: 2027 }], until: 2040 })
    const b = simulate({ decisions: [], events: [], until: 2040 })
    expect(at(s, 2027).migrationIrregular).toBeGreaterThan(at(b, 2027).migrationIrregular + 40)
    expect(at(s, 2040).migrationIrregular - at(b, 2040).migrationIrregular).toBeLessThan(5)
  })

  it('le contrôle n’empêche qu’une partie des arrivées, quel qu’en soit le prix, et il coûte', () => {
    const s = simulate({ decisions: [{ year: 2026, patch: { borderControl: 20 } }], events: [], until: 2035 })
    const b = simulate({ decisions: [], events: [], until: 2035 })
    expect(at(s, 2035).controlEffect).toBeLessThan(0.5)
    expect(at(s, 2035).migrationIrregular).toBeGreaterThan(at(s, 2035).migrationPressure.base * 0.5)
    expect(at(s, 2035).deficit / at(s, 2035).gdp).toBeGreaterThan(at(b, 2035).deficit / at(b, 2035).gdp)
  })

  it('l’aide au développement et à la paix réduit les départs forcés, lentement', () => {
    const war = [{ id: 'sahel-war', year: 2032 }]
    const s = simulate({ decisions: [{ year: 2026, patch: { developmentAid: 45 } }], events: war, until: 2035 })
    const b = simulate({ decisions: [], events: war, until: 2035 })
    expect(at(s, 2026).peaceEffect).toBeLessThan(at(s, 2035).peaceEffect)
    expect(at(s, 2032).migrationPressure.conflict).toBeLessThan(at(b, 2032).migrationPressure.conflict * 0.85)
  })

  it('l’intégration apaise les tensions d’un accueil plus nombreux', () => {
    const many = { netMigration: 300 }
    const s = simulate({ decisions: [{ year: 2026, patch: { ...many, integration: 10 } }], events: [], until: 2030 })
    const b = simulate({ decisions: [{ year: 2026, patch: many }], events: [], until: 2030 })
    expect(at(s, 2030).discontent).toBeLessThan(at(b, 2030).discontent)
  })
})

describe('influence : la puissance rejaillit sur tout le reste', () => {
  const at = (s: ReturnType<typeof simulate>, y: number) => s.find((x) => x.year === y)!
  const base = simulate({ decisions: [], events: [], until: 2035 })

  it('l’armée, la culture et l’aide renforcent l’influence ; la colère l’affaiblit', () => {
    const strong = simulate({ decisions: [{ year: 2026, patch: { defence: 90, softPower: 15, developmentAid: 25 } }], events: [], until: 2035 })
    const angry = simulate({ decisions: [{ year: 2026, patch: { vat: 0.26, csg: 0.12 } }], events: [], until: 2035 })
    expect(at(strong, 2035).influence).toBeGreaterThan(at(base, 2035).influence + 0.04)
    expect(at(angry, 2030).influence).toBeLessThan(at(base, 2030).influence)
  })

  it('sans rien faire, le poids relatif de la France s’érode lentement (le monde croît plus vite)', () => {
    expect(at(base, 2035).influence).toBeLessThan(1)
    expect(at(base, 2035).influence).toBeGreaterThan(0.9)
  })

  it('une France influente paie un peu moins cher sa dette (à dépense égale)', () => {
    // Les 14 Md€ de rayonnement en plus sont pris sur les autres services publics : seule l'influence change.
    const strong = simulate({ decisions: [{ year: 2026, patch: { softPower: 20, otherServices: 246, developmentAid: 30 } }], events: [], until: 2032 })
    const b = simulate({ decisions: [{ year: 2026, patch: { developmentAid: 30 } }], events: [], until: 2032 })
    expect(at(strong, 2032).riskPremium).toBeLessThan(at(b, 2032).riskPremium)
  })
})

describe('emploi et pauvreté', () => {
  it('quand le chômage baisse, les plus modestes y gagnent : les emplois retrouvés vont surtout à ceux qui étaient au chômage', () => {
    const base = simulate({ decisions: [], events: [], until: 2026 }).at(-1)!
    // Un grand chantier d'investissement public : beaucoup d'emplois, sans transfert direct aux ménages.
    const boom = simulate({ decisions: [{ year: 2026, patch: { investment: 230 } }], events: [], until: 2026 }).at(-1)!
    expect(boom.unemployment).toBeLessThan(base.unemployment - 0.01)
    expect(boom.disposablePerCapita.g1).toBeGreaterThan(base.disposablePerCapita.g1)
  })

  it('une récession coûte aux plus modestes, mais les allocations amortissent (comme en 2009, les revenus du capital des plus aisés chutent davantage)', () => {
    const base = simulate({ decisions: [], events: [], until: 2026 }).at(-1)!
    const cut = simulate({ decisions: [{ year: 2026, patch: { investment: 60, otherServices: 200 } }], events: [], until: 2026 }).at(-1)!
    expect(cut.unemployment).toBeGreaterThan(base.unemployment + 0.01)
    const loss = (g: 'g1' | 'g5') => cut.disposablePerCapita[g] / base.disposablePerCapita[g] - 1
    expect(loss('g1')).toBeLessThan(0)
    expect(loss('g5')).toBeLessThan(loss('g1'))
  })
})

/**
 * Ce que le playtest des scénarios a fait corriger : chaque test fixe le comportement voulu,
 * pour qu'une modification future ne réintroduise pas l'incohérence sans qu'on le voie.
 */
describe('constats du playtest : le modèle reste cohérent', () => {
  type Patch = Parameters<typeof simulate>[0]['decisions'][0]['patch']
  const base = simulate({ decisions: [], events: [], until: 2050 })
  const play = (patch: Patch, until = 2050) => simulate({ decisions: [{ year: 2026, patch }], events: [], until })
  const year = (st: ReturnType<typeof simulate>, y: number) => st.find((s) => s.year === y)!

  it('loi d’Okun réaliste : 1 % d’activité en plus fait baisser le chômage de moins de 0,6 point la même année', () => {
    const s = year(play({ health: 260 }, 2026), 2026)
    const b = year(base, 2026)
    const okun = -(s.unemployment - b.unemployment) / (s.gdpReal / b.gdpReal - 1)
    expect(okun).toBeGreaterThan(0.2)
    expect(okun).toBeLessThan(0.6)
  })

  it('une hausse de TVA réduit le déficit dès la première année, une baisse le creuse', () => {
    expect(year(play({ vat: 0.21 }, 2026), 2026).deficit).toBeLessThan(year(base, 2026).deficit)
    expect(year(play({ vat: 0.135 }, 2026), 2026).deficit).toBeGreaterThan(year(base, 2026).deficit + 20)
  })

  it('l’électrification n’est pas un plan de relance gratuit, et son coût baisse quand il reste peu de fossile', () => {
    const e = play({ electrification: 0.08 })
    expect(year(base, 2026).unemployment - year(e, 2026).unemployment).toBeLessThan(0.01)
    const extra = (y: number) => year(e, y).investment - year(base, y).investment
    expect(extra(2050)).toBeLessThan(0.5 * extra(2026))
  })

  it('le parc nucléaire suit l’objectif avec retard : au plus un point de plus par an', () => {
    const n = play({ nuclearShare: 0.85 }, 2030)
    expect(year(n, 2026).nuclearShare).toBeLessThanOrEqual(0.69 + 1e-9)
    expect(year(n, 2030).nuclearShare).toBeLessThanOrEqual(0.73 + 1e-9)
    expect(year(n, 2026).electricityPrice).toBeGreaterThan(year(base, 2026).electricityPrice - 0.02)
  })

  it('baisser l’âge de départ ne crée pas des millions de retraités en un an', () => {
    expect(year(play({ retirementAge: 60 }, 2026), 2026).retirees - year(base, 2026).retirees).toBeLessThan(1)
  })

  it('des droits de succession à 100 % ne sont pas une manne : l’assiette fond', () => {
    expect(year(base, 2026).deficit - year(play({ inheritanceTax: 1 }, 2026), 2026).deficit).toBeLessThan(30)
  })

  it('un an de gel des retraites se sent tout de suite dans le climat social', () => {
    const st = simulate({ decisions: [{ year: 2026, patch: { pensionIndexation: 0 } }, { year: 2027, patch: { pensionIndexation: 1 } }], events: [], until: 2026 })
    expect(year(st, 2026).discontent - year(base, 2026).discontent).toBeGreaterThan(0.02)
  })

  it('la popularité peut monter : de bonnes nouvelles apaisent le pays', () => {
    const good = play({ minima: 30, foodSecurity: 100 }, 2027)
    expect(year(good, 2027).discontent).toBeLessThan(year(base, 2027).discontent)
  })

  it('un krach bancaire resserre le crédit', () => {
    const st = simulate({ decisions: [], events: [{ year: 2028, id: 'financial-crisis' }], until: 2028 })
    expect(year(st, 2028).creditCrunch).toBeGreaterThan(0.05)
  })

  it('nationaliser ne rapporte pas plus que ce que coûte la dette émise pour le faire, plus 3 points', () => {
    const s = year(play({ publicOwnership: 0.6 }, 2026), 2026)
    const bonds = (0.6 - 0.1) * 2500
    expect(s.taxes['Dividendes des entreprises publiques (en plus)'] / bonds).toBeLessThan(s.effectiveRate + 0.03)
  })

  it('supprimer les aides aux entreprises coûte des emplois (elles allègent en partie le coût du travail)', () => {
    expect(year(play({ firmAid: 0 }, 2027), 2027).unemployment).toBeGreaterThan(year(base, 2027).unemployment + 0.004)
  })

  it('une récession brève ne déclenche pas à elle seule une crise de la dette (2009 n’en a pas provoqué)', () => {
    const st = simulate({ decisions: [], events: [{ year: 2028, id: 'recession' }], until: 2031 })
    expect(st.some((s) => s.debtCrisis)).toBe(false)
  })

  it('des droits de douane de 40 % ne font pas 10 points d’inflation : seule la part importée renchérit', () => {
    expect(year(play({ tariffs: 0.4 }, 2026), 2026).inflation - year(base, 2026).inflation).toBeLessThan(0.05)
  })

    it('la planche à billets coûte en compétitivité, sans provoquer une dépression', () => {
    const m = play({ monetization: 1 }, 2036)
    expect(year(m, 2036).unemployment - year(base, 2036).unemployment).toBeLessThan(0.05)
    expect(year(m, 2028).inflation).toBeGreaterThan(year(base, 2028).inflation)
  })

  it('une sécurité sociale de l’alimentation financée par sa cotisation ne creuse pas le déficit', () => {
    const f = play({ foodSecurity: 250 }, 2035)
    expect(year(f, 2035).deficit / year(f, 2035).gdp).toBeLessThan(year(base, 2035).deficit / year(base, 2035).gdp + 0.005)
    expect(year(f, 2035).poverty).toBeLessThan(year(base, 2035).poverty - 0.01)
  })

    it('le prix de l’électricité et le baril de référence ne cachent pas de crise en 2026', () => {
    expect(year(base, 2026).oil).toBeLessThan(80)
  })
})
