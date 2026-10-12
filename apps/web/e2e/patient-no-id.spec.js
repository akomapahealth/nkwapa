const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * A patient with no ID document (#214): registered with "No ID document", then given a Ghana Card
 * when they bring one, after which the card is theirs alone.
 *
 * Every run uses fresh names and numbers, so the file is safe to re-run on a database it touched.
 */
async function chooseSelect(page, label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('registers a patient with no ID, then records their card when they bring it', async ({
  page,
}) => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const card = `GHA-E2E-${suffix}`;

  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('NoId');
  await page.getByLabel('Last name', { exact: true }).fill(`Patient-${suffix}`);
  await chooseSelect(page, 'National ID type', 'No ID document');
  // No number to give, so no field to fill.
  await expect(page.getByRole('textbox', { name: 'National ID', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByText('No ID document')).toBeVisible();

  await page.goto(`${new URL(page.url()).pathname}/edit`);
  await page.getByRole('button', { name: 'Add ID' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('ID number').fill(card);
  await dialog.getByLabel('Reason').fill('Brought their Ghana Card');
  await dialog.getByRole('button', { name: 'Save ID' }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(`National ID …${card.slice(-4)}`).first()).toBeVisible();

  // The card now belongs to this chart: registering it again finds the existing patient.
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Second');
  await page.getByLabel('Last name', { exact: true }).fill(`Patient-${suffix}`);
  await chooseSelect(page, 'National ID type', 'National ID');
  await page.getByRole('textbox', { name: 'National ID', exact: true }).fill(card);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await expect(page.getByRole('heading', { name: 'Patient already exists' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('dialog').getByText(`NoId Patient-${suffix}`)).toBeVisible();
});
