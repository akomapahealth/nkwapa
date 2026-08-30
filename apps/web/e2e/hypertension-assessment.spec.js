const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * One assessment per encounter, and the encounter shows the last thing that was saved.
 *
 * Issue #91: `HypertensionForm` generated a fresh id inside its save handler, so every save wrote
 * another row into the local table. The encounter page reads them back with
 * `.where('encounterId').equals(id).first()`, and Dexie orders duplicate index keys by primary
 * key -- random UUIDs -- so a clinician who corrected Stage 1 to Crisis could reopen the encounter
 * and be shown Stage 1 again.
 *
 * The rows are asserted directly rather than through the UI, because the UI symptom depended on
 * which UUID happened to sort first: a test that only reopened the page would pass roughly half
 * the time against the broken build.
 */

async function readAssessments(page, encounterId) {
  return page.evaluate(
    (encounter) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('hypertension_assessments')) {
            db.close();
            resolve([]);
            return;
          }
          const store = db
            .transaction('hypertension_assessments', 'readonly')
            .objectStore('hypertension_assessments');
          const all = store.getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result.filter((row) => row.encounterId === encounter));
          };
        };
      }),
    encounterId,
  );
}

async function setClassification(page, label) {
  await page.getByLabel('Classification').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

test('a corrected blood pressure classification is what the encounter shows next time', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Hypertension');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-HTN-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const patientId = page.url().split('/').at(-1);

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/clinics\/[^/]+\/encounters$/.test(new URL(response.url()).pathname),
  );
  await page.goto(`/patients/${patientId}/encounters/new`);
  const encounterId = (await (await created).json()).id;

  await page.goto(`/encounters/${encounterId}`);
  await page.getByRole('tab', { name: 'Hypertension' }).click();

  // First reading.
  await setClassification(page, 'Stage 1');
  await page.getByRole('button', { name: 'Save Assessment' }).click();
  await expect(page.getByRole('button', { name: 'Save Assessment' })).toBeEnabled();
  await expect.poll(async () => (await readAssessments(page, encounterId)).length).toBe(1);

  // The correction. This is the save that used to insert a second row.
  await setClassification(page, 'Crisis');
  await page.getByRole('button', { name: 'Save Assessment' }).click();
  await expect(page.getByRole('button', { name: 'Save Assessment' })).toBeEnabled();

  await expect
    .poll(async () => (await readAssessments(page, encounterId)).map((row) => row.classification))
    .toEqual(['CRISIS']);

  // And the encounter agrees on the next visit, which is what a clinician actually experiences.
  await page.goto(`/encounters/${encounterId}`);
  await page.getByRole('tab', { name: 'Hypertension' }).click();
  await expect(page.getByLabel('Classification')).toHaveText(/crisis/i);
});
