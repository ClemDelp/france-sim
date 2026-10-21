/*
 * Le service worker de France·Sim : le jeu marche hors ligne, comme une appli.
 * Ce fichier est un modèle : au build, vite.config.ts y écrit la version et la liste exacte
 * des fichiers du jeu (à la place des deux marqueurs ci-dessous).
 */
const VERSION = '8eee288907fc'
const CACHE = `france-sim-${VERSION}`
const FONTS = 'france-sim-fonts'
const PRECACHE = [
  "./",
  "assets/index-DVbe0sOw.js",
  "assets/index-DNjAHJLf.css",
  "favicon.svg",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "icons/maskable-512.png",
  "icons/maskable.svg",
  "manifest.webmanifest"
]

self.addEventListener('install', (event) => {
  // Tout le jeu est téléchargé d'un coup : il marchera ensuite sans réseau.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  // Les anciennes versions sont effacées (pas les polices, partagées d'une version à l'autre).
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)

  // Une page : d'abord le réseau (pour avoir la dernière version), sinon celle gardée en cache,
  // sinon le jeu lui-même (hors ligne, toute adresse inconnue ouvre le jeu).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r ?? caches.match('./'))),
    )
    return
  }

  // Les polices Google : servies du cache, rafraîchies en arrière-plan.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then((cache) =>
        cache.match(request).then((cached) => {
          const fresh = fetch(request)
            .then((response) => {
              cache.put(request, response.clone())
              return response
            })
            .catch(() => cached)
          return cached ?? fresh
        }),
      ),
    )
    return
  }

  // Les fichiers du jeu (leur nom change à chaque version) : du cache d'abord.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})
