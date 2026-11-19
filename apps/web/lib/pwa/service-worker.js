/**
 * The Nkwapa service worker (#206). This file is the only source: app/service-worker.js/route.ts
 * serves it with VERSION replaced per deploy, and jest requires it to test the rules below.
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

// The wordmark on the offline screens (#207). A phone never shows it while online, so it is kept
// at install rather than on first use.
const PRECACHE_ASSETS = ['/images/nkwapa-logo.png', '/images/nkwapa-logo-dark.png'];

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    PRECACHE_ASSETS.includes(url.pathname)
  );
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

/*
  Chart and encounter shells (#207). Next serves these dynamic routes `private, no-store` because
  they render per request, not because they hold anything personal: patient data arrives from the
  API into the encrypted local database, and e2e/pwa.spec.js checks no name or national ID reaches
  Cache Storage. Kept by exact path, so a chart opened online can be reopened in an offline session.
*/
const SHELL_ROUTE = /^\/clinics\/[^/]+\/(patients|encounters)\/[^/]+(\/(edit|consent))?$/;

/** Only successful, same-origin, shareable responses may become an offline copy (#206). */
function isCacheable(response, pathname) {
  if (!response || !response.ok || response.type !== 'basic' || response.redirected) return false;
  if (pathname && SHELL_ROUTE.test(pathname)) return true;
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !/\b(no-store|private)\b/.test(cacheControl);
}

/*
  An unlocked offline session (#207), held in this worker's memory and nowhere else, so a page
  change in the same browser does not ask for the PIN again. Offline, every in-app navigation is a
  full load: Next cannot fetch the next route's data. The keys are non-extractable CryptoKeys;
  the session is dropped on Lock, sign-in, an idle gap longer than the page's idle lock, and when
  the browser stops this worker. Never written to Cache Storage or IndexedDB.
*/
function offlineSessionMessage(held, data, now) {
  switch (data && data.type) {
    case 'OFFLINE_SESSION_HOLD':
      return { held: { session: data.session, keys: data.keys, idleMs: data.idleMs, at: now } };
    case 'OFFLINE_SESSION_TOUCH':
      return { held: held ? { ...held, at: now } : null };
    case 'OFFLINE_SESSION_DROP':
      return { held: null };
    case 'OFFLINE_SESSION_RESUME': {
      const fresh = held && now - held.at < held.idleMs ? held : null;
      return { held: fresh, reply: fresh ? { session: fresh.session, keys: fresh.keys } : null };
    }
    default:
      return { held };
  }
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
  if (!isCacheable(response, new URL(key.url).pathname)) return;
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
    const key = cacheKeyFor(request);
    event.waitUntil(putIfCacheable(names.pages, key, response.clone(), MAX_PAGES));
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

/*
  A clicked notification goes to an open Nkwapa window when there is one, which then navigates
  itself (it knows the router and the chat panel), and opens a new window only when there is none.
  The message type matches NOTIFICATION_CLICK_MESSAGE in lib/browser-notifications.ts.
*/
async function openFromNotification(clients, origin, rawUrl) {
  const target = new URL(rawUrl || '/dashboard', origin);
  // Only ever this app: a notification's data is ours, but never let it open another site.
  const url = target.origin === origin ? `${target.pathname}${target.search}` : '/dashboard';
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((client) => new URL(client.url).origin === origin);
  if (existing) {
    await existing.focus();
    existing.postMessage({ type: 'NKWAPA_NOTIFICATION_CLICK', url });
    return;
  }
  await clients.openWindow(url);
}

/*
  A background push from the API (#250). The payload names who or what kind, never patient details;
  the worker only shows it. Skipped while a Nkwapa window is focused and visible: the page already
  raises its own notification from the live connection, under the same tag, so a push would repeat
  it. A payload that does not parse still shows something, because a push must be visible.
*/
function pushNotificationFor(rawText) {
  let message = {};
  try {
    message = JSON.parse(rawText || '{}') || {};
  } catch {
    message = {};
  }
  return {
    title: typeof message.title === 'string' && message.title ? message.title : 'Nkwapa',
    options: {
      body: typeof message.body === 'string' ? message.body : 'Open Nkwapa to see what is new.',
      tag: typeof message.tag === 'string' ? message.tag : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: typeof message.url === 'string' ? message.url : '/dashboard' },
    },
  };
}

async function showPush(registration, clients, rawText) {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.some((client) => client.focused && client.visibilityState === 'visible')) return;
  const { title, options } = pushNotificationFor(rawText);
  await registration.showNotification(title, options);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VERSION,
    MAX_PAGES,
    MAX_STATIC,
    cacheNames,
    shouldHandle,
    isCacheable,
    offlineSessionMessage,
    cacheKeyFor,
    trimCache,
    openFromNotification,
    pushNotificationFor,
    showPush,
  };
} else {
  self.addEventListener('push', (event) => {
    event.waitUntil(showPush(self.registration, self.clients, event.data ? event.data.text() : ''));
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data && event.notification.data.url;
    event.waitUntil(openFromNotification(self.clients, self.location.origin, url));
  });

  self.addEventListener('install', (event) => {
    // No skipWaiting here: a new version waits until the page asks (#206), so a deploy never
    // takes over a tab in the middle of a form.
    event.waitUntil(
      (async () => {
        await (await caches.open(names.offline)).add(OFFLINE_URL);
        await (await caches.open(names.static)).addAll(PRECACHE_ASSETS);
        const pages = await caches.open(names.pages);
        for (const path of PRECACHE_PAGES) {
          const response = await fetch(path, { cache: 'reload' });
          if (isCacheable(response, path)) await pages.put(path, response);
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

  let heldOfflineSession = null;
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
    if (
      event.source &&
      event.source.url &&
      new URL(event.source.url).origin !== self.location.origin
    )
      return;
    const { held, reply } = offlineSessionMessage(heldOfflineSession, event.data, Date.now());
    heldOfflineSession = held;
    if (event.data && event.data.type === 'OFFLINE_SESSION_RESUME' && event.ports[0]) {
      event.ports[0].postMessage(reply ?? null);
    }
  });

  self.addEventListener('fetch', (event) => {
    const kind = shouldHandle(event.request, self.location.origin);
    if (kind === 'page') event.respondWith(handlePage(event));
    else if (kind === 'static') event.respondWith(handleStatic(event));
  });
}
