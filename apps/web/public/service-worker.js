// v2 precaches the offline page. Bumping the name also clears v1, whose fallback served the
// marketing home page for every uncached route, so going offline looked like being signed out.
const CACHE_NAME = 'nkwapa-shell-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/', OFFLINE_URL]);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    }),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  const isNav = request.mode === 'navigate';
  const isStatic = url.pathname.startsWith('/_next/static');

  if (isNav || (isStatic && url.pathname.match(/\.(js|css|woff2?)$/))) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || (isNav ? caches.match(OFFLINE_URL) : undefined)),
        ),
    );
  }
});
