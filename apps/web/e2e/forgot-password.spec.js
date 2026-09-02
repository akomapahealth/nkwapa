const { test, expect } = require('@playwright/test');

test.use({ storageState: { cookies: [], origins: [] } });

const { clearMailpitInbox, findMessageTo, messageContent } = require('../playwright/mailpit');

const resetEmail = process.env.E2E_RESET_EMAIL || 'e2e.reset@nkwapa.local';

test('forgot password sends a Keycloak reset email to Mailpit', async ({ page }) => {
  await clearMailpitInbox();

  await page.goto('/login?next=%2Fdashboard');
  await page
    .getByRole('button', { name: /continue to secure sign in|try secure sign in again/i })
    .click();
  await page.waitForURL(/realms\/nkwapa/, { timeout: 20_000 });

  await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
  await page.getByRole('link', { name: /forgot password/i }).click();

  await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible();
  await page.locator('input[name="username"]').fill(resetEmail);
  await page.locator('#kc-reset-password-form input[type="submit"], button[type="submit"]').click();

  const message = await findMessageTo(resetEmail);
  const messageText = messageContent(message);

  expect(messageText).toMatch(/reset|password|credential/i);
  expect(messageText).toContain('/realms/nkwapa/login-actions/action-token');
  expect(messageText).toContain('client_id=nkwapa-web');
  expect(messageText).toContain('key=');
});
