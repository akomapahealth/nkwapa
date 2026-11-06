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
    '/appointments',
    '/metrics',
    '/staff-activity',
  ],
  doctor: ['/dashboard', '/my/assigned', '/queues', '/patients', 'patient-record', '/appointments'],
  volunteer: ['/dashboard', '/my/assigned', '/stations', '/patients', '/patients/new'],
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
const rows = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'route-audit.json'), JSON.stringify(rows, null, 2)),
);

async function open(page, route) {
  if (route !== 'patient-record') return page.goto(route);
  // The first patient in the registry: a seeded synthetic record.
  await page.goto('/patients');
  // #313: the 1440 registry is a table whose first /patients/ link was not a record; match the
  // record links by their href shape, which the table and the 390 cards share.
  const link = page.locator('main a[href*="/patients/"]:not([href$="/new"])').first();
  await link.waitFor({ state: 'attached', timeout: 30_000 });
  await page.goto(await link.getAttribute('href'));
}

for (const [role, routes] of Object.entries(PLAN)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(role, async ({ page }) => {
      test.setTimeout(900_000);
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark']) {
        await page.goto(routes[0]);
        await page.evaluate((t) => localStorage.setItem('nkwapa-theme', t), theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
          for (const route of routes) {
            const row = { role, route, theme, width };
            try {
              await open(page, route);
              // Not networkidle: chat and sync polling keep the network busy on every staff page.
              await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
              // A page without an h1 (a feature that is off) is a finding, so it is scanned anyway.
              await page
                .locator('h1')
                .first()
                .waitFor({ timeout: 8_000 })
                .catch(() => {});
              await page.waitForTimeout(600);
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
