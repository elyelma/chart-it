/*
 * Grafito service worker: makes the app open fast and installable.
 * Only the app's own files are cached. Market data (exchange APIs and
 * websockets) always goes to the network and is never stored.
 */
// Bump on releases that change the cached shell files (icons, manifest).
const CACHE = 'grafito-v3'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Pages: network first so updates arrive at once; cached copy when offline.
  if (req.mode === 'navigate') {
    // Only the app page itself becomes the offline copy (not the legal pages, not error pages).
    const isApp = url.pathname === '/' || url.pathname === '/index.html'
    event.respondWith(
      fetch(req)
        .then(res => {
          if (isApp && res.ok) {
            const copy = res.clone()
            event.waitUntil(caches.open(CACHE).then(c => c.put('/index.html', copy)))
          }
          return res
        })
        .catch(() => (isApp ? caches.match('/index.html') : caches.match(req)).then(r => r ?? caches.match('/index.html')))
    )
    return
  }

  // Built assets have a content hash in their name: cache first.
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit
      return fetch(req).then(res => {
        if (res.ok && (url.pathname.startsWith('/assets/') || /\.(png|svg|woff2?)$/.test(url.pathname))) {
          const copy = res.clone()
          event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)))
        }
        return res
      })
    })
  )
})
