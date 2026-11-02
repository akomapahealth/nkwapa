const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('volunteer') });

test('completed and cancelled assignments stay in the worklist without being called pending work', async ({
  page,
}) => {
  const now = new Date().toISOString();
  const assignment = (status) => ({
    id: status,
    patientCheckInId: status,
    assignedRole: 'VOLUNTEER',
    assignedAt: now,
    checkedInAt: now,
    checkInStatus: status,
    encounterId: null,
    patient: {
      id: status,
      patientCode: `SYN-${status}`,
      firstName: 'Synthetic',
      lastName: status,
      displayName: `Synthetic ${status}`,
    },
    assignedVolunteer: { id: 'volunteer', displayName: 'Synthetic Volunteer' },
    assignedDoctor: { id: 'doctor', displayName: 'Synthetic Doctor' },
  });
  await page.route('**/my/assignments*', (route) =>
    route.fulfill({
      json: {
        date: now.slice(0, 10),
        timezone: 'Africa/Accra',
        items: ['ASSIGNED', 'COMPLETED', 'CANCELLED'].map(assignment),
      },
    }),
  );
  await page.goto('/my/assigned');
  const needs = page.getByRole('region', { name: 'Needs you now' });
  await expect(needs.getByText('1 assigned patient needs follow-through')).toBeVisible();
  const table = page.getByRole('table', { name: 'Patients assigned to you' });
  await expect(table.getByText('SYN-CANCELLED · Synthetic CANCELLED')).toBeVisible();
  await expect(table.getByText('SYN-COMPLETED · Synthetic COMPLETED')).toBeVisible();
  await needs.getByRole('link', { name: 'View worklist' }).click();
  await expect(page.getByRole('heading', { name: 'Assigned Patients' })).toBeInViewport();
});
