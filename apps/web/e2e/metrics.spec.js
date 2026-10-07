const { test, expect } = require('@playwright/test');

const { queueOfflineChange } = require('../playwright/outbox');
const { storageStateFor } = require('../playwright/roles');

/**
 * The metrics dashboard, and who may see it.
 *
 * Opening any workspace page syncs, and a sync push is a tracked event, so by the time this file
 * runs there is always something to count. Events are flushed every five seconds.
 */
test.describe('as staff', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('shows conversions, failures and per-workflow outcomes', async ({ page }) => {
    // The active clinic, as the app itself names it to the sync endpoint.
    const firstPull = page.waitForRequest((request) => request.url().includes('/sync/pull'));
    await page.goto('/dashboard');
    const clinicId = new URL((await firstPull).url()).searchParams.get('clinicId');
    expect(clinicId).toBeTruthy();
    await expect(page.locator('#main-content')).toBeVisible();

    await page
      .getByRole('link', { name: /Metrics/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/metrics$/);
    await expect(page.getByRole('heading', { name: 'Metrics', level: 1 })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Conversions' })).toBeVisible();
    for (const funnel of ['Appointment requests', 'Chart merges', 'Portal invitations']) {
      await expect(page.getByRole('heading', { name: funnel, exact: true })).toBeVisible();
    }
    for (const table of [
      'Appointments',
      'Patient identity',
      'Invitations',
      'Offline sync',
      'Security',
    ]) {
      await expect(page.getByRole('table', { name: table })).toBeVisible();
    }

    // Make a push happen: queue one change the server will refuse, then sync. That records a push,
    // a refused change and its reason, all of which the dashboard should count.
    await queueOfflineChange(page, {
      id: crypto.randomUUID(),
      clinicId,
      entityType: 'encounter',
      entityId: crypto.randomUUID(),
      operation: 'UPSERT',
      payloadJson: JSON.stringify({ clinicId: crypto.randomUUID() }),
      idempotencyKey: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    const pushed = page.waitForResponse((response) => response.url().includes('/sync/push'));
    await page.reload();
    await pushed;

    // Recorded events are written every five seconds, and the refusal and the push can land in
    // consecutive writes, so both are checked on each fresh load.
    const total = (label) => page.getByRole('row', { name: label }).getByRole('cell').first();
    await expect(async () => {
      await page.reload();
      await expect(total(/Offline changes refused/)).not.toHaveText('0', { timeout: 3_000 });
      await expect(total(/Sync pushes/)).not.toHaveText('0', { timeout: 3_000 });
    }).toPass({ timeout: 40_000 });

    await page.getByRole('button', { name: '7 days' }).click();
    await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('heading', { name: 'Conversions' })).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('as a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('is not offered metrics and cannot open them', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Metrics/ })).toHaveCount(0);

    await page.goto('/metrics');
    await expect(page.getByRole('heading', { name: 'Conversions' })).toHaveCount(0);
    await expect(page.getByText(/don.t have access to this page/i).first()).toBeVisible();
  });
});
