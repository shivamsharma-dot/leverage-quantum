/* Leverage Quantum — Service Worker
 * Network-first strategy: ALWAYS prefer fresh content, fall back to cache only when offline.
 * This deliberately avoids cache-first to prevent stale JS/CSS chunks after Vercel redeploys
 * (see CLAUDE.md: React.lazy stale-chunk learning). Safe for an internal dashboard.
 */
const CACHE = 'quantum-v1'
const PRECACHE = ['/', '/icon-192.png', '/icon-512.png', '/manifest.json']

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  // Only handle GET; never touch API calls or cross-origin (Meta, Supabase, Google, fonts)
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  e.respondWith(
    fetch(request)
      .then(res => {
        // Cache a fresh copy of successful same-origin responses
        if (res && res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone)).catch(() => {})
        }
        return res
      })
      .catch(() =>
        // Offline: serve cached version, or fall back to app shell for navigations
        caches.match(request).then(cached => cached || caches.match('/'))
      )
  )
})
