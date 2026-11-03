const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

// #272: queues and encounters. Seeded E2E identities and synthetic local records only.
const OUT = process.env.EVIDENCE_DIR;
const CLINIC = 'beaf0daf-5444-4c90-9586-fd931b881fd3';
const PATIENT = '986cc8a5-c16c-45e7-8f31-9fb695a1dda9';
// One local encounter per state, read from the synthetic E2E database before capture.
const ENCOUNTERS = {
  draft: 'b2e3af84-3a58-44e3-81b2-c011d89729b8',
  review: 'dce4b8c1-6b05-4572-bc04-cac3f18c010c',
  signoff: 'e43e9eb2-f76f-4928-80d2-bc3d713b5de3',
  finalized: 'e58f8af1-a1f3-4050-b2b8-3d98de13e4dd',
};
const PLAN = {
  doctor: [
    ['queues-doctor', '/queues?tab=review'],
    ...Object.entries(ENCOUNTERS).map(([state, id]) => [`encounter-${state}`, `/encounters/${id}`]),
    ['clinic-encounters', `/clinics/${CLINIC}/encounters`],
  ],
  manager: [['queues-manager', '/queues']],
  volunteer: [['encounter-new', `/patients/${PATIENT}/encounters/new`]],
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

for (const [role, routes] of Object.entries(PLAN)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(role, async ({ page }) => {
      test.setTimeout(600_000);
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark']) {
        await page.addInitScript((theme) => {
          localStorage.setItem('nkwapa-theme', theme);
          localStorage.setItem('nkwapa.sidebar.collapsed', String(window.innerWidth <= 1280));
        }, theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
          for (const [name, url] of routes) {
            await page.goto(url);
            await expect(page.locator('main h1, main h2').first()).toBeVisible({
              timeout: 30_000,
            });
            await page.waitForLoadState('networkidle').catch(() => {});
            await settle(page);
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
  });
}
