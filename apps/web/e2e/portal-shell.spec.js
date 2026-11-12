const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const { queueOfflineChange, outboxCount } = require('../playwright/outbox');

test.use({ storageState: storageStateFor('patient') });
const nav = (page) => page.getByRole('navigation', { name: 'Patient portal', exact: true });
const more = (page) => page.getByRole('button', { name: 'More', exact: true });
async function settle(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
}
async function capture(page, name) {
  if (!process.env.DESIGN_PORTAL_DIR) return;
  fs.mkdirSync(process.env.DESIGN_PORTAL_DIR, { recursive: true });
  await settle(page);
  await page.screenshot({ path: path.join(process.env.DESIGN_PORTAL_DIR, `${name}.png`) });
}
for (const theme of ['light', 'dark']) {
  test.describe(`portal shell: ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    });
    test('all width boundaries retain one draft and reachable actions', async ({ page }) => {
      test.setTimeout(120_000);
      await page.route('**/auth/whoami', async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        for (const clinic of [...data.memberships, ...(data.availableClinics || [])])
          clinic.clinicName = 'Synthetic Patient Clinic With A Very Long Name '.repeat(3);
        await route.fulfill({ response, json: data });
      });
      await page.goto('/portal/self-reports/new');
      const notes = page.getByLabel('Notes', { exact: true });
      await notes.fill('Synthetic draft retained across shell presentations');
      const original = await notes.elementHandle();
      for (const width of [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await expect(nav(page)).toBeVisible();
        await expect(
          nav(page).getByRole('link', { name: 'My health', exact: true }),
        ).toHaveAttribute('aria-current', width < 600 ? 'page' : 'location');
        await expect(more(page)).toBeVisible({ visible: width < 600 });
        await expect(
          page.getByRole('button', { name: 'Open navigation', exact: true }),
        ).toHaveCount(0);
        await expect(notes).toHaveValue('Synthetic draft retained across shell presentations');
        expect(await original.evaluate((el) => el === document.querySelector('#notes'))).toBe(true);
        for (const control of await nav(page).locator('a,button').all()) {
          const box = await control.boundingBox();
          if (!box) continue;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        ).toBeLessThanOrEqual(1);
        await page.locator('main').evaluate((el) => el.scrollIntoView());
        await page.evaluate(() => scrollTo(0, 0));
        await capture(page, `portal-${width}-${theme}`);
      }
      await page.setViewportSize({ width: 320, height: 800 });
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      for (const control of await nav(page).locator('a,button').all())
        expect(await control.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await capture(page, `portal-text-${theme}`);
      // Long content must not hide the final action behind the fixed navigation.
      await page.locator('main > div').evaluate((el) => {
        const spacer = document.createElement('div');
        spacer.style.height = '1200px';
        const button = document.createElement('button');
        button.textContent = 'Synthetic final action';
        button.onclick = () => (button.textContent = 'Final action reached');
        el.append(spacer, button);
      });
      const final = page.getByRole('button', { name: 'Synthetic final action' });
      await final.scrollIntoViewIfNeeded();
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      const bottom = await nav(page).boundingBox(),
        action = await final.boundingBox();
      expect(action.y + action.height).toBeLessThanOrEqual(bottom.y);
      await final.click();
      await expect(page.getByRole('button', { name: 'Final action reached' })).toBeVisible();
    });
    test('More supports keyboard, focus, account routes, history, resize and reduced motion', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto('/portal');
      await expect(page.getByTestId('sync-status')).toHaveCount(0);
      await more(page).focus();
      await page.keyboard.press('Enter');
      const sheet = page.getByRole('dialog', { name: 'More', exact: true });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Saved changes and sync' })).toHaveCount(0);
      await expect(sheet.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
      await settle(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await capture(page, `portal-more-${theme}`);
      await sheet.getByRole('link', { name: 'Your settings', exact: true }).focus();
      await page.keyboard.press('Tab');
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(more(page)).toBeFocused();
      await more(page).click();
      await settle(page);
      const handle = await sheet.getByRole('button', { name: /^Close sheet/ }).boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 200);
      await page.mouse.up();
      await expect(sheet).toBeHidden();
      await expect(more(page)).toBeFocused();
      for (let i = 0; i < 2; i++) {
        await more(page).click();
        await page.keyboard.press('Escape');
        await expect(more(page)).toBeFocused();
      }
      await more(page).click();
      await sheet.getByRole('link', { name: 'Your settings', exact: true }).click();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(sheet).toBeHidden();
      await expect(more(page)).toHaveAttribute('aria-current', 'true');
      await more(page).click();
      await sheet.getByRole('link', { name: 'Manage profile', exact: true }).click();
      await expect(page).toHaveURL(/\/account$/);
      await page.goBack();
      await expect(page).toHaveURL(/\/settings$/);
      await more(page).click();
      await page.goBack();
      await expect(page).toHaveURL(/\/portal$/);
      await expect(sheet).toBeHidden();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await more(page).click();
      await page.setViewportSize({ width: 600, height: 800 });
      await expect(sheet).toBeHidden();
      await expect(page.locator('main')).toBeFocused();
      await page.setViewportSize({ width: 599, height: 800 });
      await expect(sheet).toBeHidden();
      await expect(more(page)).toBeVisible();
      const indicator = nav(page).locator('span[aria-hidden="true"]').first();
      expect(
        await indicator.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration)),
      ).toBeLessThan(0.001);
      await nav(page).getByRole('link', { name: 'Appointments', exact: true }).click();
      await expect(page).toHaveURL(/\/portal\/appointments$/);
      await expect(
        nav(page).getByRole('link', { name: 'Appointments', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    });
    test('held changes expose truthful recovery and preserve the More-to-sync focus handoff', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      const whoami = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/auth/whoami' && r.ok(),
      );
      await page.goto('/portal');
      const bootstrap = await (await whoami).json();
      await expect(nav(page)).toBeVisible();
      expect(bootstrap.effectivePermissionsForActiveClinic).not.toContain('SYNC.PUSH');
      await queueOfflineChange(page, {
        id: randomUUID(),
        clinicId: theme === 'dark' ? randomUUID() : bootstrap.activeClinicId,
        ownerUserId: 'synthetic-other-account',
        entityType: 'patient',
        entityId: randomUUID(),
        operation: 'UPSERT',
        payloadJson: '{}',
        idempotencyKey: randomUUID(),
        createdAt: new Date().toISOString(),
      });
      await page.reload();
      await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'held');
      await more(page).click();
      const sheet = page.getByRole('dialog', { name: 'More', exact: true });
      await sheet.getByRole('button', { name: 'Saved changes and sync' }).click();
      const sync = page.getByRole('dialog', { name: 'Offline changes' });
      await expect(sync).toBeVisible();
      await expect(sheet).toBeHidden();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      expect(await sync.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await expect(sync.getByRole('button', { name: 'Sync now', exact: true })).toBeDisabled();
      await capture(page, `portal-held-sync-${theme}`);
      await page.keyboard.press('Escape');
      await expect(more(page)).toBeFocused();
      expect(await outboxCount(page)).toBe(1);
      await page.getByTestId('sync-status').click();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('sync-status')).toBeFocused();
    });
  });
}

// Staff can visit portal routes too; existing authorized Header utilities must not
// disappear in the 600–767px gap when the phone More presentation is hidden.
test.describe('portal shell with existing staff permissions', () => {
  test.use({ storageState: storageStateFor('staff') });
  for (const theme of ['light', 'dark']) {
    test(`authorized Header utilities remain reachable across 600px: ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
      await page.goto('/portal');
      for (const width of [390, 600, 767, 768, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await expect(
          page.getByRole('banner').getByRole('link', { name: 'Message delivery' }),
        ).toBeVisible({ visible: width >= 600 });
        if (width < 600) {
          await more(page).click();
          await expect(
            page
              .getByRole('dialog', { name: 'More', exact: true })
              .getByRole('link', { name: 'Message delivery' }),
          ).toBeVisible();
          await page.keyboard.press('Escape');
        }
      }
    });
  }
});
