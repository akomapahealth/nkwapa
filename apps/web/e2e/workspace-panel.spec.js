const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/*
  The chart's forms open in a side panel beside the chart from 1200px (O3 workspace pattern), and
  the patient bar stays pinned on the chart and on a visit, with the allergy status.
*/

test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Panel');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-PANEL-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  return page.url().split('/').at(-1);
}

async function chooseOption(page, scope, label, option) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function addAllergy(page) {
  await page.getByRole('tab', { name: 'Medical history' }).click();
  await page.getByRole('button', { name: 'Add history', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Add history record' });
  await chooseOption(page, panel, 'Category', 'Allergy / adverse reaction');
  await panel.getByLabel('Substance').fill('Penicillin');
  await chooseOption(page, panel, 'Severity', 'Severe');
  await panel.getByRole('button', { name: 'Add record' }).click();
  await expect(panel).toBeHidden();
}

test('on a computer the form sits beside the chart, hides, restores and asks before discarding', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createPatient(page);
  await page.getByRole('tab', { name: 'Medical history' }).click();
  await page.getByRole('button', { name: 'Add history', exact: true }).click();

  const panel = page.getByRole('dialog', { name: 'Add history record' });
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-workspace-panel]')).toHaveCount(1);
  // No scrim, and the page makes room: the chart's own controls stay usable beside it.
  await expect(page.locator('body')).toHaveAttribute('data-workspace-open', 'true');
  const panelBox = await panel.boundingBox();
  const addBox = await page.getByRole('button', { name: 'Add history', exact: true }).boundingBox();
  expect(addBox.x + addBox.width).toBeLessThanOrEqual(panelBox.x);

  await chooseOption(page, panel, 'Category', 'Allergy / adverse reaction');
  await panel.getByLabel('Substance').fill('Penicillin');

  // Hide keeps the entry behind a restore button that says it is not saved.
  await panel.getByRole('button', { name: 'Hide Add history record' }).click();
  await expect(panel).toBeHidden();
  const restore = page.getByRole('button', { name: 'Show Add history record, not saved' });
  await expect(restore).toBeFocused();
  await restore.click();
  await expect(panel.getByLabel('Substance')).toHaveValue('Penicillin');

  // A chart tab change would drop the form, so it asks; keeping editing stays put.
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep editing' }).click();
  await expect(panel.getByLabel('Substance')).toHaveValue('Penicillin');

  // Closing asks too, and Discard closes it and gives the page its width back.
  await panel.getByRole('button', { name: 'Close Add history record' }).click();
  await page
    .getByRole('dialog', { name: 'Discard changes?' })
    .getByRole('button', {
      name: 'Discard',
    })
    .click();
  await expect(panel).toBeHidden();
  await expect(page.locator('body')).not.toHaveAttribute('data-workspace-open', 'true');
});

test('on a phone the same form is a dialog, not a side panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPatient(page);
  await page.getByRole('tab', { name: 'Medical history' }).click();
  await page.getByRole('button', { name: 'Add history', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add history record' })).toBeVisible();
  await expect(page.locator('[data-workspace-panel]')).toHaveCount(0);
});

test('the patient bar pins with the allergy status on the chart and on a visit', async ({
  page,
}) => {
  // Short enough that the chart and the visit both scroll their header away.
  await page.setViewportSize({ width: 1440, height: 520 });
  const patientId = await createPatient(page);
  await addAllergy(page);

  const bar = page.locator('[data-patient-context]');
  await page.locator('main').evaluate((main) => main.scrollBy(0, 2000));
  await page.evaluate(() => window.scrollBy(0, 2000));
  await expect(bar).toHaveAttribute('data-visible', 'true');
  await expect(bar).toContainText('Panel E2E-');
  await expect(bar).toContainText('Allergies: Penicillin');

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/clinics\/[^/]+\/encounters$/.test(new URL(response.url()).pathname),
  );
  await page.goto(`/patients/${patientId}/encounters/new`);
  const encounter = await (await created).json();
  await page.goto(`/encounters/${encounter.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Panel E2E-');
  await page.locator('main').evaluate((main) => main.scrollBy(0, 2000));
  await page.evaluate(() => window.scrollBy(0, 2000));
  const visitBar = page.locator('[data-patient-context]');
  await expect(visitBar).toHaveAttribute('data-visible', 'true');
  await expect(visitBar).toContainText('Allergies: Penicillin');
});
