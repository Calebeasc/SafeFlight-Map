// Invincible.Inc Scanner — Service Worker v2
// Caches the app shell so it loads instantly and works offline.
// API calls (fetch to /users, /encounters, etc.) always go to the network.

const CACHE = 'iinc-shell-v3'
const SHELL = ['/', '/icon.svg', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Let API calls go straight to network (never cache dynamic data)
  const isApi = url.pathname.startsWith('/users') ||
                url.pathname.startsWith('/encounters') ||
                url.pathname.startsWith('/gps') ||
                url.pathname.startsWith('/control') ||
                url.pathname.startsWith('/heatmap') ||
                url.pathname.startsWith('/route') ||
                url.pathname.startsWith('/stoppers') ||
                url.pathname.startsWith('/flock') ||
                url.pathname.startsWith('/scan') ||
                url.pathname.startsWith('/settings') ||
                url.pathname.startsWith('/accounts') ||
                url.pathname.startsWith('/hotspots') ||
                url.pathname.startsWith('/achievements') ||
                url.pathname.startsWith('/replay') ||
                url.pathname.startsWith('/targets') ||
                url.pathname.startsWith('/devices') ||
                url.pathname.startsWith('/export') ||
                url.pathname.startsWith('/stats') ||
                url.pathname.startsWith('/health')

  if (isApi || e.request.method !== 'GET') {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })))
    return
  }

  // App shell: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      return cached || network
    })
  )
})

// Tapping the "GPS Tracking Active" notification brings the app to the foreground
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    })
  )
})
