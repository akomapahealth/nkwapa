const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/**
 * Prescribing, end to end, for the first time.
 *
 * Before this spec the only prescribing assertion in the whole suite was that a new patient has
 * none: `medication-reconciliation.spec.js` checking "No linked prescriptions found.". The form,
 * the catalogue search, the allergy gate and the POST were exercised by nothing above a unit test
 * with a mocked Prisma.
 *
 * It also could not have existed until recently. `seedDrugs` sat behind `SEED_SYSTEM_ADMIN_SUB`,
 * which CI does not set, so CI ran with an empty drug catalogue and the picker below would never
 * have returned a row. See the seed fix on #114.
 */

async function createPatient(page, prefix) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill(prefix);
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page
    .getByLabel('National ID', { exact: true })
    .fill(`E2E-${prefix.toUpperCase()}-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  return page.url().split('/').at(-1);
}

async function createEncounter(page, patientId) {
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/clinics\/[^/]+\/encounters$/.test(new URL(response.url()).pathname),
  );
  await page.goto(`/patients/${patientId}/encounters/new`);
  return (await (await created).json()).id;
}

/** The catalogue search is debounced and the results are plain buttons, not a listbox. */
async function chooseDrug(page, name) {
  await page.getByLabel('Drug', { exact: true }).fill(name);
  await page
    .getByRole('button', { name: new RegExp(name, 'i') })
    .first()
    .click();
}

test.describe('as a doctor', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('a prescription is written from the clinic catalogue and appears on the encounter', async ({
    page,
  }) => {
    test.setTimeout(150_000);

    const patientId = await createPatient(page, 'Prescribe');
    const encounterId = await createEncounter(page, patientId);
    await page.goto(`/encounters/${encounterId}`);

    await expect(page.getByRole('heading', { name: 'Add prescription' })).toBeVisible();
    await expect(page.getByText('No prescriptions yet.')).toBeVisible();

    /*
      The catalogue is the seeded one. A drug the clinic does not stock is refused by the API --
      `drug.clinicId !== clinicId` -- so searching it is also what proves the catalogue reached
      this clinic rather than merely existing.
    */
    await chooseDrug(page, 'Amlodipine');
    await page.getByLabel('Dosage (with unit, e.g. mg)').fill('10 mg');
    await page.getByLabel('Frequency (doses per day)').fill('Once daily');
    await page.getByLabel('Quantity (units dispensed)').fill('30');

    /*
      A brand-new patient has no allergy record, which is `NOT_RECORDED` -- the state the server
      refuses a prescription in. The acknowledgement is therefore required here, and this is the
      only place the gate is proven as a whole rather than as a predicate.
    */
    const acknowledgement = page.getByLabel(
      "I reviewed the patient's allergy status before prescribing.",
    );
    await expect(acknowledgement).toBeVisible();
    await acknowledgement.check();

    await page.getByRole('button', { name: 'Add prescription' }).click();

    await expect(page.getByText('No prescriptions yet.')).toBeHidden();
    const listed = page.getByRole('listitem').filter({ hasText: 'Amlodipine' });
    await expect(listed).toBeVisible();
    await expect(listed).toContainText('10 mg');
    await expect(listed).toContainText('Once daily');
    await expect(listed).toContainText('Qty: 30');
    await expect(listed).toContainText('Prescribed by');
  });

  test('the allergy acknowledgement is refused rather than assumed', async ({ page }) => {
    test.setTimeout(150_000);

    const patientId = await createPatient(page, 'Allergy');
    const encounterId = await createEncounter(page, patientId);
    await page.goto(`/encounters/${encounterId}`);

    await chooseDrug(page, 'Lisinopril');
    await page.getByLabel('Dosage (with unit, e.g. mg)').fill('5 mg');
    await page.getByLabel('Frequency (doses per day)').fill('Once daily');

    // Everything else is valid, so only the unticked acknowledgement can stop this.
    await page.getByRole('button', { name: 'Add prescription' }).click();

    await expect(
      page.getByText('Confirm you reviewed the allergy status before prescribing.'),
    ).toBeVisible();
    await expect(page.getByText('No prescriptions yet.')).toBeVisible();

    await page.getByLabel("I reviewed the patient's allergy status before prescribing.").check();
    await page.getByRole('button', { name: 'Add prescription' }).click();

    await expect(page.getByRole('listitem').filter({ hasText: 'Lisinopril' })).toBeVisible();
  });

  /*
    A finalized encounter closes prescribing, and says so by removing the controls.

    The route refuses it too -- `ensureEncounterNotFinalized` throws before anything is written,
    covered by `prescription.service.spec.ts` -- but that refusal is not reachable through the UI,
    because the form is gone. This is the half a prescriber actually meets, and it was untested.
  */
  test('finalizing an encounter closes prescribing without hiding what was prescribed', async ({
    page,
  }) => {
    test.setTimeout(150_000);

    const patientId = await createPatient(page, 'Finalized');
    const encounterId = await createEncounter(page, patientId);
    await page.goto(`/encounters/${encounterId}`);

    await chooseDrug(page, 'Atenolol');
    await page.getByLabel('Dosage (with unit, e.g. mg)').fill('25 mg');
    await page.getByLabel('Frequency (doses per day)').fill('Once daily');
    await page.getByLabel("I reviewed the patient's allergy status before prescribing.").check();
    await page.getByRole('button', { name: 'Add prescription' }).click();

    const listed = page.getByRole('listitem').filter({ hasText: 'Atenolol' });
    await expect(listed).toBeVisible();

    await page.getByRole('button', { name: 'Submit for Review' }).click();
    await page.getByRole('button', { name: 'Mark Reviewed' }).click();
    await page.getByRole('button', { name: 'Finalize' }).click();

    // The record stays readable -- a finalized encounter is history, not a blank.
    await expect(page.getByRole('listitem').filter({ hasText: 'Atenolol' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add prescription' })).toHaveCount(0);
    await expect(page.getByLabel('Dosage (with unit, e.g. mg)')).toHaveCount(0);
  });

  test('the required fields are named rather than left to a disabled button', async ({ page }) => {
    test.setTimeout(150_000);

    const patientId = await createPatient(page, 'Validate');
    const encounterId = await createEncounter(page, patientId);
    await page.goto(`/encounters/${encounterId}`);

    /*
      The button is deliberately enabled. It used to be disabled until every field was filled,
      which left a prescriber facing a control that would not press and no statement of which of
      four conditions was unmet.
    */
    const save = page.getByRole('button', { name: 'Add prescription' });
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page.getByText('Choose a drug from the clinic catalog.')).toBeVisible();
    await expect(page.getByText('Enter a dose, including its unit.')).toBeVisible();
    await expect(page.getByText('Enter how often the patient takes it.')).toBeVisible();
    await expect(page.getByText('No prescriptions yet.')).toBeVisible();

    // Corrected fields clear as they are fixed, rather than all at the next submit.
    await chooseDrug(page, 'Metformin');
    await expect(page.getByText('Choose a drug from the clinic catalog.')).toBeHidden();

    await page.getByLabel('Dosage (with unit, e.g. mg)').fill('500 mg');
    await expect(page.getByText('Enter a dose, including its unit.')).toBeHidden();

    // A quantity has to be a positive whole number when it is given at all.
    await page.getByLabel('Frequency (doses per day)').fill('Twice daily');
    await page.getByLabel('Quantity (units dispensed)').fill('0');
    await save.click();
    await expect(page.getByText('Quantity must be a whole number of one or more.')).toBeVisible();
  });
});

/**
 * A volunteer holds neither prescription permission, and the encounter page gates the whole
 * section on `PRESCRIPTION.READ`. The API refuses the routes independently -- that is asserted in
 * `prescriptions.controller.spec.ts` -- and this is the other half: the surface is absent rather
 * than present and failing.
 */
test.describe('as a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('the prescribing surface is not on the page at all', async ({ page }) => {
    test.setTimeout(150_000);

    const patientId = await createPatient(page, 'NoRx');
    const encounterId = await createEncounter(page, patientId);
    await page.goto(`/encounters/${encounterId}`);

    // The encounter itself is reachable; the volunteer works down its tabs.
    await expect(page.getByRole('tab', { name: 'Vitals' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Prescriptions' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Add prescription' })).toHaveCount(0);
    await expect(page.getByLabel('Dosage (with unit, e.g. mg)')).toHaveCount(0);
  });
});
