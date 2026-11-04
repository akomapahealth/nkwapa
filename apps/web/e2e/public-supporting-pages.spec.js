const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

const CONSENT_KEY = 'nkwapa.cookie-consent';
const SIGNED_OUT = { cookies: [], origins: [] };

async function trackConsentWrites(page, saved = null) {
  await page.addInitScript(
    ({ key, saved }) => {
      if (saved !== null) localStorage.setItem(key, saved);
      window.__publicConsentWrites = [];
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) window.__publicConsentWrites.push(value);
        return setItem.call(this, name, value);
      };
    },
    { key: CONSENT_KEY, saved },
  );
}

async function consentSnapshot(page) {
  return page.evaluate(
    (key) => ({
      saved: localStorage.getItem(key),
      writes: window.__publicConsentWrites,
    }),
    CONSENT_KEY,
  );
}

test.describe('public navigation contracts', () => {
  test.use({ storageState: SIGNED_OUT });

  for (const path of [
    '/status',
    '/research',
    '/volunteers',
    '/volunteers/events',
    '/volunteers/events/synthetic-screening-day',
  ]) {
    test(`${path} retains its signed-out sign-in redirect`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL((url) => {
        return url.pathname === '/login' && url.searchParams.get('next') === path;
      });
      await expect(page.getByRole('heading', { name: /sign in to continue/i })).toBeVisible();
    });
  }

  test('footer settings retain fresh essential-only defaults without saving on open or Escape', async ({
    page,
  }) => {
    await trackConsentWrites(page);
    await page.goto('/privacy');
    const trigger = page.locator('footer').getByRole('button', { name: 'Cookie settings' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Cookie settings' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Essential', exact: true })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Essential', exact: true })).toBeDisabled();
    await expect(
      dialog.getByRole('checkbox', { name: 'Analytics', exact: true }),
    ).not.toBeChecked();
    expect(await consentSnapshot(page)).toEqual({ saved: null, writes: [] });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await consentSnapshot(page)).toEqual({ saved: null, writes: [] });
  });

  test('cookie policy and footer reopen the same consent dialog and essential-only saves the existing format', async ({
    page,
  }) => {
    await trackConsentWrites(page);
    await page.goto('/cookies');
    const policy = page
      .locator('main')
      .getByRole('button', { name: 'open cookie settings', exact: true });
    await policy.click();
    const dialog = page.getByRole('dialog', { name: 'Cookie settings' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('checkbox', { name: 'Analytics', exact: true }),
    ).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Essential only', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(policy).toBeFocused();
    const snapshot = await consentSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
    expect(JSON.parse(snapshot.saved)).toEqual({
      analytics: false,
      version: 1,
      decidedAt: expect.any(String),
    });
    await page.locator('footer').getByRole('button', { name: 'Cookie settings' }).click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('checkbox', { name: 'Analytics', exact: true }),
    ).not.toBeChecked();
    expect(await consentSnapshot(page)).toEqual(snapshot);
  });

  test('the legal skip link is first and reaches the reading landmark with reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/privacy');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/privacy#main');
    await expect(page.locator('#main')).toBeInViewport();
    expect(
      await page
        .locator('main section')
        .evaluateAll((sections) =>
          sections.every((section) => section.getAnimations({ subtree: true }).length === 0),
        ),
    ).toBe(true);
  });

  for (const analytics of [false, true]) {
    test(`reopening footer settings preserves existing analytics=${analytics} consent exactly`, async ({
      page,
    }) => {
      const saved = JSON.stringify({
        analytics,
        version: 1,
        decidedAt: '2026-01-01T00:00:00.000Z',
      });
      await trackConsentWrites(page, saved);
      await page.goto('/cookies');
      const trigger = page.locator('footer').getByRole('button', { name: 'Cookie settings' });
      for (let open = 0; open < 2; open += 1) {
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Cookie settings' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('checkbox', { name: 'Analytics', exact: true })).toBeChecked({
          checked: analytics,
        });
        await expect(
          dialog.getByRole('checkbox', { name: 'Essential', exact: true }),
        ).toBeChecked();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        expect(await consentSnapshot(page)).toEqual({ saved, writes: [] });
      }
    });
  }

  for (const theme of ['light', 'dark']) {
    test(`mobile menu traps keyboard focus and Escape returns it in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
      await page.goto('/privacy');
      const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Menu', exact: true });
      await expect(dialog).toBeVisible();
      const focusable = dialog.locator('a[href], button:not([disabled]), [tabindex="0"]');
      const first = focusable.first();
      const last = focusable.last();
      await first.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(last).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(first).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('volunteer mobile navigation', () => {
  test.use({ storageState: storageStateFor('manager') });

  test('a manager opens a synthetic screening day from its mobile title link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const event = {
      id: 'synthetic-screening-day',
      title: 'Synthetic community screening',
      startsAt: '2030-01-05T08:00:00.000Z',
      endsAt: '2030-01-05T13:00:00.000Z',
      siteName: 'Synthetic community hall',
      siteAddress: null,
      notes: null,
      status: 'SCHEDULED',
      cancelReason: null,
      rosteredCount: 0,
    };
    const writes = [];
    await page.route(
      /\/clinics\/[^/]+\/screening-events(?:\/synthetic-screening-day)?(?:\?.*)?$/,
      (route) => {
        if (route.request().method() !== 'GET') {
          writes.push(route.request().method());
          return route.abort();
        }
        const detail = new URL(route.request().url()).pathname.endsWith(`/${event.id}`);
        return route.fulfill({
          json: detail
            ? { event, timezone: 'Africa/Accra', emailConfigured: true, roster: [] }
            : { timezone: 'Africa/Accra', items: [event] },
        });
      },
    );
    await page.goto('/volunteers/events');
    const link = page.getByRole('link', { name: event.title, exact: true });
    await expect(link).toBeVisible();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/volunteers/events/${event.id}`);
    await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Roster', exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  });
});

test.describe('research presentation', () => {
  test.use({ storageState: storageStateFor('staff') });
  test('research exports retain readable synthetic content, focus and large copy targets at both widths', async ({
    page,
  }) => {
    const { responseFor } = require('../../../docs/design-system/evidence/279/fixtures.cjs');
    const writes = [];
    await page.route('**/clinics/**', (route) => {
      const json = responseFor(route.request().url());
      if (!json) return route.continue();
      if (route.request().method() !== 'GET') {
        writes.push(route.request().method());
        return route.abort();
      }
      return route.fulfill({ json });
    });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/research');
      await expect(
        page.getByRole('heading', { name: 'Research exports', exact: true }),
      ).toBeVisible();
      const key = page.getByRole('button', { name: 'Copy run key rx-synthetic-example' }).first();
      await expect(key).toBeVisible();
      await key.focus();
      await expect(key).toBeFocused();
      expect((await key.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await expect(
        page.getByRole('heading', { name: 'Request export pack', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Export activity', exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
    }
    expect(writes).toEqual([]);
  });
});
