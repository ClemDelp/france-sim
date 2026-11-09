import { describe, expect, it } from 'vitest'
import { candidateById } from '../game/candidates'
import { MANDATE_END, MANDATE_START } from '../game/mandate'
import { playAiTurn } from './ai'
import { endTurn, firstToPlay, newGame, other, playPledge, playTactic, pledgeStats, type Game, type Side } from './engine'

const melenchon = candidateById('melenchon')!
const retailleau = candidateById('retailleau')!

/** Une partie jouée par deux IA, du début à la fin. */
function auto(g0: Game): Game {
  let g = g0
  for (let i = 0; i < 20 && g.phase !== 'fin'; i += 1) {
    const first: Side = firstToPlay(g)
    g = endTurn(playAiTurn(g, first), first)
    g = endTurn(playAiTurn(g, other(first)), other(first))
  }
  return g
}

describe('Élysée, le duel de cartes', () => {
  it('se joue jusqu’à la présidentielle de 2032, et la même graine donne la même partie', () => {
    const a = auto(newGame(melenchon, retailleau, 7))
    const b = auto(newGame(melenchon, retailleau, 7))
    expect(a.phase).toBe('fin')
    expect(a.elections.map((e) => e.year)).toEqual([MANDATE_START, MANDATE_END])
    expect(a.elections).toEqual(b.elections)
  })

  it('au pouvoir, une promesse jouée devient une décision appliquée l’année suivante', () => {
    let g = newGame(melenchon, retailleau, 3)
    // La campagne : le joueur joue tous ses coups, l'IA passe son tour ; il est élu.
    for (let i = 0; i < 3; i += 1) {
      for (const card of g.seats.player.hand) g = playTactic(g, 'player', card)
      g = endTurn(endTurn(g, 'player'), 'ai')
    }
    expect(g.phase).toBe('mandat')
    expect(g.president).toBe('player')
    const pledge = g.seats.player.programme.find((p) => p.measure!.id === 'smic-up')!
    g = playPledge(g, 'player', pledge)
    expect(g.reforms).toHaveLength(1)
    const year = g.year
    g = endTurn(endTurn(g, 'player'), 'ai')
    expect(g.decisions.some((d) => d.year === year && 'smicBoost' in d.patch)).toBe(true)
    expect(g.seats.player.applied.map((p) => p.key)).toContain(pledge.key)
  })

  it('on ne joue pas au-delà de son capital politique', () => {
    let g = newGame(melenchon, retailleau, 1)
    const mana = g.seats.player.mana
    for (const p of g.seats.player.programme) g = playPledge(g, 'player', p)
    const spent = g.seats.player.announced.reduce((a, p) => a + pledgeStats(p).cost, 0)
    expect(spent).toBeLessThanOrEqual(mana)
    expect(g.seats.player.mana).toBeGreaterThanOrEqual(0)
  })

  it('les promesses rapportent des voix selon le modèle : l’austérité en fait perdre, les minima sociaux en gagnent', () => {
    const cuts = retailleau.promises.find((p) => p.measure?.id === 'social-cuts')!
    const minima = melenchon.promises.find((p) => p.measure?.id === 'minima')!
    expect(pledgeStats(cuts).appeal).toBeLessThan(0)
    expect(pledgeStats(minima).appeal).toBeGreaterThan(pledgeStats(cuts).appeal + 3)
    expect(pledgeStats(minima).deficit).toBeGreaterThan(0)
  })
})
