const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

// #270 patient workflows evidence. Seeded E2E identities and synthetic data only.
const OUT = process.env.EVIDENCE_DIR;
const findings = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2)),
);

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

// One synthetic chart is created once and reused for before/after evidence.
test.use({ storageState: storageStateFor('staff'), reducedMotion: 'reduce' });
test('patient workflows', async ({ page }) => {
  test.setTimeout(300_000);
  const fixturePath =
    process.env.EVIDENCE_FIXTURE || path.join(require('os').tmpdir(), 'nkwapa-270-fixture.json');
  let fixture;
  if (fs.existsSync(fixturePath)) fixture = JSON.parse(fs.readFileSync(fixturePath));
  else {
    await page.goto('/patients/new');
    await page.getByLabel('First name', { exact: true }).fill('Synthetic');
    await page.getByLabel('Last name', { exact: true }).fill('Redesign270');
    await page.getByLabel('National ID', { exact: true }).fill('E2E-REDESIGN-270-' + Date.now());
    await page.getByRole('button', { name: 'Create patient' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/);
    fixture = { chart: new URL(page.url()).pathname };
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  }
  const clinic = fixture.chart.split('/')[2];
  for (const [name, route] of [
    ['registry', '/patients?q=Redesign270'],
    ['registration', '/patients/new'],
    ['chart', fixture.chart],
    ['vitals', fixture.chart + '?tab=vitals'],
    ['edit', fixture.chart + '/edit'],
    ['consent', fixture.chart + '/consent'],
    ['clinic-registry', `/clinics/${clinic}/patients?q=Redesign270`],
  ]) {
    for (const theme of ['light', 'dark']) {
      await page.addInitScript((theme) => {
        localStorage.setItem('nkwapa-theme', theme);
        localStorage.setItem('nkwapa.sidebar.collapsed', String(window.innerWidth <= 1280));
      }, theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
        await page.goto(route);
        await expect(page.locator('main h1').first()).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await settle(page);
        fs.mkdirSync(OUT, { recursive: true });
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
