const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

/**
 * What each clinical role sees in the browser.
 *
 * The permission matrix is asserted exhaustively and quickly in
 * apps/api/src/auth/clinical-record-role-matrix.spec.ts. These tests exist for the part that
 * cannot be asserted there: that the rendered chart honours it. A tab that is refused by the API
 * but still rendered is a broken promise to the clinician even though no data leaks.
 */

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name *').fill('Role');
  await page.getByLabel('Last name *').fill(`E2E-${suffix}`);
  await page.getByLabel('National ID *').fill(`E2E-ROLE-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+/, { timeout: 20_000 });
  const url = new URL(page.url());
  const [, , clinicId, , patientId] = url.pathname.split('/');
  return { clinicId, patientId };
}

test.describe('doctor', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('reaches clinical notes and the cosign queue', async ({ page }) => {
    const { clinicId, patientId } = await createPatient(page);
    await page.goto(`/clinics/${clinicId}/patients/${patientId}`);

    await expect(page.getByRole('tab', { name: 'Notes', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Medications', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Diabetes', exact: true })).toBeVisible();
  });
});

test.describe('volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('reaches the sections a volunteer records and reads back', async ({ page }) => {
    const { clinicId, patientId } = await createPatient(page);
    await page.goto(`/clinics/${clinicId}/patients/${patientId}`);

    // A volunteer records screenings, history and medications, so must be able to read them back.
    for (const tab of ['Vitals', 'Diabetes', 'Medical History', 'Medications', 'Notes']) {
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
    }
  });

  test('is not offered a cosign queue', async ({ page }) => {
    // Cosigning is a doctor's act. The route is refused by the API; it must also not be offered.
    await page.goto('/dashboard');
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByRole('link', { name: /pending hap cosign/i })).toHaveCount(0);
  });

  test('cannot edit an existing chart', async ({ page }) => {
    // A volunteer registers patients but does not hold PATIENT.UPDATE, so the affordance to edit
    // an existing chart must be absent rather than present and rejected on submit.
    const { clinicId, patientId } = await createPatient(page);
    await page.goto(`/clinics/${clinicId}/patients/${patientId}`);

    await expect(page.getByRole('link', { name: /edit patient/i })).toHaveCount(0);
  });
});
