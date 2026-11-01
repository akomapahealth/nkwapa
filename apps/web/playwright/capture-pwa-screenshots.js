/**
 * Regenerates the install-sheet screenshots in public/screenshots (#206).
 *
 * Seeded demo data only, never a real patient. With the API and a production web build running
 * against a seeded database, and playwright/.auth populated by an e2e run:
 *
 *   node playwright/capture-pwa-screenshots.js
 *
 * Commit the two PNGs. Their sizes are declared in app/manifest.ts.
 */
const path = require('path');
const { chromium } = require('@playwright/test');
const { apiRequestAs } = require('./api-client');
const { storageStateFor } = require('./roles');
const { skipWelcomeTour } = require('./welcome-tour');

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'public', 'screenshots');

async function demoChartPath() {
  const whoami = (await apiRequestAs('staff', 'get', '/auth/whoami')).json();
  const clinicId = whoami.activeClinicId;
  const results = (
    await apiRequestAs('staff', 'get', `/clinics/${clinicId}/patients/search?q=Demo&take=5`, {
      clinicId,
    })
  ).json();
  const patient = (results.items ?? results).find((p) => p.lastName === 'Demo');
  if (!patient)
    throw new Error('Seeded "Appointment Demo" patient not found; seed sample data first.');
  return `/clinics/${clinicId}/patients/${patient.id}`;
}

async function capture(browser, { url, file, viewport, deviceScaleFactor }) {
  const context = await browser.newContext({
    baseURL,
    viewport,
    deviceScaleFactor,
    colorScheme: 'light',
    storageState: storageStateFor('staff'),
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('#main-content').waitFor();
  await skipWelcomeTour(page);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, file) });
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  await capture(browser, {
    url: '/today',
    file: 'wide-today.png',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  await capture(browser, {
    url: await demoChartPath(),
    file: 'narrow-chart.png',
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
  });
  await browser.close();
  console.log(`wrote ${OUT}/wide-today.png and narrow-chart.png`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
