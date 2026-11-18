const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const { apiRequestAs } = require('../playwright/api-client');
const { readOutboxRows, waitForOutboxDrain } = require('../playwright/outbox');
const { storageStateFor } = require('../playwright/roles');

/*
  #207: a staff member who opted in on this device resumes offline after a cold start. The
  threat model and every decision are in docs/security/offline-session-matrix.md.
*/
const offlineSession =
  process.env.FEATURE_OFFLINE_SESSION_ENABLED === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_OFFLINE_SESSION_ENABLED === 'true';
test.skip(!offlineSession, 'Offline session resume is behind FEATURE_OFFLINE_SESSION_ENABLED');

const PIN = '482913';

async function waitForControlledPage(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

/** A chart the role can open, created through the API so the spec owns it. */
async function createPatient(role) {
  const clinicId = (await apiRequestAs(role, 'get', '/auth/whoami')).json().activeClinicId;
  const lastName = `Offline-${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const response = await apiRequestAs(role, 'post', `/clinics/${clinicId}/patients`, {
    clinicId,
    data: {
      firstName: 'Resumed',
      lastName,
      nationalIdType: 'OTHER',
      nationalId: `E2E-OFFLINE-${randomUUID()}`,
      sex: 'FEMALE',
    },
  });
  expect(response.ok()).toBe(true);
  return { clinicId, patientId: response.json().id, lastName };
}

async function enableOfflineAccess(page, { passkey = false } = {}) {
  await page.goto('/settings/offline-access');
  await page.getByLabel('New PIN').fill(PIN);
  await page.getByLabel('Enter the PIN again').fill(PIN);
  const passkeyBox = page.getByRole('checkbox', { name: /fingerprint or face/ });
  if ((await passkeyBox.count()) > 0) {
    if ((await passkeyBox.isChecked()) !== passkey) await passkeyBox.click();
  }
  await page.getByRole('button', { name: 'Turn on offline access' }).click();
  await expect(page.getByRole('heading', { name: 'On for this device' })).toBeVisible({
    timeout: 20_000,
  });
}

/** Open `path` online twice, so the service worker has it for a cold start without signal. */
async function cache(page, path) {
  await page.goto(path);
  await waitForControlledPage(page);
  await page.reload();
  // The worker stores the copy after answering, so wait for it before cutting the connection.
  await expect
    .poll(() => page.evaluate(async (pathname) => Boolean(await caches.match(pathname)), path))
    .toBe(true);
}

async function unlock(page, pin = PIN) {
  await page.getByLabel('Offline PIN').fill(pin);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
}

test.describe('a doctor who opted in on this device', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('cold-starts offline, unlocks with the PIN, queues a change under the grant, and sends it after signing in', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const patient = await createPatient('doctor');
    const chart = `/clinics/${patient.clinicId}/patients/${patient.patientId}`;
    await enableOfflineAccess(page);
    await cache(page, chart);
    await expect(page.getByRole('heading', { name: `Resumed ${patient.lastName}` })).toBeVisible({
      timeout: 20_000,
    });
    await cache(page, `${chart}/edit`);
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Resumed');
    await cache(page, '/dashboard');

    // The cold start: no connection before the first navigation, and no token in memory.
    await context.setOffline(true);
    await page.goto(chart);
    await expect(page.getByRole('heading', { name: 'Unlock as E2E Doctor' })).toBeVisible({
      timeout: 20_000,
    });

    await unlock(page, '000000');
    await expect(page.getByText('That PIN is not right. 4 tries left.')).toBeVisible();
    await unlock(page);
    await expect(page.getByTestId('offline-session-banner')).toContainText(
      'Offline session as E2E Doctor',
    );
    // The chart reads from the encrypted local copy, opened with the keys the grant carried.
    await expect(page.getByRole('heading', { name: `Resumed ${patient.lastName}` })).toBeVisible({
      timeout: 20_000,
    });

    // Offline, a page change is a full load. The session survives it without a second PIN.
    await page.goto(`${chart}/edit`);
    await expect(page.getByTestId('offline-session-banner')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Resumed');
    await page.getByLabel('First name', { exact: true }).fill('Unlocked');
    await page.getByRole('button', { name: 'Save changes' }).click();
    // Saving returns to the chart, another full load, in the same session.
    await expect(page.getByRole('button', { name: /Offline changes: 1 queued/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('offline-session-banner')).toBeVisible();
    const [row] = (await readOutboxRows(page, patient.clinicId)).filter(
      (queued) => queued.entityType === 'patient' && queued.entityId === patient.patientId,
    );
    expect(row.offlineSession).toMatchObject({ unlockMethod: 'pin' });
    expect(row.offlineSession.grantId).toBeTruthy();

    // OFF-01: the home page offline is a calm notice, not a failed load.
    await page.goto('/dashboard');
    await expect(page.getByTestId('offline-session-banner')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('dashboard-offline-notice')).toContainText(
      'Dashboard figures need a connection.',
    );
    await expect(page.getByText(/could not load|couldn't load/i)).toHaveCount(0);

    // Lock pauses the session: back to the unlock screen, and nothing queued is lost. A page load
    // after Lock asks again: the service worker let go of the session too.
    await page.getByRole('button', { name: 'Lock' }).click();
    await expect(page.getByRole('heading', { name: 'Unlock as E2E Doctor' })).toBeVisible();
    await page.goto(chart);
    await expect(page.getByRole('heading', { name: 'Unlock as E2E Doctor' })).toBeVisible({
      timeout: 20_000,
    });

    // The connection returns before anyone unlocks: the ordinary sign-in takes over and sends it.
    await context.setOffline(false);
    await page.goto(chart);
    // Read from the server: until the device keys load, a queued row is sealed and an entity-type
    // filter on the local outbox would match nothing, which looks drained when it is not.
    await expect
      .poll(
        async () =>
          (
            await apiRequestAs(
              'doctor',
              'get',
              `/patients/${patient.patientId}?clinicId=${patient.clinicId}`,
              { clinicId: patient.clinicId },
            )
          ).json().patient?.firstName,
        { timeout: 60_000 },
      )
      .toBe('Unlocked');
    await waitForOutboxDrain(page, expect, { clinicId: patient.clinicId });
  });

  test('five wrong PINs remove offline access from the device but keep its queued changes', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await enableOfflineAccess(page);
    await cache(page, '/dashboard');
    const queuedBefore = (await readOutboxRows(page)).length;

    await context.setOffline(true);
    await page.goto('/dashboard');
    // Each attempt is answered before the next: a PIN is checked through 600,000 PBKDF2 rounds.
    for (const left of ['4 tries left', '3 tries left', '2 tries left', '1 try left']) {
      await unlock(page, '111111');
      await expect(page.getByText(new RegExp(left))).toBeVisible();
    }
    await unlock(page, '111111');
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(page.getByText(/removed from this device after 5 wrong tries/)).toBeVisible();
    await expect(page.getByTestId('offline-queued-count')).toHaveText(String(queuedBefore));

    await context.setOffline(false);
    await page.goto('/settings/offline-access');
    await expect(page.getByRole('button', { name: 'Turn on offline access' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('a grant past its lifetime gives the offline screen, not the unlock screen', async ({
    page,
    context,
  }) => {
    await enableOfflineAccess(page);
    await cache(page, '/dashboard');
    await context.setOffline(true);
    // The device clock four days on: well past the 72-hour default.
    await page.clock.install({ time: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000) });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: /^Unlock as/ })).toHaveCount(0);
  });

  test('unlocks with a passkey when the authenticator supports PRF', async ({ page, context }) => {
    test.setTimeout(120_000);
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    try {
      await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
          hasPrf: true,
        },
      });
    } catch {
      test.skip(
        true,
        'This Chromium cannot emulate PRF; unlock.ts unit tests cover the passkey path',
      );
    }

    await enableOfflineAccess(page, { passkey: true });
    await expect(page.getByText('PIN, or fingerprint or face')).toBeVisible();
    await cache(page, '/dashboard');
    await context.setOffline(true);
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Use fingerprint or face' }).click();
    await expect(page.getByTestId('offline-session-banner')).toContainText(
      'Offline session as E2E Doctor',
    );
  });
});

test('on a shared device each person unlocks only as themselves', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ storageState: storageStateFor('doctor') });
  const page = await context.newPage();
  await enableOfflineAccess(page);

  // The volunteer signs in on the same browser profile.
  const volunteer = require(storageStateFor('volunteer'));
  await context.clearCookies();
  await context.addCookies(volunteer.cookies);
  await enableOfflineAccess(page);
  await cache(page, '/dashboard');

  await context.setOffline(true);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Who is using this device?' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: /E2E Doctor/ })).toBeVisible();
  await page.getByRole('button', { name: /E2E Volunteer/ }).click();
  await expect(page.getByRole('heading', { name: 'Unlock as E2E Volunteer' })).toBeVisible();
  await page.getByRole('button', { name: 'Not E2E?' }).click();
  await expect(page.getByRole('heading', { name: 'Who is using this device?' })).toBeVisible();
  await page.getByRole('button', { name: /E2E Volunteer/ }).click();
  await unlock(page);
  await expect(page.getByTestId('offline-session-banner')).toContainText(
    'Offline session as E2E Volunteer',
  );
  await context.close();
});

test.describe('accounts that never get offline access', () => {
  for (const role of ['staff', 'patient']) {
    test(`${role}`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: storageStateFor(role) });
      const page = await context.newPage();
      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('link', { name: 'Manage offline access' })).toHaveCount(0);
      await page.goto('/settings/offline-access');
      await expect(
        page.getByText(
          'Offline access is for clinic staff. Administrator and patient accounts work online only.',
        ),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: 'Turn on offline access' })).toHaveCount(0);
      await context.close();
    });
  }
});
