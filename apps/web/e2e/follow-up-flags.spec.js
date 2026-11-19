const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');

/*
  Issue #337: flag notifications. A volunteer records a danger sign; the clinic's manager gets a
  bell tile (and the volunteer does not); a doctor says "I'm on it" from the chart; the manager's
  tile then says who took it. Managers are told on or off shift, so the assertions do not depend
  on who another spec left checked in. Needs the follow-up flag on in the API and the web build.
*/
test.skip(
  process.env.FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED !== 'true' ||
    process.env.NEXT_PUBLIC_FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED !== 'true',
  'Runs only with the follow-up stratification flag on (API and web).',
);
test.describe.configure({ mode: 'serial' });

/** The bell's tiles about this patient, read as `role`. */
async function tilesFor(role, lastName) {
  const response = await apiRequestAs(role, 'get', '/me/notifications');
  expect(response.ok()).toBe(true);
  return response.json().items.filter((item) => item.title.includes(lastName));
}

test('a danger sign reaches the manager, a doctor takes it, and the manager sees who', async ({
  browser,
}) => {
  const whoami = (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json();
  const clinicId = whoami.activeClinicId;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const lastName = `Flag-${suffix}`;

  const patient = await apiRequestAs('volunteer', 'post', `/clinics/${clinicId}/patients`, {
    clinicId,
    headers: { 'Idempotency-Key': randomUUID() },
    data: {
      firstName: 'Urgent',
      lastName,
      nationalIdType: 'NATIONAL_ID',
      nationalId: `E2E-FLAG-${suffix}`,
    },
  });
  expect(patient.ok()).toBe(true);
  const patientId = patient.json().id;

  const encounter = await apiRequestAs('volunteer', 'post', `/clinics/${clinicId}/encounters`, {
    clinicId,
    headers: { 'Idempotency-Key': randomUUID() },
    data: { patientId },
  });
  expect(encounter.ok()).toBe(true);
  // 400 mg/dL is above the 18 mmol/L danger line, whatever the timing.
  const reading = await apiRequestAs(
    'volunteer',
    'put',
    `/clinics/${clinicId}/encounters/${encounter.json().id}/diabetes-screening/glucose`,
    {
      clinicId,
      headers: { 'Idempotency-Key': randomUUID() },
      data: { glucoseMgDl: 400, glucoseType: 'RANDOM', collectedAt: new Date().toISOString() },
    },
  );
  expect(reading.ok()).toBe(true);

  // Within seconds, the manager has one tile; the volunteer who recorded it has none.
  await expect
    .poll(async () => (await tilesFor('manager', lastName)).length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  const [tile] = await tilesFor('manager', lastName);
  expect(tile.kind).toBe('HEALTH_ALERT');
  expect(tile.riskFlag).toMatchObject({ patientId, open: true, acknowledgedBy: null });
  expect(await tilesFor('volunteer', lastName)).toHaveLength(0);

  // A doctor takes it from the chart's urgent banner.
  const doctor = await browser.newContext({ storageState: storageStateFor('doctor') });
  const doctorPage = await doctor.newPage();
  await doctorPage.goto(`/clinics/${clinicId}/patients/${patientId}`);
  const banner = doctorPage.getByTestId('urgent-flag-banner');
  await expect(banner).toContainText('Urgent: refer today', { timeout: 20_000 });
  await expect(banner).toContainText('Very high blood sugar');
  await banner.getByRole('button', { name: "I'm on it" }).click();
  await expect(banner.getByTestId('urgent-flag-owner')).toHaveText(/You're on it/);
  await doctor.close();

  // The manager's tile is read and names the doctor.
  const manager = await browser.newContext({ storageState: storageStateFor('manager') });
  const managerPage = await manager.newPage();
  await managerPage.goto('/notifications');
  const owner = managerPage
    .getByRole('listitem')
    .filter({ hasText: lastName })
    .getByTestId('notification-owner');
  await expect(owner).toContainText(/is on it$/, { timeout: 20_000 });
  await expect(managerPage.getByRole('listitem').filter({ hasText: lastName })).not.toContainText(
    "I'm on it",
  );
  await manager.close();
});
