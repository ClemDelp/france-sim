import { describe, expect, it } from 'vitest'
import { MEASURES, pledgeText, pledgeTitle, type Pledge } from '../game/candidates'
import { cardName, generic, type Card, type CrisisId } from './cards'
import { neutralGame } from './engine'
import { brief } from './brief'
import { cardImpact } from './why'

const pledge = (id: string, amount: number | null): Pledge => ({ ...generic(id), amount })
/** Les espaces insécables des nombres (« 100 000 ») comptés comme des espaces. */
const flat = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ')

describe('le titre d’une carte dit son sens et son montant', () => {
  it('les postes de fonctionnaires : créer ou supprimer, selon le signe', () => {
    expect(flat(pledgeTitle(pledge('public-jobs', 100)))).toBe('Créer 100 000 postes de fonctionnaires')
    expect(flat(pledgeTitle(pledge('public-jobs', -100)))).toBe('Supprimer 100 000 postes de fonctionnaires')
    expect(pledgeText(pledge('public-jobs', -100))).not.toMatch(/ou en moins/)
    expect(flat(pledgeText(pledge('public-jobs', -100)))).toMatch(/^100 000 postes d’agents publics en moins/)
  })

  it('l’immigration et la retraite : au-dessus ou au-dessous du niveau actuel', () => {
    expect(flat(pledgeTitle(pledge('immigration', 50)))).toBe('Baisser l’immigration à 50 000 par an')
    expect(flat(pledgeTitle(pledge('immigration', 250)))).toBe('Augmenter l’immigration à 250 000 par an')
    expect(flat(pledgeTitle(pledge('retirement-age', 62)))).toBe('Ramener la retraite à 62 ans')
    expect(flat(pledgeTitle(pledge('retirement-age', 65)))).toBe('Repousser la retraite à 65 ans')
  })

  it('une carte générale prend le montant par défaut ; une mesure sans montant garde son nom', () => {
    expect(flat(pledgeTitle(generic('public-jobs')))).toBe('Créer 100 000 postes de fonctionnaires')
    expect(flat(pledgeTitle(generic('smic-up')))).toBe('Augmenter le SMIC de 10 %')
    expect(flat(pledgeTitle(generic('isf')))).toBe(MEASURES.isf.name)
    expect(flat(cardName({ kind: 'mesure', pledge: pledge('public-jobs', -50) }))).toBe('Supprimer 50 000 postes de fonctionnaires')
  })
})

describe('« En bref » : quelques lignes qui ne contredisent jamais le modèle', () => {
  const g = neutralGame()
  const cards: Card[] = [
    ...(
      [
        ['public-jobs', 100],
        ['public-jobs', -100],
        ['immigration', 50],
        ['smic-up', 10],
        ['retirement-age', 62],
        ['retirement-age', 66],
        ['savings', 20],
        ['climate', 20],
      ] as const
    ).map(([id, amount], i): Card => ({ kind: 'mesure', pledge: pledge(id, amount), uid: `t-${i}` })),
    ...(['rail-strike', 'recession', 'gaffe'] as CrisisId[]).map((crisis, i): Card => ({ kind: 'crise', crisis, uid: `c-${i}` })),
  ]

  for (const card of cards) {
    it(cardName(card), () => {
      const side = 'player'
      const impact = cardImpact(g, side, card)!
      const lines = brief(g, side, card, impact)
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(lines.length).toBeLessThanOrEqual(4)
      // Chaque conséquence annonce l'indicateur avec le chiffre du modèle, dans le bon sens.
      // La première ligne dit ce que fait la carte ; les suivantes, ce qui en découle.
      for (const line of lines.slice(1).filter((l) => l.includes(' → '))) {
        const ind = impact.indicators.find((i) => line.endsWith(i.text))
        expect(ind, line).toBeDefined()
        if (ind!.node === 'deficit') {
          // Un déficit qui se creuse s'explique par une dépense en plus ou une recette en moins.
          expect(/dépense plus|encaisse moins/.test(line)).toBe(ind!.up)
        }
        if (ind!.node === 'unemployment' && /emplois/.test(line)) {
          expect(line.includes('Plus d’emplois')).toBe(!ind!.up)
        }
      }
      // Le bilan reprend la note calculée.
      const note = impact.health === 0 ? '±0' : `${impact.health > 0 ? '+' : '−'}${Math.abs(impact.health)}`
      expect(lines.at(-1)).toContain(`note ${note}`)
      if (card.kind === 'crise') {
        expect(lines.at(-1)).toContain('Chez ')
      }
    })
  }

  it('une carte qui ne passe pas par le modèle le dit', () => {
    const lines = brief(g, 'player', { kind: 'crise', crisis: 'fuite', uid: 'x' }, null)
    expect(lines.join(' ')).toMatch(/Rien dans l’économie/)
  })
})
