import { describe, expect, it } from 'vitest'
import { BASE_POLICY } from './calibration'
import { chanceOf, EVENTS, random, rollEvents } from './events'
import { simulate } from './sim'

/** Les délais du monde réel : ce qu'aucune décision ne peut accélérer (audit de cohérence). */
describe('les délais du monde réel', () => {
  it('relancer le nucléaire : pas de nouveau réacteur avant 2038 (Penly), puis la part monte', () => {
    const states = simulate({ decisions: [{ year: 2026, patch: { nuclearShare: 0.85 } }], events: [], until: 2045 })
    const at = (y: number) => states.find((s) => s.year === y)!.nuclearShare
    expect(at(2035)).toBeLessThanOrEqual(0.72 + 1e-9)
    expect(at(2045)).toBeGreaterThan(0.75)
  })
})

describe('les ordres de grandeur économiques', () => {
  it('un droit de douane de 10 % coûte de l’activité au pays qui l’impose (il ne la stimule pas)', () => {
    const base = simulate({ decisions: [], events: [], until: 2030 })
    const taxed = simulate({ decisions: [{ year: 2026, patch: { tariffs: 0.1 } }], events: [], until: 2030 })
    for (const i of [1, 2, 5]) {
      expect(taxed[i].gdpReal).toBeLessThan(base[i].gdpReal)
    }
  })
})

/** Ce que l'audit de cohérence a corrigé : chaque test dit quel fait réel il protège. */
describe('audit de cohérence : les rendements des impôts', () => {
  const base = simulate({ decisions: [], events: [], until: 2026 })[1]
  const once = (patch: Record<string, number>) => simulate({ decisions: [{ year: 2026, patch }], events: [], until: 2026 })[1]
  const tax = (s: typeof base, name: string) => s.taxes[name]

  it('un point de TVA (taux normal) rapporte environ 7 Md€, pas 11 (taux réduits : Terra Nova)', () => {
    const gain = tax(once({ vat: BASE_POLICY.vat + 0.01 }), 'TVA') - tax(base, 'TVA')
    expect(gain).toBeGreaterThan(5)
    expect(gain).toBeLessThan(9)
  })

  it('une baisse de TVA est bien moins répercutée sur les prix qu’une hausse (restauration 2009)', () => {
    const up = once({ vat: BASE_POLICY.vat + 0.01 }).inflation - base.inflation
    const down = base.inflation - once({ vat: BASE_POLICY.vat - 0.01 }).inflation
    expect(down).toBeLessThan(up * 0.6)
  })

  it('un point d’impôt en plus sur les plus aisés rapporte 3 à 6 Md€ (les dividendes paient le PFU)', () => {
    const gain = tax(once({ incomeTaxTop: BASE_POLICY.incomeTaxTop + 0.01 }), 'Impôt sur le revenu') - tax(base, 'Impôt sur le revenu')
    expect(gain).toBeGreaterThan(3)
    expect(gain).toBeLessThan(6)
  })

  it('la taxe carbone ne touche qu’une partie des émissions (≈ 8 Md€ à 44,6 €/t, soit ≈ 180 Mt taxées)', () => {
    const gain = tax(once({ carbonTax: 100 }), 'Taxe carbone (en plus de 2025)')
    // 55,4 €/t en plus sur ≈ 180-200 Mt : 10 à 12 Md€, pas 15.
    expect(gain).toBeGreaterThan(8)
    expect(gain).toBeLessThan(13)
  })
})

describe('audit de cohérence : les délais et les comportements', () => {
  it('la taxe carbone réduit la consommation peu à peu : l’effet de la 5e année dépasse nettement celui de la 1re (INSEE)', () => {
    const base = simulate({ decisions: [], events: [], until: 2030 })
    const taxed = simulate({ decisions: [{ year: 2026, patch: { carbonTax: 100 } }], events: [], until: 2030 })
    const cut = (i: number) => base[i].frenchEmissions - taxed[i].frenchEmissions
    expect(cut(5)).toBeGreaterThan(cut(1) * 1.8)
  })

  it('un revenu durablement plus haut finit par être dépensé : l’effet d’une hausse des minima ne s’effondre pas la 2e année', () => {
    const base = simulate({ decisions: [], events: [], until: 2027 })
    const more = simulate({ decisions: [{ year: 2026, patch: { minima: 30 } }], events: [], until: 2027 })
    const gain = (i: number) => more[i].gdpReal / base[i].gdpReal - 1
    expect(gain(2)).toBeGreaterThan(gain(1) * 0.8)
  })

  it('une petite mesure fait bouger le taux de pauvreté (il ne saute plus par paliers de 0,07 point)', () => {
    const base = simulate({ decisions: [], events: [], until: 2026 })[1]
    const more = simulate({ decisions: [{ year: 2026, patch: { minima: 2 } }], events: [], until: 2026 })[1]
    expect(more.poverty).toBeLessThan(base.poverty)
    expect(base.poverty - more.poverty).toBeLessThan(0.002)
  })

  it('une assurance chômage plus généreuse relève un peu le chômage d’équilibre (OCDE, DARES)', () => {
    const base = simulate({ decisions: [], events: [], until: 2032 }).at(-1)!
    const generous = simulate({ decisions: [{ year: 2026, patch: { unemploymentReplacement: 0.67 } }], events: [], until: 2032 }).at(-1)!
    expect(generous.unemployment - base.unemployment).toBeGreaterThan(0.002)
    expect(generous.unemployment - base.unemployment).toBeLessThan(0.01)
  })

  it('l’immigration n’ajoute que modérément au chômage (taux des immigrés ≈ 12 % contre 7 %)', () => {
    const base = simulate({ decisions: [], events: [], until: 2035 }).at(-1)!
    const more = simulate({ decisions: [{ year: 2026, patch: { netMigration: 220 } }], events: [], until: 2035 }).at(-1)!
    expect(more.unemployment - base.unemployment).toBeLessThan(0.004)
  })
})

describe('audit de cohérence : les chocs du monde', () => {
  const gdpCost = (id: string) => {
    const base = simulate({ decisions: [], events: [], until: 2027 })[2]
    const hit = simulate({ decisions: [], events: [{ year: 2027, id }], until: 2027 })[2]
    return 1 - hit.gdpReal / base.gdpReal
  }

  it('une catastrophe climatique coûte surtout des biens, peu d’activité (2022 : ≈ 10 Md€ de dommages assurés)', () => {
    for (const id of ['heatwave', 'drought', 'floods', 'wildfires', 'storm']) {
      expect(gdpCost(id), id).toBeLessThan(0.004)
    }
  })

  it('une pandémie : récession forte, mais le chômage partiel garde les emplois (2020 : chômage à 8 %)', () => {
    const base = simulate({ decisions: [], events: [], until: 2027 })[2]
    const hit = simulate({ decisions: [], events: [{ year: 2027, id: 'pandemic' }], until: 2027 })[2]
    expect(hit.gdpReal / base.gdpReal - 1).toBeLessThan(-0.03)
    expect(hit.unemployment - base.unemployment).toBeLessThan(0.01)
    // Le chômage partiel est payé par l'État : le déficit se creuse.
    expect(hit.deficit - base.deficit).toBeGreaterThan(20)
  })
})

describe('audit de cohérence : les probabilités des événements', () => {
  const start = simulate({ decisions: [], events: [], until: 2025 })[0]
  const chance = (id: string, s: typeof start) => chanceOf(EVENTS.find((e) => e.id === id)!.chance(s, start))

  it('des droits de douane de 10 % appellent souvent une riposte américaine (taxe numérique, 2019)', () => {
    expect(chance('us-retaliation', { ...start, tariffs: 0.1 })).toBeGreaterThan(0.2)
  })

  it('une colère modérée suffit à déclencher une grève générale (sept grands mouvements en trente ans)', () => {
    expect(chance('general-strike', { ...start, discontent: 0.2 })).toBeGreaterThan(chance('general-strike', { ...start, discontent: 0 }) + 0.04)
  })

  it('quand plus de deux événements tombent la même année, le tirage ne favorise pas le début de la liste', () => {
    const tense = { ...start, discontent: 0.9, tariffs: 0.5, temperature: 3, debtRatio: 1.6 }
    let crowded = 0
    let firstTwo = 0
    for (let seed = 0; seed < 300; seed += 1) {
      const eligible = EVENTS.filter((e) => random(seed, 2030, e.id) < chanceOf(e.chance(tense, start))).map((e) => e.id)
      const kept = rollEvents(seed, 2030, tense, start, []).map((e) => e.id)
      if (eligible.length > 2 && kept.length === 2) {
        crowded += 1
        firstTwo += kept.every((id) => eligible.slice(0, 2).includes(id)) ? 1 : 0
      }
    }
    expect(crowded).toBeGreaterThan(20)
    // Avec un ordre fixe, ce seraient toujours les deux premiers de la liste.
    expect(firstTwo / crowded).toBeLessThan(0.7)
  })
})

describe('les prêteurs et le budget', () => {
  it('des baisses d’impôts non financées, en temps normal, font bondir les taux (Royaume-Uni 2022, Italie 2018)', () => {
    const base = simulate({ decisions: [], events: [], until: 2028 })
    // ≈ 2 % du PIB de CSG en moins, sans économies en face.
    const truss = simulate({ decisions: [{ year: 2026, patch: { csg: BASE_POLICY.csg - 0.035 } }], events: [], until: 2028 })
    expect(truss[2].rate - base[2].rate).toBeGreaterThan(0.004)
  })

  it('en pleine crise mondiale, un déficit qui se creuse n’affole pas les prêteurs (2009, 2020)', () => {
    const base = simulate({ decisions: [], events: [{ year: 2026, id: 'pandemic' }], until: 2028 })
    const stimulus = simulate({ decisions: [{ year: 2026, patch: { investment: BASE_POLICY.investment + 20 } }], events: [{ year: 2026, id: 'pandemic' }], until: 2028 })
    expect(stimulus[2].rate - base[2].rate).toBeLessThan(0.002)
  })
})

describe('les cicatrices des crises', () => {
  it('une crise bancaire laisse une perte de production durable (Cerra et Saxena, 2008)', () => {
    const base = simulate({ decisions: [], events: [], until: 2035 })
    const crisis = simulate({ decisions: [], events: [{ year: 2027, id: 'financial-crisis' }], until: 2035 })
    expect(crisis.at(-1)!.gdpReal / base.at(-1)!.gdpReal - 1).toBeLessThan(-0.01)
  })

  it('des années de chômage élevé laissent un chômage d’équilibre plus haut (hystérèse, Ball 2014)', () => {
    const base = simulate({ decisions: [], events: [], until: 2036 })
    // Une récession longue, puis la reprise : le chômage ne revient pas tout de suite à son niveau.
    const slump = simulate({ decisions: [], events: [{ year: 2027, id: 'recession' }, { year: 2028, id: 'financial-crisis' }], until: 2036 })
    expect(slump.at(-1)!.unemployment - base.at(-1)!.unemployment).toBeGreaterThan(0.001)
  })
})

describe('la santé publique', () => {
  it('la prévention allonge la vie sur des années, pas l’année même', () => {
    const base = simulate({ decisions: [], events: [], until: 2036 })
    const more = simulate({ decisions: [{ year: 2026, patch: { prevention: BASE_POLICY.prevention + 10 } }], events: [], until: 2036 })
    const gain = (i: number) => more[i].lifeExpectancy - base[i].lifeExpectancy
    expect(gain(1)).toBeLessThan(gain(10) * 0.25)
  })
})

describe('les aides aux entreprises', () => {
  it('créent des emplois (CICE : 100 000 à 160 000 pour ≈ 20 Md€) sans faire baisser le PIB à long terme', () => {
    const base = simulate({ decisions: [], events: [], until: 2035 })
    const aid = simulate({ decisions: [{ year: 2026, patch: { firmAid: BASE_POLICY.firmAid + 20 } }], events: [], until: 2035 })
    const jobs = (aid.at(-1)!.employment - base.at(-1)!.employment) * 1000
    expect(jobs).toBeGreaterThan(50)
    expect(aid.at(-1)!.gdpReal).toBeGreaterThanOrEqual(base.at(-1)!.gdpReal)
  })
})
