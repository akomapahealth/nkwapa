/**
 * Emergency replacement for lib/pwa/service-worker.js (#206). Unused until needed; see
 * "Service worker and installed app" in docs/specs/04_OFFLINE_FIRST_AND_SYNC.md for the steps.
 * It takes over at once, deletes every Nkwapa cache, unregisters itself and reloads open tabs
 * from the network. IndexedDB (the outbox) is untouched.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('nkwapa-')) await caches.delete(key);
      }
      await self.registration.unregister();
      for (const client of await self.clients.matchAll()) client.navigate(client.url);
    })(),
  ),
);
