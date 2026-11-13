/* global document, window, innerWidth, innerHeight -- read inside page.evaluate, in the browser */
// #282 (UX-22) route audit: every seeded identity walks its own routes, in light and dark, at 1440
// and 390. Read-only: it navigates and scans, it never submits a form. Run with route-audit.config.cjs.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

test.use({ reducedMotion: 'reduce' });
const OUT = process.env.EVIDENCE_DIR;
const requestedRoutes = (process.env.AUDIT_ROUTES || '').split(',').filter(Boolean);
// Optional guarded, synthetic fixture ids. The audit never prints credentials or clinical content.
const FIXTURES = process.env.AUDIT_FIXTURES
  ? JSON.parse(fs.readFileSync(process.env.AUDIT_FIXTURES, 'utf8'))
  : {};

const PLAN = {
  staff: [
    '/dashboard',
    '/today',
    '/stations',
    '/stations/setup',
    '/my/assigned',
    '/queues',
    '/patients',
    'patient-record',
    '/patients/new',
    '/appointments',
    '/audit',
    '/staff-activity',
    '/metrics',
    '/notifications',
    '/settings/clinic',
    '/admin/clinics',
    '/admin/users',
    '/admin/duplicates',
    '/admin/duplicates/cross-clinic',
    '/admin/data-requests',
    '/reports/organization',
    '/account',
    '/settings',
    '/status',
    '/research',
    '/volunteers',
  ],
  director: [
    '/dashboard',
    '/patients',
    'patient-record',
    '/metrics',
    '/reports/organization',
    '/admin/duplicates',
    '/audit',
  ],
  manager: [
    '/dashboard',
    '/today',
    '/stations',
    '/queues',
    '/patients',
    'patient-record',
    '/appointments',
    '/metrics',
    '/staff-activity',
  ],
  doctor: ['/dashboard', '/my/assigned', '/queues', '/patients', 'patient-record', '/appointments'],
  volunteer: [
    '/dashboard',
    '/my/assigned',
    '/stations',
    '/patients',
    'patient-record',
    '/patients/new',
  ],
  patient: [
    '/portal',
    '/portal/health',
    '/portal/appointments',
    '/portal/appointments/request',
    '/portal/self-reports',
    '/portal/self-reports/new',
  ],
};

// R8.1: aliases and detail routes are absent from sidebar discovery. Walk them explicitly.
const shared = ['/account', '/settings', '/status', '/notifications'];
const details = [
  '/clinics/[clinicId]/patients',
  '/clinics/[clinicId]/patients/new',
  '/clinics/[clinicId]/patients/[patientId]',
  '/patients/[patientId]',
  '/clinics/[clinicId]/patients/[patientId]/edit',
  '/clinics/[clinicId]/patients/[patientId]/consent',
  '/patients/[patientId]/consent',
  '/patients/[patientId]/encounters/new',
  '/clinics/[clinicId]/encounters',
  '/encounters/[encounterId]',
  '/clinics/[clinicId]/encounters/[encounterId]',
  '/stations/visits/[visitId]',
];
for (const [role, routes] of Object.entries(PLAN)) {
  routes.push(...shared);
  if (role !== 'patient') routes.push(...details, '/reminders');
  if (['staff', 'director', 'manager'].includes(role)) routes.push('/stations/setup');
  if (['staff', 'director', 'manager'].includes(role))
    routes.push(
      '/notifications/delivery',
      '/reminders',
      '/volunteers/events',
      '/volunteers/events/[eventId]',
      '/clinics/[clinicId]/research/exports',
    );
  if (['staff', 'doctor', 'volunteer'].includes(role))
    routes.push(
      ...['vitals', 'hypertension', 'diabetes', 'careplan', 'clinical-note'].map(
        (tab) => `/encounters/[encounterId]?tab=${tab}`,
      ),
    );
  PLAN[role] = [...new Set(routes)];
}
function resolveRoute(route) {
  let missing = false;
  const resolved = route.replace(
    /\[(clinicId|patientId|encounterId|visitId|eventId)\]/g,
    (_, key) => {
      if (!FIXTURES[key]) missing = true;
      return FIXTURES[key] || '';
    },
  );
  return missing ? null : resolved;
}

// AUDIT_ROLES=staff,manager limits the run (the station-flag build only re-walks station roles).
const only = (process.env.AUDIT_ROLES || '').split(',').filter(Boolean);
for (const role of Object.keys(PLAN)) if (only.length && !only.includes(role)) delete PLAN[role];
// Every section of the patient record, walked by URL for each role that opens the record; a section
// the role cannot read falls back to one it can, which the row's `tab` shows.
const CHART_TABS = [
  'overview',
  'vitals',
  'medications',
  'hypertension',
  'diabetes',
  'medical-history',
  'notes',
  'visits',
  'self-reports',
  'consent',
];
for (const routes of Object.values(PLAN)) {
  const at = routes.indexOf('patient-record');
  if (at >= 0) routes.splice(at, 1, ...CHART_TABS.map((tab) => `patient-record:${tab}`));
}
// AUDIT_THEMES=light limits the themes (dark mode is reviewed separately).
const THEMES = (process.env.AUDIT_THEMES || 'light,dark').split(',').filter(Boolean);
const rows = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'route-audit.json'), JSON.stringify(rows, null, 2));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.env.WEB_DIR, '.next/server/app-paths-manifest.json'), 'utf8'),
  );
  const normalize = (route) =>
    route
      .split('?')[0]
      .replace(/\/\([^/]+\)/g, '')
      .replace(/\/(page|route)$/, '') || '/';
  const visited = new Set(
    rows
      .filter((row) => !row.fixtureMissing && !row.error)
      .map((row) =>
        row.route.startsWith('patient-record')
          ? '/clinics/[clinicId]/patients/[patientId]'
          : normalize(row.route),
      ),
  );
  if (visited.has('/r8-synthetic-missing-route')) visited.add('/_not-found');
  const inventory = [...new Set(Object.keys(manifest).map(normalize))].sort().map((route) => ({
    route,
    visited: visited.has(route),
    ...(route === '/_global-error'
      ? {
          internalState: true,
          limitation:
            'Internal root boundary, not a navigable route; root-fault injection remains unverified.',
        }
      : {}),
  }));
  fs.writeFileSync(path.join(OUT, 'route-inventory.json'), JSON.stringify(inventory, null, 2));
  expect(
    rows.filter((row) => row.fixtureMissing),
    'Detail routes require synthetic fixture ids.',
  ).toEqual([]);
  if (!process.env.AUDIT_ROLES && !requestedRoutes.length) {
    expect(
      inventory.filter((route) => !route.visited && !route.internalState),
      'Every built route must be accounted for.',
    ).toEqual([]);
  }
  const defects = rows.filter(
    (row) =>
      !row.fixtureMissing &&
      (row.error ||
        (row.resource
          ? row.status !== 200
          : row.overflowX > 0 || row.h1Count !== 1 || row.violations?.length || row.minor?.length)),
  );
  expect(defects, JSON.stringify(defects, null, 2)).toEqual([]);
});

let recordHref = null;
async function open(page, route) {
  if (!route.startsWith('patient-record')) return page.goto(resolveRoute(route));
  const tab = route.split(':')[1];
  if (!recordHref && FIXTURES.clinicId && FIXTURES.patientId)
    recordHref = `/clinics/${FIXTURES.clinicId}/patients/${FIXTURES.patientId}`;
  if (recordHref) return page.goto(tab ? `${recordHref}?tab=${tab}` : recordHref);
  // The first patient in the registry: a seeded synthetic record.
  await page.goto('/patients');
  // #313: the 1440 registry is a table whose first /patients/ link was not a record; match the
  // record links by their href shape, which the table and the 390 cards share.
  const link = page.locator('main a[href*="/patients/"]:not([href$="/new"]):visible').first();
  await link.waitFor({ state: 'attached', timeout: 30_000 });
  recordHref = await link.getAttribute('href');
  await page.goto(tab ? `${recordHref}?tab=${tab}` : recordHref);
}

/** The role's own sidebar links, so a page the plan forgot is still walked. */
async function navRoutes(page, first) {
  await page.goto(first);
  const nav = page.locator('nav[aria-label="Workspace"]').first();
  // The sidebar renders after the session loads; a page without one has nothing to add.
  await nav.waitFor({ timeout: 15_000 }).catch(() => {});
  if (!(await nav.count())) return [];
  await nav
    .locator('a[href^="/"]')
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  const links = await nav.evaluate((el) =>
    [...el.querySelectorAll('a[href^="/"]')].map((a) => new URL(a.href).pathname),
  );
  const accountMenu = page.getByRole('button', { name: 'User menu', exact: true });
  if (await accountMenu.count()) {
    await accountMenu.click();
    const menu = page.getByRole('menu');
    await menu.waitFor();
    links.push(
      ...(await menu
        .locator('a[href^="/"]')
        .evaluateAll((items) => items.map((a) => new URL(a.href).pathname))),
    );
    await page.keyboard.press('Escape');
  }
  return [...new Set(links)];
}

for (const [role, routes] of Object.entries(PLAN)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(role, async ({ page }) => {
      test.setTimeout(900_000);
      fs.mkdirSync(OUT, { recursive: true });
      recordHref = null;
      // Registration's wizard creates a draft on entry. Reuse the seeded id during this read-only audit.
      await page.route(/\/clinics\/[^/]+\/encounters$/, (route) =>
        route.request().method() === 'POST' && FIXTURES.encounter
          ? route.fulfill({ json: FIXTURES.encounter })
          : route.continue(),
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const href of await navRoutes(page, routes[0]))
        if (!routes.includes(href)) routes.push(href);
      const walks = requestedRoutes.length
        ? routes.filter((route) => requestedRoutes.includes(route))
        : routes;
      for (const theme of THEMES) {
        await page.goto(routes[0]);
        await page.evaluate((t) => localStorage.setItem('nkwapa-theme', t), theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
          for (const route of walks) {
            const row = { role, route, theme, width };
            try {
              if (!route.startsWith('patient-record') && resolveRoute(route) === null) {
                rows.push({
                  ...row,
                  fixtureMissing: 'Supply this synthetic detail id through AUDIT_FIXTURES.',
                });
                continue;
              }
              await open(page, route);
              await page.waitForFunction(() => document.title.trim().length > 0, undefined, {
                timeout: 10000,
              });
              if (route.startsWith('patient-record:'))
                row.tab = await page
                  .locator('[role="tab"][aria-selected="true"]')
                  .first()
                  .innerText({ timeout: 8_000 })
                  .catch(() => '');
              // Not networkidle: chat and sync polling keep the network busy on every staff page.
              await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
              // A page without an h1 (a feature that is off) is a finding, so it is scanned anyway.
              await page
                .locator('h1')
                .first()
                .waitFor({ timeout: 8_000 })
                .catch(() => {});
              await page.waitForTimeout(Number(process.env.AUDIT_SETTLE_MS || 600));
              // Normal-route contrast is measured at rest; transient sync states are a separate audit.
              const sync = page.getByTestId('sync-status');
              if (await sync.count())
                await expect(sync).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
              row.landed = new URL(page.url()).pathname;
              row.resolved = route.startsWith('patient-record') ? recordHref : resolveRoute(route);
              row.h1 = (
                await page
                  .locator('h1')
                  .first()
                  .innerText({ timeout: 1000 })
                  .catch(() => '')
              ).trim();
              row.h1Count = await page.locator('h1').count();
              row.overflowX = await page.evaluate(
                () => document.documentElement.scrollWidth - innerWidth,
              );
              // Client aliases can replace the route after the initial document title arrives.
              // Check metadata after the destination content and sync settle, immediately before axe.
              await expect(page).toHaveTitle(/\S/, { timeout: 10000 });
              row.documentTitle = await page.title();
              const r = await new AxeBuilder({ page }).analyze();
              row.violations = r.violations
                .filter((v) => ['serious', 'critical'].includes(v.impact))
                .map((v) => ({
                  id: v.id,
                  impact: v.impact,
                  nodes: v.nodes.map((n) => n.target.join(' ')),
                }));
              // Save both themes; include theme in filenames so neither overwrites the other.
              if (process.env.SHOTS_DIR) {
                const name = `${role}-${theme}${route.startsWith('patient-record') ? `-${route.replace(':', '-')}` : route.replace(/\//g, '-')}-${width}.png`;
                await page.screenshot({
                  path: path.join(process.env.SHOTS_DIR, name),
                  fullPage: width > 390,
                });
              }
              row.minor = r.violations
                .filter((v) => !['serious', 'critical'].includes(v.impact))
                .map((v) => v.id);
            } catch (error) {
              row.error = String(error.message).split('\n')[0];
            }
            rows.push(row);
            console.log(
              role,
              route,
              theme,
              width,
              row.landed,
              row.error || (row.violations || []).map((v) => v.id).join(',') || 'clean',
            );
          }
        }
      }
    });
  });
}

// Public pages and auth entry/error states are intentionally audited without a signed-in identity.
const PUBLIC_ROUTES = [
  '/',
  '/privacy',
  '/terms',
  '/cookies',
  '/status',
  '/login',
  '/accept-invite?token=synthetic-invalid-token',
  '/claim-record',
  '/account/name',
  '/r8-synthetic-missing-route',
];
test('public and authentication routes', async ({ page }) => {
  test.setTimeout(600000);
  fs.mkdirSync(OUT, { recursive: true });
  for (const theme of THEMES) {
    await page.goto('/status');
    await page.evaluate((t) => localStorage.setItem('nkwapa-theme', t), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of PUBLIC_ROUTES) {
        const row = { role: 'public', route, theme, width };
        try {
          await page.goto(route);
          await page.waitForFunction(() => document.title.trim().length > 0);
          await page.locator('h1').first().waitFor({ timeout: 10000 });
          await page.evaluate(() => document.fonts.ready);
          if (route === '/') {
            // Reveal the full landing document before auditing it, as in landing.spec.js.
            await page.evaluate(async () => {
              for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight / 2) {
                window.scrollTo({ top: y, behavior: 'instant' });
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
              window.scrollTo({ top: 0, behavior: 'instant' });
            });
          }
          await page.waitForTimeout(600);
          row.landed = new URL(page.url()).pathname;
          row.h1Count = await page.locator('h1').count();
          row.h1 = await page.locator('h1').first().innerText();
          row.overflowX = await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          );
          const axe = await new AxeBuilder({ page }).analyze();
          row.violations = axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target.join(' ')),
          }));
          if (process.env.SHOTS_DIR)
            await page.screenshot({
              path: path.join(
                process.env.SHOTS_DIR,
                `public-${route.replace(/[^a-z0-9]/gi, '-')}-${theme}-${width}.png`,
              ),
              fullPage: width === 1440,
            });
        } catch (error) {
          row.error = String(error.message).split('\n')[0];
        }
        rows.push(row);
      }
      // The Keycloak theme is deliberately light-only. Dark preference must not invent a dark login.
      const row = { role: 'public', route: 'keycloak-sign-in', theme, width };
      try {
        await page.goto('/login');
        await page
          .getByRole('button', { name: /continue to secure sign in|try secure sign in again/i })
          .click();
        await page.waitForURL(/realms\//);
        await page.locator('#username').waitFor();
        row.landed = new URL(page.url()).pathname;
        row.h1Count = await page.locator('h1').count();
        row.overflowX = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        row.violations = (await new AxeBuilder({ page }).analyze()).violations.map((v) => ({
          id: v.id,
          impact: v.impact,
        }));
        if (process.env.SHOTS_DIR)
          await page.screenshot({
            path: path.join(process.env.SHOTS_DIR, `keycloak-${theme}-${width}.png`),
          });
      } catch (error) {
        row.error = String(error.message).split('\n')[0];
      }
      rows.push(row);
    }
  }
  for (const route of [
    '/api/version',
    '/manifest.webmanifest',
    '/opengraph-image',
    '/twitter-image',
    '/robots.txt',
    '/sitemap.xml',
    '/service-worker.js',
  ]) {
    try {
      const response = await page.request.get(route);
      rows.push({
        role: 'public',
        route,
        resource: true,
        status: response.status(),
        contentType: response.headers()['content-type'],
      });
    } catch (error) {
      rows.push({
        role: 'public',
        route,
        resource: true,
        error: String(error.message).split('\n')[0],
      });
    }
  }
});
