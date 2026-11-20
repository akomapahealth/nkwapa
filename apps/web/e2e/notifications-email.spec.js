const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const {
  clearMailpitInbox,
  countMessagesTo,
  findMessageTo,
  messageContent,
} = require('../playwright/mailpit');

test.use({ storageState: storageStateFor('staff') });

const inviteEmail = process.env.SEED_E2E_CLAIM_EMAIL || 'e2e.claim@nkwapa.local';

/**
 * A resent portal invite now arrives as one email (#383): Keycloak's account-setup message,
 * carrying the clinic and patient code our own email used to. The API records that send in the
 * delivery ledger, so the page still lists it. Our own SMTP path is covered by
 * volunteer-roster.spec.js, whose rota emails still go through it.
 */
test.describe('portal invite email', () => {
  test('a resend arrives as one email with the patient code', async ({ page }) => {
    // Scoped to this suite's own address: the inbox is shared with the other mail specs.
    await clearMailpitInbox(inviteEmail);

    await page.goto('/patients');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });

    // The seeded chart that carries a pending, unclaimed invite.
    await page.getByLabel('Name, patient code, phone or ID last 4').fill('Unclaimed');
    // Matched by name rather than position: results are debounced, so the first row can
    // still be the unfiltered one at the moment the fill resolves.
    const row = page.getByRole('row', { name: /Unclaimed/i });
    await expect(row).toBeVisible({ timeout: 30_000 });
    // The row carries an explicit View action; the row itself is not a navigation target.
    await row.getByRole('link', { name: /view/i }).click();

    await expect(page.getByRole('heading', { name: /E2E Unclaimed/i })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByRole('button', { name: /resend invite email/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: /resend invite email/i }).click();

    const message = await findMessageTo(inviteEmail, {
      subjectMatch: /set up your nkwapa account/i,
    });
    const content = messageContent(message);

    // The claim flow matches on email, patient code and date of birth, so the code has
    // to be in the message or the invitation cannot be acted on.
    expect(content).toMatch(/NKP-\d{4}-\d{6}/);
    expect(content).toMatch(/patient account/i);
    // Both parts are sent; an HTML-only message scores worse with spam filters and
    // renders as nothing in a text-only client.
    expect(message.Text || '').not.toHaveLength(0);
    expect(message.HTML || '').toContain('<');
    // The address is patient-supplied and unverified until the account is claimed.
    expect(content).not.toContain('Unclaimed');
    expect(await countMessagesTo(inviteEmail)).toBe(1);

    await expect(page.getByText('Invite email sent', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    // Keycloak sent it, but the delivery page still lists it beside every other email.
    await page.goto('/notifications/delivery');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/portal invite/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test('the notifications view is accessible and explains email availability', async ({ page }) => {
    await page.goto('/notifications/delivery');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });

    // The banner and the failure column are new content in the accessibility tree.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('the failed figure applies the existing message status filter', async ({ page }) => {
    await page.goto('/notifications/delivery');
    const failed = page.getByRole('button', { name: 'Show failed messages', exact: true });
    await expect(failed).toHaveAccessibleDescription(/^\d+$/);
    await failed.click();
    await expect(
      page.getByRole('button', { name: 'Remove Status filter', exact: true }),
    ).toContainText('Failed');
  });

  test('the old reminders path still lands somewhere useful', async ({ page }) => {
    // The route was renamed; bookmarks and older documentation still point here.
    await page.goto('/reminders');
    await page.waitForURL(/\/notifications\/delivery$/, { timeout: 30_000 });
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
  });
});
