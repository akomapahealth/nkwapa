// Captures the six landing screenshots into SHOTS_DIR as <name>-<YYYYMMDD>.png. Copy them to
// apps/web/public/product/ and point the landing at the new names: the image optimizer and any CDN
// cache by URL, so a replaced file under an old name keeps serving the old picture.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

const OUT = process.env.SHOTS_DIR;
const STAMP = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const LAPTOP = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 };
const PHONE = {
  viewport: { width: 404, height: 872 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
};

/** Light theme, expanded sidebar, no motion caught mid-flight. */
async function prepare(page) {
  await page.addInitScript(() => {
    localStorage.setItem('nkwapa-theme', 'light');
    localStorage.setItem('nkwapa.sidebar.collapsed', 'false');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Screens that print clock times read them against the seeded morning (seed-screening-day.ts).
  if (process.env.SHOTS_NOW) await page.clock.setFixedTime(new Date(process.env.SHOTS_NOW));
}

async function settle(page, heading) {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle');
  // The header badge has a hidden twin for the other layout; wait on the one on screen.
  await expect(
    page
      .getByText(/^(All synced|Synced)$/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
}

const shot = (page, name, clip) =>
  page.screenshot({ path: path.join(OUT, `${name}-${STAMP}.png`), ...(clip ? { clip } : {}) });

test.describe('manager', () => {
  test.use({ storageState: storageStateFor('manager'), ...LAPTOP });
  test('station line and dashboard', async ({ page }) => {
    await prepare(page);
    await page.goto('/today');
    await settle(page, 'Station line');
    await shot(page, 'station-line');
    await page.goto('/dashboard');
    // The manager's home (W2) opens on the greeting band, not the clinic name.
    await settle(page, /^(Good (morning|afternoon|evening)|Welcome)/);
    await shot(page, 'manager-dashboard');
  });
});

test.describe('volunteer laptop', () => {
  test.use({ storageState: storageStateFor('volunteer'), ...LAPTOP });
  test('stations', async ({ page }) => {
    await prepare(page);
    await page.goto('/stations');
    await settle(page, 'Stations');
    await shot(page, 'volunteer-stations');
  });
});

test.describe('volunteer phone', () => {
  test.use({ storageState: storageStateFor('volunteer'), ...PHONE });
  test('stations', async ({ page }) => {
    await prepare(page);
    await page.goto('/stations');
    await settle(page, 'Stations');
    await shot(page, 'stations-phone');
  });
});

test.describe('doctor', () => {
  test.use({ storageState: storageStateFor('doctor'), ...LAPTOP });
  test('patient record', async ({ page }) => {
    await prepare(page);
    await page.goto('/patients');
    await page
      .getByRole('row', { name: /Akosua Mensah/ })
      .filter({ visible: true })
      .getByRole('link', { name: 'View' })
      .or(
        page
          .getByRole('row', { name: /Akosua Mensah/ })
          .filter({ visible: true })
          .getByRole('button', { name: 'View' }),
      )
      .first()
      .click();
    await settle(page, 'Akosua Mensah');
    await shot(page, 'doctor-record');
  });
});

test.describe('patient phone', () => {
  test.use({ storageState: storageStateFor('patient'), ...PHONE });
  test('portal', async ({ page }) => {
    await prepare(page);
    await page.goto('/portal');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    // The top of the portal: the welcome and the three things a patient does from home.
    await shot(page, 'portal-phone', { x: 0, y: 0, width: 404, height: 660 });
  });
});
