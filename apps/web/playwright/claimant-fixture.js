const { randomUUID } = require('crypto');
const { expect } = require('@playwright/test');
const { storageStateFor } = require('./roles');
const { findMessageTo } = require('./mailpit');

/** A real invitation and account owned by this run. Never unlink or reseed a claimed chart. */
async function createClaimantStorageState(browser) {
  const suffix = randomUUID();
  const email = `e2e.claim.${suffix}@nkwapa.local`;
  const password = `E2e!${randomUUID()}`;
  const staff = await browser.newContext({ storageState: storageStateFor('staff') });
  const patient = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await staff.newPage();
    await page.goto('/patients/new');
    await page.getByLabel('First name', { exact: true }).fill('E2E');
    await page.getByLabel('Last name', { exact: true }).fill(`Claimable ${suffix}`);
    await page.getByLabel('Date of birth').fill('1993-08-19');
    await page.getByLabel('National ID', { exact: true }).fill(`E2E-CLAIM-${suffix}`);
    await page.getByRole('button', { name: 'Create patient' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 30_000 });
    await page
      .getByRole('button', { name: /portal invite|replace invitation/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email', { exact: true }).fill(email);
    await dialog.getByRole('button', { name: /create invite|replace invitation/i }).click();
    await expect(page.getByText('Account created', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const setup = await findMessageTo(email, { subjectMatch: /choose your nkwapa password/i });
    const link = (setup.Text || '').match(
      /https?:\/\/[^\s"<]*\/realms\/nkwapa\/login-actions\/action-token[^\s"<]+/,
    )?.[0];
    expect(link, 'the fresh claimant must receive a real Keycloak account-setup link').toBeTruthy();
    const claim = await patient.newPage();
    await claim.goto(link);
    await expect(claim.getByText(/choose a password/i).first()).toBeVisible({ timeout: 30_000 });
    await claim
      .getByRole('link', { name: /continue/i })
      .first()
      .click();
    await claim.fill('#password-new', password);
    await claim.fill('#password-confirm', password);
    await claim.click('input[type="submit"], button[type="submit"]');
    await expect(claim.getByText(/your account is ready/i)).toBeVisible({ timeout: 30_000 });
    await claim.getByRole('link', { name: /continue to nkwapa/i }).click();
    await claim.waitForURL(/realms\/nkwapa/, { timeout: 60_000 });
    await claim.fill('input[name="username"]', email);
    await claim.fill('input[name="password"]', password);
    await claim.click('#kc-login, button[type="submit"], input[type="submit"]');
    await claim.waitForURL(/\/claim-record/, { timeout: 60_000 });
    await expect(
      claim.getByRole('heading', { name: /claim your existing patient record/i }),
    ).toBeVisible({ timeout: 30_000 });
    return await patient.storageState();
  } finally {
    await staff.close();
    await patient.close();
  }
}
module.exports = { createClaimantStorageState };
