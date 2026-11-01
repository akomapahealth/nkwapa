const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const { queueOfflineChange } = require('../playwright/outbox');
const { ROLES, storageStateFor } = require('../playwright/roles');

/*
  Issue #206: the installable app. The manifest, the service worker's caching rules, the update
  prompt and the offline launch screen. The worker registers only in production builds, which is
  what this suite runs against.
*/

const PAGE_CACHE_MAX = 60;
const STATIC_CACHE_MAX = 300;
const KEYCLOAK_ERRORS = /couldn't finish secure sign in|Keycloak initialization timed out/i;

/** Waits until the worker is active and controls this page, reloading once if needed. */
async function waitForControlledPage(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

/** Every Cache Storage entry, with the body of anything HTML. */
async function dumpCaches(page) {
  return page.evaluate(async () => {
    const entries = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        const type = response?.headers.get('Content-Type') ?? '';
        entries.push({
          cache: name,
          url: request.url,
          headers: Object.fromEntries(request.headers),
          html: type.includes('text/html') ? await response.text() : '',
        });
      }
    }
    return entries;
  });
}

test.describe('manifest and registration', () => {
  test('serves one manifest, linked once from every page', async ({ page, request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json();
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/login?source=pwa');

    for (const path of ['/', '/login']) {
      await page.goto(path);
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    }
  });

  test('Chromium reports nothing stopping installation', async ({ page }) => {
    await page.goto('/login');
    await waitForControlledPage(page);
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    // Playwright contexts are incognito-like; that is the harness, not the app.
    expect(installabilityErrors.filter((error) => error.errorId !== 'in-incognito')).toEqual([]);
  });

  test('registers a versioned worker the browser must always revalidate', async ({
    page,
    request,
  }) => {
    const response = await request.get('/service-worker.js');
    expect(response.headers()['cache-control']).toContain('no-cache');
    expect(response.headers()['content-type']).toContain('application/javascript');
    const body = await response.text();
    expect(body).toMatch(/const VERSION = "[^"]+";/);
    expect(body).not.toContain('__SW_VERSION__');

    await page.goto('/login');
    await waitForControlledPage(page);
    // The first worker claiming the page is not an update. The update prompt itself is covered in
    // lib/pwa/update.test.ts: Playwright cannot route the browser's fetch of a worker script.
    await expect(page.getByText('A new version of Nkwapa is ready')).toHaveCount(0);
  });
});

test.describe('signed in as staff', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('offline, a visited page opens the offline launch screen with the queued count, and a new one opens offline.html', async ({
    page,
    context,
  }) => {
    await page.goto('/dashboard');
    await waitForControlledPage(page);
    // The load the worker claimed never passed through it; this one is cached.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await queueOfflineChange(page, {
      id: randomUUID(),
      clinicId: randomUUID(),
      clinicName: 'PWA Offline Clinic',
      entityType: 'patient_check_in',
      entityId: randomUUID(),
      operation: 'UPSERT',
      payloadJson: JSON.stringify({ schemaVersion: 1, occurredAt: new Date().toISOString() }),
      idempotencyKey: randomUUID(),
      createdAt: new Date().toISOString(),
    });

    await context.setOffline(true);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(page.getByTestId('offline-queued-count')).toHaveText('1');
    await expect(page.getByText(KEYCLOAK_ERRORS)).toHaveCount(0);

    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(page.locator('#queued')).toHaveText('1 change waiting on this device');
  });

  test('keeps patient data out of Cache Storage', async ({ page }) => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const lastName = `Cachecheck-${suffix}`;
    const nationalId = `E2E-PWA-${suffix}`;
    await page.goto('/patients/new');
    await waitForControlledPage(page);
    await page.getByLabel('First name', { exact: true }).fill('Shellonly');
    await page.getByLabel('Last name', { exact: true }).fill(lastName);
    await page.getByLabel('National ID', { exact: true }).fill(nationalId);
    await page.getByRole('button', { name: 'Create patient' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: `Shellonly ${lastName}` })).toBeVisible({
      timeout: 20_000,
    });
    // A full load of the chart and the list too, not only client-side navigations.
    await page.reload();
    await page.goto('/patients');

    const entries = await dumpCaches(page);
    expect(entries.length).toBeGreaterThan(0);
    const origin = new URL(page.url()).origin;
    for (const entry of entries) {
      expect(entry.cache).toMatch(/^nkwapa-(pages|static|offline)-/);
      expect(new URL(entry.url).origin).toBe(origin);
      expect(entry.url).not.toMatch(/\/api\/|_rsc=|realms\/|silent-check-sso/);
      expect(entry.headers.rsc).toBeUndefined();
      expect(entry.html).not.toContain(lastName);
      expect(entry.html).not.toContain(nationalId);
    }
    const count = (kind) => entries.filter((entry) => entry.cache.includes(`-${kind}-`)).length;
    expect(count('pages')).toBeLessThanOrEqual(PAGE_CACHE_MAX);
    expect(count('static')).toBeLessThanOrEqual(STATIC_CACHE_MAX);
  });
});

test('a cold start with no connection shows the offline screen at once, not a sign-in error', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: storageStateFor('staff') });
  const warm = await context.newPage();
  // The worker has to have been installed once: a device that has never opened Nkwapa has no app.
  await warm.goto('/login?source=pwa');
  await waitForControlledPage(warm);
  await warm.close();

  await context.setOffline(true);
  const page = await context.newPage();
  const started = Date.now();
  await page.goto('/login?source=pwa');
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible({
    timeout: 3_000,
  });
  expect(Date.now() - started).toBeLessThan(3_000);
  await expect(page.getByText(KEYCLOAK_ERRORS)).toHaveCount(0);

  // Back online, it retries by itself and signs in.
  await context.setOffline(false);
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 30_000 });
  await context.close();
});

test.describe('installed launch for every role', () => {
  for (const role of Object.keys(ROLES)) {
    test(`${role} lands on their own home, and the shortcuts do not break`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: storageStateFor(role) });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto('/login?source=pwa');
      // The claimant's invitation is consumed by patient-claim.spec.js, which runs first in CI;
      // once claimed the account is a patient and its home is the portal.
      const homes =
        role === 'claimant'
          ? ['/claim-record', '/portal']
          : [ROLES[role].landingUrl ?? '/dashboard'];
      await page.waitForURL((url) => homes.includes(url.pathname), { timeout: 30_000 });

      for (const shortcut of ['/dashboard?source=pwa-shortcut', '/patients?source=pwa-shortcut']) {
        await page.goto(shortcut);
        await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText('This page ran into a problem')).toHaveCount(0);
      }
      expect(errors).toEqual([]);
      await context.close();
    });
  }
});
