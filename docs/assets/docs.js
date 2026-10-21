// Documentation de France·Sim : menu commun, thème, schémas Mermaid.
const PAGES = [
  ['Commencer', [
    ['index.html', '🏠 Accueil'],
    ['modele.html', '🧠 Comprendre le modèle'],
    ['glossaire.html', '📖 Glossaire'],
  ]],
  ['Modifier le modèle (sans coder)', [
    ['parametres.html', '🎛️ Modifier un paramètre'],
    ['tester.html', '🧪 Tester son changement'],
    ['catalogue.html', '📚 Catalogue des paramètres'],
  ]],
  ['Développer le jeu', [
    ['developpeurs.html', '💻 Guide du développeur'],
    ['moteur.html', '⚙️ Le moteur pas à pas'],
    ['recettes.html', '🧩 Recettes (ajouter un levier, un événement…)'],
  ]],
]

const here = location.pathname.split('/').pop() || 'index.html'
const nav = document.createElement('nav')
nav.className = 'nav'
nav.innerHTML = `
  <div class="nav-head">
    <a class="nav-brand" href="index.html">🇫🇷 <span>France·Sim<small>Documentation</small></span></a>
    <button class="nav-toggle" type="button" aria-expanded="false">Menu</button>
  </div>
  <div class="nav-body">
    ${PAGES.map(([title, links]) => `<h4>${title}</h4><ul>${links.map(([href, label]) => `<li><a href="${href}"${href === here ? ' class="is-active" aria-current="page"' : ''}>${label}</a></li>`).join('')}</ul>`).join('')}
    <button class="theme-toggle" type="button">🌓 Changer de thème</button>
  </div>`
document.querySelector('.layout').prepend(nav)
nav.querySelector('.nav-toggle').addEventListener('click', (e) => {
  nav.classList.toggle('is-open')
  e.currentTarget.setAttribute('aria-expanded', nav.classList.contains('is-open'))
})

// Le thème choisi est retenu dans ce navigateur (si le stockage est permis).
const root = document.documentElement
try {
  const saved = localStorage.getItem('france-sim-docs-theme')
  if (saved) root.dataset.theme = saved
} catch {}
nav.querySelector('.theme-toggle').addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  root.dataset.theme = dark ? 'light' : 'dark'
  try {
    localStorage.setItem('france-sim-docs-theme', root.dataset.theme)
  } catch {}
  renderDiagrams()
})

// Les schémas : écrits en Mermaid dans la page, dessinés par le navigateur. Sans connexion, le texte du schéma reste lisible.
const sources = [...document.querySelectorAll('pre.mermaid')].map((el) => [el, el.textContent])
let mermaid = null
async function renderDiagrams() {
  if (!sources.length) return
  try {
    mermaid ??= (await import('https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs')).default
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', fontFamily: 'Nunito, system-ui, sans-serif', flowchart: { htmlLabels: true } })
    for (const [i, [el, code]] of sources.entries()) {
      const { svg } = await mermaid.render(`schema-${i}-${Date.now()}`, code)
      el.innerHTML = svg
    }
  } catch (err) {
    console.warn('Schémas non dessinés (pas de connexion ?)', err)
  }
}
renderDiagrams()
