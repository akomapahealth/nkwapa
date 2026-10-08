const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');

/**
 * Organization cohort analytics (#25): a system admin narrows the organization by date, clinic,
 * zone, workflow and status, and drills into a clinic; nobody else can read it.
 */
async function staffOrganizationId(role = 'staff') {
  const whoami = (await apiRequestAs(role, 'get', '/auth/whoami')).json();
  const clinics = (await apiRequestAs('staff', 'get', '/admin/clinics')).json();
  return clinics.find((clinic) => clinic.id === whoami.activeClinicId).organizationId;
}

async function openAnalyticsTab(page) {
  await page.goto('/reports/organization');
  await page.getByRole('tab', { name: 'Cohort analytics' }).click({ timeout: 30_000 });
}

test.describe('as a system admin', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('shows the cohort totals and a row per clinic', async ({ page }) => {
    await openAnalyticsTab(page);
    /*
      By role, not by text: "Encounter status" is both this filter's label and, once the cohort
      has loaded, the title of a chart. A text match passed only while the data was still in
      flight, and failed strict mode the moment the chart rendered first.
    */
    await expect(page.getByRole('combobox', { name: 'Encounter status' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('grid').getByText('Nkwapa Clinic - Demo')).toBeVisible();
  });

  test('the analytics agree with themselves: clinic rows add up to the totals', async () => {
    const organizationId = await staffOrganizationId();
    const res = await apiRequestAs('staff', 'get', `/organizations/${organizationId}/analytics`);
    expect(res.status()).toBe(200);
    const data = res.json();

    const sum = (pick) => data.clinics.reduce((total, row) => total + pick(row), 0);
    expect(sum((row) => row.encounters)).toBe(data.totals.encounters);
    expect(sum((row) => row.appointments)).toBe(data.totals.appointments);
    // Distinct patients cannot exceed the per-clinic sum; a shared patient makes it smaller.
    expect(data.totals.patients).toBeLessThanOrEqual(sum((row) => row.patients));
    expect(data.encounterTrend.reduce((total, day) => total + day.count, 0)).toBe(
      data.totals.encounters,
    );
  });

  test('narrowing to one clinic returns only that clinic', async () => {
    const organizationId = await staffOrganizationId();
    const all = (
      await apiRequestAs('staff', 'get', `/organizations/${organizationId}/analytics`)
    ).json();
    const clinicId = all.clinics[0].clinicId;
    const one = (
      await apiRequestAs(
        'staff',
        'get',
        `/organizations/${organizationId}/analytics?clinicId=${clinicId}`,
      )
    ).json();
    expect(one.clinics.map((row) => row.clinicId)).toEqual([clinicId]);
    expect(one.totals.encounters).toBe(all.clinics[0].encounters);
  });

  test('a cohort with nothing in it says so, and offers a way back', async ({ page }) => {
    await openAnalyticsTab(page);
    await page.getByLabel('From', { exact: true }).fill('2000-01-01');
    await page.getByLabel('To', { exact: true }).fill('2000-01-02');
    await expect(page.getByText('Nothing matches this cohort')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Reset filters' }).last().click();
    /*
      By role, not by text: "Encounter status" is both this filter's label and, once the cohort
      has loaded, the title of a chart. A text match passed only while the data was still in
      flight, and failed strict mode the moment the chart rendered first.
    */
    await expect(page.getByRole('combobox', { name: 'Encounter status' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('a backwards date range is caught before it is sent', async ({ page }) => {
    await openAnalyticsTab(page);
    await page.getByLabel('From', { exact: true }).fill('2026-09-10');
    await page.getByLabel('To', { exact: true }).fill('2026-09-01');
    await expect(page.getByRole('alert').filter({ hasText: 'after the end date' })).toBeVisible();
  });

  test('opening a clinic lands on that clinic’s dashboard', async ({ page }) => {
    await openAnalyticsTab(page);
    await page
      .getByRole('button', { name: 'Open the Nkwapa Clinic - Demo dashboard' })
      .click({ timeout: 30_000 });
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText('Nkwapa Clinic - Demo').first()).toBeVisible();
  });
});

test.describe('as anyone else', () => {
  test('is refused by the API', async () => {
    const organizationId = await staffOrganizationId('doctor');
    for (const role of ['doctor', 'volunteer']) {
      const res = await apiRequestAs(role, 'get', `/organizations/${organizationId}/analytics`);
      expect(res.status()).toBe(403);
    }
  });
});
