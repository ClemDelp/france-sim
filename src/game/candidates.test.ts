import { describe, expect, it } from 'vitest'
import { BASE_POLICY } from '../model/calibration'
import { chanceOf, EVENTS } from '../model/events'
import { simulate } from '../model/sim'
import { LEVER_GROUPS } from '../ui/levers'
import { CANDIDATES, isPlayable, MEASURES, promisePatch, promiseStatus } from './candidates'
import { MANDATE_END, playMandate } from './mandate'
import { electionAt, popularity } from './score'

const LEVER_KEYS = new Set<string>([...LEVER_GROUPS.flatMap((g) => g.levers.map((l) => l.key)), 'cancelShare', 'cancelHolder'])

describe('les candidats et leurs promesses (modele/candidats.csv, promesses.csv, mesures.csv, mesures-leviers.csv)', () => {
  it('dix personnages, chacun avec au moins trois promesses jouables', () => {
    expect(CANDIDATES).toHaveLength(10)
    for (const c of CANDIDATES) {
      expect(c.promises.filter(isPlayable).length, c.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('chaque mesure agit sur des leviers qui existent, ou dit pourquoi le moteur ne la représente pas', () => {
    for (const m of Object.values(MEASURES)) {
      for (const e of m.effects) {
        expect(LEVER_KEYS.has(e.lever), `${m.id} → ${e.lever}`).toBe(true)
      }
      if (!m.effects.length) {
        expect(m.notes.join(''), m.id).toMatch(/Pas encore dans le moteur/)
      }
    }
  })

  it('chaque promesse cite sa source, et renvoie à une mesure connue quand elle en nomme une', () => {
    for (const c of CANDIDATES) {
      for (const p of c.promises) {
        expect(p.quote, `${c.id} ${p.key}`).toBeTruthy()
        if (p.measure) {
          expect(p.source, `${c.id} ${p.key}`).toMatch(/^https?:\/\//)
        }
      }
    }
  })

  it('une promesse appliquée est reconnue comme tenue, et reste dans les bornes des leviers', () => {
    const bounds = Object.fromEntries(LEVER_GROUPS.flatMap((g) => g.levers.map((l) => [l.key, l])))
    for (const c of CANDIDATES) {
      for (const p of c.promises.filter(isPlayable)) {
        const { patch } = promisePatch(p, BASE_POLICY)
        for (const [k, v] of Object.entries(patch)) {
          if (typeof v === 'number' && bounds[k]) {
            expect(v, `${c.id} ${k}`).toBeGreaterThanOrEqual(bounds[k].min - 1e-9)
            expect(v, `${c.id} ${k}`).toBeLessThanOrEqual(bounds[k].max + 1e-9)
          }
        }
        expect(promiseStatus(p, BASE_POLICY, { ...BASE_POLICY, ...patch }), `${c.id} ${p.measure!.id}`).toBe('tenue')
      }
    }
  })
})

describe('le mandat de chaque candidat, joué à la lettre de 2027 à 2032', () => {
  it.each(CANDIDATES.map((c) => [c.name, c] as const))('%s : le modèle reste sain, photo de fin de mandat', (_, c) => {
    const m = playMandate(c)
    for (const s of m.states) {
      expect(Math.abs(s.closure), `${c.id} ${s.year}`).toBeLessThan(0.5)
      expect(Number.isFinite(s.debtRatio + s.unemployment + s.poverty + s.discontent), `${c.id} ${s.year}`).toBe(true)
    }
    expect(m.applied.length).toBeGreaterThan(0)
    const s = m.states.at(-1)!
    const r = (v: number, d: number) => Number(v.toFixed(d))
    expect({
      promessesAppliquées: `${m.applied.length} / ${m.applied.length + m.pending.length}`,
      fin: m.lost ? `${m.lost.reason} en ${m.lost.year}` : s.year === MANDATE_END ? (electionAt(s).won ? 'réélu·e' : 'battu·e') : 'en cours',
      popularité: popularity(s),
      croissance: r(s.growth * 100, 1),
      chômage: r(s.unemployment * 100, 1),
      inflation: r(s.inflation * 100, 1),
      déficit: r((s.deficit / s.gdp) * 100, 1),
      dette: r(s.debtRatio * 100, 0),
      pauvreté: r(s.poverty * 100, 1),
      émissions: r(s.frenchEmissions, 0),
    }).toMatchSnapshot()
  })
})

describe('le monde réagit au programme', () => {
  const start = simulate({ decisions: [], events: [], until: 2025 })[0]
  const chance = (id: string, s: typeof start) => chanceOf(EVENTS.find((e) => e.id === id)!.chance(s, start))

  it('un gros déficit rend une sanction de Bruxelles plus probable', () => {
    expect(chance('eu-procedure', { ...start, deficit: start.gdp * 0.08 })).toBeGreaterThan(chance('eu-procedure', { ...start, deficit: start.gdp * 0.03 }) + 0.03)
  })

  it('des droits de douane élevés rendent une riposte américaine plus probable', () => {
    expect(chance('us-retaliation', { ...start, tariffs: 0.2 })).toBeGreaterThan(chance('us-retaliation', start) + 0.08)
  })

  it('des comptes tenus rendent un soutien européen plus probable', () => {
    expect(chance('eu-support', { ...start, deficit: start.gdp * 0.02 })).toBeGreaterThan(chance('eu-support', start))
  })
})
