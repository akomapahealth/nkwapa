const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const fixtures = process.env.AUDIT_FIXTURES
  ? JSON.parse(fs.readFileSync(process.env.AUDIT_FIXTURES, 'utf8'))
  : null;
test.use({ storageState: storageStateFor('staff'), reducedMotion: 'reduce' });
async function capture(page, name, info) {
  const out = process.env.R8_STATES_DIR || info.outputPath('states');
  fs.mkdirSync(out, { recursive: true });
  const axe = await new AxeBuilder({ page }).analyze();
  const row = {
    name,
    h1: await page.locator('h1').count(),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')),
    })),
  };
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(row, null, 2));
  if (!process.env.R8_BASELINE) {
    expect(row.h1).toBe(1);
    expect(row.overflow).toBe(0);
    expect(row.violations).toEqual([]);
  }
}
for (const theme of ['light', 'dark'])
  for (const width of [1440, 390]) {
    test.describe(`${theme} ${width}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((t) => localStorage.setItem('nkwapa-theme', t), theme);
      });
      test('access skeleton has a heading and fits', async ({ page }, info) => {
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        await page.route('**/auth/whoami', async (route) => {
          await gate;
          await route.continue().catch(() => {});
        });
        try {
          await page.goto('/dashboard');
          await expect(
            page.getByRole('status', { name: 'Checking your access', exact: true }),
          ).toBeVisible({ timeout: 15000 });
          await capture(page, `skeleton-${theme}-${width}`, info);
        } finally {
          release();
          await page.unrouteAll({ behavior: 'wait' });
        }
      });
      test('disabled account status stays accessible', async ({ page }, info) => {
        await page.route('**/auth/whoami', (route) =>
          route.fulfill({
            status: 403,
            json: { code: 'USER_DISABLED', message: 'Synthetic disabled account' },
          }),
        );
        await page.goto('/dashboard');
        await expect(page.getByRole('heading', { name: 'Access has been disabled' })).toBeVisible();
        await capture(page, `disabled-${theme}-${width}`, info);
      });
      test('render boundary offers recovery without exposing the exception', async ({
        page,
      }, info) => {
        test.skip(!fixtures, 'Supply guarded audit fixture IDs.');
        const endpoint = `**/encounters/${fixtures.encounterId}`;
        await page.route(endpoint, (route) =>
          route.request().resourceType() === 'document'
            ? route.continue()
            : route.fulfill({
                json: {
                  ...fixtures.encounter,
                  patient: {
                    firstName: 'Synthetic',
                    lastName: 'Boundary',
                    patientCode: { synthetic: true },
                  },
                },
              }),
        );
        await page.goto(`/encounters/${fixtures.encounterId}`);
        await expect(
          page.getByRole('heading', { name: 'This page ran into a problem' }),
        ).toBeVisible();
        await expect(page.getByText(/Objects are not valid as a React child/)).toHaveCount(0);
        await capture(page, `boundary-${theme}-${width}`, info);
        await page.unroute(endpoint);
        await page.getByRole('button', { name: 'Try again', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'This page ran into a problem' }),
        ).toBeHidden();
      });
    });
  }
