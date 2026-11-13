/* global document, innerWidth -- read inside page.evaluate, in the browser */
// #282 (UX-22) route audit: every seeded identity walks its own routes, in light and dark, at 1440
// and 390. Read-only: it navigates and scans, it never submits a form. Run with route-audit.config.cjs.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

const OUT = process.env.EVIDENCE_DIR;
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
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'route-audit.json'), JSON.stringify(rows, null, 2)),
);

let recordHref = null;
async function open(page, route) {
  if (!route.startsWith('patient-record')) return page.goto(route);
  const tab = route.split(':')[1];
  if (recordHref) return page.goto(tab ? `${recordHref}?tab=${tab}` : recordHref);
  // The first patient in the registry: a seeded synthetic record.
  await page.goto('/patients');
  // #313: the 1440 registry is a table whose first /patients/ link was not a record; match the
  // record links by their href shape, which the table and the 390 cards share.
  const link = page.locator('main a[href*="/patients/"]:not([href$="/new"])').first();
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
  return nav.evaluate((el) =>
    [...el.querySelectorAll('a[href^="/"]')].map((a) => new URL(a.href).pathname),
  );
}

for (const [role, routes] of Object.entries(PLAN)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(role, async ({ page }) => {
      test.setTimeout(900_000);
      fs.mkdirSync(OUT, { recursive: true });
      recordHref = null;
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const href of await navRoutes(page, routes[0]))
        if (!routes.includes(href)) routes.push(href);
      for (const theme of THEMES) {
        await page.goto(routes[0]);
        await page.evaluate((t) => localStorage.setItem('nkwapa-theme', t), theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
          for (const route of routes) {
            const row = { role, route, theme, width };
            try {
              await open(page, route);
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
              await page.waitForTimeout(600);
              // Normal-route contrast is measured at rest; transient sync states are a separate audit.
              const sync = page.getByTestId('sync-status');
              if (await sync.count())
                await expect(sync).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
              row.landed = new URL(page.url()).pathname;
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
              const r = await new AxeBuilder({ page }).analyze();
              row.violations = r.violations
                .filter((v) => ['serious', 'critical'].includes(v.impact))
                .map((v) => ({
                  id: v.id,
                  impact: v.impact,
                  nodes: v.nodes.map((n) => n.target.join(' ')),
                }));
              // SHOTS_DIR=<abs dir> also saves a light-theme screenshot per route (UI refresh R0 "before" set).
              if (process.env.SHOTS_DIR && theme === 'light') {
                const name = `${role}${route.startsWith('patient-record') ? `-${route.replace(':', '-')}` : route.replace(/\//g, '-')}-${width}.png`;
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
