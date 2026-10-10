const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('doctor') });

/**
 * The new-encounter wizard runs the same chronic-disease forms as the encounter page.
 *
 * It did not. The encounter page chose between the guided interview and the pre-interview form
 * behind `guidedChronicTabs`; this wizard rendered the old forms unconditionally. With the flag
 * on, a volunteer creating a visit here answered four hypertension fields and then landed on a
 * tab showing the full interview -- two different forms writing one record in a single sitting,
 * and no spec walked these steps to notice.
 */
async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Wizard');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-WIZARD-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  return page.url().split('/').at(-1);
}

async function chooseOption(page, label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('the wizard runs the guided interviews and carries vitals into them', async ({ page }) => {
  test.setTimeout(150_000);

  const patientId = await createPatient(page);
  await page.goto(`/patients/${patientId}/encounters/new`);

  await page.getByRole('button', { name: 'Continue to Vitals' }).click();

  await page.getByLabel('Systolic BP (mmHg)').fill('152');
  await page.getByLabel('Diastolic BP (mmHg)').fill('96');
  await chooseOption(page, 'Measurement site', 'Left arm');
  await chooseOption(page, 'Patient position', 'Sitting');
  await chooseOption(page, 'Cuff size', 'Adult');
  await page.getByLabel('Pulse (bpm)').fill('78');
  await page.getByRole('button', { name: 'Save measurements' }).click();

  /*
    The guided interview, not the four-field form. Section 2 exists only on the interview, and
    its heading is what distinguishes the two without depending on a field they share.
  */
  await expect(page.getByRole('heading', { name: /2\. Blood pressure control/i })).toBeVisible({
    timeout: 30_000,
  });

  /*
    And it carries the reading the previous step just saved.

    This is the part a flag check alone would not have fixed: the wizard held no encounter state,
    so the interview would have rendered with no vitals on the one path where they were certainly
    just taken, and shown no classification for a reading that is plainly stage 2.
  */
  await expect(page.getByText('152/96 mmHg', { exact: true })).toBeVisible();
  await expect(page.getByText('78 bpm', { exact: true })).toBeVisible();

  /*
    And the server-derived classification follows from it. 152/96 is stage 2 on the ACC/AHA bands,
    so this asserts the reading reached the derivation rather than merely being printed: the
    wizard's hypertension step is now doing the work the encounter page's tab does.
  */
  await expect(page.getByText(/Derived from 152\/96 mmHg/)).toBeVisible();
});
