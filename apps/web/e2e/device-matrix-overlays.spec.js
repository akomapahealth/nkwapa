const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const {
  WIDTHS,
  THEMES,
  INPUTS,
  prepare,
  ready,
  record,
  reachable,
  requireAuditDatabase,
} = require('../playwright/device-matrix.cjs');

test.beforeAll(() => requireAuditDatabase());

async function activate(control, input) {
  if (input === 'touch') await control.tap();
  else await control.click();
}

async function keyboardDismiss(page, dialog, opener) {
  await dialog.getByRole('button').first().focus();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
}

for (const input of INPUTS)
  for (const theme of THEMES)
    test.describe(`overlays ${input} ${theme}`, () => {
      test.use({ storageState: storageStateFor('staff'), hasTouch: input === 'touch' });
      test('R8.2 More, sync and chat boundaries, focus and short height', async ({
        page,
      }, info) => {
        test.setTimeout(180_000);
        await prepare(page, theme);
        await page.goto('/dashboard');
        await ready(page);
        const cases = [
          ...WIDTHS.map((width) => ({ width, height: 640, scale: false })),
          { width: 320, height: 900, scale: true },
          { width: 600, height: 900, scale: true },
          { width: 568, height: 320, scale: false },
        ];
        for (const { width, height, scale } of cases) {
          await page.setViewportSize({ width, height });
          await page.evaluate((enlarged) => {
            document.documentElement.style.fontSize = enlarged ? '200%' : '';
            scrollTo(0, 0);
          }, scale);
          const suffix = `${input}-${theme}-${width}x${height}${scale ? '-text200' : ''}`;
          if (width < 600) {
            const more = page.getByRole('button', { name: 'More', exact: true });
            await activate(more, input);
            const dialog = page.getByRole('dialog', { name: 'More', exact: true });
            const syncLink = dialog.getByRole('button', {
              name: 'Saved changes and sync',
              exact: true,
            });
            await reachable(syncLink);
            await record(page, info, `more-${suffix}`);
            await keyboardDismiss(page, dialog, more);
            await activate(more, input);
            await activate(syncLink, input);
          } else {
            await activate(page.getByTestId('sync-status'), input);
          }
          const sync = page.getByRole('dialog', { name: 'Offline changes', exact: true });
          await expect(sync).toBeVisible();
          await record(page, info, `sync-${suffix}`);
          await keyboardDismiss(
            page,
            sync,
            width < 600
              ? page.getByRole('button', { name: 'More', exact: true })
              : page.getByTestId('sync-status'),
          );
          const chat = page.getByRole('button', { name: 'Open chat', exact: true });
          await activate(chat, input);
          const panel = page.getByTestId('chat-panel');
          await expect(panel).toBeVisible();
          await activate(
            panel.getByRole('button', { name: 'New message', exact: true }).first(),
            input,
          );
          const search = panel.getByPlaceholder('Search staff...');
          await search.fill('Synthetic matrix search');
          await record(page, info, `chat-picker-${suffix}`);
          await reachable(search);
          if (width === 320 && !scale)
            expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await search.focus();
          await page.keyboard.press('Escape');
          await expect(panel).toBeHidden();
          await expect(chat).toBeFocused();
          // Reset the picker without selecting a recipient or sending a message.
          await activate(chat, input);
          await activate(panel.getByRole('button', { name: 'Back', exact: true }), input);
          await panel.getByRole('button').first().focus();
          await page.keyboard.press('Escape');
          await expect(panel).toBeHidden();
        }
      });

      test('R8.2 skip link and form keyboard traversal at 200% text', async ({ page }, info) => {
        await prepare(page, theme);
        await page.setViewportSize({ width: 320, height: 900 });
        await page.goto('/patients/new');
        await ready(page);
        await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
        await page.keyboard.press('Tab');
        await expect(
          page.getByRole('link', { name: 'Skip to main content', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('#main-content')).toBeFocused();
        await page.getByLabel('First name', { exact: true }).focus();
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press('Tab');
          const focused = page.locator(':focus');
          await expect(focused).toHaveCount(1);
          await expect(focused).toBeInViewport();
          expect(await focused.evaluate((el) => el.closest('main') !== null)).toBe(true);
        }
        await record(page, info, `keyboard-registration-${input}-${theme}-text200`);
      });
    });
