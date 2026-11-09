const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
async function dismiss(page, sheet, side, name) {
  await expect(sheet).toBeVisible();
  await sheet.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})));
  });
  const handle = sheet.getByRole('button', { name: /^Close sheet/ });
  const box = await handle.boundingBox();
  if (process.env.DESIGN_SHEET_DIR) {
    fs.mkdirSync(process.env.DESIGN_SHEET_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.DESIGN_SHEET_DIR, `${name}.png`) });
  }
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (side === 'right' ? 200 : 0), y + (side === 'bottom' ? 200 : 0));
  await page.mouse.up();
  await expect(sheet).toBeHidden();
}
for (const theme of ['light', 'dark']) {
  test.describe(`actual Sheet consumers: ${theme}`, () => {
    test.use({ storageState: storageStateFor('staff'), reducedMotion: 'no-preference' });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    });
    test('More to sync then drag restores its actual entry point', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto('/dashboard');
      const more = page.getByRole('button', { name: 'More', exact: true });
      await more.click();
      const sheet = page.getByRole('dialog', { name: 'More', exact: true });
      await sheet.getByRole('button', { name: 'Saved changes and sync', exact: true }).click();
      const sync = page.getByRole('dialog', { name: 'Offline changes' });
      await expect(sheet).toBeHidden();
      await dismiss(page, sync, 'right', `sync-${theme}`);
      await expect(more).toBeFocused();
      await more.click();
      await dismiss(page, sheet, 'bottom', `more-${theme}`);
      await expect(more).toBeFocused();
    });
    test('comparison dismisses without recording a decision', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const writes = [];
      page.on('request', (request) => {
        if (request.method() !== 'GET' && /duplicates/.test(request.url()))
          writes.push(request.url());
      });
      await page.goto('/admin/duplicates');
      const trigger = page
        .getByRole('table')
        .getByRole('button', { name: 'Compare', exact: true })
        .first();
      await trigger.click();
      await dismiss(page, page.getByRole('dialog'), 'right', `compare-${theme}`);
      expect(writes).toEqual([]);
      await expect(trigger).toBeFocused();
    });
    test('staff access dismisses without a lifecycle action', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/admin/users');
      const trigger = page.getByRole('button', { name: 'Manage', exact: true }).first();
      const openingControl = await trigger.elementHandle();
      await trigger.click();
      await dismiss(page, page.getByRole('dialog'), 'right', `staff-access-${theme}`);
      // The roster can replace its cell controls when selection updates its columns.
      if (await openingControl.evaluate((el) => el.isConnected))
        await expect(trigger).toBeFocused();
      else await expect(page.locator('#main-content')).toBeFocused();
    });
    test('public navigation retains links and drag dismissal', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto('/');
      const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
      await trigger.click();
      const sheet = page.getByRole('dialog', { name: 'Menu', exact: true });
      await expect(sheet.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
      await dismiss(page, sheet, 'right', `public-menu-${theme}`);
      await expect(trigger).toBeFocused();
    });
  });
  test.describe(`patient portal shared-primitive regression: ${theme}`, () => {
    test.use({ storageState: storageStateFor('patient') });
    test('portal navigation and ineligible sync remain unchanged', async ({ page }) => {
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto('/portal');
      await expect(page.getByRole('navigation', { name: 'Patient portal' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Offline changes:.*Open sync center/ }),
      ).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page
        .getByRole('navigation', { name: 'Patient portal' })
        .getByRole('link', { name: 'My Health', exact: true })
        .click();
      await expect(page).toHaveURL(/\/portal\/health$/);
    });
  });
}
