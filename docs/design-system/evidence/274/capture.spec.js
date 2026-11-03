const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');
// #274: seeded local governance views.
const OUT = process.env.EVIDENCE_DIR;
const PLAN = {
  staff: [
    ['/admin/users', 'users'],
    ['/admin/clinics', 'clinics'],
    ['/admin/duplicates', 'duplicates'],
    ['/admin/duplicates/cross-clinic', 'cross-clinic'],
    ['/admin/data-requests', 'data-requests'],
    ['/audit', 'audit'],
    ['/notifications', 'message-delivery'],
    ['/settings/clinic', 'clinic-settings'],
  ].map(([route, name]) => [
    name,
    async (page) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(route);
    },
  ]),
};

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

for (const [role, views] of Object.entries(PLAN)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(role, async ({ page }) => {
      test.setTimeout(600_000);
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark']) {
        await page.goto('/dashboard');
        await page.evaluate((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
          for (const [name, open] of views) {
            await open(page);
            await page.waitForLoadState('networkidle').catch(() => {});
            await settle(page);
            const dialog = name.endsWith('-form');
            await page.screenshot({
              path: path.join(OUT, `${name}--${width}--${theme}.jpg`),
              fullPage: width > 390 && !dialog,
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
