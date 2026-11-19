const { test, expect } = require('@playwright/test');

const { apiRequestAs } = require('../playwright/api-client');
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

    await page.getByRole('button', { name: '7 days', exact: true }).click();
    await expect(page.getByRole('button', { name: '7 days', exact: true })).toHaveAttribute(
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

test.describe('follow-up indicators (#339)', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('shows each figure with its denominator, its definition and a CSV', async ({ page }) => {
    await page.goto('/metrics');
    const section = page.getByRole('region', { name: 'Hypertension control' });
    await expect(page.getByRole('heading', { name: 'Follow-up', level: 2 })).toBeVisible();
    await expect(section).toBeVisible();

    // Every share names what it is out of.
    const controlled = section.getByText('Controlled', { exact: true }).locator('..').locator('..');
    await expect(controlled).toContainText(/\(\d+ of \d+\)/);

    // The HEARTS360 definition, word for word, one press away.
    await section
      .getByRole('button', { name: /^Show help: BP below target at the patient's most recent/ })
      .click();
    await expect(page.getByRole('tooltip')).toContainText(
      "BP below target at the patient's most recent reading, taken within the past 3 months",
    );
    await page.keyboard.press('Escape');

    await expect(page.getByRole('table', { name: 'Contacts this month' })).toBeVisible();
    for (const row of ['Due', 'Completed', 'Missed', 'Attempts']) {
      await expect(
        page
          .getByRole('table', { name: 'Contacts this month' })
          .getByRole('row', { name: new RegExp(`^${row}`) }),
      ).toBeVisible();
    }

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/^follow-up-\d{4}-\d{2}\.csv$/);

    // Another month reloads the figures.
    await page.getByRole('combobox', { name: 'Month' }).click();
    await page.getByRole('option').nth(1).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByText(/^At the end of /)).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('opens the patients behind a tier from the table view, each linking to their chart', async ({
    page,
  }) => {
    await page.goto('/metrics');
    const tiers = page.locator('[data-chart-frame]').filter({
      has: page.getByRole('heading', { name: 'Patients by tier' }),
    });
    await tiers.getByRole('button', { name: 'Show table' }).click();
    // Only tiers with patients are offered; the seed may have none in a fresh database.
    const openers = tiers.getByRole('button', { name: /^Show the \d+ patients in the/ });
    test.skip((await openers.count()) === 0, 'No tiered patients in this database');

    await openers.first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: / tier$/ })).toBeVisible();
    const first = sheet.getByRole('link').first();
    await expect(first).toHaveAttribute('href', /^\/clinics\/[0-9a-f-]+\/patients\/[0-9a-f-]+$/);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('shows the organization the same figures in its own tab', async ({ page }) => {
    await page.goto('/reports/organization');
    await page.getByRole('tab', { name: 'Follow-up' }).click({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Hypertension control' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
  });

  test('keeps the figures from roles without metrics', async () => {
    const whoami = (await apiRequestAs('staff', 'get', '/auth/whoami')).json();
    const clinicId = whoami.activeClinicId;
    const response = await apiRequestAs(
      'volunteer',
      'get',
      `/clinics/${clinicId}/follow-up-metrics`,
      {
        clinicId,
      },
    );
    expect(response.status()).toBe(403);
    // Nor the organization's, which is for system admins only.
    const clinics = (await apiRequestAs('staff', 'get', '/admin/clinics')).json();
    const organizationId = clinics.find((clinic) => clinic.id === clinicId).organizationId;
    const organization = await apiRequestAs(
      'director',
      'get',
      `/organizations/${organizationId}/follow-up-metrics`,
    );
    expect(organization.status()).toBe(403);
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
