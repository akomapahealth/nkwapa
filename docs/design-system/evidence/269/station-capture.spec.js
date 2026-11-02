const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

// #269 station line evidence: run against a build with the station workflow on, after
// station-workflow.spec.js has queued patients. Seeded E2E identities and synthetic data only.
const OUT = process.env.EVIDENCE_DIR;
test.use({ storageState: storageStateFor('manager'), reducedMotion: 'reduce' });

test('manager dashboard with the station line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Station flow', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, 'manager-dashboard--station--1440--light.jpg'),
    fullPage: true,
    type: 'jpeg',
    quality: 70,
  });
});
