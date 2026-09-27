const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

async function createPatient(page, nationalId) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Sync');
  await page.getByLabel('Last name', { exact: true }).fill(`Recovery-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(nationalId);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  return { clinicId, patientId };
}

/** Write straight into the device outbox, as an older client or a long offline session would. */
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

async function outboxCount(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const count = request.result
            .transaction('outbox', 'readonly')
            .objectStore('outbox')
            .count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        };
      }),
  );
}

function waitForPush(page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/sync/push',
  );
}

test('a duplicate patient conflict is explained and recoverable without the console', async ({
  page,
}) => {
  const nationalId = `E2E-SYNC-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const { clinicId, patientId: existingPatientId } = await createPatient(page, nationalId);

  // A chart registered offline with an ID that already belongs to someone else.
  await queueOfflineChange(page, {
    id: randomUUID(),
    clinicId,
    entityType: 'patient',
    entityId: randomUUID(),
    operation: 'UPSERT',
    payloadJson: JSON.stringify({
      nationalId,
      primaryClinicId: clinicId,
      firstName: 'Offline',
      lastName: 'Duplicate',
    }),
    idempotencyKey: randomUUID(),
    createdAt: new Date().toISOString(),
  });

  // Reloading is the realistic path, a queue left over from an earlier session, and it is also
  // what lets Dexie see a row written behind its back. Opening the app syncs on its own.
  const push = waitForPush(page);
  await page.reload();
  const pushResult = await (await push).json();
  expect(pushResult.results[0]).toMatchObject({
    status: 'CONFLICT',
    conflictType: 'DUPLICATE_NATIONAL_ID',
    retryable: false,
  });

  // The clinician is told, and can go straight to the queue from the toast.
  await expect(page.getByText('An offline change needs your attention')).toBeVisible();
  await page.getByRole('button', { name: 'Review', exact: true }).click();

  const center = page.getByRole('dialog', { name: 'Offline changes' });
  await expect(center.getByRole('heading', { name: /Needs attention/ })).toBeVisible();
  await expect(
    center.getByText('Another chart already uses this national ID', { exact: true }),
  ).toBeVisible();
  await expect(center.getByText('Next step:')).toBeVisible();
  await expect(center.getByRole('link', { name: 'Open existing chart' })).toHaveAttribute(
    'href',
    `/clinics/${clinicId}/patients/${existingPatientId}`,
  );
  await expect(center.getByRole('link', { name: 'Review duplicates' })).toHaveAttribute(
    'href',
    '/admin/duplicates',
  );
  // Replaying would get the same answer, so it is not offered.
  await expect(center.getByRole('button', { name: 'Retry' })).toHaveCount(0);

  // Support can see the raw answer without anyone opening DevTools.
  await center.getByText('Technical details').click();
  await expect(center.getByText('DUPLICATE_NATIONAL_ID').first()).toBeVisible();
  await expect(center.getByRole('button', { name: 'Copy for support' })).toBeVisible();

  // The state lives on the device, not in memory.
  await page.reload();
  const pill = page.getByTestId('sync-status');
  await expect(pill).toHaveAttribute('data-state', 'attention');
  await pill.click();
  await expect(
    center.getByText('Another chart already uses this national ID', { exact: true }),
  ).toBeVisible();

  await center.getByRole('link', { name: 'Open existing chart' }).click();
  await page.waitForURL(`**/clinics/${clinicId}/patients/${existingPatientId}`);
  await expect(center).toBeHidden();

  // Narrowest supported width: the pill stays reachable and the sheet does not overflow.
  await page.setViewportSize({ width: 375, height: 812 });
  await pill.click();
  await expect(
    center.getByText('Another chart already uses this national ID', { exact: true }),
  ).toBeVisible();
  const overflow = await center.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await center.getByRole('button', { name: 'Discard' }).click();
  const confirm = page.getByRole('dialog', { name: 'Discard this offline change?' });
  await expect(confirm.getByText(/cannot be recovered/)).toBeVisible();
  const afterDiscard = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/sync/pull',
  );
  await confirm.getByRole('button', { name: 'Discard change' }).click();
  await afterDiscard;
  await expect(center.getByText('Everything is synced').first()).toBeVisible();
  expect(await outboxCount(page)).toBe(0);
  await expect(pill).toHaveAttribute('data-state', 'synced');
});

test('an offline patient edit syncs once the connection returns', async ({ page, context }) => {
  const nationalId = `E2E-EDIT-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const { clinicId, patientId } = await createPatient(page, nationalId);

  await page.goto(`/clinics/${clinicId}/patients/${patientId}/edit`);
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Sync');

  await context.setOffline(true);
  await page.getByLabel('First name', { exact: true }).fill('Edited offline');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Saved on this device/)).toBeVisible();
  // Every offline patient edit used to be refused for lacking a national ID and re-sent forever.
  expect(await outboxCount(page)).toBe(1);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'offline');

  const push = waitForPush(page);
  await context.setOffline(false);
  const pushResult = await (await push).json();
  expect(pushResult.results[0]).toMatchObject({ status: 'APPLIED' });
  await expect.poll(() => outboxCount(page)).toBe(0);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced');
});
