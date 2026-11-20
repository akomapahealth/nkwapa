const { test, expect } = require('@playwright/test');

test.use({ storageState: { cookies: [], origins: [] } });

const { clearMailpitInbox, findMessageTo, messageContent } = require('../playwright/mailpit');

const resetEmail = process.env.E2E_RESET_EMAIL || 'e2e.reset@nkwapa.local';

test('forgot password sends a Keycloak reset email to Mailpit', async ({ page }) => {
  // Scoped to this suite's own address: the inbox is shared with the other mail spec.
  await clearMailpitInbox(resetEmail);

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

test('a broken link offers a reset that stays on Nkwapa and lands back in it', async ({ page }) => {
  // With no client in context Keycloak built this link for its "account" client, which failed
  // behind the proxy with "Invalid parameter: redirect_uri".
  await clearMailpitInbox(resetEmail);
  const keycloak = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080';
  await page.goto(`${keycloak}/realms/nkwapa/login-actions/action-token?key=e2e-not-a-token`);
  await expect(page.getByRole('link', { name: /back to sign in/i })).toHaveAttribute(
    'href',
    /\/login$/,
  );
  const reset = page.getByRole('link', { name: 'Email me a new password link' });
  await expect(reset).toHaveAttribute('href', /client_id=nkwapa-web/);
  await reset.click();

  await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible();
  await page.locator('#kc-reset-password-form input[type="submit"], button[type="submit"]').click();
  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await page.locator('input[name="username"]').fill(resetEmail);
  await page.locator('#kc-reset-password-form input[type="submit"], button[type="submit"]').click();
  await expect(page.getByText(/a link to choose a new password is on its way/i)).toBeVisible();

  const messageText = messageContent(await findMessageTo(resetEmail));
  expect(messageText).toContain('client_id=nkwapa-web');
  expect(messageText).not.toContain('client_id=account');
});
