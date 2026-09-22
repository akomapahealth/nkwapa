const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const { waitForOutboxDrain } = require('../playwright/outbox');
const { apiRequestAs } = require('../playwright/api-client');

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
  const segments = page.url().split('/');
  // .../clinics/<clinicId>/patients/<patientId>
  return { patientId: segments.at(-1), clinicId: segments.at(-3) };
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

    const { patientId } = await createPatient(page, 'Prescribe');
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

    const { patientId } = await createPatient(page, 'Allergy');
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

    Both halves are asserted here. The UI half is what a prescriber meets: the form is gone. The
    route half is what actually protects the record, and it used to be reachable only from a
    service unit test, because removing the form also removes every way to ask the API from the
    page. `apiRequestAs` is how a spec asks anyway.
  */
  test('finalizing an encounter closes prescribing without hiding what was prescribed', async ({
    page,
  }) => {
    test.setTimeout(150_000);

    const { patientId, clinicId } = await createPatient(page, 'Finalized');
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

    /*
      The absent form is a courtesy; this is the boundary.

      `drugId` is a random UUID on purpose. It satisfies the DTO so the request reaches the
      service, and `ensureEncounterNotFinalized` runs before the drug is ever looked up -- so the
      refusal under test is the finalized one and cannot be a missing drug wearing its clothes.
    */
    const refused = await apiRequestAs(
      'doctor',
      'post',
      `/clinics/${clinicId}/encounters/${encounterId}/prescriptions`,
      {
        clinicId,
        data: {
          drugId: randomUUID(),
          dosage: '25 mg',
          frequency: 'Once daily',
          allergyReviewed: true,
        },
      },
    );

    expect(refused.status()).toBe(400);
    expect(await refused.text()).toContain('finalized encounter');
  });

  /*
    A prescription written offline replays through the same validation as an online one.

    `SyncService` used to write this record with an inline Prisma upsert that checked neither the
    drug's clinic nor the payload's shape, and took the prescriber from the payload. It now
    delegates to `PrescriptionService` (#134), and this is the proof the queued path still lands:
    the outbox is empty only once the server reported the mutation applied.
  */
  test('a prescription written offline replays and lands', async ({ page, context }) => {
    test.setTimeout(150_000);

    const { patientId } = await createPatient(page, 'Offline');
    const encounterId = await createEncounter(page, patientId);
    await page.goto(`/encounters/${encounterId}`);

    // Chosen while online: the picker reads the catalogue from the server.
    await chooseDrug(page, 'Nifedipine');
    await page.getByLabel('Dosage (with unit, e.g. mg)').fill('20 mg');
    await page.getByLabel('Frequency (doses per day)').fill('Twice daily');
    await page.getByLabel("I reviewed the patient's allergy status before prescribing.").check();

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Add prescription' }).click();

    await context.setOffline(false);
    await waitForOutboxDrain(page, expect, { entityType: 'prescription' });

    await expect(async () => {
      await page.goto(`/encounters/${encounterId}`);
      const listed = page.getByRole('listitem').filter({ hasText: 'Nifedipine' });
      await expect(listed).toBeVisible({ timeout: 5_000 });
      await expect(listed).toContainText('20 mg');
      // The prescriber is the replaying actor, not anything the payload named.
      await expect(listed).toContainText('Prescribed by');
    }).toPass({ timeout: 30_000 });
  });

  test('the required fields are named rather than left to a disabled button', async ({ page }) => {
    test.setTimeout(150_000);

    const { patientId } = await createPatient(page, 'Validate');
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
 * section on `PRESCRIPTION.READ`. Both halves are asserted: the surface is absent rather than
 * present and failing, and the route refuses the request that the absent surface would have sent.
 */
test.describe('as a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('the prescribing surface is not on the page at all', async ({ page }) => {
    test.setTimeout(150_000);

    const { patientId } = await createPatient(page, 'NoRx');
    const encounterId = await createEncounter(page, patientId);
    await page.goto(`/encounters/${encounterId}`);

    // The encounter itself is reachable; the volunteer works down its tabs.
    await expect(page.getByRole('tab', { name: 'Vitals' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Prescriptions' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Add prescription' })).toHaveCount(0);
    await expect(page.getByLabel('Dosage (with unit, e.g. mg)')).toHaveCount(0);
  });

  /*
    A hidden control is not a closed door.

    Until `apiRequestAs` existed this could only be approximated by the assertion above, which
    proves the volunteer is not offered the form and says nothing about what happens if they ask
    the API anyway. `RbacGuard` refuses on `PRESCRIPTION.WRITE` before the body is even validated,
    so the bogus drug id below never gets a chance to be the reason.
  */
  test('the API refuses a prescription even though the form was never offered', async ({
    page,
  }) => {
    test.setTimeout(150_000);

    const { patientId, clinicId } = await createPatient(page, 'NoRxRoute');
    const encounterId = await createEncounter(page, patientId);

    const refused = await apiRequestAs(
      'volunteer',
      'post',
      `/clinics/${clinicId}/encounters/${encounterId}/prescriptions`,
      {
        clinicId,
        data: {
          drugId: randomUUID(),
          dosage: '25 mg',
          frequency: 'Once daily',
          allergyReviewed: true,
        },
      },
    );

    expect(refused.status()).toBe(403);
  });
});
