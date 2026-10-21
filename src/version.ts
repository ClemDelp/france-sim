// La version du jeu, écrite au moment de la construction (vite.config.ts) : numéro, commit publié, date.
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __BUILD_DATE__: string

export const APP_VERSION = __APP_VERSION__
export const APP_COMMIT = __APP_COMMIT__
export const BUILD_DATE = new Date(__BUILD_DATE__)

/** « v0.1.0 · a1b2c3d · 21 oct. 2026, 18:05 » : de quoi vérifier qu'on a bien la dernière version. */
export const VERSION_LABEL = `v${APP_VERSION} · ${APP_COMMIT} · ${BUILD_DATE.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
