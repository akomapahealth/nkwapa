const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const { readOutbox, waitForOutboxDrain } = require('../playwright/outbox');
const { hitTarget, minButtonHeight } = require('../playwright/hit-target');

const WIDTHS = [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440];
const panel = (page) => page.getByRole('region', { name: 'Your shift', exact: true });
async function capture(page, name) {
  if (!process.env.DESIGN_VOLUNTEER_DIR) return;
  fs.mkdirSync(process.env.DESIGN_VOLUNTEER_DIR, { recursive: true });
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: path.join(process.env.DESIGN_VOLUNTEER_DIR, name + '.png') });
}
async function mockRoster(
  page,
  { delay = false, failure = false, permissions, noClinic = false, longName = false } = {},
) {
  const state = { items: [], posts: 0, reads: 0, failure, delay, bootstrap: null };
  await page.route('**/auth/whoami', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    state.bootstrap = data;
    if (permissions)
      data.effectivePermissionsForActiveClinic = permissions(
        data.effectivePermissionsForActiveClinic,
      );
    if (longName) data.displayName = 'SyntheticLongVolunteerName'.repeat(5);
    if (noClinic) {
      data.activeClinicId = null;
      data.availableClinics = [];
      data.memberships = [];
    }
    await route.fulfill({ response, json: data });
  });
  await page.route('**/shifts/active*', async (route) => {
    state.reads++;
    if (state.delay) await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill(
      state.failure
        ? { status: 403, json: { message: 'Synthetic shift read refused' } }
        : {
            json: {
              date: new URL(route.request().url()).searchParams.get('date'),
              timezone: 'Africa/Accra',
              items: state.items,
            },
          },
    );
  });
  await page.route('**/shifts/check-in', async (route) => {
    state.posts++;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const body = route.request().postDataJSON();
    state.items = [
      {
        shiftId: body.id ?? body.shiftId ?? 'synthetic-shift',
        userId: state.bootstrap.userId,
        displayName: 'Synthetic Volunteer',
        roleAtShift: body.roleAtShift,
        checkedInAt: new Date().toISOString(),
        status: 'ACTIVE',
      },
    ];
    await route.fulfill({ status: 201, json: state.items[0] });
  });
  await page.route('**/shifts/*/check-out', async (route) => {
    state.posts++;
    state.items = [];
    await route.fulfill({ json: { status: 'CLOSED' } });
  });
  return state;
}

test.describe('volunteer refresh', () => {
  test.use({ storageState: storageStateFor('volunteer') });
  for (const theme of ['light', 'dark']) {
    test(`all boundaries, long name, text size, final actions and static motion: ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
      const state = await mockRoster(page, { longName: true });
      await page.goto('/dashboard');
      await expect(panel(page).getByText('Off Duty', { exact: true })).toBeVisible();
      const original = await panel(page).elementHandle();
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await original.evaluate(
            (el) => el === document.querySelector('[data-testid="dashboard-shift"]'),
          ),
        ).toBe(true);
        await expect(
          panel(page).getByRole('button', { name: 'Start shift', exact: true }),
        ).toBeEnabled();
        for (const control of await panel(page).locator('button').all()) {
          if (!(await control.boundingBox())) continue;
          const b = await hitTarget(control);
          expect(b.height).toBeGreaterThanOrEqual(await minButtonHeight(page));
          expect(b.width).toBeGreaterThanOrEqual(44);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        ).toBeLessThanOrEqual(1);
        await capture(page, `volunteer-${width}-${theme}`);
      }
      expect(state.posts).toBe(0);
      await expect(page.getByTestId('illustration-hello')).toHaveAttribute('data-playing', 'false');
      expect(
        await page
          .getByTestId('volunteer-welcome')
          .locator('svg')
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('none');
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await capture(page, `volunteer-text-${theme}`);
      const start = panel(page).getByRole('button', { name: 'Start shift', exact: true });
      await start.scrollIntoViewIfNeeded();
      const startBox = await start.boundingBox();
      const navBox = await page
        .getByRole('navigation', { name: 'Primary', exact: true })
        .boundingBox();
      expect(startBox.y + startBox.height).toBeLessThanOrEqual(navBox.y);
      await capture(page, `volunteer-text-controls-${theme}`);
      const final = page.getByRole('link', { name: 'Open queues', exact: true }).last();
      await final.scrollIntoViewIfNeeded();
      await final.click();
      await expect(page).toHaveURL(/\/queues/);
    });
    test(`server-confirmed start/end, keyboard and once-only animation: ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
      const state = await mockRoster(page);
      await page.goto('/dashboard');
      const start = panel(page).getByRole('button', { name: 'Start shift', exact: true });
      await expect(start).toBeEnabled();
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await capture(page, `volunteer-normal-${width}-${theme}`);
      }
      await expect(page.getByTestId('illustration-hello').locator('[data-frame="60"]')).toHaveCount(
        1,
        { timeout: 15000 },
      );
      await start.focus();
      await page.keyboard.press('Enter');
      await expect(panel(page).getByTestId('ops-feedback')).toHaveText(
        'Shift started as Volunteer.',
      );
      await expect(panel(page).getByText('On Duty', { exact: true })).toBeVisible();
      await expect(
        page.getByTestId('illustration-checklist').locator('[data-frame="98"]'),
      ).toHaveCount(1, { timeout: 15000 });
      expect(state.posts).toBe(1);
      await capture(page, `volunteer-started-${theme}`);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      const end = panel(page).getByRole('button', { name: 'End shift', exact: true });
      await end.focus();
      await page.keyboard.press('Enter');
      await expect(panel(page).getByTestId('ops-feedback')).toHaveText('Shift ended.');
      await expect(panel(page).getByText('Off Duty', { exact: true })).toBeVisible();
      expect(state.posts).toBe(2);
    });
  }
  test('write refusal stays recoverable and a warm read failure keeps the last known shift', async ({
    page,
  }) => {
    const state = await mockRoster(page);
    let refused = true;
    await page.route('**/shifts/check-in', async (route) => {
      if (refused) {
        state.posts++;
        await route.fulfill({ status: 403, json: { message: 'Synthetic shift start refused' } });
        return;
      }
      await route.fallback();
    });
    await page.goto('/dashboard');
    const start = panel(page).getByRole('button', { name: 'Start shift', exact: true });
    await start.click();
    await expect(panel(page).getByTestId('ops-feedback')).toHaveAttribute('data-tone', 'error');
    await expect(start).toBeEnabled();
    await expect(page.getByTestId('illustration-checklist')).toHaveCount(0);
    refused = false;
    await start.click();
    await expect(panel(page).getByText('On Duty', { exact: true })).toBeVisible();
    expect(state.posts).toBe(2);
    state.failure = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    // usePolling refreshes on focus/visibility as well as its interval.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(panel(page).getByText('Shift refresh is affected', { exact: true })).toBeVisible({
      timeout: 35000,
    });
    await expect(panel(page).getByText('On Duty', { exact: true })).toBeVisible();
    state.failure = false;
    await panel(page).getByRole('button', { name: 'Try again' }).click();
    await expect(panel(page).getByText('Shift refresh is affected', { exact: true })).toHaveCount(
      0,
    );
    // Once reconciled, a later server-side end must release Start shift, despite the old feedback.
    state.items = [];
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(
      panel(page).getByRole('button', { name: 'Start shift', exact: true }),
    ).toBeEnabled();
  });
  test('the greeting follows all four clinic-clock (Accra) phases and uses existing theme tokens', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockRoster(page);
    for (const [hour, phase, greeting] of [
      [6, 'morning', 'Good morning'],
      [14, 'afternoon', 'Good afternoon'],
      [19, 'evening', 'Good evening'],
      [23, 'night', 'Good evening'],
    ]) {
      // W2: the greeting reads clinic time, Africa/Accra (UTC, no daylight saving), not the device's.
      await page.clock.setFixedTime(Date.UTC(2026, 10, 10, hour));
      await page.goto('/dashboard');
      const band = page.getByTestId('volunteer-welcome');
      await expect(band).toHaveAttribute('data-phase', phase);
      await expect(band.getByRole('heading')).toContainText(greeting);
      expect(
        await band.getByRole('heading').evaluate((el) => getComputedStyle(el).fontFamily),
      ).toBe(await page.locator('main').evaluate((el) => getComputedStyle(el).fontFamily));
      const stroke = await band
        .locator('svg')
        .last()
        .locator('path')
        .last()
        .evaluate((el) => getComputedStyle(el).stroke);
      expect(stroke).not.toBe('none');
    }
  });
  test('real online shift outcomes come from the existing server operation', async ({ page }) => {
    await page.goto('/dashboard');
    const shift = panel(page);
    await expect(shift.getByText(/^(On Duty|Off Duty)$/)).toBeVisible();
    let end = shift.getByRole('button', { name: 'End shift', exact: true });
    if (await end.isVisible()) {
      await end.click();
      await expect(shift.getByText('Off Duty', { exact: true })).toBeVisible();
    }
    try {
      await shift.getByRole('button', { name: 'Start shift', exact: true }).click();
      await expect(shift.getByTestId('ops-feedback')).toHaveText('Shift started as Volunteer.');
      await expect(shift.getByText('On Duty', { exact: true })).toBeVisible();
      await expect(shift.getByTestId('ops-pending-badge')).toHaveCount(0);
    } finally {
      end = shift.getByRole('button', { name: 'End shift', exact: true });
      if (await end.isVisible()) {
        await end.click();
        await expect(shift.getByText('Off Duty', { exact: true })).toBeVisible();
      }
    }
  });
  test('loading, refusal and retry preserve unknown status and reject double submissions', async ({
    page,
  }) => {
    const state = await mockRoster(page, { delay: true, failure: true });
    await page.goto('/dashboard');
    await expect(panel(page).getByText('Loading your shift status…')).toBeVisible();
    await expect(panel(page).getByText('Off Duty', { exact: true })).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Start shift', exact: true })).toHaveCount(
      0,
    );
    await expect(panel(page).getByText('Shift status unavailable', { exact: true })).toBeVisible();
    state.failure = false;
    state.delay = false;
    await panel(page).getByRole('button', { name: 'Try again' }).click();
    const start = panel(page).getByRole('button', { name: 'Start shift', exact: true });
    await expect(start).toBeEnabled();
    await start.evaluate((el) => {
      el.click();
      el.click();
    });
    await expect(panel(page).getByText('On Duty', { exact: true })).toBeVisible();
    expect(state.posts).toBe(1);
  });
  test('read permission is required without asking for station-board access', async ({ page }) => {
    const state = await mockRoster(page, {
      permissions: (p) => p.filter((v) => v !== 'OPS.SHIFT.READ'),
    });
    await page.goto('/dashboard');
    await expect(page.getByTestId('volunteer-welcome')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    expect(state.reads).toBe(0);
  });
  test('read-only shifts do not expose a write action', async ({ page }) => {
    await mockRoster(page, { permissions: (p) => p.filter((v) => v !== 'OPS.SHIFT.WRITE') });
    await page.goto('/dashboard');
    await expect(panel(page).getByText('This account cannot start or end shifts.')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Start shift' })).toHaveCount(0);
  });
  test('a volunteer section without an eligible shift role keeps an honest unavailable state', async ({
    page,
  }) => {
    await mockRoster(page);
    await page.route('**/auth/whoami', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.effectiveRolesForActiveClinic = [];
      for (const membership of data.memberships) membership.roles = [];
      await route.fulfill({ response, json: data });
    });
    await page.goto('/dashboard');
    await expect(panel(page).getByText(/No shift role available/)).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Start shift', exact: true })).toHaveCount(
      0,
    );
  });
  test('no clinic makes no shift request', async ({ page }) => {
    const state = await mockRoster(page, { noClinic: true });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Select a clinic first' })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    expect(state.reads).toBe(0);
  });
  test('a failed asset load keeps the themed static greeting and usable actions', async ({
    page,
  }) => {
    await page.route('**/lottie/Hello.json', (route) => route.abort());
    await mockRoster(page);
    await page.goto('/dashboard');
    await expect(
      panel(page).getByRole('button', { name: 'Start shift', exact: true }),
    ).toBeEnabled();
    const art = page.getByTestId('illustration-hello');
    await expect(art).toHaveAttribute('data-playing', 'false');
    await expect(art.locator('svg')).toBeVisible();
  });
  test('real offline start and end stay pending, replay once and reconcile', async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await page.goto('/dashboard');
    const shift = panel(page);
    await expect(shift).toBeVisible();
    const end = shift.getByRole('button', { name: 'End shift', exact: true });
    await expect(shift.getByText(/^(On Duty|Off Duty)$/)).toBeVisible();
    if (await end.isVisible()) {
      await end.click();
      await expect(shift.getByText('Off Duty', { exact: true })).toBeVisible();
    }
    await context.setOffline(true);
    const start = shift.getByRole('button', { name: 'Start shift', exact: true });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(shift.getByTestId('ops-feedback')).toContainText(
      'Shift start saved on this device',
    );
    await expect(shift.getByTestId('ops-pending-badge')).toContainText('Pending sync');
    await expect(page.getByTestId('illustration-checklist')).toHaveCount(0);
    expect((await readOutbox(page)).filter((r) => r.entityType === 'shift_check_in')).toHaveLength(
      1,
    );
    await shift.getByRole('button', { name: 'End shift', exact: true }).click();
    await expect(shift.getByText('Shift end saved on this device.', { exact: true })).toBeVisible();
    expect((await readOutbox(page)).filter((r) => r.entityType === 'shift_check_out')).toHaveLength(
      1,
    );
    await context.setOffline(false);
    await waitForOutboxDrain(page, expect, { entityType: 'shift_check_in' });
    await waitForOutboxDrain(page, expect, { entityType: 'shift_check_out' });
    await expect(shift.getByText('Off Duty', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(shift.getByTestId('ops-pending-badge')).toHaveCount(0);
    await page.reload();
    await expect(panel(page).getByText('Off Duty', { exact: true })).toBeVisible();
  });
});

test.describe('mixed role refresh', () => {
  test.use({ storageState: storageStateFor('staff') });
  // W2: a person holding every role gets their main role's home; the volunteer shift panel (and
  // its role picker) is a volunteer's home only, and starting a shift with a role is on Stations.
  test('gets one main-role home at every width, with no role tabs and no shift panel', async ({
    page,
  }) => {
    const state = await mockRoster(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Clinic comparison' })).toBeVisible({
      timeout: 30_000,
    });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('tab')).toHaveCount(0);
      await expect(panel(page)).toHaveCount(0);
      await expect(page.getByTestId('volunteer-welcome')).toHaveCount(1);
    }
    expect(state.posts).toBe(0);
  });
});
