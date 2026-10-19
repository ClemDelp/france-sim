import { describe, expect, it } from 'vitest'
import { analyzeRobustness, HYPOTHESES, type Metric } from './robustness'

const metrics: Metric[] = [
  { id: 'poverty', label: 'Pauvreté', value: (s) => s.poverty, epsilon: 0.001 },
  { id: 'gdp', label: 'PIB', value: (s) => s.gdpReal / s.priceLevel, epsilon: 1 },
  { id: 'deficit', label: 'Déficit', value: (s) => s.deficit / s.gdp, epsilon: 0.001 },
]

describe('solidité d’un résultat', () => {
  it('liste les hypothèses du modèle', () => {
    expect(HYPOTHESES.length).toBeGreaterThan(40)
    expect(HYPOTHESES.some((h) => h.id === 'mobility' && h.keys.length === 3)).toBe(true)
  })

  it('taxer les riches réduit la pauvreté quelles que soient les hypothèses ; l’effet sur le déficit dépend d’hypothèses (fuite des capitaux…)', async () => {
    const t0 = Date.now()
    const r = await analyzeRobustness({ decisions: [{ year: 2026, patch: { wealthTax: 0.02, incomeTaxTop: 0.05, minima: 30 } }], events: [], until: 2035 }, metrics)
    const ms = Date.now() - t0
    console.log(`${HYPOTHESES.length} hypothèses en ${ms} ms`)
    for (const x of r!) {
      console.log(x.metric.label, x.verdict, x.effect.toFixed(4), x.low.toFixed(4), x.high.toFixed(4), x.drivers.map((d) => `${d.id} ${d.low.toFixed(4)}/${d.high.toFixed(4)}`).join(' ; '))
    }
    const poverty = r!.find((x) => x.metric.id === 'poverty')!
    expect(poverty.effect).toBeLessThan(0)
    expect(poverty.high).toBeLessThan(0)
  }, 30000)
})
