// Offline support. The page is tiny, so the rules are simple:
// - page loads: network first, so a deploy shows up at once; the cached copy when offline
// - /assets/*: cache first, since Vite gives every build new file names
// - other files of this site: cached copy at once, refreshed in the background
// Requests to other sites (analytics) are left alone.
const CACHE = 'tzm-v1'
const ASSET_LIMIT = 40

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './favicon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(cache) {
  const assets = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'))
  for (const r of assets.slice(0, Math.max(0, assets.length - ASSET_LIMIT))) await cache.delete(r)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('./', copy))
          }
          return res
        })
        .catch(async () => (await caches.match('./')) ?? Response.error()),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then(async (c) => {
                await c.put(req, copy)
                await trim(c)
              })
            }
            return res
          }),
      ),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req)
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) c.put(req, res.clone())
          return res
        })
        .catch(() => hit ?? Response.error())
      if (hit) event.waitUntil(fresh)
      return hit ?? fresh
    }),
  )
})
