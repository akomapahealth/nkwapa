const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * Portal invite lifecycle from the chart.
 *
 * Acts on the seeded "E2E Lifecycle" chart rather than "E2E Unclaimed": Playwright runs
 * these files in series against one database, and notifications-email.spec.js needs that
 * other chart to keep a claimable invite for its Mailpit resend. This chart is seeded with
 * a cancelled and an expired invite and no live one, so the previous-invitations list is
 * deterministic and the mutations here are free to change what they like.
 */
async function createInvite(page, { email, validFor }) {
  await page
    .getByRole('button', { name: /portal invite|replace invitation/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.getByLabel('Valid for').click();
  await page.getByRole('option', { name: validFor }).click();
  await dialog.getByRole('button', { name: /create invite|replace invitation/i }).click();
  await expect(page.getByText('Invitation waiting')).toBeVisible({ timeout: 20_000 });
}

async function openLifecycleChart(page) {
  await page.goto('/patients');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder(/search by name, patient code/i).fill('Lifecycle');
  // Matched by name, not position: the search is debounced, so the first row can still be
  // the unfiltered one when the fill resolves.
  const row = page.getByRole('row', { name: /Lifecycle/i });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('link', { name: /view/i }).click();

  await expect(page.getByRole('heading', { name: /E2E Lifecycle/i })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('portal invite lifecycle', () => {
  test('staff can read the whole lifecycle and recover from a stale invite', async ({ page }) => {
    await openLifecycleChart(page);

    // The chart's only invites have lapsed or been cancelled, so it is not "invited": the
    // action offered has to be a new invitation, not a resend of a dead one.
    await expect(page.getByText('No portal access').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /resend invite email/i })).toHaveCount(0);

    // Settled invites were previously invisible on the chart, which left "nobody ever
    // invited them" and "someone cancelled it" looking identical.
    const previous = page.getByRole('button', { name: /previous invitations/i });
    await expect(previous).toBeVisible();
    await expect(previous).toHaveAttribute('aria-expanded', 'false');
    await previous.click();
    await expect(previous).toHaveAttribute('aria-expanded', 'true');

    // Scoped to the list, and counted rather than matched exactly once: the suite may have
    // run against this database before, so the number of settled invitations grows.
    const settled = page.locator('#portal-previous-invites').getByRole('listitem');
    await expect(settled.first()).toBeVisible();
    await expect(settled.filter({ hasText: 'Cancelled' }).first()).toBeVisible();
    await expect(settled.filter({ hasText: 'Expired' }).first()).toBeVisible();

    // Issue a replacement with an explicit lifetime.
    await createInvite(page, { email: 'e2e.lifecycle@nkwapa.local', validFor: '7 days' });

    await expect(page.getByText(/expires in 7 days/i)).toBeVisible();
    await expect(page.getByText('e2e.lifecycle@nkwapa.local').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /resend invite email/i })).toBeVisible();
  });

  test('cancelling asks first and moves the invitation into the record', async ({ page }) => {
    await openLifecycleChart(page);
    // Arranged here rather than inherited from the test above: these run in series against
    // one database, and a test that depends on its predecessor fails when run alone.
    await createInvite(page, { email: 'e2e.lifecycle@nkwapa.local', validFor: '14 days' });

    // Cancel used to fire on the first click. It is not recoverable: the patient has to be
    // sent a new invitation and told.
    await page
      .getByRole('button', { name: /cancel invitation/i })
      .first()
      .click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByText(/no longer be able to claim/i)).toBeVisible();

    // Backing out must leave the invitation alone.
    await confirm.getByRole('button', { name: /keep invitation/i }).click();
    await expect(page.getByText('Invitation waiting')).toBeVisible();

    await page
      .getByRole('button', { name: /cancel invitation/i })
      .first()
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /cancel invitation/i })
      .click();

    await expect(page.getByText('No portal access').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /previous invitations/i }).click();
    await expect(
      page
        .locator('#portal-previous-invites')
        .getByRole('listitem')
        .filter({ hasText: 'Cancelled' })
        .first(),
    ).toBeVisible();
  });

  test('the card is accessible and holds its layout at every supported width', async ({ page }) => {
    await openLifecycleChart(page);
    await page.getByRole('button', { name: /previous invitations/i }).click();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('#main-content')
      .analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { name: 'Portal account' })).toBeVisible();
      // The shell sets overflow-auto, so the document element cannot report the overflow.
      expect(
        await page.evaluate(() => {
          const main = document.querySelector('#main-content');
          return main ? main.scrollWidth > main.clientWidth + 1 : false;
        }),
      ).toBeFalsy();
    }
  });
});
