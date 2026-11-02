const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

const OUT = process.env.EVIDENCE_DIR;
const CHART_FILE = path.join(path.dirname(OUT), 'chart-url.txt');
const findings = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2)),
);

async function capture(page, name) {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['nkwapa-theme', theme]);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(page.__route);
      await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(800);
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({
        path: path.join(OUT, `${name}--${width}--${theme}.jpg`),
        fullPage: true,
        type: 'jpeg',
        quality: 70,
      });
      const r = await new AxeBuilder({ page }).analyze();
      findings.push({
        name,
        width,
        theme,
        violations: r.violations
          .filter((v) => ['serious', 'critical'].includes(v.impact))
          .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      });
    }
  }
}

test.describe('doctor', () => {
  test.use({ storageState: storageStateFor('doctor'), reducedMotion: 'reduce' });
  test('doctor dashboard', async ({ page }) => {
    test.setTimeout(240_000);
    page.__route = '/dashboard';
    await capture(page, 'doctor-dashboard');
  });
  test('doctor queues', async ({ page }) => {
    test.setTimeout(240_000);
    page.__route = '/queues';
    await capture(page, 'doctor-queues');
  });
});
test.describe('staff', () => {
  test.use({ storageState: storageStateFor('staff'), reducedMotion: 'reduce' });
  test('staff notifications', async ({ page }) => {
    test.setTimeout(240_000);
    page.__route = '/notifications';
    await capture(page, 'staff-notifications');
  });
  test('staff patient chart', async ({ page }) => {
    test.setTimeout(240_000);
    let url = fs.existsSync(CHART_FILE) ? fs.readFileSync(CHART_FILE, 'utf8').trim() : '';
    if (!url) {
      await page.goto('/patients');
      const link = page
        .locator('a[href*="/clinics/"][href*="/patients/"]:not([href$="/new"])')
        .first();
      await link.waitFor({ state: 'attached', timeout: 30_000 });
      url = new URL(await link.getAttribute('href'), 'http://x').pathname;
      fs.writeFileSync(CHART_FILE, url);
    }
    page.__route = url;
    await capture(page, 'staff-patient-chart');
  });
});
