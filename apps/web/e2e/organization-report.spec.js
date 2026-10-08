const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');

/**
 * The organization report (#13): a system admin sees every clinic at once and can open any one
 * clinic's dashboard from its row; nobody else can read it, through the page or the API.
 */
test.describe('as a system admin', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('shows the organization totals and a row per clinic', async ({ page }) => {
    await page.goto('/reports/organization');
    await expect(page.getByRole('heading', { name: 'Organization report' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Encounters per day')).toBeVisible({ timeout: 30_000 });

    const grid = page.getByRole('grid');
    await expect(grid.getByText('Nkwapa Clinic - Demo')).toBeVisible();
    // The page says what a rate rests on, not only the percentage.
    await expect(page.getByText(/Blood pressure screened/)).toBeVisible();
  });

  test('the report agrees with itself: clinic rows add up to the totals', async () => {
    const whoami = (await apiRequestAs('staff', 'get', '/auth/whoami')).json();
    const clinicId = whoami.activeClinicId;
    const clinics = (await apiRequestAs('staff', 'get', '/admin/clinics')).json();
    const organizationId = clinics.find((clinic) => clinic.id === clinicId).organizationId;

    const res = await apiRequestAs('staff', 'get', `/organizations/${organizationId}/report`);
    expect(res.status()).toBe(200);
    const report = res.json();

    const sum = (field) => report.clinics.reduce((total, row) => total + row[field], 0);
    expect(sum('patients')).toBe(report.totals.patients);
    expect(sum('encounters')).toBe(report.totals.encounters);
    expect(sum('openDrafts')).toBe(report.totals.openDrafts);
    expect(report.encounterTrend.reduce((total, day) => total + day.count, 0)).toBe(
      report.totals.encounters,
    );
  });

  test('opening a clinic lands on that clinic’s dashboard', async ({ page }) => {
    await page.goto('/reports/organization');
    await page
      .getByRole('button', { name: 'Open the Nkwapa Clinic - Demo dashboard' })
      .click({ timeout: 30_000 });
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText('Nkwapa Clinic - Demo').first()).toBeVisible();
  });
});

test.describe('as anyone else', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('is refused the page and the API', async ({ page }) => {
    await page.goto('/reports/organization');
    await expect(page.getByRole('heading', { name: 'Organization report' })).toHaveCount(0, {
      timeout: 15_000,
    });

    const whoami = (await apiRequestAs('doctor', 'get', '/auth/whoami')).json();
    const clinicId = whoami.activeClinicId;
    const staffClinics = (await apiRequestAs('staff', 'get', '/admin/clinics')).json();
    const organizationId = staffClinics.find((clinic) => clinic.id === clinicId).organizationId;

    for (const role of ['doctor', 'volunteer']) {
      const res = await apiRequestAs(role, 'get', `/organizations/${organizationId}/report`);
      expect(res.status()).toBe(403);
    }
  });
});
