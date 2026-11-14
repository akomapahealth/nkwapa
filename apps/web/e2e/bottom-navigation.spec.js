const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });
const primaryNav = (page) => page.getByRole('navigation', { name: 'Primary', exact: true });
async function settle(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
}
async function capture(page, name) {
  if (!process.env.DESIGN_SHELL_DIR) return;
  fs.mkdirSync(process.env.DESIGN_SHELL_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.DESIGN_SHELL_DIR, `${name}.png`) });
}

for (const theme of ['light', 'dark']) {
  test(`phone targets, More focus, clearance and boundaries: ${theme}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    const nav = primaryNav(page);
    await expect(nav.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const width of [320, 390, 599]) {
      await page.setViewportSize({ width, height: 640 });
      await expect(nav).toBeVisible();
      await expect(
        nav.getByRole('link', { name: 'Dashboard', exact: true }).locator('span:visible'),
      ).toHaveText('Home');
      for (const control of await nav.locator('a,button').all()) {
        const box = await control.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(60);
        expect(await control.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        for (const label of await control.locator('span:visible').all()) {
          const box = await label.boundingBox();
          const line = await label.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
          expect(box.height).toBeLessThanOrEqual(line + 1);
        }
      }
      const chatBox = await page.getByTestId('chat-toggle').boundingBox();
      const navBox = await nav.boundingBox();
      expect(chatBox.y + chatBox.height).toBeLessThan(navBox.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(page, `bottom-${width}-${theme}`);
    }
    await page.setViewportSize({ width: 390, height: 640 });
    await page.getByTestId('chat-toggle').click();
    const panel = page.getByTestId('chat-panel');
    await expect(panel).toBeVisible();
    expect((await panel.boundingBox()).y).toBeGreaterThanOrEqual(0);
    // Phone chat is modal; its launcher is correctly inert behind the sheet.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    // A synthetic final action checks actual pointer reachability above chat and the bar.
    await page.locator('main > div').evaluate((el) => {
      const button = document.createElement('button');
      button.textContent = 'Shell final action';
      button.style.cssText = 'display:block;margin-left:auto;min-height:44px';
      button.onclick = () => (button.textContent = 'Final action reached');
      el.append(button);
    });
    await page.getByRole('button', { name: 'Shell final action' }).click();
    await expect(page.getByRole('button', { name: 'Final action reached' })).toBeVisible();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'More', exact: true });
    await expect(sheet).toBeVisible();
    await settle(page);
    await capture(page, `more-open-${theme}`);
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await sheet.getByRole('button', { name: 'Saved changes and sync' }).focus();
    const last = await sheet.getByRole('button', { name: 'Saved changes and sync' }).boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual(640);
    await capture(page, `more-${theme}`);
    // Preserve full-page diagnostics, including the pre-existing open-overlay finding.
    const result = await new AxeBuilder({ page }).analyze();
    await testInfo.attach(`more-full-page-axe-${theme}`, {
      body: JSON.stringify(result.violations, null, 2),
      contentType: 'application/json',
    });
    if (process.env.DESIGN_SHELL_DIR)
      fs.writeFileSync(
        path.join(process.env.DESIGN_SHELL_DIR, `more-axe-${theme}.json`),
        JSON.stringify(result.violations, null, 2),
      );
    await page.keyboard.press('Tab');
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(nav.getByRole('button', { name: 'More', exact: true })).toBeFocused();
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    for (const control of await nav.locator('a,button').all()) {
      expect(await control.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await capture(page, `bottom-text-scale-${theme}`);
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await nav
        .locator('span[aria-hidden="true"]')
        .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration)),
    ).toBeLessThan(0.001);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.setViewportSize({ width: 600, height: 640 });
    await expect(sheet).toBeHidden();
    await expect(nav).toBeHidden();
    await expect(page.locator('main')).toBeFocused();
    await expect(page.locator('#workspace-sidebar')).toBeVisible();
    await page.setViewportSize({ width: 599, height: 640 });
    await expect(nav).toBeVisible();
    await expect(sheet).toBeHidden();
  });
}

test('current route, overflow route, history and sync handoff', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  const nav = primaryNav(page);
  await nav.getByRole('link', { name: 'Queues', exact: true }).click();
  await expect(page).toHaveURL(/\/queues$/);
  await expect(nav.getByRole('link', { name: 'Queues', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('button', { name: 'More', exact: true }).click();
  let sheet = page.getByRole('dialog', { name: 'More', exact: true });
  await sheet.getByRole('link', { name: 'New patient', exact: true }).click();
  await expect(page).toHaveURL(/\/clinics\/[^/]+\/patients\/new$/);
  await expect(sheet).toBeHidden();
  await expect(nav.getByRole('button', { name: 'More', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(nav.locator('a[aria-current]')).toHaveCount(0);
  await page.goBack();
  await expect(nav.getByRole('link', { name: 'Queues', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('button', { name: 'More', exact: true }).click();
  await sheet.getByRole('button', { name: 'Saved changes and sync' }).click();
  const sync = page.getByRole('dialog', { name: 'Offline changes' });
  await expect(sheet).toBeHidden();
  await expect(sync).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(await sync.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sync).toBeHidden();
  await expect(nav.getByRole('button', { name: 'More', exact: true })).toBeFocused();
  await nav.getByRole('button', { name: 'More', exact: true }).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  const headerSync = page.getByTestId('sync-status');
  await headerSync.focus();
  await page.keyboard.press('Enter');
  await expect(sync).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sync).toBeHidden();
  await expect(headerSync).toBeFocused();
});

test('desktop collapse and tablet rail keep icon labels visually hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  const sidebar = page.locator('#workspace-sidebar');
  await expect.poll(() => sidebar.evaluate((el) => el.getBoundingClientRect().width)).toBe(64);
  for (const label of await sidebar.locator('nav a > span').all()) {
    expect(
      await label.evaluate((el) => ({
        width: el.getBoundingClientRect().width,
        position: getComputedStyle(el).position,
      })),
    ).toEqual({ width: 1, position: 'absolute' });
  }
  await capture(page, 'collapsed-desktop-icons-only');
  await page.setViewportSize({ width: 744, height: 900 });
  for (const label of await sidebar.locator('nav a > span').all()) {
    expect(await label.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
  }
});
