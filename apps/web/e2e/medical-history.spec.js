const path = require('path');
const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const authFile = path.join(__dirname, '..', 'playwright', '.auth', 'staff.json');

test.use({ storageState: authFile });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name *').fill('History');
  await page.getByLabel('Last name *').fill(`E2E-${suffix}`);
  await page.getByLabel('National ID *').fill(`E2E-HISTORY-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
}

async function chooseOption(page, dialog, label, option) {
  await dialog.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('medical history supports empty, validation, active, historical, revision, and responsive states', async ({
  page,
}) => {
  await createPatient(page);
  await page.getByRole('tab', { name: 'Medical History' }).click();

  await expect(page.getByRole('heading', { name: 'Allergy status not recorded' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No matching history records' })).toBeVisible();

  await page.getByRole('button', { name: 'Add history' }).click();
  let dialog = page.getByRole('dialog', { name: 'Add history record' });
  await dialog.getByRole('button', { name: 'Add record' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await chooseOption(page, dialog, 'Category', 'Allergy / adverse reaction');
  await dialog.getByLabel('Substance').fill('Peanut');
  await dialog.getByLabel('Reaction (if known)').fill('Hives');
  await chooseOption(page, dialog, 'Severity', 'Severe');
  await dialog.getByRole('button', { name: 'Add record' }).click();

  await expect(
    page.getByRole('heading', { name: 'Active allergies or adverse reactions' }),
  ).toBeVisible();
  await expect(page.getByText(/Peanut.*SEVERE.*Hives/)).toBeVisible();

  await page.getByRole('button', { name: 'Revise' }).click();
  dialog = page.getByRole('dialog', { name: 'Revise history record' });
  await chooseOption(page, dialog, 'Status', 'Resolved');
  await dialog.getByLabel('Resolved date').fill(new Date().toISOString().slice(0, 10));
  await dialog.getByRole('button', { name: 'Save revision' }).click();

  await expect(page.getByRole('heading', { name: 'Historical allergies only' })).toBeVisible();
  await expect(page.getByText('Resolved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revisions' }).click();
  const revisionDialog = page.getByRole('dialog', { name: 'Revision history' });
  await expect(revisionDialog.getByText('Revision 2')).toBeVisible();
  await expect(revisionDialog.getByText('Revision 1')).toBeVisible();
  await revisionDialog.press('Escape');

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const hasViewportOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasViewportOverflow).toBeFalsy();
    await expect(page.getByRole('tab', { name: 'Medical History' })).toBeVisible();
  }
});

test('medical history shows cached empty state when the device is offline', async ({
  page,
  context,
}) => {
  await createPatient(page);
  await expect(page.getByRole('tab', { name: 'Medical History' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('tab', { name: 'Medical History' }).click();

  await expect(page.getByText(/Offline history is shown from this device/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No matching history records' })).toBeVisible();

  await context.setOffline(false);
});
