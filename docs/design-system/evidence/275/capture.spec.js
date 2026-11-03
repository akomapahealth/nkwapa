const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');
const { apiRequestAs } = require(process.env.WEB_DIR + '/playwright/api-client');

// #275: analytics and reporting. Seeded E2E identities and synthetic local records only.
const OUT = process.env.EVIDENCE_DIR;
let clinicId;

async function open(page, url, heading, ready) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  if (ready) await expect(ready(page)).toBeVisible({ timeout: 30_000 });
}

const metrics = (page) =>
  open(page, '/metrics', 'Metrics', (p) => p.getByRole('heading', { name: 'Conversions' }));
const staffActivity = (page) =>
  open(page, '/staff-activity', 'Staff activity', (p) => p.getByTestId('staff-activity-table'));
const report = (page) =>
  open(page, '/reports/organization', 'Organization report', (p) =>
    p.getByRole('table').getByText('Nkwapa Clinic - Demo'),
  );

const PLAN = {
  director: [
    ['metrics-director', metrics],
    [
      'research-exports',
      (page) =>
        open(page, `/clinics/${clinicId}/research/exports`, 'Research exports', (p) =>
          p.getByRole('heading', { name: /request export pack/i }),
        ),
    ],
  ],
  manager: [
    ['metrics-manager', metrics],
    ['staff-activity', staffActivity],
    [
      'staff-activity-person',
      async (page) => {
        await staffActivity(page);
        await page.getByTestId('staff-activity-table').getByRole('button').first().click();
        await expect(
          page.getByTestId('activity-days').or(page.getByText('Nothing recorded in this range.')),
        ).toBeVisible({ timeout: 30_000 });
      },
    ],
  ],
  staff: [
    ['organization-report', report],
    [
      'organization-analytics',
      async (page) => {
        await report(page);
        await page.getByRole('tab', { name: 'Cohort analytics' }).click();
        await expect(page.getByRole('combobox', { name: 'Encounter status' })).toBeVisible({
          timeout: 30_000,
        });
        await page.waitForLoadState('networkidle').catch(() => {});
      },
    ],
  ],
};

const findings = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2)),
);

test.beforeAll(async () => {
  clinicId = (await apiRequestAs('director', 'get', '/auth/whoami')).json().activeClinicId;
  expect(clinicId).toBeTruthy();
});

/** Wait for entrance animations; spinners and skeleton pulses loop forever, so skip those. */
async function settle(page) {
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
}

for (const [role, views] of Object.entries(PLAN)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(role, async ({ page }) => {
      test.setTimeout(600_000);
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark']) {
        await page.addInitScript((theme) => {
          localStorage.setItem('nkwapa-theme', theme);
          localStorage.setItem('nkwapa.sidebar.collapsed', String(window.innerWidth <= 1280));
        }, theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
          for (const [name, show] of views) {
            await show(page);
            await page.waitForLoadState('networkidle').catch(() => {});
            await settle(page);
            await page.screenshot({
              path: path.join(OUT, `${name}--${width}--${theme}.jpg`),
              fullPage: width > 390,
              type: 'jpeg',
              quality: 70,
            });
            const r = await new AxeBuilder({ page }).analyze();
            findings.push({
              name,
              width,
              theme,
              height: await page.evaluate(() => document.documentElement.scrollHeight),
              violations: r.violations
                .filter((v) => ['serious', 'critical'].includes(v.impact))
                .map((v) => ({
                  id: v.id,
                  impact: v.impact,
                  nodes: v.nodes.map((n) => n.target.join(' ')),
                })),
            });
          }
        }
      }
    });
  });
}
