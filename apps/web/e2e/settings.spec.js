const { test, expect } = require('@playwright/test');
const { ROLES, storageStateFor } = require('../playwright/roles');
const { skipWelcomeTour } = require('../playwright/welcome-tour');

/*
  Issue #206: every account has its own settings page, reached from the account menu, rendered in
  the account's own shell. Clinic-wide settings stay at /settings/clinic.
*/

async function openSettings(page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Your settings' })).toBeVisible({
    timeout: 30_000,
  });
  await skipWelcomeTour(page);
}

test.describe('staff settings', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('the account menu opens it', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    await skipWelcomeTour(page);
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Your settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Your settings' })).toBeVisible();
  });

  test('the theme choice applies at once and survives a reload', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('radio', { name: 'Dark' }).check({ force: true });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('radio', { name: 'Light' }).check({ force: true });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('shows install, device storage and account sections', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole('heading', { name: 'Install the app' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This device' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manage notifications' })).toHaveAttribute(
      'href',
      '/account#notifications',
    );
    await expect(page.getByRole('link', { name: 'Manage profile' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  });

  // Keycloak's own setup page, opened from Nkwapa and back again, with PKCE enforced.
  test('starts authenticator app setup and returns when cancelled', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole('heading', { name: 'Sign-in security' })).toBeVisible();
    await page.getByRole('button', { name: 'Set up authenticator app' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/settings'), { timeout: 30_000 });
    // Keycloak asks for the password again when the sign-in is older than its limit.
    if (await page.locator('#password').isVisible()) {
      await page.locator('#password').fill(ROLES.staff.password);
      await page.locator('#kc-login, button[type="submit"]').click();
    }
    await expect(page.locator('#totp')).toBeVisible({ timeout: 30_000 });
    await page.locator('[name="cancel-aia"]').click();
    await expect(page).toHaveURL(/\/settings/, { timeout: 30_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Setup was cancelled' })).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe('patient settings', () => {
  test.use({ storageState: storageStateFor('patient') });

  test('renders in the portal shell, without staff-only actions', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole('navigation', { name: 'Patient portal' })).toBeVisible();
    await expect(page.getByText(/not authorized|access denied/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Manage profile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign-in security' })).toHaveCount(0);
  });

  test('the profile shows access read-only, without staff-only name and phone', async ({
    page,
  }) => {
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 30_000 });
    await skipWelcomeTour(page);
    await expect(page.getByRole('navigation', { name: 'Patient portal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your access' })).toBeVisible();
    await expect(page.getByLabel('Last name')).toHaveCount(0);
    await expect(page.getByLabel('Phone number')).toHaveCount(0);
    // Patients can turn on notifications for appointment replies (#250).
    await expect(page.getByText(/when the clinic answers your appointment request/)).toBeVisible();
  });
});
