const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const { prepare, ready } = require('../playwright/device-matrix.cjs');

// Main destinations from R8.1. Details/states remain in the route audit, geometry in R8.2.
const PLAN = {
  staff: ['/dashboard', '/today', '/stations', '/patients', '/patients/new', '/appointments'],
  doctor: ['/dashboard', '/my/assigned', '/queues', '/patients'],
  volunteer: ['/dashboard', '/my/assigned', '/stations', '/patients/new'],
  manager: ['/dashboard', '/today', '/stations', '/queues'],
  director: ['/dashboard', '/metrics', '/reports/organization', '/audit'],
  patient: ['/portal', '/portal/health', '/portal/appointments', '/portal/self-reports/new'],
};

for (const [role, routes] of Object.entries(PLAN)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role) });
    for (const width of [390, 1440])
      for (const route of routes)
        test(`R8.6 ${route} light ${width}`, async ({ page }) => {
          await prepare(page, 'light');
          await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
          await page.goto(route);
          await ready(page);
          await expect(page).not.toHaveURL(/\/login/);
          await expect(page.locator('main')).not.toContainText(
            /This page ran into a problem|You don't have access|Checking your access/,
          );
          await expect(page.locator('html')).not.toHaveClass(/dark/);
          await page.evaluate(() => document.fonts.ready);
          // Wait for chart resize/entrance, independently of the shell's polling requests.
          await page.waitForTimeout(700);
          await expect(page).toHaveScreenshot(
            `${role}-${route.slice(1).replaceAll('/', '-')}-${width}.png`,
            {
              fullPage: true,
              animations: 'disabled',
              maxDiffPixelRatio: 0.001,
              // Live clock, notification count and sync polling are not visual layout contracts.
              mask: [page.locator('time'), page.getByTestId('sync-status')],
            },
          );
        });
  });
}
