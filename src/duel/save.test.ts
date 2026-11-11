import { describe, expect, it } from 'vitest'
import { candidateById } from '../game/candidates'
import { aiStep, playAiYear } from './ai'
import { newGame, resolveYear, type Game, type Player } from './engine'
import { deserialize, serialize } from './save'

const as = (id: string): Player => {
  const c = candidateById(id)!
  return { candidate: c, name: c.name, emblem: c.emblem, color: c.color }
}

describe('la partie gardée dans le navigateur', () => {
  it('se reprend à l’identique, au milieu d’une année comme après', () => {
    let g: Game = newGame(as('melenchon'), as('zemmour'), { seed: 5, years: 3 })
    g = resolveYear(playAiYear(g))
    // Au milieu de l'année suivante : un seul geste joué.
    g = aiStep(g, g.turn!) ?? g
    const back = deserialize<{ stage: string }>(serialize(g, { stage: 'play' }))
    expect(back?.extra).toEqual({ stage: 'play' })
    expect(back?.game).toEqual(g)
  })

  it('une partie finie ne se garde pas, et un texte abîmé ou d’une autre version ne se reprend pas', () => {
    let g: Game = newGame(as('ruffin'), as('attal'), { seed: 3, years: 1 })
    while (!g.outcome) {
      g = resolveYear(playAiYear(g))
    }
    expect(serialize(g, null)).toBeNull()
    expect(deserialize('{pas du json')).toBeNull()
    const old = JSON.parse(serialize(newGame(as('ruffin'), as('attal'), { seed: 3, years: 1 }), null)!)
    expect(deserialize(JSON.stringify({ ...old, version: 'ancienne' }))).toBeNull()
  })
})
