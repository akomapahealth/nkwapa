const { test, expect } = require('@playwright/test');
const Axe = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');
const fs = require('fs');
const out = process.env.EVIDENCE_DIR;
test.use({ storageState: storageStateFor('patient'), reducedMotion: 'reduce' });
test('portal contrast evidence', async ({ page }) => {
  const scans = [];
  fs.mkdirSync(out, { recursive: true });
  for (const theme of ['light', 'dark'])
    for (const width of [1440, 390]) {
      await page.addInitScript((t) => localStorage.setItem('nkwapa-theme', t), theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/portal/self-reports/new');
      await expect(
        page.getByRole('heading', { name: 'Measurement details', exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `${out}/portal--${width}--${theme}.jpg`,
        fullPage: width === 1440,
        type: 'jpeg',
        quality: 75,
      });
      const axe = await new Axe({ page }).analyze();
      scans.push({
        theme,
        width,
        violations: axe.violations
          .filter((x) => ['serious', 'critical'].includes(x.impact))
          .map((x) => ({ id: x.id, nodes: x.nodes.map((n) => n.target) })),
      });
    }
  fs.writeFileSync(`${out}/axe.json`, JSON.stringify(scans, null, 2));
});

test.describe('normal-motion sampling', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('repeat the first-render portal contrast scan', async ({ page }) => {
    test.setTimeout(120_000);
    const scans = [];
    for (let index = 0; index < 12; index++) {
      await page.goto('/portal/self-reports/new');
      await expect(page.locator('#main-content')).toBeVisible();
      const axe = await new Axe({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      scans.push({
        i: index,
        violations: axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
            html: n.html,
          })),
        })),
      });
    }
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(`${out}/contrast.json`, JSON.stringify(scans, null, 2));
  });
});

test('portal clinic-note contrast evidence', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nkwapa-theme', 'light'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/portal/appointments');
  const note = page.getByRole('heading', { name: 'Clinic note', exact: true }).first();
  await expect(note).toBeVisible();
  fs.mkdirSync(out, { recursive: true });
  await note.locator('..').screenshot({ path: `${out}/clinic-note.png` });
  const result = await new Axe({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  fs.writeFileSync(
    `${out}/appointments-contrast.json`,
    JSON.stringify(
      result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
          html: node.html,
        })),
      })),
      null,
      2,
    ),
  );
});
