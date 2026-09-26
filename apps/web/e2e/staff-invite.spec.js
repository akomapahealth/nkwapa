const { test, expect, request: playwrightRequest } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');
const { clearMailpitInbox, findMessageTo, messageContent } = require('../playwright/mailpit');

test.use({ storageState: storageStateFor('staff') });

/**
 * A new volunteer, from invitation to a correctly scoped account, with nobody touching Keycloak.
 *
 * Issue #124, walked end to end. The patient version of this journey is
 * patient-account-setup.spec.js; this one differs where the issue says it must. The invitation
 * grants a role rather than a record, there is no patient code to confirm, and the role has to
 * land in exactly one clinic.
 *
 * Serial, with the invitee's browser context held across tests, because each step only makes
 * sense after the one before. Separate tests, so a failure names the stage that broke.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'NkwapaColleague!2026';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080';

// Unique per run, so the identity is genuinely new: a fixed address would already hold a
// password on the second run, and the journey under test would never happen.
const RUN = Date.now();
const INVITE_EMAIL = `e2e.colleague.${RUN}@nkwapa.local`;
const CANCELLED_EMAIL = `e2e.withdrawn.${RUN}@nkwapa.local`;

let inviteeContext;
let inviteePage;
let clinicName;

test.beforeAll(async ({ browser }) => {
  await clearMailpitInbox(INVITE_EMAIL);
  // An empty session, not the staff one: Keycloak refuses an action link while another user is
  // signed in, and this invitee has never signed in anywhere.
  inviteeContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  inviteePage = await inviteeContext.newPage();
});

test.afterAll(async () => {
  await inviteeContext?.close();
  await clearMailpitInbox(INVITE_EMAIL);
});

async function openInvitations(page) {
  await page.goto('/admin/users');
  const card = page.getByRole('heading', { name: 'Staff invitations' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  return page.getByRole('list', { name: 'Staff invitations' });
}

async function sendInvitation(page, email) {
  await page.getByRole('button', { name: /invite a colleague/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email').fill(email);
  // Volunteer is the default; asserted rather than assumed, since it is the role under test.
  await expect(dialog.getByLabel('Role')).toContainText('Volunteer');
  await dialog.getByRole('button', { name: /send invitation/i }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible({ timeout: 30_000 });
}

test('a director-level admin invites a volunteer, and an account is created', async ({ page }) => {
  const list = await openInvitations(page);
  await sendInvitation(page, INVITE_EMAIL);

  const row = list.getByRole('listitem').filter({ hasText: INVITE_EMAIL });
  await expect(row.getByText('Waiting to be accepted')).toBeVisible();
  // Identity and delivery are separate facts, as on the patient chart.
  await expect(row.getByText('Account created')).toBeVisible({ timeout: 30_000 });
});

test('both emails arrive, and neither talks about a health record', async () => {
  const invite = await findMessageTo(INVITE_EMAIL, { subjectMatch: /invited to join/i });
  const inviteBody = messageContent(invite);
  clinicName = invite.Subject.match(/join (.+) on Nkwapa/)?.[1];
  expect(clinicName, 'the subject names the clinic').toBeTruthy();

  expect(inviteBody).toContain('Volunteer');
  expect(inviteBody).toContain('Choose your Nkwapa password');
  expect(inviteBody).not.toMatch(/health record|patient code/i);

  const setup = await findMessageTo(INVITE_EMAIL, { subjectMatch: /choose your nkwapa password/i });
  expect(messageContent(setup)).toContain('/realms/nkwapa/login-actions/action-token');
});

test('the invitee sets a password, signs in, and is held on the acceptance page', async () => {
  const setup = await findMessageTo(INVITE_EMAIL, { subjectMatch: /choose your nkwapa password/i });
  const link = (setup.Text || '').match(
    /https?:\/\/[^\s"<]*\/realms\/nkwapa\/login-actions\/action-token[^\s"<]+/,
  )?.[0];
  expect(link, 'the setup email must carry an action token link').toBeTruthy();

  await inviteePage.goto(link);
  await inviteePage
    .getByRole('link', { name: /continue/i })
    .first()
    .click();
  await inviteePage.fill('#password-new', PASSWORD);
  await inviteePage.fill('#password-confirm', PASSWORD);
  await inviteePage.click('input[type="submit"], button[type="submit"]');
  await expect(inviteePage.getByText(/your account is ready/i)).toBeVisible({ timeout: 30_000 });
  await inviteePage.getByRole('link', { name: /continue to nkwapa/i }).click();

  await inviteePage.waitForURL(/realms\/nkwapa/, { timeout: 60_000 });
  await inviteePage.fill('input[name="username"]', INVITE_EMAIL);
  await inviteePage.fill('input[name="password"]', PASSWORD);
  await inviteePage.click('#kc-login, button[type="submit"], input[type="submit"]');

  await inviteePage.waitForURL(/\/accept-invite/, { timeout: 60_000 });
  await expect(inviteePage.getByRole('heading', { name: /join your clinic team/i })).toBeVisible({
    timeout: 60_000,
  });
  await expect(inviteePage.getByText(/password saved/i)).toBeVisible();

  // Nothing is granted by arriving. Anywhere else sends them straight back here.
  await inviteePage.goto('/patients');
  await inviteePage.waitForURL(/\/accept-invite/, { timeout: 30_000 });
});

test('accepting grants the role in that one clinic, and nowhere else', async () => {
  await inviteePage
    .getByRole('button', { name: new RegExp(`accept volunteer at ${clinicName}`, 'i') })
    .click();
  await inviteePage.waitForURL(/\/dashboard/, { timeout: 60_000 });

  // Asked of the API directly, as the invitee: the role, and the scope it landed in.
  const tokenContext = await playwrightRequest.newContext();
  const tokenResponse = await tokenContext.post(
    `${KEYCLOAK_URL}/realms/nkwapa/protocol/openid-connect/token`,
    {
      form: {
        grant_type: 'password',
        client_id: 'nkwapa-web',
        username: INVITE_EMAIL,
        password: PASSWORD,
        scope: 'openid',
      },
    },
  );
  expect(tokenResponse.ok()).toBe(true);
  const { access_token: token } = await tokenResponse.json();
  await tokenContext.dispose();

  const api = await playwrightRequest.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const whoami = await (await api.get('/auth/whoami')).json();
  await api.dispose();

  expect(whoami.globalRoles).toEqual([]);
  expect(whoami.memberships).toHaveLength(1);
  expect(whoami.memberships[0]).toMatchObject({ clinicName, roles: ['VOLUNTEER'] });
  expect(whoami.onboarding).toBeNull();
  expect(whoami.pendingStaffInvites).toEqual([]);
});

test('the admin sees the invitation as accepted, not gone', async ({ page }) => {
  const list = await openInvitations(page);
  const row = list.getByRole('listitem').filter({ hasText: INVITE_EMAIL });
  await expect(row.getByText('Accepted', { exact: true })).toBeVisible({ timeout: 30_000 });
});

test('a cancelled invitation stays visible and stops granting anything', async ({ page }) => {
  const list = await openInvitations(page);
  await sendInvitation(page, CANCELLED_EMAIL);

  const row = list.getByRole('listitem').filter({ hasText: CANCELLED_EMAIL });
  await row.getByRole('button', { name: `Cancel invitation to ${CANCELLED_EMAIL}` }).click();
  await expect(row.getByText('Cancelled', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(row.getByRole('button', { name: /resend/i })).toHaveCount(0);

  await clearMailpitInbox(CANCELLED_EMAIL);
});

test('the API refuses what the form never offers', async () => {
  const whoami = (await apiRequestAs('staff', 'get', '/auth/whoami')).json();
  const clinicId = whoami.activeClinicId;

  // No director seat by email, even for a system admin.
  const escalation = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/staff-invites`, {
    clinicId,
    data: { email: `e2e.director.${RUN}@nkwapa.local`, role: 'DIRECTOR' },
  });
  expect(escalation.status()).toBe(403);

  // A shared inbox is refused outright.
  const shared = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/staff-invites`, {
    clinicId,
    data: { email: 'reception@nkwapa.local', role: 'VOLUNTEER' },
  });
  expect(shared.status()).toBe(400);
  expect(shared.json().code).toBe('STAFF_INVITE_SHARED_MAILBOX');

  // And a volunteer cannot invite at all.
  const volunteer = (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json();
  const volunteerClinic = volunteer.activeClinicId;
  const refused = await apiRequestAs(
    'volunteer',
    'post',
    `/clinics/${volunteerClinic}/staff-invites`,
    {
      clinicId: volunteerClinic,
      data: { email: `e2e.sneaky.${RUN}@nkwapa.local`, role: 'VOLUNTEER' },
    },
  );
  expect(refused.status()).toBe(403);
});
