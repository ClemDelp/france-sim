// Fabrique les pages de documentation générées à partir des sources du dépôt :
//  - docs/modele.html     depuis docs/COMMENT-CA-MARCHE.md (une seule source de vérité pour l'explication du modèle) ;
//  - docs/catalogue.html  depuis les fichiers CSV de modele/ (la liste complète des paramètres, toujours à jour).
// Usage : npm run docs        (la vérification automatique de GitHub refuse un catalogue qui n'est plus à jour)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/^﻿/, '')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// — Lecture des CSV « à la française » (même règles que src/model/params.ts)
function csv(path) {
  const [head, ...rows] = read(path)
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(';'))
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

// — Un petit convertisseur Markdown → HTML, suffisant pour COMMENT-CA-MARCHE.md
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const target = href === '../CONTRIBUER.md' ? 'parametres.html' : href
      return `<a href="${target}">${label}</a>`
    })
}

function markdown(md) {
  const lines = md.split('\n')
  const out = []
  const toc = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const body = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i])
        i += 1
      }
      i += 1
      out.push(lang === 'mermaid' ? `<div class="diagram"><pre class="mermaid">\n${esc(body.join('\n'))}\n</pre></div>` : `<pre><code>${esc(body.join('\n'))}</code></pre>`)
      continue
    }
    const heading = line.match(/^(#{1,3}) (.*)$/)
    if (heading) {
      const level = heading[1].length
      const text = heading[2]
      if (level === 1) {
        i += 1
        continue
      }
      const id = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      if (level === 2) toc.push([id, text])
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`)
      i += 1
      continue
    }
    if (/^\s*(- |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\. /.test(line)
      const items = []
      while (i < lines.length && (/^\s*(- |\d+\. )/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (/^\s*(- |\d+\. )/.test(lines[i])) items.push(lines[i].replace(/^\s*(- |\d+\. )/, ''))
        else items[items.length - 1] += ' ' + lines[i].trim()
        i += 1
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i])
        i += 1
      }
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim())
      const [head, , ...body] = rows
      out.push(`<div class="table-wrap"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^(#|```|\s*- |\s*\d+\. |\|)/.test(lines[i])) {
      para.push(lines[i].trim())
      i += 1
    }
    out.push(`<p>${inline(para.join(' '))}</p>`)
  }
  return { html: out.join('\n'), toc }
}

function page(title, lead, body) {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <link rel="stylesheet" href="assets/style.css" />
  </head>
  <body>
    <!-- Page générée par scripts/build-docs.mjs : ne pas la modifier à la main. -->
    <div class="layout">
      <main>
        <h1>${title}</h1>
        <p class="lead">${lead}</p>
${body}
        <footer>Page générée automatiquement (npm run docs). Pour la corriger, modifiez sa source et relancez la génération.</footer>
      </main>
    </div>
    <script type="module" src="assets/docs.js"></script>
  </body>
</html>
`
}

// — 1. Comprendre le modèle
{
  const { html, toc } = markdown(read('docs/COMMENT-CA-MARCHE.md'))
  const summary = `<div class="note"><p><strong>Sommaire</strong></p><ol>${toc.map(([id, text]) => `<li><a href="#${id}">${inline(text.replace(/^\d+\. /, ''))}</a></li>`).join('')}</ol></div>`
  writeFileSync(
    join(root, 'docs/modele.html'),
    page('🧠 Comprendre le modèle', 'Les grandes boucles du simulateur, en schémas. Source : <code>docs/COMMENT-CA-MARCHE.md</code>.', summary + '\n' + html),
  )
}

// — 2. Le catalogue des paramètres
{
  const links = csv('modele/liens.csv')
  const variables = Object.fromEntries(csv('modele/variables.csv').map((v) => [v.id, v.nom]))
  const usedBy = (id) =>
    links
      .filter((l) => l.parametres.split(/\s+/).some((p) => p === id || p.startsWith(`${id}.`)))
      .map((l) => `${variables[l.de] ?? l.de} → ${variables[l.vers] ?? l.vers}`)
  const badge = (f) => {
    const k = (f || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const cls = k.startsWith('mesur') ? 'mesure' : k.startsWith('estim') ? 'estime' : k.startsWith('hypoth') ? 'hypothese' : ''
    return f ? `<span class="badge ${cls}">${esc(f)}</span>` : ''
  }
  const row = (file, r, value, reliability) => {
    const uses = usedBy(r.id)
    return `<tr data-file="${file}" data-reliability="${esc((reliability || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase())}" data-text="${esc(`${r.id} ${r.nom} ${r.bloc ?? ''} ${r.explication ?? ''} ${r.source ?? ''}`.toLowerCase())}">
  <td><code>${esc(r.id)}</code><br /><small>${esc(r.bloc ?? '')}</small></td>
  <td><strong>${esc(r.nom)}</strong>${r.explication ? `<br /><small>${esc(r.explication)}</small>` : ''}${uses.length ? `<br /><small>Utilisé par : ${esc(uses.slice(0, 4).join(' · '))}${uses.length > 4 ? '…' : ''}</small>` : ''}</td>
  <td>${value}${r.unite ? `<br /><small>${esc(r.unite)}</small>` : ''}${r.min || r.max ? `<br /><small>plage ${esc(r.min)} à ${esc(r.max)}</small>` : ''}</td>
  <td>${badge(reliability)}</td>
  <td><small>${esc(r.source ?? '')}</small></td>
</tr>`
  }
  const tables = [
    ['donnees-2025.csv', 'Données de 2025', csv('modele/donnees-2025.csv').map((r) => row('donnees-2025', r, esc(r.valeur), 'mesuré'))],
    ['comportements.csv', 'Comportements', csv('modele/comportements.csv').map((r) => row('comportements', r, esc(r.valeur), r.fiabilite))],
    ['tranches.csv', 'Tranches de ménages (g1 = 20 % les plus modestes … g5 = 10 % les plus aisés)', csv('modele/tranches.csv').map((r) => row('tranches', r, ['g1', 'g2', 'g3', 'g4', 'g5'].map((g) => `${g} ${esc(r[g])}`).join('<br />'), r.source?.toLowerCase().startsWith('hypoth') ? 'hypothèse' : 'mesuré'))],
    ['entreprises.csv', 'Tailles d’entreprises', csv('modele/entreprises.csv').map((r) => row('entreprises', r, ['pme', 'eti', 'ge'].map((g) => `${g} ${esc(r[g])}`).join('<br />'), r.fiabilite))],
    ['donnees-2000.csv', 'Données de 2000 (rejeu du passé)', csv('modele/donnees-2000.csv').map((r) => row('donnees-2000', r, esc(r.valeur), 'mesuré'))],
  ]
  const count = tables.reduce((a, [, , rows]) => a + rows.length, 0)
  const body = `
        <input class="search" type="search" placeholder="Chercher (ex. : TVA, dette, réchauffement, PME, immigration…)" aria-label="Chercher un paramètre" />
        <div class="filters" role="group" aria-label="Filtrer">
          <button type="button" data-filter="all" class="is-on">Tout (${count})</button>
          ${tables.map(([file, label]) => `<button type="button" data-filter="${file.replace('.csv', '')}">${esc(file)}</button>`).join('')}
          <button type="button" data-filter="hypothese">Hypothèses seulement</button>
        </div>
        <p class="note">Pour modifier une valeur : <a href="parametres.html">mode d’emploi</a>. Pour essayer avant : dans le jeu, <strong>🧠 Le modèle → Tous les paramètres</strong>.</p>
        ${tables
          .map(
            ([file, label, rows]) => `<h2 id="${file}">${esc(label)} <small><code>modele/${esc(file)}</code></small></h2>
        <div class="table-wrap"><table class="catalog"><thead><tr><th>id</th><th>Paramètre</th><th>Valeur</th><th>Fiabilité</th><th>Source</th></tr></thead><tbody>
${rows.join('\n')}
        </tbody></table></div>`,
          )
          .join('\n')}
        <h2 id="liens">Le graphe des causes <small><code>modele/liens.csv</code></small></h2>
        <div class="table-wrap"><table><thead><tr><th>De</th><th>Vers</th><th>Sens</th><th>Paramètres</th><th>Explication</th></tr></thead><tbody>
${links.map((l) => `<tr data-file="liens" data-text="${esc(`${l.de} ${l.vers} ${variables[l.de] ?? ''} ${variables[l.vers] ?? ''} ${l.parametres} ${l.explication}`.toLowerCase())}"><td>${esc(variables[l.de] ?? l.de)}</td><td>${esc(variables[l.vers] ?? l.vers)}</td><td>${esc(l.sens)}</td><td><small>${l.parametres.split(/\s+/).filter(Boolean).map((p) => `<code>${esc(p)}</code>`).join(' ')}</small></td><td><small>${esc(l.explication)}</small></td></tr>`).join('\n')}
        </tbody></table></div>
        <script>
          const input = document.querySelector('.search')
          const buttons = [...document.querySelectorAll('.filters button')]
          let filter = 'all'
          const apply = () => {
            const q = input.value.toLowerCase().normalize('NFD').replace(/\\p{Diacritic}/gu, '')
            for (const tr of document.querySelectorAll('tr[data-text]')) {
              const text = tr.dataset.text.normalize('NFD').replace(/\\p{Diacritic}/gu, '')
              const okFilter = filter === 'all' || tr.dataset.file === filter || (filter === 'hypothese' && tr.dataset.reliability === 'hypothese')
              tr.hidden = !(okFilter && (!q || text.includes(q)))
            }
          }
          input.addEventListener('input', apply)
          for (const b of buttons) b.addEventListener('click', () => { filter = b.dataset.filter; buttons.forEach((x) => x.classList.toggle('is-on', x === b)); apply() })
        </script>`
  writeFileSync(
    join(root, 'docs/catalogue.html'),
    page('📚 Catalogue des paramètres', `Les ${count} paramètres du modèle et les ${links.length} liens du graphe des causes, lus directement dans <code>modele/</code>.`, body),
  )
}

console.log('Documentation générée : docs/modele.html, docs/catalogue.html')
