const CACHE_NAME = 'nkwapa-shell-v1';
const SHELL_ROUTES = ['/', '/_next/static'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
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
        .catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    );
  }
});
