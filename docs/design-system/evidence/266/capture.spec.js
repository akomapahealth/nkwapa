const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

// #266 shell evidence. Seeded E2E identities and synthetic data only.
const OUT = process.env.EVIDENCE_DIR;
const findings = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2)),
);

const CASES = [
  ['doctor', '/dashboard'],
  ['manager', '/today'],
  ['staff', '/queues'],
  ['volunteer', '/patients'],
];
for (const [role, route] of CASES) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(`${role} ${route}`, async ({ page }) => {
      test.setTimeout(300_000);
      const name = `${role}-${route.replace(/\W+/g, '')}`;
      for (const theme of ['light', 'dark']) {
        await page.addInitScript(
          ([k, v]) => {
            localStorage.setItem(k, v);
            // Expanded at 1440, collapsed at laptop widths, as the layout's own default.
            localStorage.setItem('nkwapa.sidebar.collapsed', String(window.innerWidth <= 1280));
          },
          ['nkwapa-theme', theme],
        );
        for (const width of [1440, 1024, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(route);
          await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.waitForTimeout(800);
          if (width > 390) {
            // Expanded at 1440, collapsed at laptop widths, whatever the stored preference says.
            const toggle = page.locator('button[aria-controls="workspace-sidebar"]');
            const expanded = (await toggle.getAttribute('aria-expanded')) === 'true';
            if (expanded !== width > 1280) {
              await toggle.click();
              await page.waitForTimeout(500);
            }
          }
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
