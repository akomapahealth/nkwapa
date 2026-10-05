const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { readOutbox, waitForOutboxDrain } = require('../playwright/outbox');
const { storageStateFor } = require('../playwright/roles');

/*
  Issue #17: the shift and patient check-in actions on the clinic floor keep working through a
  connection drop, replay exactly once, and say what still needs a connection.

  Runs as `staff`, the one identity that holds both a shift role and the Today board.
*/
test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const lastName = `Floor-${suffix}`;
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Offline');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-OPS-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  const name = `Offline ${lastName}`;
  // The chart must be on screen before a test drops the connection under it.
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 20_000 });
  return { clinicId, patientId, name };
}

/** Write straight into the device outbox, as a device that queued it in an earlier session. */
async function queueOfflineChange(page, row) {
  await page.evaluate(
    (record) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('outbox', 'readwrite');
          transaction.objectStore('outbox').put(record);
          transaction.oncomplete = () => resolve(undefined);
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    row,
  );
}

/** Leave the staff identity off duty, so each test starts from the same place. */
async function endShiftIfRunning(page) {
  const end = page.getByRole('button', { name: /^End shift at/ });
  if (await end.isVisible()) {
    await end.click();
    await expect(page.getByTestId('ops-feedback')).toHaveText('Shift ended.');
  }
}

async function openTodayBoard(page) {
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Today Board' })).toBeVisible();
  await expect(page.getByText('Shift Status', { exact: true })).toBeVisible({ timeout: 20_000 });
}

test('a shift started offline is labelled pending, then syncs once', async ({ page, context }) => {
  await openTodayBoard(page);
  await endShiftIfRunning(page);

  await context.setOffline(true);
  await expect(page.getByTestId('ops-offline-banner')).toBeVisible();
  await expect(page.getByTestId('ops-offline-banner')).toContainText(
    'Assigning patients and refreshing the board need a connection.',
  );

  const start = page.getByRole('button', { name: /^Start / });
  await expect(start).toBeEnabled();
  await start.click();

  await expect(page.getByTestId('ops-feedback')).toContainText('Shift start saved on this device');
  await expect(page.getByText('On Duty', { exact: true })).toBeVisible();
  await expect(page.getByTestId('ops-pending-badge').first()).toHaveText('Pending sync');

  const queued = (await readOutbox(page)).filter((row) => row.entityType === 'shift_check_in');
  expect(queued).toHaveLength(1);

  await context.setOffline(false);
  await waitForOutboxDrain(page, expect, { entityType: 'shift_check_in' });

  // The server's copy replaces the drawn one: still on duty, no longer pending.
  await expect(page.getByText('On Duty', { exact: true })).toBeVisible();
  await expect(page.getByTestId('ops-pending-badge')).toHaveCount(0, { timeout: 20_000 });

  await page.reload();
  await expect(page.getByText('On Duty', { exact: true })).toBeVisible({ timeout: 20_000 });
  await endShiftIfRunning(page);
});

test('a patient checked in offline reaches the board once, and is not checked in twice', async ({
  page,
  context,
}) => {
  const patient = await createPatient(page);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Check In Patient' }).click();
  await expect(page.getByTestId('ops-feedback')).toContainText(
    'is checked in on this device and will reach the clinic board',
  );

  await context.setOffline(false);
  await waitForOutboxDrain(page, expect, { entityType: 'patient_check_in' });

  await openTodayBoard(page);
  const card = page.locator('article', { hasText: patient.name });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('ops-pending-badge')).toHaveCount(0);

  // A second check-in the same day is refused in plain words, with the way to the board.
  await page.goto(`/clinics/${patient.clinicId}/patients/${patient.patientId}`);
  await page.getByRole('button', { name: 'Check In Patient' }).click();
  const feedback = page.getByTestId('ops-feedback');
  await expect(feedback).toContainText('is already checked in today');
  await expect(feedback).toHaveAttribute('data-tone', 'warning');
  await expect(page.getByRole('link', { name: 'Open Today board' })).toHaveAttribute(
    'href',
    '/today',
  );

  // Offline, the board still renders from the device's copy, and assigning says why it cannot.
  await openTodayBoard(page);
  await expect(page.locator('article', { hasText: patient.name })).toHaveCount(1);
  await context.setOffline(true);
  await expect(page.getByTestId('ops-offline-banner')).toContainText(
    'Showing what this device last loaded',
  );
  const assign = page
    .locator('article', { hasText: patient.name })
    .getByRole('button', { name: 'Assign' });
  await expect(assign).toBeDisabled();
  await expect(assign).toHaveAttribute('title', /Assigning needs a connection/);
  await context.setOffline(false);
});

test('replaying the same check-in twice creates one arrival', async ({ page }) => {
  const patient = await createPatient(page);
  const checkInId = randomUUID();
  const row = (id) => ({
    id,
    clinicId: patient.clinicId,
    entityType: 'patient_check_in',
    entityId: checkInId,
    operation: 'UPSERT',
    payloadJson: JSON.stringify({
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      patientId: patient.patientId,
    }),
    // Different keys on purpose: the server's own record id is what has to stop the second one.
    idempotencyKey: randomUUID(),
    createdAt: new Date().toISOString(),
  });

  await queueOfflineChange(page, row(randomUUID()));
  await queueOfflineChange(page, row(randomUUID()));

  const push = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/sync/push',
  );
  await page.reload();
  const { results } = await (await push).json();
  expect(results.map((result) => result.status)).toEqual(['APPLIED', 'APPLIED']);
  await waitForOutboxDrain(page, expect, { entityType: 'patient_check_in' });

  await openTodayBoard(page);
  await expect(page.locator('article', { hasText: patient.name })).toHaveCount(1);
});
