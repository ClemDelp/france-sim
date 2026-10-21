// Publie le jeu sur GitHub Pages : construit dist/ (avec la documentation dans dist/docs/)
// et le pousse sur la branche gh-pages, que GitHub sert à https://<compte>.github.io/<dépôt>/.
// Usage : npm run deploy
import { execSync } from 'node:child_process'
import { cpSync, rmSync, writeFileSync } from 'node:fs'

const run = (cmd, cwd = '.') => execSync(cmd, { cwd, stdio: 'inherit' })
const read = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

const remote = read('git remote get-url origin')
const name = read('git config user.name')
const email = read('git config user.email')
const commit = read('git rev-parse --short HEAD')
if (read('git status --porcelain --untracked-files=no')) {
  console.warn('⚠️  Des modifications ne sont pas commitées : elles seront publiées quand même.')
}

run('npm run build')
cpSync('docs', 'dist/docs', { recursive: true })
// Sans ce fichier, GitHub Pages ignorerait les dossiers qui commencent par « _ ».
writeFileSync('dist/.nojekyll', '')

rmSync('dist/.git', { recursive: true, force: true })
run('git init -q -b gh-pages', 'dist')
run(`git -c user.name="${name}" -c user.email="${email}" add -A`, 'dist')
run(`git -c user.name="${name}" -c user.email="${email}" commit -q -m "Publier le jeu (${commit})"`, 'dist')
run(`git push -q -f ${remote} gh-pages`, 'dist')
rmSync('dist/.git', { recursive: true, force: true })
console.log('✅ Publié sur la branche gh-pages. En ligne dans une minute environ.')
