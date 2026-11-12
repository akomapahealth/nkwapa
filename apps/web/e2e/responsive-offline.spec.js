const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');
const { WIDTHS, workspaceRoutes, overflow } = require('../playwright/responsive-routes');
const stationWorkflow =
  process.env.FEATURE_STATION_WORKFLOW_ENABLED === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED === 'true';

let clinicId;
let patientId;
let encounterId;
let eventId;
let stationVisitId;
test.beforeAll(async () => {
  clinicId = (await apiRequestAs('staff', 'get', '/auth/whoami')).json().activeClinicId;
  expect(clinicId).toBeTruthy();
  const response = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/patients`, {
    clinicId,
    data: {
      firstName: 'E2E',
      lastName: `Responsive ${randomUUID().slice(0, 8)}`,
      nationalIdType: 'OTHER',
      nationalId: `E2E-${randomUUID()}`,
      sex: 'FEMALE',
    },
  });
  expect(response.ok()).toBe(true);
  patientId = response.json().id;
  const encounter = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/encounters`, {
    clinicId,
    data: { patientId },
  });
  expect(encounter.ok()).toBe(true);
  encounterId = encounter.json().id;
  const event = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/screening-events`, {
    clinicId,
    data: {
      title: 'E2E Responsive screening day',
      siteName: 'Synthetic clinic',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 90000000).toISOString(),
    },
  });
  expect(event.ok()).toBe(true);
  eventId = event.json().id;
  stationVisitId = randomUUID();
  if (
    process.env.FEATURE_STATION_WORKFLOW_ENABLED === 'true' &&
    process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED === 'true'
  ) {
    const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
      clinicId,
      data: { patientId },
    });
    expect(checkIn.ok()).toBe(true);
    const board = await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, {
      clinicId,
    });
    expect(board.ok()).toBe(true);
    const visit = board
      .json()
      .stations.flatMap((station) => station.visits)
      .find((visit) => visit.checkInId === checkIn.json().id);
    expect(visit).toBeTruthy();
    stationVisitId = visit.id;
  }
});

for (const template of workspaceRoutes()) {
  test.describe(template, () => {
    test.use({
      storageState: storageStateFor(template.startsWith('/portal') ? 'patient' : 'staff'),
    });
    test('fits every supported width, starting on a phone', async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const url = template
        .replace('[clinicId]', clinicId)
        .replace('[patientId]', patientId)
        .replace('[encounterId]', encounterId)
        .replace('[eventId]', eventId)
        .replace('[visitId]', stationVisitId);
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(url);
      await expect(
        page
          .locator('#main-content')
          .or(
            page.getByRole('heading', {
              name: /invite|secure sign|your name|record|access|station|account/i,
            }),
          )
          .first(),
      ).toBeVisible({ timeout: 25_000 });
      // Wait for data/state resolution. A shell-only probe would miss the table/form that follows.
      await expect(page.getByRole('status', { name: 'Signing you in' })).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      expect(new URL(page.url()).pathname, 'must not measure a redirected login page').not.toBe(
        '/login',
      );
      const measures = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await expect
          .poll(
            async () =>
              Math.max(...(await overflow(page)).map((x) => x.scrollWidth - x.clientWidth)),
            { message: `${template} at ${width}` },
          )
          .toBeLessThanOrEqual(0);
        measures.push({ width, boxes: await overflow(page) });
      }
      if (process.env.RESPONSIVE_ROUTE_REPORT) {
        fs.mkdirSync(process.env.RESPONSIVE_ROUTE_REPORT, { recursive: true });
        fs.writeFileSync(
          path.join(process.env.RESPONSIVE_ROUTE_REPORT, encodeURIComponent(template) + '.json'),
          JSON.stringify(
            { template, landed: new URL(page.url()).pathname, widths: WIDTHS, measures },
            null,
            2,
          ),
        );
      }
      await testInfo.attach('route-width-measurements', {
        body: JSON.stringify({ template, url: new URL(page.url()).pathname, widths: WIDTHS }),
        contentType: 'application/json',
      });
    });
  });
}

for (const [url, empty] of [
  ['/patients', 'No patients in this clinic yet'],
  ['/today', 'No patient check-ins yet'],
  ['/queues', 'All caught up'],
  ['/appointments', 'No appointments found'],
  ['/portal', 'No confirmed appointment yet'],
]) {
  test.describe(`offline ${url}`, () => {
    test.use({ storageState: storageStateFor(url.startsWith('/portal') ? 'patient' : 'staff') });
    test('retains loaded data or reports the connection, never a false empty result', async ({
      page,
      context,
    }) => {
      await page.goto(url);
      await expect(page.locator('#main-content')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await context.setOffline(true);
      try {
        // Mounted-session drop, not the cold-start authentication work reserved for #207.
        await expect(page.locator('#main-content')).toContainText(
          /offline|connection|last.*load|saved copy/i,
        );
        const emptyState = page.getByRole('heading', { name: empty, exact: true });
        if (await emptyState.count()) {
          // A genuinely empty saved copy is allowed only with a notice explaining its age/source.
          await expect(
            page
              .getByTestId('stale-data-notice')
              .or(page.getByTestId('ops-offline-banner'))
              .first(),
          ).toBeVisible();
        }
        expect(
          Math.max(...(await overflow(page)).map((x) => x.scrollWidth - x.clientWidth)),
        ).toBeLessThanOrEqual(0);
      } finally {
        await context.setOffline(false);
      }
    });
  });
}

// Hold the first read until the connection drops. This proves no successful/empty response
// exists, rather than merely checking the header pill after already loading a populated list.
for (const [url, pattern, empty] of [
  ['/patients', '**/clinics/*/patients?*', 'No patients in this clinic yet'],
  [
    '/today',
    stationWorkflow ? '**/stations/board*' : '**/clinics/*/checkins?*',
    'No patient check-ins yet',
  ],
  ['/queues', '**/clinics/*/encounters?*', 'All caught up'],
  ['/appointments', '**/clinics/*/appointments?*', 'No appointments found'],
  ['/portal', '**/patient-portal/me', 'No confirmed appointment yet'],
  ['/portal/appointments', '**/patients/me/appointments**', 'No visit booked yet'],
]) {
  test.describe(`uncached offline ${url}`, () => {
    test.use({ storageState: storageStateFor(url.startsWith('/portal') ? 'patient' : 'staff') });
    test('does not manufacture an empty result from an interrupted first read', async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      let readStarted = false;
      let release;
      const waitForDrop = new Promise((resolve) => (release = resolve));
      await page.route(pattern, async (route) => {
        readStarted = true;
        await waitForDrop;
        await route.abort('internetdisconnected');
      });
      try {
        await page.goto(url);
        await expect.poll(() => readStarted).toBe(true);
        await context.setOffline(true);
        release();
        if (url === '/today') {
          await expect(page.getByTestId('ops-offline-banner')).toBeVisible();
        } else if (url === '/queues') {
          await expect(
            page.getByRole('tabpanel').getByText(/You are offline. Reconnect to load the queues/),
          ).toBeVisible();
        } else {
          await expect(
            page.locator('#main-content').getByText('You are offline', { exact: true }).first(),
          ).toBeVisible();
        }
        await expect(page.getByRole('heading', { name: empty, exact: true })).toHaveCount(0);
        await expect(page.getByText('Nothing to show.', { exact: true })).toHaveCount(0);
        await expect(
          page.getByText('No long waits or unstaffed stations in this line.', { exact: true }),
        ).toHaveCount(0);
      } finally {
        release();
        await context.setOffline(false);
        await page.unrouteAll({ behavior: 'ignoreErrors' });
      }
    });
  });
}

test.describe('failed list reads', () => {
  test.use({ storageState: storageStateFor('staff') });
  for (const [url, api, empty] of [
    ['/audit', '**/clinics/*/audit?*', 'No audit events match the current filters'],
    ['/notifications', '**/clinics/*/reminders?*', 'No reminders match the current filters'],
    ['/queues', '**/clinics/*/encounters?*', 'All caught up'],
    ['/admin/users', '**/clinics/*/users?*', 'No staff records match these filters'],
  ])
    test(`${url} reports failed loads without claiming zero records`, async ({ page }) => {
      await page.route(api, (route) =>
        route.fulfill({ status: 503, json: { message: 'Synthetic unavailable network' } }),
      );
      await page.goto(url);
      const result = url === '/queues' ? page.getByRole('tabpanel') : page.locator('#main-content');
      await expect(result.getByText(/Synthetic unavailable network/).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: empty, exact: true })).toHaveCount(0);
      await expect(page.getByText('Nothing to show.', { exact: true })).toHaveCount(0);
      await expect(
        page.getByText('No long waits or unstaffed stations in this line.', { exact: true }),
      ).toHaveCount(0);
    });
});

for (const role of ['doctor', 'volunteer', 'manager', 'director']) {
  test.describe(`${role} dashboard`, () => {
    test.use({ storageState: storageStateFor(role) });
    test('keeps role-specific work and navigation within every width', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto('/dashboard');
      // Each role's home (W2) leads with its own work rows: "Needs attention" for the clinic's
      // managers and directors, "Needs you now" otherwise.
      await expect(
        page.getByRole('heading', { name: /^Needs (you now|attention)$/ }),
      ).toBeVisible();
      // This heading is rendered only with loaded dashboard data. Background polling and
      // chat can keep the network active indefinitely, so networkidle is not a ready signal.
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await expect
          .poll(async () =>
            Math.max(...(await overflow(page)).map((box) => box.scrollWidth - box.clientWidth)),
          )
          .toBeLessThanOrEqual(0);
      }
    });
  });
}

test.describe('staff role read errors', () => {
  test.use({ storageState: storageStateFor('staff') });
  test('failed role details do not claim the account has no role records', async ({ page }) => {
    await page.route('**/admin/users/*/roles', (route) =>
      route.fulfill({ status: 503, json: { message: 'Synthetic unavailable network' } }),
    );
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Manage', exact: true }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(
      sheet.getByText('Role records could not be loaded', { exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByRole('heading', { name: 'No role records found', exact: true }),
    ).toHaveCount(0);
    await expect(
      sheet.getByRole('heading', { name: 'No roles in the active clinic', exact: true }),
    ).toHaveCount(0);
  });
});
