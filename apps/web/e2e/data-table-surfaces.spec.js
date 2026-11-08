const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const bundleFixture = require('./component-fixtures/bundle.cjs');
let bundle;
test.beforeAll(async () => {
  bundle = await bundleFixture({ entry: 'DataTableSurfaces.tsx' });
});
async function mount(page, theme = 'light', width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/privacy');
  await page.evaluate((theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.body.innerHTML = '<main id="component-fixture"></main>';
  }, theme);
  await page.addScriptTag({ content: bundle });
  await expect(page.getByRole('heading', { name: 'Table surface verification' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function shot(page, name) {
  if (!process.env.DESIGN_COMPONENTS_DIR) return;
  fs.mkdirSync(process.env.DESIGN_COMPONENTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.DESIGN_COMPONENTS_DIR, `${name}.png`),
    fullPage: true,
  });
}
for (const theme of ['light', 'dark']) {
  for (const server of [false, true]) {
    test(`same rows, controls and state across container widths: ${theme} ${server ? 'server' : 'client'}`, async ({
      page,
    }) => {
      await mount(page, theme);
      if (server) await page.getByRole('button', { name: 'Toggle server', exact: true }).click();
      const panel = page.getByTestId('panel');
      const status = page.getByRole('status');
      await page.getByRole('button', { name: 'Record', exact: true }).click();
      await expect(panel.getByRole('columnheader', { name: 'Record' })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      const rowIds = await panel
        .locator('tr[data-row-id]')
        .evaluateAll((els) => els.map((el) => el.dataset.rowId));
      expect(rowIds).toEqual(['c', 'd']);
      const beforeResize = await status.innerText();
      await page.getByRole('button', { name: 'Toggle panel', exact: true }).click();
      await expect(panel.getByRole('table')).toHaveCount(0);
      await expect(panel.getByRole('region', { name: 'Surface records' })).toBeVisible();
      await expect(panel.getByRole('button', { name: /^Record\s*, ascending$/ })).toBeVisible();
      expect(
        await panel
          .locator('.data-table-cards [data-row-id]')
          .evaluateAll((els) => els.map((el) => el.dataset.rowId)),
      ).toEqual(rowIds);
      await expect(status).toHaveText(beforeResize);
      await expect(panel.getByRole('button', { name: 'Open c', exact: true })).toHaveCount(1);
      await panel.getByRole('button', { name: 'Open c', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(status).toContainText('opened: c');
      await shot(page, `narrow-panel-${theme}-${server}`);
      await panel.getByRole('button', { name: /^Record\s*, ascending$/ }).click();
      await expect(panel.getByRole('button', { name: /^Record\s*, descending$/ })).toBeVisible();
      await panel.getByRole('button', { name: /^Record\s*, descending$/ }).click();
      await expect(panel.getByRole('button', { name: /^Record\s*, unsorted$/ })).toBeVisible();
      await page.getByRole('button', { name: 'Toggle panel', exact: true }).click();
      await expect(panel.getByRole('columnheader', { name: 'Record' })).toHaveAttribute(
        'aria-sort',
        'none',
      );
      for (const width of [390, 744, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(panel.getByRole('table')).toHaveCount(width < 1024 ? 0 : 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(
          0,
        );
        const result = await new AxeBuilder({ page }).include('#component-fixture').analyze();
        expect(result.violations).toEqual([]);
        await shot(page, `surface-${width}-${theme}-${server}`);
      }
      // The panel has 16px viewport gutters: exercise the exact 960px content threshold.
      for (const [width, tables] of [
        [991, 0],
        [992, 1],
      ]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(panel.getByRole('table')).toHaveCount(tables);
      }
      await page.getByLabel('Filter surface records', { exact: true }).fill('record D');
      const previous = page.getByRole('button', { name: 'Previous page', exact: true });
      if (await previous.isEnabled()) await previous.click();
      await page.getByRole('button', { name: 'Toggle panel', exact: true }).click();
      await expect(panel.getByRole('button', { name: 'Open d', exact: true })).toHaveCount(1);
      await expect(panel.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
      await shot(page, `filtered-${theme}-${server}`);
    });
  }
  test(`empty, refresh, scroll and targets: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mount(page, theme, 390);
    const panel = page.getByTestId('panel');
    const first = panel.locator('.data-table-cards [data-row-id]').first();
    const before = await first.boundingBox();
    await page.getByRole('button', { name: 'Toggle refresh', exact: true }).click();
    expect(await first.boundingBox()).toEqual(before);
    await expect(panel.locator('.animate-refresh-sweep')).toBeVisible();
    const motion = await panel.locator('.animate-refresh-sweep').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        duration: parseFloat(style.animationDuration),
        iterations: style.animationIterationCount,
      };
    });
    expect(motion.duration).toBeLessThanOrEqual(0.00001);
    expect(motion.iterations).toBe('1');
    await page.getByRole('button', { name: 'Toggle empty', exact: true }).click();
    await expect(
      panel
        .getByRole('region', { name: 'Surface records' })
        .getByText('Nothing to show.', { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(panel.getByRole('table')).toContainText('Nothing to show.');
    await page.getByRole('button', { name: 'Toggle empty', exact: true }).click();
    const numeric = panel.locator('tbody tr').first().locator('td').nth(1);
    expect(await numeric.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right');
    await page.getByRole('button', { name: 'Toggle cards', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 1000 });
    const region = panel.getByRole('region', { name: 'Surface records' });
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('Rows per page', { exact: true }).click();
    await page.getByRole('option', { name: '4', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    const headerBefore = await panel.locator('thead').boundingBox();
    await region.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const headerAfter = await panel.locator('thead').boundingBox();
    expect(headerAfter.y).toBe(headerBefore.y);
    for (const box of await panel.getByRole('button').all()) {
      const bounds = await box.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await shot(page, `scroll-${theme}`);
  });
}

test('coarse pointers retain 52px table cells', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await mount(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const heights = await page
      .locator('tbody td')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((height) => height >= 52)).toBe(true);
  } finally {
    await context.close();
  }
});
