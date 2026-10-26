import { describe, expect, it } from 'vitest'
import { afterPresidential, canDissolve, canForce, canReferendum, capitalShift, dissolve, force, legislativeSeats, majorityOf, referendum, referendumChance, START_POLITICS } from './parliament'

describe("l'Assemblée et les jokers du pouvoir", () => {
  it('un président élu largement et populaire obtient une majorité absolue ; mal élu et impopulaire, une cohabitation', () => {
    const seeds = [1, 2, 3, 4, 5, 6]
    for (const seed of seeds) {
      expect(majorityOf(legislativeSeats(60, 60, seed, 2027))).toBe('absolue')
      expect(majorityOf(legislativeSeats(51, 35, seed, 2027))).toBe('cohabitation')
    }
  })

  it('la majorité change le capital politique de chaque année', () => {
    const p = START_POLITICS(2025)
    expect(capitalShift({ ...p, seats: 320 }, 2028).total).toBe(2)
    expect(capitalShift({ ...p, seats: 250 }, 2028).total).toBe(0)
    expect(capitalShift({ ...p, seats: 180 }, 2028).total).toBe(-2)
  })

  it('le 49.3 : une fois par an ; la censure guette surtout sans majorité, et coûte cher', () => {
    const counts = { absolue: 0, cohabitation: 0 }
    for (let seed = 0; seed < 200; seed += 1) {
      counts.absolue += force({ ...START_POLITICS(2025), seats: 330 }, 2029, seed).censured ? 1 : 0
      counts.cohabitation += force({ ...START_POLITICS(2025), seats: 180 }, 2029, seed).censured ? 1 : 0
    }
    expect(counts.cohabitation).toBeGreaterThan(counts.absolue * 5)
    const { politics, censured } = force(START_POLITICS(2025), 2029, 7)
    expect(canForce(politics, 2029)).toBe(false)
    expect(canForce(politics, 2030)).toBe(true)
    expect(capitalShift(politics, 2029).total).toBe(censured ? -2 : -1)
  })

  it('le référendum : une fois par mandat ; le oui suit la popularité', () => {
    expect(referendumChance(70)).toBeGreaterThan(referendumChance(45))
    const { politics } = referendum(START_POLITICS(2025), 2029, 3, 55)
    expect(canReferendum(politics, 2030)).toBe(false)
    expect(canReferendum(politics, 2033)).toBe(true)
  })

  it('la dissolution : une fois par mandat, pas juste après des législatives, et elle suit la popularité du moment', () => {
    const p = afterPresidential(START_POLITICS(2025), 2027, 55, 55, 1)
    expect(canDissolve(p, 2027)).toBe(false)
    expect(canDissolve(p, 2029)).toBe(true)
    const after = dissolve(p, 2029, 1, 30)
    expect(majorityOf(after.seats)).toBe('cohabitation')
    expect(canDissolve(after, 2031)).toBe(false)
    expect(canDissolve(after, 2033)).toBe(true)
  })
})
