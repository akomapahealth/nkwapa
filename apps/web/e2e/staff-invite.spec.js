const { test, expect, request: playwrightRequest } = require('@playwright/test');
const { skipWelcomeTour } = require('../playwright/welcome-tour');
const { fillStaffName } = require('../playwright/staff-name');

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
const NAMED_EMAIL = `e2e.named.${RUN}@nkwapa.local`;
const CANCELLED_EMAIL = `e2e.withdrawn.${RUN}@nkwapa.local`;

let inviteeContext;
let inviteePage;
let clinicName;

test.beforeAll(async ({ browser }) => {
  await clearMailpitInbox(INVITE_EMAIL);
  await clearMailpitInbox(NAMED_EMAIL);
  // An empty session, not the staff one: Keycloak refuses an action link while another user is
  // signed in, and this invitee has never signed in anywhere.
  inviteeContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  inviteePage = await inviteeContext.newPage();
});

test.afterAll(async () => {
  await inviteeContext?.close();
  await clearMailpitInbox(INVITE_EMAIL);
  await clearMailpitInbox(NAMED_EMAIL);
});

async function openInvitations(page) {
  await page.goto('/admin/users');
  const card = page.getByRole('heading', { name: 'Staff invitations' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  return page.getByRole('list', { name: 'Staff invitations' });
}

async function sendInvitation(page, email, name) {
  await page.getByRole('button', { name: /invite a colleague/i }).click();
  const dialog = page.getByRole('dialog');
  if (name) await fillStaffName(dialog, name);
  await dialog.getByLabel('Email').fill(email);
  // Volunteer is the default; asserted rather than assumed, since it is the role under test.
  await expect(dialog.getByLabel('Role')).toContainText('Volunteer');
  await dialog.getByRole('button', { name: /send invitation/i }).click();
  await expect(page.getByText(`Invitation sent to ${name?.displayName ?? email}`)).toBeVisible({
    timeout: 30_000,
  });
}

/** From the Keycloak setup email to a signed-in invitee, held on the acceptance page. */
async function completeAccountSetup(page, email) {
  const setup = await findMessageTo(email, { subjectMatch: /choose your nkwapa password/i });
  const link = (setup.Text || '').match(
    /https?:\/\/[^\s"<]*\/realms\/nkwapa\/login-actions\/action-token[^\s"<]+/,
  )?.[0];
  expect(link, 'the setup email must carry an action token link').toBeTruthy();

  await page.goto(link);
  await page
    .getByRole('link', { name: /continue/i })
    .first()
    .click();
  await page.fill('#password-new', PASSWORD);
  await page.fill('#password-confirm', PASSWORD);
  await page.click('input[type="submit"], button[type="submit"]');
  await expect(page.getByText(/your account is ready/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: /continue to nkwapa/i }).click();

  await page.waitForURL(/realms\/nkwapa/, { timeout: 60_000 });
  await page.fill('input[name="username"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('#kc-login, button[type="submit"], input[type="submit"]');

  await page.waitForURL(/\/accept-invite/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /join your clinic team/i })).toBeVisible({
    timeout: 60_000,
  });
}

async function acceptVolunteerSeat(page) {
  await page
    .getByRole('button', { name: new RegExp(`accept volunteer at ${clinicName}`, 'i') })
    .click();
}

/** The name the header's user menu shows for the signed-in person. */
async function expectMenuName(page, displayName) {
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByRole('menu').getByText(displayName, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
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
  await completeAccountSetup(inviteePage, INVITE_EMAIL);
  await expect(inviteePage.getByText(/password saved/i)).toBeVisible();

  // Nothing is granted by arriving. Anywhere else sends them straight back here.
  await inviteePage.goto('/patients');
  await inviteePage.waitForURL(/\/accept-invite/, { timeout: 30_000 });
});

test('accepting grants the role in that one clinic, and nowhere else', async () => {
  await acceptVolunteerSeat(inviteePage);
  // Invited without a name, so the name step comes before the workspace (#225).
  await inviteePage.waitForURL(/\/account\/name/, { timeout: 60_000 });

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
  expect(whoami.onboarding).toEqual({ state: 'NAME_REQUIRED' });
  expect(whoami.profile).toMatchObject({ needsName: true, firstName: null, lastName: null });
  expect(whoami.pendingStaffInvites).toEqual([]);
});

test('the name step holds them until they save, then lets them in', async () => {
  await expect(inviteePage.getByRole('heading', { name: 'Your name' })).toBeVisible();
  // Blocking, but never a trap.
  await expect(inviteePage.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await inviteePage.goto('/patients');
  await inviteePage.waitForURL(/\/account\/name/, { timeout: 30_000 });

  // A name that repeats nothing but digits is refused in place, input kept.
  await fillStaffName(inviteePage, { firstName: 'Ama', lastName: '1234' });
  await inviteePage.getByRole('button', { name: 'Save and continue' }).click();
  await expect(inviteePage.getByText(/last name can only use letters/i)).toBeVisible();
  await expect(inviteePage.getByLabel('First name')).toHaveValue('Ama');

  await fillStaffName(inviteePage, { firstName: 'Ama', middleInitial: 'k.', lastName: 'Mensah' });
  await expect(inviteePage.getByText('Ama K. Mensah')).toBeVisible();
  await inviteePage.getByRole('button', { name: 'Save and continue' }).click();
  await expect(inviteePage.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 });
  // Back to where they were headed when the step stopped them.
  await inviteePage.waitForURL(/\/patients/, { timeout: 60_000 });
  // A brand-new account meets the welcome tour on its first workspace page.
  await skipWelcomeTour(inviteePage);
  await expectMenuName(inviteePage, 'Ama K. Mensah');
});

test('the profile menu edits the name, and the header follows without signing in again', async () => {
  await inviteePage.getByRole('button', { name: 'User menu' }).click();
  await inviteePage.getByRole('menuitem', { name: 'Your name' }).click();
  await inviteePage.waitForURL(/\/account\/name/, { timeout: 30_000 });
  await expect(inviteePage.getByLabel('Last name')).toHaveValue('Mensah');

  await fillStaffName(inviteePage, {
    firstName: 'Ama',
    middleInitial: 'B',
    lastName: 'Mensah-Owusu',
  });
  await inviteePage.getByRole('button', { name: 'Save name' }).click();
  await expect(inviteePage.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 });
  await inviteePage.waitForURL(/\/patients/, { timeout: 30_000 });
  await expectMenuName(inviteePage, 'Ama B. Mensah-Owusu');
});

test('an invitation that carries a name goes straight in', async ({ page, browser }) => {
  await openInvitations(page);
  await sendInvitation(page, NAMED_EMAIL, {
    firstName: 'Kofi',
    middleInitial: 'A',
    lastName: 'Boateng',
    displayName: 'Kofi A. Boateng',
  });

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const named = await context.newPage();
  try {
    await completeAccountSetup(named, NAMED_EMAIL);
    await acceptVolunteerSeat(named);
    await named.waitForURL(/\/dashboard/, { timeout: 60_000 });
    await skipWelcomeTour(named);
    await expectMenuName(named, 'Kofi A. Boateng');
  } finally {
    await context.close();
  }
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
