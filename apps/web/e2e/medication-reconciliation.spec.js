const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name *').fill('Medication');
  await page.getByLabel('Last name *').fill(`E2E-${suffix}`);
  await page.getByLabel('National ID *').fill(`E2E-MEDICATION-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
}

async function selectOption(page, dialog, label, option) {
  await dialog.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('medication reconciliation covers clinical, pharmacy, validation, and responsive states', async ({
  page,
}) => {
  await createPatient(page);
  await page.getByRole('tab', { name: 'Medications' }).click();

  await expect(page.getByRole('heading', { name: 'No medications recorded' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Allergy status not recorded' })).toBeVisible();
  await expect(page.getByText('No linked prescriptions found.')).toBeVisible();

  await page.getByRole('button', { name: 'Add medication' }).click();
  let dialog = page.getByRole('dialog', { name: 'Add reported medication' });
  await dialog.getByRole('button', { name: 'Add medication' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Medication name is required');
  await dialog.getByLabel('Medication name *').fill('Metformin from home');
  await dialog.getByLabel('Strength').fill('500 mg');
  await dialog.getByLabel('Dose', { exact: true }).fill('1');
  await dialog.getByLabel('Dose unit').fill('tablet');
  await dialog.getByLabel('Frequency').fill('Twice daily');
  await dialog.getByRole('button', { name: 'Add medication' }).click();

  await expect(page.getByRole('heading', { name: 'Metformin from home' })).toBeVisible();
  await expect(page.getByText('External / uncatalogued')).toBeVisible();
  await expect(page.getByText(/Recorded by E2E Staff/)).toBeVisible();
  await page.getByRole('button', { name: 'Reconcile list' }).click();
  await expect(page.getByText(/Last reconciled/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Revise' }).first().click();
  dialog = page.getByRole('dialog', { name: 'Revise reported medication' });
  await selectOption(page, dialog, 'Status', 'Stopped');
  await dialog.getByLabel('End date').fill(new Date().toISOString().slice(0, 10));
  await dialog.getByRole('button', { name: 'Save revision' }).click();

  await expect(page.getByRole('heading', { name: 'No current medications' })).toBeVisible();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record no known medications' }).click();
  await expect(page.getByRole('heading', { name: 'No known current medications' })).toBeVisible();

  await page.getByRole('button', { name: 'History' }).first().click();
  const historyDialog = page.getByRole('dialog', { name: 'Revision history' });
  await expect(historyDialog.getByText('Revision 3')).toBeVisible();
  await expect(historyDialog.getByText('Revision 1')).toBeVisible();
  await historyDialog.press('Escape');

  await page.getByRole('button', { name: 'Add pharmacy' }).click();
  dialog = page.getByRole('dialog', { name: 'Add pharmacy' });
  await dialog.getByLabel('Pharmacy name *').fill('First Community Pharmacy');
  await dialog.getByLabel('Address line 1').fill('1 Main Street');
  await dialog.getByLabel('City').fill('Accra');
  await dialog.getByRole('button', { name: 'Add pharmacy' }).click();
  await page.getByRole('button', { name: 'Make preferred' }).click();
  await expect(page.getByText('Preferred', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add pharmacy' }).click();
  dialog = page.getByRole('dialog', { name: 'Add pharmacy' });
  await dialog.getByLabel('Pharmacy name *').fill('Second Community Pharmacy');
  await dialog.getByLabel('City').fill('Kumasi');
  await dialog.getByRole('button', { name: 'Add pharmacy' }).click();
  await page.getByRole('button', { name: 'Make preferred' }).click();

  const firstPharmacy = page.getByRole('listitem').filter({ hasText: 'First Community Pharmacy' });
  await expect(firstPharmacy.getByText(/Preferred .* –/)).toBeVisible();
  const secondPharmacy = page
    .getByRole('listitem')
    .filter({ hasText: 'Second Community Pharmacy' });
  await expect(secondPharmacy.getByText('Preferred', { exact: true })).toBeVisible();

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    ).toBeFalsy();
    await expect(page.getByRole('tab', { name: 'Medications' })).toBeVisible();
  }
});

test('an empty offline chart remains not-recorded until an authorized attestation', async ({
  page,
  context,
}) => {
  await createPatient(page);
  const medicationsTab = page.getByRole('tab', { name: 'Medications' });
  await expect(medicationsTab).toBeVisible();
  await context.setOffline(true);
  await medicationsTab.click();

  await expect(page.getByText(/Showing medications saved on this device/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No medications recorded' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No known current medications' })).toHaveCount(0);

  await context.setOffline(false);
});
