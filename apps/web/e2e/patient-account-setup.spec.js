const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const {
  clearMailpitInbox,
  findMessageTo,
  mailpitFetch,
  messageContent,
} = require('../playwright/mailpit');

test.use({ storageState: storageStateFor('staff') });

/**
 * The cold-from-email journey: invitation to signed-in portal, with nobody touching Keycloak.
 *
 * This is the whole of issue #115 as a single walk. A patient who has never had an account
 * receives an invitation, sets a password from the link Keycloak emails, signs in with it, and
 * claims their record.
 *
 * Serial, with one browser context per role held across the tests, because the journey is a
 * sequence and each step only makes sense after the one before it. The steps are separate
 * tests rather than one long one so a failure names the stage that broke.
 *
 * Acts on the seeded "E2E Signup" chart, which exists for this file alone and is seeded with
 * no invitation, because the invitation is what this test creates. The other portal charts
 * are relied on by notifications-email.spec.js and portal-invite-lifecycle.spec.js; the
 * suites share one database, so each owns its own chart.
 */
test.describe.configure({ mode: 'serial' });

// The DOB seeded for this chart. Changing it in seed.ts breaks this file and nothing else.
const SIGNUP_DOB = '1981-06-24';
const PASSWORD = 'NkwapaSignup!2026';

// Unique per run, so the identity is genuinely new every time. A fixed address would already
// hold a password on the second run and the journey being tested would never happen.
const INVITE_EMAIL = `e2e.signup.${Date.now()}@nkwapa.local`;

let patientContext;
let patientPage;
let patientCode;

test.beforeAll(async ({ browser }) => {
  await clearMailpitInbox(INVITE_EMAIL);
  /*
    Explicitly empty, not merely omitted.

    This file signs in as staff, and a context created without saying otherwise carries that
    session to Keycloak -- which then refuses the action link with "You are already
    authenticated as a different user". The patient in this journey has never signed in
    anywhere, and the context has to be built to match.
  */
  patientContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  patientPage = await patientContext.newPage();
});

test.afterAll(async () => {
  await patientContext?.close();
  await clearMailpitInbox(INVITE_EMAIL);
});

async function openSignupChart(page) {
  await page.goto('/patients');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder(/search by name, patient code/i).fill('Signup');
  // Matched by name, not position: the search is debounced, so the first row can still be
  // the unfiltered one when the fill resolves.
  const row = page.getByRole('row', { name: /Signup/i });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('link', { name: /view/i }).click();

  await expect(page.getByRole('heading', { name: /E2E Signup/i })).toBeVisible({ timeout: 30_000 });
}

test('staff invite a patient who has no account, and an account is created', async ({ page }) => {
  await openSignupChart(page);

  patientCode = (
    await page
      .getByText(/NKP-\d{4}-\d{6}/)
      .first()
      .textContent()
  )?.match(/NKP-\d{4}-\d{6}/)?.[0];
  expect(patientCode).toMatch(/^NKP-\d{4}-\d{6}$/);

  await page
    .getByRole('button', { name: /portal invite|replace invitation/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email', { exact: true }).fill(INVITE_EMAIL);
  await dialog.getByRole('button', { name: /create invite|replace invitation/i }).click();

  await expect(page.getByText('Invitation waiting')).toBeVisible({ timeout: 30_000 });

  /*
    The fact the chart could not report before. Delivery and identity fail independently, so
    "the email went out" was never an answer to "can this patient sign in?".
  */
  await expect(page.getByText('Account created')).toBeVisible({ timeout: 30_000 });
});

test('both emails arrive, and each one names the other', async () => {
  const invite = await findMessageTo(INVITE_EMAIL, { subjectMatch: /patient account/i });
  const inviteBody = messageContent(invite);

  // The claim step asks for this, and the email is where most patients will read it.
  expect(inviteBody).toContain(patientCode);
  // The sentence at the centre of the bug: registration is disabled, so this was never true.
  expect(inviteBody).not.toMatch(/create an account/i);
  expect(inviteBody).toContain('Choose your Nkwapa password');

  const setup = await findMessageTo(INVITE_EMAIL, { subjectMatch: /choose your nkwapa password/i });
  const setupBody = messageContent(setup);

  // Possession of the inbox is what authorises the flow. The link carries the action token.
  expect(setupBody).toContain('/realms/nkwapa/login-actions/action-token');
  expect(setupBody).toContain('key=');

  /*
    The pairing is one-directional on purpose, and the direction matters.

    The invitation names this message by subject, because the message carrying the clinic and
    the patient code is the one with standing to vouch for a bare link. This message cannot
    return the favour unconditionally: every Keycloak required-actions email renders from the
    same template, including the one an administrator sends when resetting a doctor's
    password, and that reader has no invitation to be pointed at.
  */
  expect(setupBody).toContain('If you were invited to the patient portal');
  expect(setupBody).not.toMatch(/health record online/i);
});

test('the patient sets a password and reaches the claim form', async () => {
  const setup = await findMessageTo(INVITE_EMAIL, { subjectMatch: /choose your nkwapa password/i });
  const link = (setup.Text || '').match(
    /https?:\/\/[^\s"<]*\/realms\/nkwapa\/login-actions\/action-token[^\s"<]+/,
  )?.[0];
  expect(link, 'the account setup email must carry an action token link').toBeTruthy();

  await patientPage.goto(link);

  // Keycloak confirms the actions before running them. In its own words these were
  // "Update Password" and "Verify Email"; the theme says what they mean to a patient.
  await expect(patientPage.getByText(/choose a password/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(patientPage.getByText(/confirm your email address/i).first()).toBeVisible();
  await patientPage
    .getByRole('link', { name: /continue/i })
    .first()
    .click();

  await patientPage.fill('#password-new', PASSWORD);
  await patientPage.fill('#password-confirm', PASSWORD);
  await patientPage.click('input[type="submit"], button[type="submit"]');

  // The defect this guards: info.ftl printed the message key, so this screen used to read
  // "accountUpdatedTitle" to the patient.
  await expect(patientPage.getByText(/your account is ready/i)).toBeVisible({ timeout: 30_000 });
  await expect(patientPage.getByText('accountUpdatedTitle')).toHaveCount(0);

  await patientPage.getByRole('link', { name: /continue to nkwapa/i }).click();

  /*
    Completing an admin-issued action token does not open a Keycloak session, so the patient
    signs in once with the password they have just chosen. The continue marker is what makes
    that a single step: without it the app stops on its own sign-in page first, and a patient
    arriving cold from an email has no reason to believe pressing a button there is safe.
  */
  await patientPage.waitForURL(/realms\/nkwapa/, { timeout: 60_000 });
  await patientPage.fill('input[name="username"]', INVITE_EMAIL);
  await patientPage.fill('input[name="password"]', PASSWORD);
  await patientPage.click('#kc-login, button[type="submit"], input[type="submit"]');

  await patientPage.waitForURL(/\/claim-record/, { timeout: 60_000 });
  await expect(
    patientPage.getByRole('heading', { name: /claim your existing patient record/i }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(patientPage.getByText(/password saved/i)).toBeVisible({ timeout: 30_000 });
});

test('resending does not create a second account or reset the chosen password', async ({
  page,
}) => {
  await openSignupChart(page);
  await page.getByRole('button', { name: /resend invite email/i }).click();

  // Keycloak's own state is what decides this, so the chart can say it plainly.
  await expect(page.getByText(/patient already has an account/i)).toBeVisible({ timeout: 30_000 });

  /*
    And nothing new was sent. A second password email would mean a second UPDATE_PASSWORD
    action, which is exactly how a resend would take away the password the patient chose.
  */
  const search = await mailpitFetch(
    `/api/v1/search?query=${encodeURIComponent(`to:${INVITE_EMAIL} subject:"Choose your Nkwapa password"`)}`,
  );
  const { messages } = await search.json();
  expect(messages).toHaveLength(1);
});

test('the patient claims their record and the portal opens', async () => {
  await patientPage.goto('/claim-record');
  await expect(
    patientPage.getByRole('heading', { name: /claim your existing patient record/i }),
  ).toBeVisible({ timeout: 60_000 });

  await patientPage.getByRole('textbox', { name: 'Patient code', exact: true }).fill(patientCode);
  await patientPage.getByLabel('Date of birth').fill(SIGNUP_DOB);
  await patientPage.getByRole('button', { name: /claim patient record/i }).click();

  await patientPage.waitForURL(/\/portal/, { timeout: 60_000 });
  await expect(
    patientPage.getByRole('heading', { name: /your care snapshot/i }).first(),
  ).toBeVisible({
    timeout: 60_000,
  });
});
