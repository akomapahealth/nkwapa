const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../../../../apps/web/playwright/roles');
const OUT = process.env.EVIDENCE_DIR;
if (!OUT) throw new Error('Set EVIDENCE_DIR to the before or after directory.');
const findings = [];
const { responseFor } = require('./fixtures.cjs');
test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'axe.json');
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const fresh = new Set(findings.map((x) => `${x.name}|${x.width}|${x.theme}`));
  fs.writeFileSync(
    file,
    JSON.stringify(
      [...previous.filter((x) => !fresh.has(`${x.name}|${x.width}|${x.theme}`)), ...findings],
      null,
      2,
    ),
  );
});
async function synthetic(page) {
  await page.route('**/clinics/**', (route) => {
    const json = responseFor(route.request().url());
    return json && route.request().method() === 'GET' ? route.fulfill({ json }) : route.continue();
  });
}
async function record(page, name, width, theme) {
  await page.waitForTimeout(350);
  await page.evaluate(() => document.fonts.ready);
  const surface = name === 'footer' ? page.locator('footer') : page;
  await surface.screenshot({
    path: path.join(OUT, `${name}--${width}--${theme}.jpg`),
    ...(name === 'footer' ? {} : { fullPage: width === 1440 }),
    type: 'jpeg',
    quality: 72,
  });
  const result = await new AxeBuilder({ page }).analyze();
  findings.push({
    name,
    width,
    theme,
    height: await page.evaluate(() => document.documentElement.scrollHeight),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    violations: result.violations,
  });
}
for (const role of ['public', 'staff']) {
  test.describe(role, () => {
    test.use({
      storageState: role === 'public' ? { cookies: [], origins: [] } : storageStateFor('staff'),
    });
    test('captures scoped pages', async ({ page }) => {
      test.setTimeout(300000);
      fs.mkdirSync(OUT, { recursive: true });
      await synthetic(page);
      const routes =
        role === 'public'
          ? [
              ['privacy', '/privacy'],
              ['terms', '/terms'],
              ['cookies', '/cookies'],
            ]
          : [
              ['status', '/status'],
              ['research', '/research'],
              ['volunteers', '/volunteers'],
              ['screening-days', '/volunteers/events'],
              ['screening-day', '/volunteers/events/synthetic-event'],
            ];
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript((t) => localStorage.setItem('nkwapa-theme', t), theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
          for (const [name, url] of routes.filter(
            ([name]) =>
              !process.env.EVIDENCE_VIEWS || process.env.EVIDENCE_VIEWS.split(',').includes(name),
          )) {
            await page.goto(url);
            await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
            await page.waitForLoadState('networkidle');
            if (name === 'research')
              await expect(
                page.getByRole('button', { name: 'Copy run key rx-synthetic-example' }).first(),
              ).toBeVisible();
            if (name === 'volunteers')
              await expect(
                page.getByText('Ama Example', { exact: true }).filter({ visible: true }).first(),
              ).toBeVisible();
            await record(page, name, width, theme);
            if (role === 'public' && name === 'privacy') {
              await page.locator('footer').scrollIntoViewIfNeeded();
              await record(page, 'footer', width, theme);
              if (width === 390) {
                await page.evaluate(() => scrollTo(0, 0));
                await page.getByRole('button', { name: 'Open menu' }).click();
                await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
                await record(page, 'mobile-menu', width, theme);
                await page.keyboard.press('Escape');
              }
            }
          }
        }
      }
    });
  });
}
