const { test, expect, request: playwrightRequest } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');
const { clearMailpitInbox, findMessageTo } = require('../playwright/mailpit');

test.use({ storageState: storageStateFor('staff') });

/**
 * Deactivating someone ends their sign-in, not only their access to Nkwapa. Issue #126.
 *
 * Before this, a deactivated volunteer's password still worked and their sessions lived until
 * they expired; only Nkwapa's own check turned them away. This walks the whole lifecycle against
 * the real Keycloak: a fresh volunteer with a live session is deactivated, and both the session
 * and the password stop working; they are reactivated, and the password works again.
 *
 * The volunteer is created through the staff invitation flow, so the spec owns an identity no
 * other spec relies on. Deactivating a seeded identity would break every spec that signs in as it.
 */
test.describe.configure({ mode: 'serial' });

const RUN = Date.now();
const EMAIL = `e2e.offboard.${RUN}@nkwapa.local`;
const PASSWORD = 'NkwapaOffboard!2026';
const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080';
const TOKEN_URL = `${KEYCLOAK_URL}/realms/nkwapa/protocol/openid-connect/token`;

let clinicId;
let userId;
let liveSession;

async function tokenRequest(form) {
  const context = await playwrightRequest.newContext();
  try {
    const response = await context.post(TOKEN_URL, { form: { client_id: 'nkwapa-web', ...form } });
    return { status: response.status(), body: await response.json().catch(() => ({})) };
  } finally {
    await context.dispose();
  }
}

const passwordGrant = () =>
  tokenRequest({ grant_type: 'password', username: EMAIL, password: PASSWORD, scope: 'openid' });

/** The identity half runs after the request commits, so the spec waits for it to report. */
async function waitForIdentityStatus(status, expected) {
  await expect
    .poll(
      async () => {
        const res = await apiRequestAs(
          'staff',
          'get',
          `/clinics/${clinicId}/users?status=${status}`,
          {
            clinicId,
          },
        );
        return res.json().items.find((row) => row.id === userId)?.identitySync?.status;
      },
      { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe(expected);
}

test.beforeAll(async () => {
  await clearMailpitInbox(EMAIL);
  clinicId = (await apiRequestAs('staff', 'get', '/auth/whoami')).json().activeClinicId;
});

test.afterAll(async () => {
  await clearMailpitInbox(EMAIL);
});

test('a fresh volunteer is invited, sets a password, and holds a live session', async ({
  browser,
}) => {
  const invited = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/staff-invites`, {
    clinicId,
    data: { email: EMAIL, role: 'VOLUNTEER' },
  });
  expect(invited.status()).toBe(201);

  const setup = await findMessageTo(EMAIL, { subjectMatch: /choose your nkwapa password/i });
  const link = (setup.Text || '').match(
    /https?:\/\/[^\s"<]*\/realms\/nkwapa\/login-actions\/action-token[^\s"<]+/,
  )?.[0];
  expect(link).toBeTruthy();

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto(link);
  await page
    .getByRole('link', { name: /continue/i })
    .first()
    .click();
  await page.fill('#password-new', PASSWORD);
  await page.fill('#password-confirm', PASSWORD);
  await page.click('input[type="submit"], button[type="submit"]');
  await expect(page.getByText(/your account is ready/i)).toBeVisible({ timeout: 30_000 });
  await context.close();

  // Signing in once is what creates the local User row, and this session is the one that must end.
  const session = await passwordGrant();
  expect(session.status).toBe(200);
  liveSession = session.body;

  const api = await playwrightRequest.newContext({
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000',
    extraHTTPHeaders: { Authorization: `Bearer ${liveSession.access_token}` },
  });
  const mine = await (await api.get('/staff-invites/mine')).json();
  const accepted = await api.post(`/staff-invites/${mine.items[0].id}/accept`, {
    headers: { 'X-Clinic-Id': clinicId },
  });
  expect(accepted.status()).toBe(201);
  userId = (await (await api.get('/auth/whoami')).json()).userId;
  await api.dispose();
});

test('deactivating ends the live session and stops the password working', async () => {
  const res = await apiRequestAs(
    'staff',
    'patch',
    `/clinics/${clinicId}/users/${userId}/deactivate`,
    {
      clinicId,
    },
  );
  expect(res.status()).toBe(200);
  // Their only clinic, so the account itself goes, and the identity half is queued.
  expect(res.json()).toMatchObject({ isActive: false, identity: { status: 'PENDING' } });

  await waitForIdentityStatus('inactive', 'IN_SYNC');

  // The session that was live a moment ago is gone, not merely waiting to expire.
  const refreshed = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: liveSession.refresh_token,
  });
  expect(refreshed.status).toBe(400);
  expect(refreshed.body.error).toBe('invalid_grant');

  // And the password no longer opens a new one.
  const again = await passwordGrant();
  expect(again.status).not.toBe(200);
});

test('deactivating again is harmless and changes nothing', async () => {
  const res = await apiRequestAs(
    'staff',
    'patch',
    `/clinics/${clinicId}/users/${userId}/deactivate`,
    {
      clinicId,
    },
  );
  expect(res.status()).toBe(200);
  expect(res.json()).toMatchObject({ isActive: false, alreadyInactive: true });
  await waitForIdentityStatus('inactive', 'IN_SYNC');
});

test('reactivating re-enables sign-in with the same password', async () => {
  const res = await apiRequestAs(
    'staff',
    'patch',
    `/clinics/${clinicId}/users/${userId}/reactivate`,
    {
      clinicId,
    },
  );
  expect(res.status()).toBe(200);
  expect(res.json()).toMatchObject({ isActive: true, identity: { status: 'PENDING' } });

  await waitForIdentityStatus('active', 'IN_SYNC');

  const signedIn = await passwordGrant();
  expect(signedIn.status).toBe(200);
});
