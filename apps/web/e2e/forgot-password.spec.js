const { test, expect } = require('@playwright/test');

test.use({ storageState: { cookies: [], origins: [] } });

const mailpitBaseUrl = process.env.MAILPIT_BASE_URL || 'http://localhost:8025';
const resetEmail = process.env.E2E_RESET_EMAIL || 'e2e.reset@nkwapa.local';

async function mailpitFetch(path, options) {
  const response = await fetch(`${mailpitBaseUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`Mailpit request failed (${response.status} ${response.statusText})`);
  }
  return response;
}

async function clearMailpitInbox() {
  await mailpitFetch('/api/v1/messages', { method: 'DELETE' });
}

async function findResetMessage() {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const response = await mailpitFetch('/api/v1/messages');
    const payload = await response.json();
    const messages = payload.messages || [];
    const message = messages.find((candidate) =>
      candidate.To?.some(
        (recipient) =>
          typeof recipient.Address === 'string' &&
          recipient.Address.toLowerCase() === resetEmail.toLowerCase(),
      ),
    );

    if (message) {
      const detailResponse = await mailpitFetch(`/api/v1/message/${message.ID}`);
      return detailResponse.json();
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for reset email to ${resetEmail}`);
}

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

  const message = await findResetMessage();
  const messageText = `${message.Subject || ''}\n${message.Text || ''}\n${message.HTML || ''}`;

  expect(messageText).toMatch(/reset|password|credential/i);
  expect(messageText).toContain('/realms/nkwapa/login-actions/reset-credentials');
  expect(messageText).toContain('key=');
});
