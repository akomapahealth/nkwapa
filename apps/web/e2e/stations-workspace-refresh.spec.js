const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');

const widths = [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440];
const shiftPanel = (page) => page.getByTestId('station-shift');
const picker = (page) => page.getByRole('button', { name: /^(Choose station|Change station:)/ });
const sheet = (page) => page.getByRole('dialog', { name: 'Choose your station' });
async function capture(page, name) {
  if (!process.env.DESIGN_STATIONS_DIR) return;
  fs.mkdirSync(process.env.DESIGN_STATIONS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.DESIGN_STATIONS_DIR, name + '.png') });
}
async function mockWorkspace(page, options = {}) {
  const state = {
    userId: '',
    duty: options.duty ?? true,
    station: options.station ?? true,
    failure: false,
    delay: 0,
    starts: 0,
    ends: 0,
    choices: 0,
    claims: 0,
    claimFailure: true,
    closed: false,
  };
  await page.route('**/auth/whoami', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    state.userId = data.userId;
    if (options.permissions)
      data.effectivePermissionsForActiveClinic = options.permissions(
        data.effectivePermissionsForActiveClinic,
      );
    if (options.roles) {
      data.effectiveRolesForActiveClinic = options.roles;
      data.memberships = data.memberships.map((m) => ({ ...m, roles: options.roles }));
    }
    await route.fulfill({ response, json: data });
  });
  const station = {
    id: 'synthetic-bp',
    name: 'Blood pressure',
    kind: 'BLOOD_PRESSURE',
    sortOrder: 1,
    active: true,
    capacity: options.capacity ?? 2,
  };
  const visits = ['Next', 'Last'].map((name, i) => ({
    id: `synthetic-${name.toLowerCase()}`,
    status: 'QUEUED',
    checkInId: 'synthetic-checkin',
    checkInStatus: 'WAITING',
    checkedInAt: new Date().toISOString(),
    encounterId: null,
    station,
    patient: {
      id: 'synthetic-patient-' + i,
      firstName: 'Synthetic',
      lastName: name,
      patientCode: 'NKP-DEMO-' + i,
      dob: null,
    },
    queuedAt: new Date(Date.now() - (26 - i * 10) * 60000).toISOString(),
    claimedBy: null,
    claimedAt: null,
    completedBy: null,
    completedAt: null,
    handoffNote: null,
    endReason: null,
    releaseCount: 0,
    previous: {
      station: { name: 'Registration and history' },
      completedBy: { displayName: 'Synthetic Account' },
      performedByName: 'Synthetic Screener',
      handoffNote: 'Synthetic handoff',
      completedAt: new Date().toISOString(),
    },
  }));
  state.visits = visits;
  await page.route('**/stations/board*', async (route) => {
    if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
    await route.fulfill(
      state.failure
        ? { status: 403, json: { message: 'Synthetic station read refused' } }
        : {
            json: {
              date: new URL(route.request().url()).searchParams.get('date'),
              timezone: 'Africa/Accra',
              stations: [
                {
                  ...station,
                  active: !state.closed,
                  inUse: options.inUse ?? 0,
                  staff:
                    state.duty && state.station && !state.closed
                      ? [
                          {
                            id: state.userId,
                            displayName: 'Synthetic Volunteer',
                            screenerName: 'Synthetic Screener',
                          },
                        ]
                      : [],
                  visits,
                },
                {
                  id: 'synthetic-long',
                  name: 'Registration and medical history with a very long synthetic station name',
                  active: true,
                  kind: 'INTAKE',
                  sortOrder: 0,
                  visits: [],
                  staff: [],
                },
              ],
              onShift: state.duty
                ? [
                    {
                      user: { id: state.userId, displayName: 'Synthetic Volunteer' },
                      screenerName: 'Synthetic Screener',
                      stationId: state.station ? station.id : null,
                      activeVisitCount: 0,
                    },
                  ]
                : [],
            },
          },
    );
  });
  await page.route('**/shifts/active*', (route) =>
    route.fulfill({
      json: {
        date: new URL(route.request().url()).searchParams.get('date'),
        timezone: 'Africa/Accra',
        items: state.duty
          ? [
              {
                shiftId: 'synthetic-shift',
                userId: state.userId,
                roleAtShift: 'VOLUNTEER',
                checkedInAt: new Date().toISOString(),
                status: 'ACTIVE',
              },
            ]
          : [],
      },
    }),
  );
  await page.route('**/shifts/check-in', async (route) => {
    state.starts++;
    await new Promise((r) => setTimeout(r, 200));
    state.duty = true;
    await route.fulfill({ status: 201, json: { shiftId: 'synthetic-shift' } });
  });
  await page.route('**/shifts/*/check-out', async (route) => {
    state.ends++;
    state.duty = false;
    await route.fulfill({ json: { status: 'CLOSED' } });
  });
  await page.route('**/shifts/*/station', async (route) => {
    state.choices++;
    await new Promise((r) => setTimeout(r, 250));
    state.station = route.request().postDataJSON().stationId !== null;
    await route.fulfill({ json: {} });
  });
  await page.route('**/stations/screener-names', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/station-visits/*/claim', async (route) => {
    state.claims++;
    await new Promise((r) => setTimeout(r, 250));
    await route.fulfill({
      status: 409,
      json: {
        code: 'STATION_VISIT_ALREADY_CLAIMED',
        message: 'Synthetic patient was already taken',
      },
    });
  });
  return state;
}
test.describe('Stations workspace refresh', () => {
  test.use({ storageState: storageStateFor('volunteer') });
  for (const theme of ['light', 'dark']) {
    test(`boundary layouts, sheet retention, final actions and enlarged text: ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
      const state = await mockWorkspace(page);
      await page.goto('/stations');
      await expect(shiftPanel(page).getByText('On Duty', { exact: true })).toBeVisible();
      const screener = page.getByTestId('screener-control');
      await expect(screener.getByLabel('Name of the person screening')).toHaveValue(
        'Synthetic Screener',
      );
      await screener.getByLabel('Name of the person screening').fill('Retained synthetic draft');
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByRole('article', { name: 'Next patient' })).toContainText(
          'Synthetic Next',
        );
        await expect(screener.getByLabel('Name of the person screening')).toHaveValue(
          'Retained synthetic draft',
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (width < 600) {
          const action = page.getByTestId('station-take-action').getByRole('button');
          await expect(action).toBeVisible();
          const bounds = await action.boundingBox();
          const chat = await page.getByTestId('chat-toggle').boundingBox();
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(chat.x);
        }
        await picker(page).click();
        await expect(sheet(page)).toBeVisible();
        await expect(sheet(page).getByRole('button', { name: /^Blood pressure/ })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await page.setViewportSize({ width: width < 600 ? 1024 : 390, height: 900 });
        await expect(sheet(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(picker(page)).toBeFocused();
        await page.setViewportSize({ width, height: 900 });
        await capture(page, `${theme}-${width}`);
      }
      expect(state.choices).toBe(0);
      await page.setViewportSize({ width: 390, height: 900 });
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      await page.evaluate(() => window.scrollTo(0, 0));
      state.visits[0].patient.lastName = 'LongSyntheticPatientName'.repeat(4);
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      const action = page.getByTestId('station-take-action').getByRole('button');
      await expect(action).toHaveAccessibleName(/LongSyntheticPatientName/);
      const a = await action.boundingBox(),
        chat = await page.getByTestId('chat-toggle').boundingBox();
      expect(a.x + a.width).toBeLessThanOrEqual(chat.x);
      expect(a.height).toBeLessThan(160);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(page, `${theme}-enlarged`);
      await action.click();
      await expect(
        page.getByText('Synthetic patient was already taken', { exact: true }),
      ).toBeVisible();
      await page.evaluate(() => (document.documentElement.style.fontSize = ''));
      await page.getByRole('button', { name: 'Take patient', exact: true }).last().click();
      expect(state.claims).toBe(2);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations).toEqual([]);
    });
  }
  for (const theme of ['light', 'dark']) {
    test(`line, sheet and final screener action: ${theme}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
      await mockWorkspace(page);
      await page.route('**/shifts/*/screener', (route) =>
        route.fulfill({ status: 403, json: { message: 'Synthetic screener change refused' } }),
      );
      await page.goto('/stations');
      const field = page.getByLabel('Name of the person screening');
      await field.fill('Synthetic final draft');
      const holderLabel = page.locator('label').filter({ hasText: "I'm the one screening" });
      expect((await holderLabel.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await page.getByRole('button', { name: 'Save name', exact: true }).click();
      await expect(page.getByTestId('screener-control')).toContainText(
        'The previous choice is kept.',
      );
      await expect(field).toHaveValue('Synthetic Screener');
      const line = page.getByRole('region', { name: 'The whole line' });
      await expect(line).toContainText('2 waiting · 0 being seen');
      await expect(line).toContainText('Synthetic Volunteer (Synthetic Screener screening)');
      await line.scrollIntoViewIfNeeded();
      await capture(page, `${theme}-line`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await picker(page).focus();
      await page.keyboard.press('Enter');
      await expect(sheet(page)).toBeVisible();
      expect(
        await sheet(page)
          .getByRole('heading', { name: 'Choose your station' })
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toBe(await page.locator('main').evaluate((el) => getComputedStyle(el).fontFamily));
      await page.setViewportSize({ width: 390, height: 900 });
      await capture(page, `${theme}-sheet-phone`);
      await page.setViewportSize({ width: 1024, height: 900 });
      await expect(sheet(page)).toBeVisible();
      await capture(page, `${theme}-sheet-wide`);
      await page.keyboard.press('Escape');
      await expect(picker(page)).toBeFocused();
    });
  }
  test('real online and queued offline shifts reconcile through existing operations', async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    const { readOutbox, waitForOutboxDrain } = require('../playwright/outbox');
    await page.goto('/stations');
    const shift = shiftPanel(page);
    await expect(shift.getByText(/^(On Duty|Off Duty)$/)).toBeVisible();
    const end = shift.getByRole('button', { name: 'End shift', exact: true });
    if (await end.isVisible()) {
      await end.click();
      await expect(shift).toContainText('Off Duty');
    }
    await shift.getByRole('button', { name: 'Start shift', exact: true }).click();
    await expect(page.getByTestId('ops-feedback')).toHaveText('Shift started as Volunteer.');
    await expect(shift).toContainText('On Duty');
    await end.click();
    await expect(shift).toContainText('Off Duty');
    await context.setOffline(true);
    await shift.getByRole('button', { name: 'Start shift', exact: true }).click();
    await expect(page.getByTestId('ops-feedback')).toContainText(
      'Shift start saved on this device',
    );
    await expect(shift.getByTestId('ops-pending-badge')).toContainText('Pending sync');
    await expect(picker(page)).toBeDisabled();
    expect((await readOutbox(page)).filter((r) => r.entityType === 'shift_check_in')).toHaveLength(
      1,
    );
    await end.click();
    await expect(shift.getByText('Shift end saved on this device.', { exact: true })).toBeVisible();
    expect((await readOutbox(page)).filter((r) => r.entityType === 'shift_check_out')).toHaveLength(
      1,
    );
    await context.setOffline(false);
    await waitForOutboxDrain(page, expect, { entityType: 'shift_check_in' });
    await waitForOutboxDrain(page, expect, { entityType: 'shift_check_out' });
    await expect(shift).toContainText('Off Duty');
    await expect(shift.getByTestId('ops-pending-badge')).toHaveCount(0);
  });
  test('unknown first read never says Off Duty, and retry reveals shift', async ({ page }) => {
    const state = await mockWorkspace(page);
    state.failure = true;
    state.delay = 1200;
    await page.goto('/stations');
    await expect(shiftPanel(page)).toHaveCount(0);
    await expect(
      page.getByText('The station line could not be loaded', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Off Duty', { exact: true })).toHaveCount(0);
    state.failure = false;
    state.delay = 0;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(shiftPanel(page)).toContainText('On Duty');
  });
  test('failed refresh keeps patient and station with truthful retry', async ({ page }) => {
    const state = await mockWorkspace(page);
    await page.goto('/stations');
    await expect(picker(page)).toBeVisible();
    state.failure = true;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(
      page.getByText('The station line refresh is affected', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('article', { name: 'Next patient' })).toContainText(
      'Synthetic Next',
    );
    state.failure = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.getByText('The station line refresh is affected', { exact: true }),
    ).toHaveCount(0);
  });
  test('off duty leads with shift, retains role and prevents duplicate starts', async ({
    page,
  }) => {
    const state = await mockWorkspace(page, {
      duty: false,
      station: false,
      roles: ['VOLUNTEER', 'DOCTOR'],
    });
    await page.goto('/stations');
    await expect(shiftPanel(page)).toContainText('Off Duty');
    await expect(picker(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'The whole line' })).toHaveCount(0);
    await page.getByLabel('Role for this shift').click();
    await page.getByRole('option', { name: 'Doctor', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(page.getByLabel('Role for this shift')).toContainText('Doctor');
    await shiftPanel(page)
      .getByRole('button', { name: 'Start shift', exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect(picker(page)).toBeVisible();
    expect(state.starts).toBe(1);
    await shiftPanel(page).getByRole('button', { name: 'End shift', exact: true }).click();
    await expect(shiftPanel(page)).toContainText('Off Duty');
    expect(state.ends).toBe(1);
  });
  test('station selection confirms once, and closure is disclosed', async ({ page }) => {
    const state = await mockWorkspace(page, { station: false });
    await page.goto('/stations');
    await picker(page).click();
    await sheet(page)
      .getByRole('button', { name: /^Blood pressure/ })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByText('You are working at Blood pressure.')).toBeVisible();
    expect(state.choices).toBe(1);
    state.closed = true;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(
      page.getByText('Blood pressure was closed. Choose another station.'),
    ).toBeVisible();
    await picker(page).click();
    await expect(sheet(page).getByRole('button', { name: /^Blood pressure/ })).toHaveCount(0);
  });
  test('claim refusal refreshes without duplicate submission and keeps attribution', async ({
    page,
  }) => {
    const state = await mockWorkspace(page);
    await page.goto('/stations');
    const ticket = page.getByRole('article', { name: 'Next patient' });
    await expect(ticket).toContainText('Synthetic Screener · signed in as Synthetic Account');
    await ticket.getByRole('button', { name: 'Take patient' }).evaluate((el) => {
      el.click();
      el.click();
    });
    await expect(
      page.getByText('Synthetic patient was already taken', { exact: true }),
    ).toBeVisible();
    expect(state.claims).toBe(1);
  });
  test('capacity stays informational and existing patients keep Continue access', async ({
    page,
  }) => {
    const state = await mockWorkspace(page, { capacity: 1, inUse: 1 });
    state.visits[1].status = 'IN_PROGRESS';
    await page.goto('/stations');
    await expect(picker(page)).toBeVisible();
    state.visits[1].claimedBy = { id: state.userId, displayName: 'Synthetic Volunteer' };
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(
      page.getByText('1 of 1 places in use. This station is at capacity.'),
    ).toBeVisible();
    await expect(
      page
        .getByRole('article', { name: 'Next patient' })
        .getByRole('button', { name: 'Take patient' }),
    ).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Continue', exact: true }).first()).toBeVisible();
  });
  test('shift write refusal keeps off duty, then allows one retry', async ({ page }) => {
    const state = await mockWorkspace(page, { duty: false, station: false });
    const refuse = (route) =>
      route.fulfill({ status: 403, json: { message: 'Synthetic shift write refused' } });
    await page.route('**/shifts/check-in', refuse);
    await page.goto('/stations');
    const start = shiftPanel(page).getByRole('button', { name: 'Start shift', exact: true });
    await start.click();
    await expect(page.getByTestId('ops-feedback')).toContainText('Synthetic shift write refused');
    await expect(shiftPanel(page)).toContainText('Off Duty');
    await expect(start).toBeEnabled();
    await page.unroute('**/shifts/check-in', refuse);
    await start.click();
    await expect(picker(page)).toBeVisible();
    expect(state.starts).toBe(1);
  });
  test('station refusal keeps previous choice and allows retry', async ({ page }) => {
    const state = await mockWorkspace(page, { station: false });
    const refuse = (route) =>
      route.fulfill({ status: 409, json: { message: 'Synthetic station choice refused' } });
    await page.route('**/shifts/*/station', refuse);
    await page.goto('/stations');
    await picker(page).click();
    const choice = sheet(page).getByRole('button', { name: /^Blood pressure/ });
    await choice.click();
    await expect(sheet(page)).toContainText('Synthetic station choice refused');
    await expect(choice).toHaveAttribute('aria-pressed', 'false');
    await page.unroute('**/shifts/*/station', refuse);
    await expect(choice).toBeEnabled();
    await choice.click();
    await expect(sheet(page)).toHaveCount(0);
    expect(state.choices).toBe(1);
  });
  test('no eligible shift role leaves start unavailable', async ({ page }) => {
    await mockWorkspace(page, { duty: false, roles: ['DIRECTOR'] });
    await page.goto('/stations');
    await expect(shiftPanel(page)).toContainText('No shift role available for this account.');
    await expect(shiftPanel(page).getByRole('button', { name: 'Start shift' })).toHaveCount(0);
  });
  test('read-only account cannot start shifts or take patients', async ({ page }) => {
    await mockWorkspace(page, {
      permissions: (permissions) =>
        permissions.filter((p) => !['OPS.SHIFT.WRITE', 'OPS.STATION.WORK'].includes(p)),
    });
    await page.goto('/stations');
    await expect(page.getByText('This account cannot start or end shifts.')).toBeVisible();
    await expect(picker(page)).toBeDisabled();
    await expect(shiftPanel(page).getByRole('button', { name: 'End shift' })).toBeDisabled();
  });
});
