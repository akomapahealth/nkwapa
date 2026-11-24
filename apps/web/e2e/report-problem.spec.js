const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');
const { fillNationalId } = require('../playwright/register-patient');

/*
  Issue #422: "Report a problem", in the moment, with where it happened attached.

  Every report goes through the sync outbox, so one sent offline and one sent online take the same
  path and land once. Directors read them at /admin/feedback; nobody else can.
*/
test.use({ storageState: storageStateFor('staff') });

const stationFlagOn =
  process.env.FEATURE_STATION_WORKFLOW_ENABLED === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED === 'true';

async function reportsFor(role, clinicId) {
  return apiRequestAs(role, 'get', `/clinics/${clinicId}/staff-feedback`, { clinicId });
}

async function staffClinicId() {
  return (await apiRequestAs('staff', 'get', '/auth/whoami')).json().activeClinicId;
}

test('a report from the account menu sends at once and a director reads it', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const marker = `E2E report ${randomUUID().slice(0, 8)}`;
  await page.goto('/today');
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Report a problem' }).click();

  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  const sent = dialog.getByRole('region', { name: 'Sent with this report' });
  await expect(sent.getByText('/today', { exact: true })).toBeVisible();
  await expect(sent.getByText('Online', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send report' })).toBeDisabled();
  await dialog.getByLabel('Confusing').check();
  await dialog.getByLabel('Describe it (optional)').fill(marker);
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Report sent')).toBeVisible({ timeout: 20_000 });

  const clinicId = await staffClinicId();
  const reports = (await reportsFor('director', clinicId)).json();
  expect(reports.find((row) => row.text === marker)).toMatchObject({
    category: 'CONFUSING',
    stationKind: null,
    context: { route: '/today', online: true },
  });

  // A volunteer can send one but not read them.
  expect((await reportsFor('volunteer', clinicId)).status()).toBe(403);

  const director = await browser.newContext({ storageState: storageStateFor('director') });
  const directorPage = await director.newPage();
  await directorPage.goto('/admin/feedback');
  await expect(directorPage.getByRole('heading', { name: 'Problem reports' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(directorPage.getByText(`“${marker}”`)).toBeVisible();
  await director.close();
});

test('a report from a station visit made offline sends after reconnecting', async ({
  page,
  context,
}) => {
  test.skip(!stationFlagOn, 'Runs only with the station workflow flag on (API and web).');
  test.setTimeout(150_000);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Report');
  await page.getByLabel('Last name', { exact: true }).fill(`Problem-${suffix}`);
  await fillNationalId(page, `E2E-RPT-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');

  const shift = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/shifts/check-in`, {
    clinicId,
    data: { roleAtShift: 'VOLUNTEER' },
  });
  if (!shift.ok()) expect(shift.json().code).toBe('SHIFT_ALREADY_ACTIVE');
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;

  // Walk the patient to Glucose.
  let visit;
  for (;;) {
    const board = (
      await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
    ).json();
    const station = board.stations.find((s) => s.visits.some((v) => v.checkInId === checkInId));
    visit = station.visits.find((v) => v.checkInId === checkInId);
    const claim = await apiRequestAs(
      'staff',
      'post',
      `/clinics/${clinicId}/station-visits/${visit.id}/claim`,
      { clinicId },
    );
    expect(claim.ok(), claim.text()).toBeTruthy();
    if (station.kind === 'GLUCOSE') break;
    const done = await apiRequestAs(
      'staff',
      'post',
      `/clinics/${clinicId}/station-visits/${visit.id}/complete`,
      { clinicId, data: {} },
    );
    expect(done.ok(), done.text()).toBeTruthy();
  }

  await page.goto(`/stations/visits/${visit.id}`);
  await expect(page.getByRole('button', { name: 'Report a problem' })).toBeVisible({
    timeout: 20_000,
  });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Report a problem' }).click();

  const marker = `E2E offline report ${suffix}`;
  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  const sent = dialog.getByRole('region', { name: 'Sent with this report' });
  // The volunteer sees what goes with the report before sending it.
  await expect(sent.getByText('/stations/visits/:id', { exact: true })).toBeVisible();
  await expect(sent.getByText('Offline', { exact: true })).toBeVisible();
  await expect(sent.getByText(/glucose/i)).toBeVisible();
  await dialog.getByLabel('Something did not save').check();
  await dialog.getByLabel('Describe it (optional)').fill(marker);
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Report saved')).toBeVisible({ timeout: 20_000 });
  expect((await reportsFor('director', clinicId)).json().some((row) => row.text === marker)).toBe(
    false,
  );

  await context.setOffline(false);
  await expect
    .poll(
      async () =>
        (await reportsFor('director', clinicId)).json().find((row) => row.text === marker),
      { timeout: 60_000 },
    )
    .toMatchObject({
      category: 'NOT_SAVED',
      stationKind: 'GLUCOSE',
      context: { route: '/stations/visits/:id', online: false },
    });
});
