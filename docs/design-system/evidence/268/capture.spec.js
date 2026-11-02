const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

// #268 volunteer and doctor dashboards evidence. Seeded E2E identities and synthetic data only.
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

for (const role of ['volunteer', 'doctor']) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(`${role} dashboard`, async ({ page }) => {
      test.setTimeout(300_000);
      for (const theme of ['light', 'dark']) {
        await page.addInitScript(
          ([k, v]) => {
            localStorage.setItem(k, v);
            localStorage.setItem('nkwapa.sidebar.collapsed', String(window.innerWidth <= 1280));
          },
          ['nkwapa-theme', theme],
        );
        // 1440 full page; 390 the first screen, which is what the acceptance criterion is about.
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
          await page.goto('/dashboard');
          await expect(page.getByRole('heading', { name: /today at a glance/i })).toBeVisible({
            timeout: 30_000,
          });
          await page.waitForLoadState('networkidle').catch(() => {});
          await settle(page);
          fs.mkdirSync(OUT, { recursive: true });
          await page.screenshot({
            path: path.join(OUT, `${role}-dashboard--${width}--${theme}.jpg`),
            fullPage: width > 390,
            type: 'jpeg',
            quality: 70,
          });
          const r = await new AxeBuilder({ page }).analyze();
          findings.push({
            name: `${role}-dashboard`,
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
    });
  });
}
