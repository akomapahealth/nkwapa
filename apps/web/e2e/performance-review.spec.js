const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const { prepare, ready } = require('../playwright/device-matrix.cjs');
const fixtures = JSON.parse(fs.readFileSync(process.env.AUDIT_FIXTURES, 'utf8'));
const vitals = fs.readFileSync(
  require.resolve('web-vitals').replace(/web-vitals\.umd\.cjs$/, 'web-vitals.iife.js'),
  'utf8',
);
const plan = [
  ...['staff', 'doctor', 'volunteer', 'manager', 'director'].map((role) => [
    role,
    'home',
    '/dashboard',
  ]),
  ['patient', 'home', '/portal'],
  ['staff', 'patients', '/patients'],
  ['doctor', 'encounter', `/encounters/${fixtures.encounterId}`],
  ['doctor', 'record', `/clinics/${fixtures.clinicId}/patients/${fixtures.patientId}`],
];
for (const width of [390, 1440])
  for (const [role, screen, route] of plan) {
    test.describe(`${role} ${screen} ${width}`, () => {
      test.use({
        storageState: storageStateFor(role),
        viewport: { width, height: width === 390 ? 844 : 900 },
      });
      test('R8.8 measure LCP INP CLS', async ({ page, context }, info) => {
        test.setTimeout(120_000);
        await prepare(page, 'light');
        await page.addInitScript({
          content: `${vitals}; window.__r88 = {}; for (const [name, fn] of [['LCP', 'onLCP'], ['INP', 'onINP'], ['CLS', 'onCLS']]) webVitals[fn](m => { window.__r88[name] = {value: m.value, rating: m.rating}; }, {reportAllChanges: true});`,
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        if (width === 390) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 150,
            downloadThroughput: 1_600_000 / 8,
            uploadThroughput: 750_000 / 8,
          });
        }
        await page.goto(route);
        await ready(page);
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.locator('main')).not.toContainText(
          /You don't have access|This page ran into a problem/,
        );
        await page.waitForTimeout(3000);
        // A real, reversible interaction shared by workspace and portal headers.
        const menu = page.getByRole('button', { name: 'User menu', exact: true });
        await menu.click();
        await expect(page.getByRole('menu').first()).toBeVisible();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        // Background the document to flush all three standard web-vitals callbacks.
        const other = await context.newPage();
        await other.bringToFront();
        await page.waitForTimeout(500);
        const metrics = await page.evaluate(() => window.__r88);
        const row = {
          role,
          screen,
          route,
          width,
          metrics,
          browser: context.browser().version(),
          measuredAt: new Date().toISOString(),
          cpu: width === 390 ? 4 : 1,
          latencyMs: width === 390 ? 150 : 0,
          downloadBitsPerSecond: width === 390 ? 1600000 : null,
          interaction: 'Open User menu and Escape',
          reducedMotion: true,
          coldCache: true,
        };
        fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(process.env.EVIDENCE_DIR, `${role}-${screen}-${width}.json`),
          JSON.stringify(row, null, 2),
        );
        await info.attach('web-vitals', {
          body: JSON.stringify(row, null, 2),
          contentType: 'application/json',
        });
        expect(Object.keys(metrics).sort()).toEqual(['CLS', 'INP', 'LCP']);
        await other.close();
      });
    });
  }
