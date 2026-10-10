const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const {
  queueOfflineChange,
  readOutboxRows,
  userIdFor,
  waitForOutboxDrain,
} = require('../playwright/outbox');
const { storageStateFor } = require('../playwright/roles');

/*
  CLN-05, issue #162: on a shared clinic laptop, a change is only ever sent by the account that
  queued it. Another account's work is held, shown and attributed, and can be discarded but never
  sent under the wrong name. A change from before owners were recorded can be claimed only after
  saying plainly whose name the server will record.
*/
test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const lastName = `Owner-${suffix}`;
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Held');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-OWN-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  return { clinicId, patientId };
}

/** A check-in the server would accept, so only ownership decides whether it is sent. */
function checkInRow(patient, overrides = {}) {
  return {
    id: randomUUID(),
    clinicId: patient.clinicId,
    entityType: 'patient_check_in',
    entityId: randomUUID(),
    operation: 'UPSERT',
    payloadJson: JSON.stringify({
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      patientId: patient.patientId,
    }),
    idempotencyKey: randomUUID(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function recordPushes(page) {
  const bodies = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/sync/push') bodies.push(request.postData() ?? '');
  });
  return bodies;
}

async function reloadAndWaitForPull(page) {
  const pull = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/sync/pull' && response.ok(),
  );
  await page.reload();
  await pull;
}

test("another account's queued change is held, attributed, and never sent", async ({ page }) => {
  const patient = await createPatient(page);
  const doctorId = await userIdFor('doctor');
  const held = await queueOfflineChange(
    page,
    checkInRow(patient, { ownerUserId: doctorId, ownerName: 'E2E Doctor' }),
  );

  const pushed = recordPushes(page);
  await reloadAndWaitForPull(page);
  expect(pushed.join('\n')).not.toContain(held.id);

  // Not this account's work, so not in its count.
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced');
  await page.getByTestId('sync-status').click();
  const group = page.getByTestId('sync-held-group');
  await expect(group).toBeVisible();
  await expect(group.getByTestId('sync-held-owner')).toContainText('Saved by E2E Doctor');
  await expect(group.getByRole('button', { name: 'This is mine, send it' })).toHaveCount(0);

  // Discarding asks first, and removes only this device's copy.
  await group.getByRole('button', { name: 'Discard' }).click();
  await page.getByRole('button', { name: 'Discard change' }).click();
  await expect(group).toHaveCount(0);
  expect(await readOutboxRows(page, patient.clinicId)).toEqual([]);
});

test('a change with no recorded owner is sent only after it is claimed', async ({ page }) => {
  const patient = await createPatient(page);
  const ownerless = await queueOfflineChange(page, checkInRow(patient), { owner: null });

  const pushed = recordPushes(page);
  await reloadAndWaitForPull(page);
  expect(pushed.join('\n')).not.toContain(ownerless.id);

  await page.getByTestId('sync-status').click();
  const group = page.getByTestId('sync-held-group');
  await expect(group.getByTestId('sync-held-owner')).toContainText('before this device recorded');
  await group.getByRole('button', { name: 'This is mine, send it' }).click();
  await expect(page.getByText('Send this change as yours?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, I made it' }).click();

  await waitForOutboxDrain(page, expect, {
    entityType: 'patient_check_in',
    clinicId: patient.clinicId,
  });
  expect(pushed.join('\n')).toContain(ownerless.id);
});

test("the owner's own session sends what it queued", async ({ browser, page }) => {
  // The doctor's device copy, as the doctor would find it on signing back in.
  const patient = await createPatient(page);
  const doctorContext = await browser.newContext({ storageState: storageStateFor('doctor') });
  const doctorPage = await doctorContext.newPage();
  await doctorPage.goto('/dashboard');
  await expect(doctorPage.getByTestId('sync-status')).toBeVisible({ timeout: 20_000 });

  const own = await queueOfflineChange(doctorPage, checkInRow(patient), { owner: 'doctor' });
  const pushed = recordPushes(doctorPage);
  await reloadAndWaitForPull(doctorPage);
  await waitForOutboxDrain(doctorPage, expect, {
    entityType: 'patient_check_in',
    clinicId: patient.clinicId,
  });
  expect(pushed.join('\n')).toContain(own.id);
  await doctorContext.close();
});
