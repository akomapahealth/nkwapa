const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');

/*
  #33: staff workload at a clinic, for the people who already read its audit trail.

  The `staff` identity is a director here. Doctors and volunteers do not hold AUDIT.READ, so they
  are refused the same summary of it.
*/

async function clinicIdFor(role) {
  const whoami = await apiRequestAs(role, 'get', '/auth/whoami');
  return whoami.json().activeClinicId;
}

test.describe('as a director', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('lists staff by name and drills into one person’s days and records', async ({ page }) => {
    const clinicId = await clinicIdFor('staff');
    const today = new Date().toISOString().slice(0, 10);
    const overview = await apiRequestAs(
      'staff',
      'get',
      `/clinics/${clinicId}/staff-activity?from=${today}&to=${today}`,
      { clinicId },
    );
    expect(overview.ok(), overview.text()).toBeTruthy();
    const body = overview.json();
    const names = body.staff.map((row) => row.displayName);
    // Listed by name, never by volume.
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(JSON.stringify(body)).not.toMatch(/patientId|firstName|lastName|patientCode/);

    await page.goto('/staff-activity');
    await expect(page.getByRole('heading', { name: 'Staff activity' })).toBeVisible({
      timeout: 20_000,
    });
    const table = page.getByTestId('staff-activity-table');
    await expect(table).toBeVisible();
    await expect(table.getByText('Clinic total')).toBeVisible();

    // The suite's own sessions leave activity behind; drill into someone who has some.
    const active = body.staff.find((row) => row.total > 0);
    test.skip(!active, 'No staff activity recorded at this clinic yet');
    await table.getByRole('button', { name: active.displayName, exact: true }).click();
    await expect(page.getByRole('button', { name: 'All staff' })).toBeVisible();
    await expect(page.getByTestId('activity-days')).toBeVisible();
    await expect(page.getByTestId('activity-records')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('refuses a range it will not compute', async () => {
    const clinicId = await clinicIdFor('staff');
    const res = await apiRequestAs(
      'staff',
      'get',
      `/clinics/${clinicId}/staff-activity?from=2026-10-08&to=2026-01-01`,
      { clinicId },
    );
    expect(res.status()).toBe(400);
    expect(res.json().code).toBe('INVALID_DATE_RANGE');
  });
});

for (const role of ['doctor', 'volunteer']) {
  test(`a ${role} is refused staff activity`, async () => {
    const clinicId = await clinicIdFor(role);
    const res = await apiRequestAs(role, 'get', `/clinics/${clinicId}/staff-activity`, {
      clinicId,
    });
    expect(res.status()).toBe(403);
  });
}
