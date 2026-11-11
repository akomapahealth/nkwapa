const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const bundleFixture = require('./component-fixtures/bundle.cjs');
const { WIDTHS, overflow } = require('../playwright/responsive-routes');
const { hitTarget } = require('../playwright/hit-target');
let bundle;
test.beforeAll(async () => {
  bundle = await bundleFixture({
    entry: 'ResponsiveOffline.tsx',
    sourceWeb: process.env.RESPONSIVE_BASELINE_WEB,
    aliases: {
      '@/lib/db$': path.join(__dirname, 'component-fixtures/ResponsiveDb.ts'),
      '@/app/ServiceWorkerAndSyncProvider$': path.join(
        __dirname,
        'component-fixtures/ResponsiveSyncContext.tsx',
      ),
    },
  });
});
for (const width of WIDTHS)
  for (const theme of ['light', 'dark']) {
    test(`sync and contained tables ${width} ${theme}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/privacy');
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.body.innerHTML = '<main id="component-fixture"></main>';
      }, theme);
      await page.addScriptTag({ content: bundle });
      await expect(
        page.getByRole('heading', { name: 'Responsive and offline clinic fixtures' }),
      ).toBeVisible();
      const out = process.env.RESPONSIVE_EVIDENCE_DIR;
      async function capture(name) {
        if (!out) return;
        fs.mkdirSync(out, { recursive: true });
        await page.screenshot({
          path: path.join(out, `${name}--${width}--${theme}.jpg`),
          type: 'jpeg',
          quality: 70,
          fullPage: name === 'tables-chart-offline',
          animations: 'disabled',
        });
        const axe = await new AxeBuilder({ page }).analyze();
        fs.writeFileSync(
          path.join(out, `${name}--${width}--${theme}.axe.json`),
          JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }, null, 2),
        );
      }
      await capture('tables-chart-offline');
      const baseline = Boolean(process.env.RESPONSIVE_BASELINE_WEB);
      for (const mode of ['offline', 'error', 'changes', 'loading', 'online']) {
        await page.getByRole('button', { name: `Open ${mode}`, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Offline changes' });
        await expect(dialog).toBeVisible();
        await expect
          .poll(() => dialog.evaluate((el) => Math.round(el.getBoundingClientRect().right)))
          .toBe(width);
        await expect(dialog.getByText('Device storage', { exact: true })).toBeVisible();
        await capture(`sync-${mode}`);
        if (mode === 'changes') {
          const switchButton = dialog.getByRole('button', { name: /Switch to SyntheticClinic/ });
          await switchButton.scrollIntoViewIfNeeded();
          await dialog.getByText('Device storage', { exact: true }).click();
          await dialog.getByText('Used', { exact: true }).scrollIntoViewIfNeeded();
          await capture('sync-changes-bottom');
          await dialog
            .getByRole('article')
            .first()
            .getByRole('button', { name: 'Discard', exact: true })
            .click();
          const confirmation = page.getByRole('dialog', { name: 'Discard this offline change?' });
          await expect(confirmation).toBeVisible();
          await confirmation.getByRole('button', { name: 'Discard change', exact: true }).hover();
          await capture('sync-discard');
          if (!baseline) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await confirmation.getByRole('button', { name: 'Keep it', exact: true }).click();
        }
        if (!baseline) {
          if (['offline', 'error', 'loading'].includes(mode))
            await expect(dialog.getByRole('heading', { name: 'Everything is synced' })).toHaveCount(
              0,
            );
          if (mode === 'changes') {
            const switchButton = dialog.getByRole('button', { name: /Switch to SyntheticClinic/ });
            await switchButton.scrollIntoViewIfNeeded();
            const box = await switchButton.boundingBox();
            expect(box.width).toBeLessThan(width);
            const textBounds = await switchButton.evaluate((el) => ({
              scroll: el.scrollWidth,
              client: el.clientWidth,
            }));
            expect(textBounds.scroll).toBeLessThanOrEqual(textBounds.client);
            await expect(dialog.getByTestId('sync-held-group')).toBeVisible();
          }
          const axe = await new AxeBuilder({ page }).analyze();
          expect(axe.violations).toEqual([]);
          for (const box of await overflow(page))
            expect(box.scrollWidth, box.name).toBeLessThanOrEqual(box.clientWidth);
          const dimensions = await dialog.evaluate((el) => ({
            scroll: el.scrollWidth,
            client: el.clientWidth,
          }));
          expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
          if (mode === 'online') {
            const action = dialog.getByRole('button', { name: 'Sync now', exact: true });
            await action.evaluate((el) => {
              el.style.height = '24px';
              el.style.width = '24px';
            });
            const target = await hitTarget(action);
            expect(target.height).toBeGreaterThanOrEqual(44);
            expect(target.width).toBeGreaterThanOrEqual(44);
            await action.evaluate((el) => {
              el.style.removeProperty('height');
              el.style.removeProperty('width');
            });
          }
          const close = dialog.getByRole('button', { name: 'Close', exact: true });
          const box = await hitTarget(close);
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      }
      await context.setOffline(true);
      await expect(page.getByRole('heading', { name: 'No records yet' })).toHaveCount(0);
    });
  }
