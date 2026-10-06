const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const {
  queueOfflineChange,
  readOutboxRows,
  waitForOutboxDrain,
  waitForPush,
} = require('../playwright/outbox');
const { storageStateFor } = require('../playwright/roles');

/*
  Issue #21: the replay cases in docs/security/offline-job-execution-matrix.md that only a browser
  can prove. A connection that fails partway, the same change arriving twice, and a change left
  over from another clinic are each a way a clinician's entry could be lost, written twice, or
  written to the wrong place.
*/
test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const lastName = `Replay-${suffix}`;
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Queued');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-REPLAY-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  return { clinicId, patientId, lastName };
}

/** Save a first-name change with the connection down, so it waits in the outbox. */
async function editFirstNameOffline(page, context, patient, firstName) {
  await page.goto(`/clinics/${patient.clinicId}/patients/${patient.patientId}/edit`);
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Queued');
  await context.setOffline(true);
  await page.getByLabel('First name', { exact: true }).fill(firstName);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Saved on this device/)).toBeVisible();
  const [row] = (await readOutboxRows(page, patient.clinicId)).filter(
    (queued) => queued.entityType === 'patient' && queued.entityId === patient.patientId,
  );
  expect(row).toBeDefined();
  return row;
}

async function expectChartName(page, patient, firstName) {
  await page.goto(`/clinics/${patient.clinicId}/patients/${patient.patientId}`);
  await expect(page.getByRole('heading', { name: `${firstName} ${patient.lastName}` })).toBeVisible(
    { timeout: 20_000 },
  );
}

test('a change the server failed to take drains by itself once the server answers again', async ({
  page,
  context,
}) => {
  const patient = await createPatient(page);
  const row = await editFirstNameOffline(page, context, patient, 'Recovered');

  // The first push after reconnecting meets a struggling server; every later one gets through.
  let failedPushes = 0;
  await page.route('**/sync/push*', async (route) => {
    if (failedPushes === 0) {
      failedPushes += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Upstream unavailable' }),
      });
      return;
    }
    await route.continue();
  });

  const pill = page.getByTestId('sync-status');
  await context.setOffline(false);
  await expect(pill).toHaveAttribute('data-state', 'failed');
  // Nothing was confirmed, so the queued change is exactly as it was saved, and it is not
  // presented as something the clinician has to deal with.
  const [untouched] = await readOutboxRows(page, patient.clinicId);
  expect(untouched).toEqual(row);

  // No reconnect and no Sync now: the provider retries on its own.
  await waitForOutboxDrain(page, expect, { entityType: 'patient', clinicId: patient.clinicId });
  expect(failedPushes).toBe(1);
  await expect(pill).toHaveAttribute('data-state', 'synced');
  await expectChartName(page, patient, 'Recovered');
});

test('the same change sent twice under one idempotency key is applied once', async ({
  page,
  context,
}) => {
  const patient = await createPatient(page);
  const original = await editFirstNameOffline(page, context, patient, 'Once');

  // The same change again, as a second tab or a resend of a request that had in fact landed
  // would carry it: a new row, the same key. Its payload differs only so a second write would show.
  await queueOfflineChange(page, {
    ...original,
    id: randomUUID(),
    payloadJson: JSON.stringify({ ...JSON.parse(original.payloadJson), firstName: 'Twice' }),
    createdAt: new Date(Date.parse(original.createdAt) + 1000).toISOString(),
  });

  const push = waitForPush(page);
  await context.setOffline(false);
  const { results } = await (await push).json();

  // The second is answered from the first one's record, so the device can let go of both.
  expect(results.map((result) => result.status)).toEqual(['APPLIED', 'APPLIED']);
  await waitForOutboxDrain(page, expect, { entityType: 'patient', clinicId: patient.clinicId });
  await expectChartName(page, patient, 'Once');
});

test('a change queued under another clinic is neither sent nor counted while this one is active', async ({
  page,
}) => {
  const patient = await createPatient(page);
  const otherClinicId = randomUUID();
  const stale = {
    id: randomUUID(),
    clinicId: otherClinicId,
    entityType: 'patient',
    entityId: randomUUID(),
    operation: 'UPSERT',
    payloadJson: JSON.stringify({ firstName: 'Elsewhere', lastName: 'Queued' }),
    idempotencyKey: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await queueOfflineChange(page, stale);

  const pushed = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/sync/push') pushed.push(request.postData() ?? '');
  });
  const pull = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/sync/pull' && response.ok(),
  );
  await page.goto(`/clinics/${patient.clinicId}/patients/${patient.patientId}`);
  await pull;

  expect(pushed.join('\n')).not.toContain(stale.id);
  expect(pushed.join('\n')).not.toContain(otherClinicId);
  // Kept for the clinic it belongs to, and not shown as this clinic's work.
  expect(await readOutboxRows(page, otherClinicId)).toEqual([stale]);
  const pill = page.getByTestId('sync-status');
  await expect(pill).toHaveAttribute('data-state', 'synced');
  await expect(pill).toHaveAttribute('aria-label', /All synced/);
});
