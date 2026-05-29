const path = require('path');
const { test: setup, expect } = require('@playwright/test');

const authFile = path.join(__dirname, '..', 'playwright', '.auth', 'staff.json');

setup('authenticate deterministic staff user', async ({ page }) => {
  const username = process.env.E2E_STAFF_USERNAME || 'e2e.staff';
  const password = process.env.E2E_STAFF_PASSWORD || 'NkwapaE2E!23';

  await page.goto('/login?next=%2Fdashboard');
  await expect(
    page.getByRole('button', { name: /continue to secure sign in|try secure sign in again/i }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: /continue to secure sign in|try secure sign in again/i })
    .click();
  await page.waitForURL(/realms\/nkwapa/, { timeout: 20_000 });

  const usernameField = page.locator('input[name="username"]');
  const backToSignIn = page.getByRole('link', { name: /back to sign in/i });
  if (!(await usernameField.isVisible({ timeout: 5_000 }).catch(() => false))) {
    if (await backToSignIn.isVisible().catch(() => false)) {
      await backToSignIn.click();
    }
  }

  await expect(usernameField).toBeVisible({ timeout: 20_000 });
  await usernameField.fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('#kc-login, button[type="submit"]').click();

  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await expect(page.getByText('Today at a glance')).toBeVisible({ timeout: 60_000 });

  await page.context().storageState({ path: authFile });
});
