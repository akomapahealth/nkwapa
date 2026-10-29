const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
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
    await expect(page.getByRole('link', { name: 'Change your name' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  });
});

test.describe('patient settings', () => {
  test.use({ storageState: storageStateFor('patient') });

  test('renders in the portal shell, without staff-only actions', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole('navigation', { name: 'Patient portal' })).toBeVisible();
    await expect(page.getByText(/not authorized|access denied/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Change your name' })).toHaveCount(0);
  });
});
