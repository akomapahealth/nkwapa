/**
 * The Nkwapa service worker (#206). This file is the only source: app/service-worker.js/route.ts
 * serves it with __SW_VERSION__ replaced per deploy, and jest requires it to test the rules below.
 * It must stay plain JavaScript with no imports.
 *
 * Cache Storage holds the app shell only: HTML shells, hashed static assets, icons and the offline
 * page. Patient data arrives from the cross-origin API and never passes through this worker. Clinic
 * devices are shared, so anything cached here is visible to the next person who signs in.
 */
const VERSION = '__SW_VERSION__';
const CACHE_PREFIX = 'nkwapa-';
const OFFLINE_URL = '/offline.html';
// Precached so an installed launch (start_url /login?source=pwa) has a shell with no signal.
const PRECACHE_PAGES = ['/login'];
const MAX_PAGES = 60;
const MAX_STATIC = 300;

function cacheNames(version) {
  return {
    pages: `${CACHE_PREFIX}pages-${version}`,
    static: `${CACHE_PREFIX}static-${version}`,
    offline: `${CACHE_PREFIX}offline-${version}`,
  };
}

// Never intercepted, whatever the method (#206): the silent SSO bridge and anything an API route
// handler might serve one day.
const BYPASS_PATHS = ['/silent-check-sso.html', '/api/', '/service-worker.js'];

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

/**
 * Which requests this worker may answer at all (#206). Everything else goes straight to the
 * network, untouched.
 * @returns {'page' | 'static' | null}
 */
function shouldHandle(request, origin) {
  // Same-origin GET only: never writes, never the API origin, never the Keycloak origin.
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== origin) return null;
  if (BYPASS_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(path))) {
    return null;
  }
  // RSC/flight requests carry server-rendered data that differs per user (#206).
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return null;
  // A Keycloak sign-in callback carries a one-time code.
  if (url.searchParams.has('code') && url.searchParams.has('state')) return null;
  if (request.mode === 'navigate') return 'page';
  if (isStaticAsset(url)) return 'static';
  return null;
}

/** Only successful, same-origin, shareable responses may become an offline copy (#206). */
function isCacheable(response) {
  if (!response || !response.ok || response.type !== 'basic' || response.redirected) return false;
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !/\b(no-store|private)\b/.test(cacheControl);
}

/** Pages are keyed on origin + pathname, so ?source=pwa and friends share one entry. */
function cacheKeyFor(request) {
  const url = new URL(request.url);
  return new Request(url.origin + url.pathname);
}

/** Drops the oldest entries until at most `max` remain. Cache keys come back in insertion order. */
async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) {
    await cache.delete(key);
  }
}

async function putIfCacheable(cacheName, key, response, max) {
  if (!isCacheable(response)) return;
  const cache = await caches.open(cacheName);
  await cache.put(key, response);
  await trimCache(cache, max);
}

const names = cacheNames(VERSION);

// Network first, so a deploy is visible on the next navigation; the cache is only the fallback.
async function handlePage(event) {
  const { request } = event;
  try {
    const response = await fetch(request);
    event.waitUntil(putIfCacheable(names.pages, cacheKeyFor(request), response.clone(), MAX_PAGES));
    return response;
  } catch {
    const cached = await caches.match(cacheKeyFor(request), {
      cacheName: names.pages,
      ignoreSearch: true,
    });
    return (
      cached || (await caches.match(OFFLINE_URL, { cacheName: names.offline })) || Response.error()
    );
  }
}

// Hashed assets never change under one URL, so cache first. Chunks of the running build stay
// available until the page reloads into a new version, which is what avoids version skew.
async function handleStatic(event) {
  const { request } = event;
  const cached = await caches.match(request, { cacheName: names.static });
  if (cached) return cached;
  const response = await fetch(request);
  event.waitUntil(putIfCacheable(names.static, request, response.clone(), MAX_STATIC));
  return response;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VERSION,
    MAX_PAGES,
    MAX_STATIC,
    cacheNames,
    shouldHandle,
    isCacheable,
    cacheKeyFor,
    trimCache,
  };
} else {
  self.addEventListener('install', (event) => {
    // No skipWaiting here: a new version waits until the page asks (#206), so a deploy never
    // takes over a tab in the middle of a form.
    event.waitUntil(
      (async () => {
        await (await caches.open(names.offline)).add(OFFLINE_URL);
        const pages = await caches.open(names.pages);
        for (const path of PRECACHE_PAGES) {
          const response = await fetch(path, { cache: 'reload' });
          if (isCacheable(response)) await pages.put(path, response);
        }
      })(),
    );
  });

  self.addEventListener('activate', (event) => {
    const current = new Set(Object.values(names));
    event.waitUntil(
      (async () => {
        for (const key of await caches.keys()) {
          if (key.startsWith(CACHE_PREFIX) && !current.has(key)) await caches.delete(key);
        }
        await self.clients.claim();
      })(),
    );
  });

  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  });

  self.addEventListener('fetch', (event) => {
    const kind = shouldHandle(event.request, self.location.origin);
    if (kind === 'page') event.respondWith(handlePage(event));
    else if (kind === 'static') event.respondWith(handleStatic(event));
  });
}
