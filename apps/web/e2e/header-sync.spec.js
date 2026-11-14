const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const bundleFixture = require('./component-fixtures/bundle.cjs');
const { storageStateFor } = require('../playwright/roles');
const { hitTarget } = require('../playwright/hit-target');

const WIDTHS = [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440];
const LABELS = {
  offline: 'Offline · 2 saved',
  syncing: 'Syncing…',
  attention: '1 needs attention',
  failed: 'Sync failed',
  queued: '2 queued',
  held: 'Review saved changes',
  synced: 'All synced',
};
async function capture(page, name) {
  if (!process.env.DESIGN_HEADER_DIR) return;
  fs.mkdirSync(process.env.DESIGN_HEADER_DIR, { recursive: true });
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: path.join(process.env.DESIGN_HEADER_DIR, `${name}.png`) });
}
async function inBounds(locator, width) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  const target = await hitTarget(locator);
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
}

test.describe('production header', () => {
  test.use({ storageState: storageStateFor('staff') });
  for (const theme of ['light', 'dark']) {
    test(`clinic/role hierarchy, utilities and text scaling: ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      const longName = 'Synthetic Outreach Clinic With A Very Long Name '.repeat(3);
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
      await page.route('**/auth/whoami', async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        for (const c of [...data.memberships, ...(data.availableClinics || [])])
          c.clinicName = c.clinicId === data.activeClinicId ? longName : c.clinicName;
        for (const m of data.memberships)
          if (m.clinicId === data.activeClinicId)
            m.roles = ['CLINIC_DIRECTOR', 'CLINIC_MANAGER', 'VOLUNTEER'];
        await route.fulfill({ response, json: data });
      });
      await page.goto('/dashboard');
      const header = page.getByRole('banner');
      const clinic = header.getByRole('combobox', { name: /Active clinic:/ });
      const role = header.getByText('Clinic Director, Clinic Manager, Volunteer', { exact: true });
      await expect(clinic).toHaveAccessibleName(/Synthetic Outreach Clinic.*Clinic Director/);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await expect(role).toBeVisible();
        const nameBox = await clinic.locator('[title]').first().boundingBox();
        const roleBox = await role.boundingBox();
        const lineHeight = await clinic.evaluate((el) =>
          parseFloat(getComputedStyle(el).lineHeight),
        );
        expect(nameBox.height).toBeLessThanOrEqual(lineHeight + 1);
        expect((await header.boundingBox()).height).toBeLessThanOrEqual(65);
        expect(roleBox.y).toBeGreaterThan(nameBox.y);
        for (const control of [
          clinic,
          header.getByTestId('sync-status'),
          header.getByRole('button', { name: 'User menu' }),
        ])
          await inBounds(control, width);
        // The bell is on every width; it replaced the message delivery icon.
        await expect(header.getByRole('link', { name: /^Notifications/ })).toBeVisible();
        await expect(header.getByRole('button', { name: 'Sync now', exact: true })).toBeVisible({
          visible: width >= 600,
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        ).toBeLessThanOrEqual(1);
        await capture(page, `header-${width}-${theme}`);
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      for (const control of [
        clinic,
        header.getByTestId('sync-status'),
        header.getByRole('button', { name: 'User menu' }),
      ])
        await inBounds(control, 320);
      expect((await clinic.locator('[title]').first().boundingBox()).width).toBeGreaterThanOrEqual(
        64,
      );
      expect((await role.boundingBox()).width).toBeGreaterThanOrEqual(64);
      await expect(header.getByTestId('sync-status')).toHaveText('');
      await expect(header.getByTestId('sync-status')).toHaveAccessibleName(/All synced/);
      await capture(page, `header-scaled-${theme}`);
      await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
      await clinic.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('listbox')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(clinic).toBeFocused();
      const axe = await new AxeBuilder({ page }).analyze();
      if (process.env.DESIGN_HEADER_DIR)
        fs.writeFileSync(
          path.join(process.env.DESIGN_HEADER_DIR, `header-closed-${theme}.axe.json`),
          JSON.stringify(axe.violations, null, 2),
        );
      expect(axe.violations).toEqual([]);
    });
  }

  test('clinic switching succeeds, reports refusal, and retains keyboard access to account actions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    const clinic = page.getByRole('banner').getByRole('combobox');
    await clinic.press('Enter');
    const originalName = await page.getByRole('option', { selected: true }).innerText();
    const other = page.getByRole('option', { selected: false }).first();
    const otherName = await other.innerText();
    await other.click();
    await expect(page.getByText(`Now viewing ${otherName}`, { exact: true })).toBeVisible();
    await expect(clinic).toHaveAccessibleName(new RegExp(otherName));
    // Refusal: return the current scope even when a different clinic was requested.
    let retained;
    await page.route('**/auth/whoami', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      if (!retained) retained = data;
      await route.fulfill({ response, json: retained });
    });
    // Capture the currently accepted scope before requesting the original clinic again.
    await page.reload();
    await expect(clinic).toHaveAccessibleName(new RegExp(otherName));
    await clinic.press('Enter');
    await page.getByRole('option', { name: originalName, exact: true }).click();
    await expect(
      page.getByRole('alert').getByText(`Could not switch to ${originalName}`, { exact: true }),
    ).toBeVisible();
    await expect(clinic).toHaveAccessibleName(new RegExp(otherName));
    const account = page.getByRole('button', { name: 'User menu' });
    await account.press('Enter');
    for (const name of ['Manage profile', 'Your settings', 'Log out'])
      await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
  });

  test('no active clinic keeps the account and More reachable without a false sync claim', async ({
    page,
  }) => {
    await page.route('**/auth/whoami', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({
        response,
        json: {
          ...data,
          activeClinicId: null,
          availableClinics: [],
          memberships: [],
          effectivePermissionsForActiveClinic: [],
        },
      });
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/account');
    const header = page.getByRole('banner');
    await expect(header.getByText('Choose an active clinic')).toBeVisible();
    await expect(header.getByTestId('sync-status')).toHaveCount(0);
    await inBounds(header.getByRole('button', { name: 'User menu' }), 320);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
  });
});

test.describe('production sync pill with controlled queue inputs', () => {
  let bundle;
  test.beforeAll(async () => {
    bundle = await bundleFixture({
      entry: 'SyncPill.tsx',
      aliases: {
        '@/lib/db$': path.join(__dirname, 'component-fixtures/ResponsiveDb.ts'),
        '@/lib/sync$': path.join(__dirname, 'component-fixtures/SyncPillState.tsx'),
        '@/lib/use-outbox-queue$': path.join(__dirname, 'component-fixtures/SyncPillState.tsx'),
        '@/lib/other-clinic-queue$': path.join(__dirname, 'component-fixtures/SyncPillState.tsx'),
        '@/app/ServiceWorkerAndSyncProvider$': path.join(
          __dirname,
          'component-fixtures/ResponsiveSyncContext.tsx',
        ),
      },
    });
  });
  for (const theme of ['light', 'dark']) {
    test(`all states, stable geometry, recovery and reduced motion: ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto('/privacy');
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.body.innerHTML =
          '<main id="component-fixture" style="font-family:var(--font-body),system-ui,sans-serif"></main>';
      }, theme);
      await page.addScriptTag({ content: bundle });
      const pill = page.getByTestId('sync-status');
      const adjacent = page.getByRole('button', { name: 'Adjacent action' });
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const initial = await adjacent.boundingBox();
        for (const [state, label] of Object.entries(LABELS)) {
          await page.getByRole('button', { name: `Show ${state}`, exact: true }).click();
          await expect(pill).toHaveAttribute('data-state', state);
          await expect(pill.locator(`[data-sync-icon="${state}"]`)).toHaveCSS('opacity', '1');
          await expect(pill).toHaveAccessibleName(`Offline changes: ${label}. Open sync center.`);
          if (state === 'synced') await expect(pill).toHaveText('');
          else await expect(pill).toContainText(/offline|syncing|attention|failed|queued|review/i);
          await inBounds(pill, width);
          const after = await adjacent.boundingBox();
          expect(after.x).toBe(initial.x);
          expect(after.y).toBe(initial.y);
          await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeVisible({
            visible: width >= 600,
          });
          if (width >= 600)
            await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled({
              enabled: !['offline', 'syncing'].includes(state),
            });
          if (width === 390) {
            const axe = await new AxeBuilder({ page })
              .include('[data-testid="pill-row"]')
              .analyze();
            if (process.env.DESIGN_HEADER_DIR)
              fs.writeFileSync(
                path.join(process.env.DESIGN_HEADER_DIR, `sync-${state}-${theme}.axe.json`),
                JSON.stringify(axe.violations, null, 2),
              );
            expect(axe.violations).toEqual([]);
          }
          if ([390, 600, 1440].includes(width))
            await capture(page, `sync-${state}-${width}-${theme}`);
        }
      }
      // Verify interruption using the real opacity transition, paused mid-flight.
      await page.getByRole('button', { name: 'Show offline' }).click();
      const sample = await pill.locator('[data-sync-icon="synced"]').evaluate(async (el) => {
        const transition = el.getAnimations().find((a) => a.transitionProperty === 'opacity');
        if (!transition) return null;
        transition.pause();
        transition.currentTime = 60;
        const before = parseFloat(getComputedStyle(el).opacity);
        [...document.querySelectorAll('button')]
          .find((b) => b.textContent === 'Show synced')
          .click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const reversed = el.getAnimations().find((a) => a.transitionProperty === 'opacity');
        return { before, start: Number(reversed?.effect.getKeyframes()[0].opacity) };
      });
      expect(sample).not.toBeNull();
      expect(sample.before).toBeGreaterThan(0);
      expect(sample.before).toBeLessThan(1);
      expect(sample.start).toBeCloseTo(sample.before, 1);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const state of [
        'syncing',
        'offline',
        'failed',
        'queued',
        'held',
        'attention',
        'synced',
      ]) {
        await page.getByRole('button', { name: `Show ${state}`, exact: true }).click();
        const icon = pill.locator(`[data-sync-icon="${state}"]`);
        await expect(icon).toHaveCSS('opacity', '1');
        // The shared reduced-motion rule uses a 0.01ms !important clamp.
        expect(
          await icon.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration)),
        ).toBeLessThan(0.001);
        await expect(icon).toHaveCSS('transform', 'none');
        if (state === 'syncing')
          await expect(icon.locator('svg')).toHaveCSS('animation-name', 'none');
      }
      await pill.focus();
      await expect(page.getByRole('tooltip')).toHaveText('All synced');
      await pill.press('Enter');
      const sheet = page.getByRole('dialog', { name: 'Offline changes' });
      await expect(sheet).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(pill).toBeFocused();
      await page.getByRole('button', { name: 'Sync now', exact: true }).click();
      await expect(page.getByText('Sync requests: 1')).toBeVisible();
      // Scan the actual pill without the intentionally unstyled fixture controls.
      expect(
        (await new AxeBuilder({ page }).include('[data-testid="pill-row"]').analyze()).violations,
      ).toEqual([]);
    });
  }
});
