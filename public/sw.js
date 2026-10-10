/* These two values are replaced by the production build. */
const PRECACHE = self.__PRECACHE__ || [];
const VERSION = self.__VERSION__ || 'development';
const SCOPE = new URL(self.registration.scope);
const PREFIX = `cadencia:${encodeURIComponent(SCOPE.pathname)}:`;
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = new URL('index.html', SCOPE).href;
const ASSETS = new Set(PRECACHE.map((path) => new URL(path, SCOPE).href));

self.addEventListener('install', (event) => {
  // addAll is atomic: an incomplete new release cannot replace the offline app.
  // Unhashed files such as index.html must come from this deployment, not the HTTP cache.
  const requests = [...ASSETS].map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
  // The update activates after existing tabs close, keeping their asset version intact.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      // Keep the HTML and hashed assets on the same installed release.
      const cache = await caches.open(CACHE);
      const cached = await cache.match(SHELL, { ignoreVary: true });
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return new Response('Cadência está offline. Conecte-se à internet para abrir pela primeira vez.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // Only known build resources enter the cache; external traffic is untouched.
  if (ASSETS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // This closed cache contains only this release's public static files. Hosts may
      // send Vary: Origin, while module and precache requests carry different headers.
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        // A full cache must never prevent a successful network response from loading.
        try { await cache.put(request, response.clone()); } catch { /* Best effort. */ }
      }
      return response;
    })());
  }
});
