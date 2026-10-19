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

  it('cancelling debt held abroad does not lower the debt for long: rates rise', () => {
    const { s, b } = at({ cancelShare: 0.5, cancelHolder: 'monde' })
    const cancelled = (base[1].holders.monde * 0.5) / base[1].gdp
    // La dette baisse moins que ce qui a été effacé, le déficit et les taux montent, le PIB recule.
    expect(b.debtRatio - s.debtRatio).toBeLessThan(cancelled * 0.8)
    expect(s.deficit / s.gdp).toBeGreaterThan(b.deficit / b.gdp)
    expect(s.gdpReal).toBeLessThan(b.gdpReal)
  })

  it('cancelling central-bank debt brings almost no budget gain', () => {
    const { s, b } = at({ cancelShare: 1, cancelHolder: 'bce' })
    expect(Math.abs(s.deficit / s.gdp - b.deficit / b.gdp)).toBeLessThan(0.005)
  })

  it('retiring at 60 costs money and output', () => {
    const { s, b } = at({ retirementAge: 60 })
    expect(s.gdpReal).toBeLessThan(b.gdpReal)
    expect(s.deficit / s.gdp).toBeGreaterThan(b.deficit / b.gdp + 0.01)
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
