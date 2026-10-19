import { describe, expect, test } from 'vitest'
import { BASE_POLICY } from './calibration'
import { LINKS, NODE_BY_ID, NODES } from './graph'
import { DEFAULTS, exportCsv, parseCsv, PARAM_ROWS } from './params'
import { simulate } from './sim'
import { MISSIONS } from '../ui/missions'

/** Le code du moteur, pour vérifier que chaque paramètre des fichiers sert vraiment. */
const SOURCES = Object.values(import.meta.glob(['./*.ts', '../ui/*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>).join('\n')

describe('les fichiers du dossier modele/', () => {
  test('chaque paramètre a une valeur, un nom et une source ou une fiabilité', () => {
    for (const r of PARAM_ROWS) {
      expect(Number.isFinite(r.value), r.id).toBe(true)
      expect(r.name, r.id).not.toBe('')
      expect(r.source || r.reliability, r.id).not.toBe('')
    }
  })

  test('aucun identifiant en double', () => {
    const ids = PARAM_ROWS.map((r) => r.id)
    expect(ids.length).toBe(new Set(ids).size)
    expect(NODES.length).toBe(new Set(NODES.map((n) => n.id)).size)
  })

  test('chaque paramètre est utilisé par le moteur', () => {
    const unused = PARAM_ROWS.map((r) => r.id.split('.')[0])
      .filter((id, i, all) => all.indexOf(id) === i)
      .filter((id) => !new RegExp(`\\.${id}\\b`).test(SOURCES))
    expect(unused).toEqual([])
  })

  test('les liens relient des variables qui existent et citent des paramètres qui existent', () => {
    for (const l of LINKS) {
      expect(NODE_BY_ID[l.from], `${l.from} → ${l.to}`).toBeDefined()
      expect(NODE_BY_ID[l.to], `${l.from} → ${l.to}`).toBeDefined()
      for (const p of l.params) {
        expect(DEFAULTS[p], `${l.from} → ${l.to} : ${p}`).toBeDefined()
      }
    }
  })

  test('chaque variable a au moins un lien, et chaque levier du jeu est dans le graphe', () => {
    for (const n of NODES) {
      expect(LINKS.some((l) => l.from === n.id || l.to === n.id), n.id).toBe(true)
    }
    for (const key of Object.keys(BASE_POLICY).filter((k) => !k.startsWith('cancel'))) {
      expect(NODE_BY_ID[key], key).toBeDefined()
    }
  })

  test('les parts de la dette par détenteur font 100 %', () => {
    expect(DEFAULTS.holderMonde + DEFAULTS.holderBce + DEFAULTS.holderAssureurs + DEFAULTS.holderBanques).toBeCloseTo(1, 6)
  })

  test('un CSV exporté se relit avec la nouvelle valeur', () => {
    const csv = exportCsv('comportement', { consumptionSmoothing: 0.4 })
    const row = parseCsv(csv).find((r) => r.id === 'consumptionSmoothing')
    expect(row?.valeur).toBe('0,4')
    const groups = parseCsv(exportCsv('tranche', { 'mpc.g1': 0.9 })).find((r) => r.id === 'mpc')
    expect(groups?.g1).toBe('0,9')
  })
})

describe('essayer d’autres paramètres', () => {
  test('une variante change le résultat, puis les valeurs des fichiers reviennent', () => {
    const base = simulate({ decisions: [], events: [], until: 2030 }).at(-1)!
    const variant = simulate({ decisions: [], events: [], until: 2030, params: { premiumPerDebtPoint: 0.03 } }).at(-1)!
    expect(variant.rate).toBeGreaterThan(base.rate + 0.005)
    const again = simulate({ decisions: [], events: [], until: 2030 }).at(-1)!
    expect(again.rate).toBe(base.rate)
  })
})

describe('le long terme', () => {
  const END = 2075
  const runs = [
    { id: 'base', states: simulate({ decisions: [], events: [], until: END }) },
    ...MISSIONS.map((m) => ({ id: m.id, states: simulate({ decisions: [{ year: 2026, patch: m.patch }], events: [], until: END }) })),
  ]

  test.each(runs)('$id reste stable jusqu’en 2075 (pas d’emballement)', ({ states }) => {
    for (const s of states) {
      expect(Number.isFinite(s.gdp)).toBe(true)
      expect(Math.abs(s.closure)).toBeLessThan(1)
      // Un choc ponctuel (droits de douane, pétrole) peut faire grimper les prix une année ; une dérive durable, non.
      expect(s.inflation).toBeLessThan(s.year < 2030 ? 0.12 : 0.05)
      expect(s.growth).toBeGreaterThan(-0.06)
      expect(s.unemployment).toBeGreaterThan(0.02)
      expect(s.unemployment).toBeLessThan(0.2)
    }
  })

  test('sans rien changer, le chômage et l’inflation restent proches de leur niveau normal', () => {
    const s2060 = runs[0].states[2060 - 2025]
    expect(s2060.unemployment).toBeGreaterThan(0.055)
    expect(s2060.unemployment).toBeLessThan(0.08)
    expect(s2060.inflation).toBeGreaterThan(0.015)
    expect(s2060.inflation).toBeLessThan(0.03)
  })

  test('la population vieillit sans s’effondrer (projection INSEE : environ 68 millions en 2070)', () => {
    const s2070 = runs[0].states[2070 - 2025]
    expect(s2070.population).toBeGreaterThan(64)
    expect(s2070.population).toBeLessThan(71)
    expect(s2070.retirees).toBeGreaterThan(19)
  })
})
