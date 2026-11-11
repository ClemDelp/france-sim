import { scoreOf, type Game } from './engine'
import { pack, PROTOCOL, unpack, type WireGame } from './online'

/**
 * La partie en cours, gardée dans le navigateur après chaque geste : un retour de trop, un rechargement ou l'appli fermée
 * ne la perdent plus. Allégée comme sur le fil (les années de chaque France se recalculent). Une autre version du jeu
 * (règles ou modèle changés) ne reprend pas une ancienne partie.
 */

export const SOLO_KEY = 'france-sim-partie'
export const LOCAL_KEY = 'france-sim-partie-locale'

type Saved<T> = { version: string; game: WireGame; extra: T }

/** Le texte à garder (ou null : la partie est finie, rien à reprendre). */
export function serialize<T>(g: Game, extra: T): string | null {
  return g.outcome ? null : JSON.stringify({ version: PROTOCOL, game: pack(g), extra } satisfies Saved<T>)
}

export function deserialize<T>(raw: string | null): { game: Game; extra: T } | null {
  if (!raw) {
    return null
  }
  try {
    const saved = JSON.parse(raw) as Saved<T>
    if (saved?.version !== PROTOCOL || !saved.game?.seats) {
      return null
    }
    return { game: unpack(saved.game), extra: saved.extra }
  } catch {
    return null
  }
}

export function saveGame<T>(key: string, g: Game | null, extra: T) {
  try {
    const text = g ? serialize(g, extra) : null
    if (text) {
      window.localStorage.setItem(key, text)
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Pas de stockage (navigation privée) : la partie ne se reprendra pas, c'est tout.
  }
}

export function loadGame<T>(key: string): { game: Game; extra: T } | null {
  try {
    return deserialize<T>(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

/** Ce qu'on annonce sur le bouton « Reprendre » : l'année, et les deux notes. */
export const resumeLabel = (g: Game) => `Année ${g.year} · vous ${scoreOf(g.seats.player)}–${scoreOf(g.seats.ai)}`
