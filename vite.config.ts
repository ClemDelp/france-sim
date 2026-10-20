import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** Tous les fichiers d'un dossier, en chemins relatifs avec des « / ». */
const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })

/**
 * Le service worker (jeu hors ligne, application installable) : on part de pwa/sw.js et on y écrit
 * la liste exacte des fichiers du build, et une version qui change dès qu'un fichier change.
 */
function serviceWorker(): Plugin {
  return {
    name: 'france-sim-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles = listFiles('public').map((f) => relative('public', f).split('\\').join('/'))
      const files = ['./', ...Object.keys(bundle), ...publicFiles].filter((f) => !f.endsWith('.map'))
      const hash = createHash('sha256')
      for (const [name, chunk] of Object.entries(bundle)) {
        hash.update(name)
        hash.update(chunk.type === 'chunk' ? chunk.code : typeof chunk.source === 'string' ? chunk.source : Buffer.from(chunk.source))
      }
      const source = readFileSync('pwa/sw.js', 'utf8')
        .replace("'__VERSION__'", `'${hash.digest('hex').slice(0, 12)}'`)
        .replace('= __PRECACHE__', `= ${JSON.stringify(files, null, 2)}`)
      if (source.includes('__VERSION__') || source.includes('__PRECACHE__')) {
        this.error('pwa/sw.js : marqueur __VERSION__ ou __PRECACHE__ introuvable')
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  // Des chemins relatifs : le jeu marche à la racine d'un site comme dans un sous-dossier (GitHub Pages…).
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
