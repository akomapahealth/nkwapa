const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { outboxCount, queueOfflineChange, waitForPush } = require('../playwright/outbox');
const { apiRequestAs } = require('../playwright/api-client');
const { readOutboxRows, waitForOutboxDrain } = require('../playwright/outbox');
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

// An older server can refuse without classifying retryability. It must remain visible,
// survive reload, and be resent only after the user explicitly asks.
test('a blocked change survives reload and an explicit retry applies it', async ({ page }) => {
  const { clinicId, patientId } = await createPatient(page, `R84-RETRY-${randomUUID()}`);
  const row = {
    id: randomUUID(),
    clinicId,
    entityType: 'patient',
    entityId: patientId,
    operation: 'UPSERT',
    idempotencyKey: randomUUID(),
    createdAt: new Date().toISOString(),
    payloadJson: JSON.stringify({ firstName: 'Recovered blocked save' }),
  };
  let attempts = 0;
  await page.route('**/sync/push*', async (route) => {
    if (
      !route
        .request()
        .postDataJSON()
        .some((mutation) => mutation.id === row.id)
    )
      return route.continue();
    attempts += 1;
    if (attempts > 1) return route.continue();
    return route.fulfill({
      json: {
        results: [
          {
            id: row.id,
            status: 'ERROR',
            conflictType: 'FORBIDDEN',
            conflictDetails: { message: 'Synthetic older-server refusal' },
          },
        ],
      },
    });
  });
  await queueOfflineChange(page, row);
  await page.reload();
  const pill = page.getByTestId('sync-status');
  await expect(pill).toHaveAttribute('data-state', 'attention');
  await expect
    .poll(async () => (await readOutboxRows(page)).find((item) => item.id === row.id)?.syncState)
    .toBe('blocked');
  await page.reload();
  await expect(pill).toHaveAttribute('data-state', 'attention');
  await pill.click();
  const center = page.getByRole('dialog', { name: 'Offline changes' });
  await center.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(center.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  expect(attempts).toBe(1);
  await center.getByRole('button', { name: 'Retry', exact: true }).click();
  await waitForOutboxDrain(page, expect, { entityType: 'patient', clinicId });
  expect(attempts).toBe(2);
  const patient = await apiRequestAs('staff', 'get', `/clinics/${clinicId}/patients/${patientId}`, {
    clinicId,
  });
  expect(patient.ok()).toBeTruthy();
  expect(patient.json().firstName).toBe('Recovered blocked save');
});

// Polish 2 unit 5: stale work still applies, while the other author gets a durable notice.
test('a second user stale save applies and sends the first user an overwrite inbox notice', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { clinicId, patientId } = await createPatient(page, `R84-OVERWRITE-${randomUUID()}`);
  const created = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/encounters`, {
    clinicId,
    data: { patientId },
  });
  expect(created.ok(), created.text()).toBeTruthy();
  const encounterId = created.json().id;
  const vitalsId = randomUUID();
  const mutation = (pulseBpm, baseUpdatedAt) => ({
    id: randomUUID(),
    clinicId,
    entityType: 'encounter_vitals_bundle',
    entityId: vitalsId,
    operation: 'UPSERT',
    idempotencyKey: randomUUID(),
    payloadJson: {
      schemaVersion: 1,
      encounterId,
      vitalsId,
      vitals: { pulseBpm },
      ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
    },
  });
  const push = async (role, change) => {
    const response = await apiRequestAs(role, 'post', `/sync/push?clinicId=${clinicId}`, {
      clinicId,
      data: [change],
    });
    expect(response.ok(), response.text()).toBeTruthy();
    expect(response.json().results[0].status).toBe('APPLIED');
    return response.json().results[0];
  };
  await push('staff', mutation(70));
  const original = await apiRequestAs('staff', 'get', `/encounters/${encounterId}`, { clinicId });
  const baseUpdatedAt = original.json().vitals.updatedAt;
  expect(Number.isFinite(Date.parse(baseUpdatedAt))).toBe(true);
  await push('staff', mutation(79));
  const newer = await apiRequestAs('staff', 'get', `/encounters/${encounterId}`, { clinicId });
  expect(Date.parse(newer.json().vitals.updatedAt)).toBeGreaterThan(Date.parse(baseUpdatedAt));

  const second = await browser.newContext({ storageState: storageStateFor('volunteer') });
  try {
    const otherPage = await second.newPage();
    await otherPage.goto(`/encounters/${encounterId}`);
    await expect(otherPage.getByLabel('Pulse (bpm)')).toHaveValue('79');
    await second.setOffline(true);
    const stale = mutation(82, baseUpdatedAt);
    await queueOfflineChange(
      otherPage,
      {
        ...stale,
        payloadJson: JSON.stringify(stale.payloadJson),
        createdAt: new Date().toISOString(),
      },
      { owner: 'volunteer' },
    );
    const replay = otherPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/sync/push' &&
        response
          .request()
          .postDataJSON()
          ?.some((item) => item.id === stale.id),
    );
    await second.setOffline(false);
    const result = (await (await replay).json()).results.find((item) => item.id === stale.id);
    expect(result).toMatchObject({ status: 'APPLIED', conflictType: 'CONFLICT_OVERWRITTEN' });
    await waitForOutboxDrain(otherPage, expect, {
      entityType: 'encounter_vitals_bundle',
      clinicId,
    });
    const saved = await apiRequestAs('staff', 'get', `/encounters/${encounterId}`, { clinicId });
    expect(saved.json().vitals.pulseBpm).toBe(82);
    const url = `/clinics/${clinicId}/encounters/${encounterId}`;
    let notice;
    await expect
      .poll(async () => {
        const inbox = await apiRequestAs('staff', 'get', '/me/notifications');
        expect(inbox.ok()).toBeTruthy();
        notice = inbox
          .json()
          .items.find(
            (item) => item.url === url && item.title.includes('offline save replaced your vitals'),
          );
        return Boolean(notice);
      })
      .toBe(true);
    expect(notice.readAt).toBeNull();
    expect(notice.count).toBe(1);
    await push('volunteer', stale); // The same key must not warn twice.
    const inbox = await apiRequestAs('staff', 'get', '/me/notifications');
    expect(inbox.json().items.filter((item) => item.id === notice.id)).toMatchObject([
      { count: 1 },
    ]);
    await page.goto('/notifications');
    const tile = page.getByRole('button').filter({ hasText: notice.title });
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(page.getByLabel('Pulse (bpm)')).toHaveValue('82');
  } finally {
    await second.close();
  }
});
