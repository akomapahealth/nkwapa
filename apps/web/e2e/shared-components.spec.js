const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const bundleFixture = require('./component-fixtures/bundle.cjs');
let bundle;
test.beforeAll(async () => {
  bundle = await bundleFixture();
});

async function mount(page, theme, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/privacy');
  await page.evaluate((theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.body.innerHTML = '<main id="component-fixture"></main>';
  }, theme);
  await page.addScriptTag({ content: bundle });
  await expect(page.getByRole('heading', { name: 'Shared clinic foundations' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function axe(page) {
  const result = await new AxeBuilder({ page }).include('#component-fixture').analyze();
  expect(result.violations).toEqual([]);
}
for (const width of [1440, 390])
  for (const theme of ['light', 'dark']) {
    test(`foundations and resource states at ${width} ${theme}`, async ({ page }, testInfo) => {
      await mount(page, theme, width);
      const resource = page.getByTestId('resource');
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
      for (const label of ['In review', 'Draft', 'Finalized', 'Stage 2', 'Unknown']) {
        await expect(
          page.getByRole('region', { name: 'Status labels' }).getByText(label, { exact: true }),
        ).toBeVisible();
      }
      expect(await page.locator('#component-fixture').innerText()).not.toMatch(
        /IN_REVIEW|FINALIZED|STAGE2|UNKNOWN|DRAFT/,
      );
      await axe(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (process.env.DESIGN_COMPONENTS_DIR) {
        const dir = process.env.DESIGN_COMPONENTS_DIR;
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `foundations-${width}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        await testInfo.attach('Foundations', { path: file, contentType: 'image/png' });
      }
      for (const mode of ['loading', 'offline', 'error', 'empty', 'stale', 'refreshing', 'saved']) {
        await page.getByRole('button', { name: `Show ${mode}`, exact: true }).click();
        if (mode === 'loading') {
          await expect(resource).toContainText('Loading');
          await expect(resource.getByRole('table')).toHaveCount(0);
        }
        if (mode === 'offline') {
          await expect(resource).toContainText('You are offline');
          await expect(resource.getByRole('table')).toHaveCount(0);
        }
        if (mode === 'error') {
          await expect(resource).toContainText("We couldn't load this view");
          await resource.getByRole('button', { name: 'Try again' }).click();
          await expect(page.getByText('Retries: 1', { exact: true })).toBeVisible();
        }
        if (mode === 'empty')
          await expect(resource.getByRole('heading', { name: 'No records yet' })).toBeVisible();
        if (['stale', 'refreshing', 'saved'].includes(mode))
          await expect(resource.getByRole('table')).toBeVisible();
        if (mode === 'stale')
          await expect(resource).toContainText('Showing the last version that loaded');
        if (mode === 'refreshing')
          await expect(resource.locator('[aria-busy="true"]')).toBeVisible();
        await axe(page);
      }
    });
  }
test('table controls, help and actions retain keyboard behaviour', async ({ page }) => {
  await mount(page, 'light', 1440);
  await page.getByRole('button', { name: 'Open review', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Actions taken: 1', { exact: true })).toBeVisible();
  const table = page.getByRole('table');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('Synthetic record A');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('Synthetic record C');
  await page.getByLabel('Filter records', { exact: true }).fill('Synthetic record B');
  await expect(table).toContainText('Synthetic record B');
  await expect(table).not.toContainText('Synthetic record C');
  const trigger = page.getByRole('button', { name: /^Show help:/ }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-describedby', await tooltip.getAttribute('id'));
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
test('skeleton motion stops when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mount(page, 'dark', 390);
  await page.getByRole('button', { name: 'Show loading', exact: true }).click();
  const animationNames = await page
    .getByTestId('resource')
    .locator('[aria-hidden="true"] div')
    .evaluateAll((elements) => elements.map((el) => getComputedStyle(el).animationName));
  expect(animationNames.length).toBeGreaterThan(0);
  expect(animationNames.every((name) => name === 'none')).toBe(true);
});
