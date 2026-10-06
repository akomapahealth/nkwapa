const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/*
  Issue #18: a patient's recent portal history survives a dropped connection or a server that
  does not answer, is clearly marked as a saved copy, and never outlives the account it belongs
  to. Portal writes stay online-only.
*/
test.use({ storageState: storageStateFor('patient') });

/** Every row of the device's saved portal history. */
async function readPortalCache(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('portal_cache')) {
            database.close();
            resolve([]);
            return;
          }
          const read = database.transaction('portal_cache').objectStore('portal_cache').getAll();
          read.onsuccess = () => {
            database.close();
            resolve(read.result);
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}

async function putPortalCacheRow(page, row) {
  await page.evaluate(
    (record) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('portal_cache', 'readwrite');
          transaction.objectStore('portal_cache').put(record);
          transaction.oncomplete = () => {
            request.result.close();
            resolve(undefined);
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    row,
  );
}

/** Wait until a live load of the view has left its copy on the device. */
async function expectSavedCopy(page, view) {
  await expect
    .poll(async () => (await readPortalCache(page)).filter((row) => row.view === view).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
}

async function openAppointments(page) {
  await page.goto('/portal/appointments');
  await expect(page.getByRole('heading', { name: /appointments and requests/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: 'Request history' })).toBeVisible({
    timeout: 20_000,
  });
}

test('a server that does not answer shows the saved appointment history, marked as saved', async ({
  page,
}) => {
  await openAppointments(page);
  await expectSavedCopy(page, 'appointments');

  await page.route('**/patients/me/appointments**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"down"}' }),
  );
  await page.reload();

  const notice = page.getByTestId('stale-data-notice');
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText('Showing a saved copy');
  await expect(notice).toContainText('This is what was saved on this device on');
  await expect(page.getByRole('heading', { name: 'Request history' })).toBeVisible();

  // The history is there to read, not to act on: a saved appointment may already have moved.
  for (const button of await page.getByRole('button', { name: 'Request reschedule' }).all()) {
    await expect(button).toBeDisabled();
  }

  // Once the server answers again, the live list replaces the saved one.
  await page.unroute('**/patients/me/appointments**');
  await notice.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('stale-data-notice')).toHaveCount(0, { timeout: 20_000 });
});

test('a read the server refuses drops the saved copy instead of showing it', async ({ page }) => {
  await openAppointments(page);
  await expectSavedCopy(page, 'appointments');

  await page.route('**/patients/me/appointments**', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: '{"message":"Portal access has been withdrawn."}',
    }),
  );
  await page.reload();

  await expect(page.getByText('Appointments could not load')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('stale-data-notice')).toHaveCount(0);
  await expect
    .poll(async () => (await readPortalCache(page)).filter((row) => row.view === 'appointments'))
    .toHaveLength(0);
});

test('offline, history pages keep their saved copy and writes wait for a connection', async ({
  page,
  context,
}) => {
  await page.goto('/portal/health');
  await expect(page.getByRole('heading', { name: /blood pressure trend/i })).toBeVisible({
    timeout: 30_000,
  });
  await expectSavedCopy(page, 'health');
  await page.getByRole('link', { name: 'Appointments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request history' })).toBeVisible({
    timeout: 20_000,
  });
  await expectSavedCopy(page, 'appointments');

  await context.setOffline(true);

  await page.getByRole('link', { name: 'My Health', exact: true }).click();
  const notice = page.getByTestId('stale-data-notice');
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText('You are offline');
  await expect(notice).toContainText('need a connection');
  await expect(page.getByRole('heading', { name: /blood pressure trend/i })).toBeVisible();

  await page.getByRole('link', { name: 'Request Visit', exact: true }).click();
  await expect(page.getByRole('heading', { name: /visit request details/i })).toBeVisible();
  await expect(page.getByTestId('portal-write-gate')).toContainText('You are offline');
  await expect(page.getByRole('button', { name: 'Submit appointment request' })).toBeDisabled();

  await context.setOffline(false);
  await expect(page.getByTestId('portal-write-gate')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit appointment request' })).toBeEnabled();

  await page.getByRole('link', { name: 'My Health', exact: true }).click();
  await expect(page.getByRole('heading', { name: /blood pressure trend/i })).toBeVisible();
  await expect(page.getByTestId('stale-data-notice')).toHaveCount(0, { timeout: 20_000 });
});

test('another account’s saved history is purged and never shown', async ({ page }) => {
  await openAppointments(page);
  await expectSavedCopy(page, 'appointments');
  const [own] = (await readPortalCache(page)).filter((row) => row.view === 'appointments');

  const foreign = {
    ...own,
    key: `someone-else|${own.clinicId}|appointments|`,
    userId: 'someone-else',
    patientId: 'someone-elses-patient',
    data: { requests: [], appointments: [] },
  };
  await putPortalCacheRow(page, foreign);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Request history' })).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(async () => (await readPortalCache(page)).map((row) => row.userId))
    .not.toContain('someone-else');
  expect((await readPortalCache(page)).every((row) => row.userId === own.userId)).toBe(true);
});
