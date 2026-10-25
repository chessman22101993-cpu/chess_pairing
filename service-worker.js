const CACHE_NAME = 'pairing-desk-shell-v4';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=4',
  './app.js?v=4',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('pairing-desk-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  if (!requestUrl.href.startsWith(self.registration.scope)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);

    try {
      const networkRequest = new Request(request, { cache: 'reload' });
      const response = await fetch(networkRequest);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return caches.match(new URL('./index.html', self.registration.scope));
      }
      return new Response('Pairing Desk is offline and this file is not cached yet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
