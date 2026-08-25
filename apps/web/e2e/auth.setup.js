const { test: setup, expect } = require('@playwright/test');
const { ROLES } = require('../playwright/roles');

async function authenticate(page, { username, password, storageState }) {
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
  // The main landmark rather than a named tile: the dashboard composes different sections per
  // role, and this setup runs for identities that see different ones.
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 60_000 });

  await page.context().storageState({ path: storageState });
}

// One sign-in per identity, each saved separately, so a spec picks the role it needs rather than
// arranging permissions inside the test.
for (const [role, credentials] of Object.entries(ROLES)) {
  setup(`authenticate deterministic ${role} user`, async ({ page }) => {
    await authenticate(page, credentials);
  });
}
