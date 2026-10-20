import { describe, expect, it } from 'vitest'
import { explainYear } from './explain'

describe('pourquoi la France en est là', () => {
  it('attribue chaque effet à sa cause, et mesure ce que leur combinaison ajoute', async () => {
    const input = {
      decisions: [{ year: 2026, patch: { vat: 0.25, minima: 30 } }],
      events: [
        { id: 'heatwave', year: 2030 },
        { id: 'financial-crisis', year: 2031 },
      ],
    }
    const r = await explainYear(input, 2032, { unemployment: (s) => s.unemployment, poverty: (s) => s.poverty })
    const u = r!.unemployment
    const ids = u.contributions.map((c) => c.cause.id)
    expect(ids).toContain('decision:vat')
    expect(ids).toContain('event:financial-crisis:2031')
    // La crise financière est la grande responsable du chômage en plus.
    expect(u.contributions[0].cause.id).toBe('event:financial-crisis:2031')
    expect(u.contributions[0].value).toBeGreaterThan(0.005)
    // Les minima sociaux font reculer la pauvreté.
    const minima = r!.poverty.contributions.find((c) => c.cause.id === 'decision:minima')!
    expect(minima.value).toBeLessThan(0)
    // Tendance + causes + combinaison = la valeur réelle.
    const sum = u.trend + u.contributions.reduce((a, c) => a + c.value, 0) + u.combination
    expect(sum).toBeCloseTo(u.value, 10)
  })
})
