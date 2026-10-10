const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * Adherence is recorded against the reconciled list, and survives a tab switch.
 *
 * Two things make this worth an end-to-end test rather than a unit test. The medication list comes
 * from a different module than the interview that asks about it, so the join only exists once the
 * whole page is running; and the answers are saved by the interview's own save, on tab change,
 * which is the contract a volunteer actually depends on -- they work down the tab and leave.
 *
 * The local rows are asserted by reading IndexedDB directly, following
 * `hypertension-assessment.spec.js`. Dexie orders duplicate index keys by primary key, so a bug
 * that wrote two sets for one encounter would surface through the UI only about half the time,
 * depending on which UUID happened to sort first.
 */

async function readAdherenceSets(page, encounterId) {
  return page.evaluate(
    (encounter) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('medication_adherence')) {
            db.close();
            resolve([]);
            return;
          }
          const store = db
            .transaction('medication_adherence', 'readonly')
            .objectStore('medication_adherence');
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

async function createPatient(page, suffix) {
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Adherence');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-ADH-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  return page.url().split('/').at(-1);
}

/** Linked to the seeded catalogue entry, so the row carries a category the section can group on. */
async function addCatalogueMedication(page, name) {
  await page.getByRole('tab', { name: 'Medications' }).click();
  await page.getByRole('button', { name: 'Add medication' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add reported medication' });
  await dialog.getByLabel('Medication name', { exact: true }).fill(name);
  await dialog.getByLabel('Link clinic Drug (optional)').fill(name);
  // The results are `role="option"` inside a listbox, and the search is debounced.
  await dialog
    .getByRole('option', { name: new RegExp(name, 'i') })
    .first()
    .click();
  await dialog.getByLabel('Strength').fill('10 mg');
  await dialog.getByLabel('Frequency').fill('Once daily');
  await dialog.getByRole('button', { name: 'Add medication' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
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

async function answer(card, page, label, option) {
  await card.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('medication adherence is recorded against the reconciled list and survives a tab switch', async ({
  page,
}) => {
  test.setTimeout(150_000);

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const patientId = await createPatient(page, suffix);
  await addCatalogueMedication(page, 'Amlodipine');
  const encounterId = await createEncounter(page, patientId);

  await page.goto(`/encounters/${encounterId}`);
  await page.getByRole('tab', { name: 'Hypertension' }).click();

  /*
    The medication arrives from the reconciled list, not from a list of the interview's own. Its
    dose is shown and is not editable here: correcting it belongs on the Medications tab, where the
    medication of record lives.
  */
  const card = page.getByRole('region', { name: /Amlodipine/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('10 mg');
  await expect(card.getByText('Not yet asked')).toBeVisible();
  await expect(page.getByText('0 of 1 medication recorded')).toBeVisible();

  // The seeded catalogue entry is an ANTIHYPERTENSIVE, so the section can name the group.
  await expect(page.getByRole('heading', { name: 'Blood-pressure medications' })).toBeVisible();

  await answer(card, page, 'Took it today?', 'Yes');
  await answer(card, page, 'Doses missed in the past 7 days', '1');
  await answer(card, page, 'Supply remaining', 'Less than 1 week');
  await expect(card.getByText('Recorded')).toBeVisible();
  await expect(page.getByText('1 of 1 medication recorded')).toBeVisible();

  /*
    Saved by the interview's own save, not a button of its own. One act writes the assessment and
    the adherence set, so a volunteer cannot leave the tab with half the section written.
  */
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('button', { name: 'Save assessment' })).toBeEnabled();

  await expect.poll(async () => (await readAdherenceSets(page, encounterId)).length).toBe(1);
  const [set] = await readAdherenceSets(page, encounterId);
  expect(set.context).toBe('HYPERTENSION');
  expect(set.entries).toHaveLength(1);
  expect(set.entries[0]).toMatchObject({
    tookToday: 'YES',
    dosesMissed7d: 'ONE',
    supplyRemaining: 'LESS_THAN_ONE_WEEK',
  });

  // Away and back, which is how the tab is actually used.
  await page.getByRole('tab', { name: 'Vitals' }).click();
  await page.getByRole('tab', { name: 'Hypertension' }).click();
  await expect(page.getByRole('region', { name: /Amlodipine/ })).toContainText('Recorded');
  await expect(page.getByLabel('Took it today?', { exact: true })).toHaveText(/yes/i);

  // And on the next visit to the encounter, which is what reaches the clinician.
  await page.goto(`/encounters/${encounterId}`);
  await page.getByRole('tab', { name: 'Hypertension' }).click();
  await expect(page.getByLabel('Supply remaining', { exact: true })).toHaveText(
    /less than 1 week/i,
  );
});

/**
 * The two conditions ask different questions and keep separate answers.
 *
 * They share one local table under one `encounterId`, and the database holds them under one
 * `(encounterId, context, medicationRecordId)` key. A bug in either place would show up as one
 * condition's answers appearing under the other, or as the second save deleting the first.
 */
test('each condition keeps its own adherence answers for the same encounter', async ({ page }) => {
  test.setTimeout(150_000);

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const patientId = await createPatient(page, suffix);
  await addCatalogueMedication(page, 'Metformin');
  const encounterId = await createEncounter(page, patientId);

  await page.goto(`/encounters/${encounterId}`);

  // Diabetes asks about the pattern over time, not about today.
  await page.getByRole('tab', { name: 'Diabetes' }).click();
  const diabetesCard = page.getByRole('region', { name: /Metformin/ });
  await expect(diabetesCard).toBeVisible();
  await expect(diabetesCard.getByLabel('Took it today?', { exact: true })).toHaveCount(0);
  await answer(diabetesCard, page, 'Taking it as prescribed?', 'Sometimes');
  await page.getByRole('button', { name: 'Save screening' }).click();
  await expect(page.getByRole('button', { name: 'Save screening' })).toBeEnabled();

  // Hypertension asks about today, and its own save must not disturb the diabetes set.
  await page.getByRole('tab', { name: 'Hypertension' }).click();
  const hypertensionCard = page.getByRole('region', { name: /Metformin/ });
  await expect(
    hypertensionCard.getByLabel('Taking it as prescribed?', { exact: true }),
  ).toHaveCount(0);
  await answer(hypertensionCard, page, 'Took it today?', 'No');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('button', { name: 'Save assessment' })).toBeEnabled();

  await expect.poll(async () => (await readAdherenceSets(page, encounterId)).length).toBe(2);
  const sets = await readAdherenceSets(page, encounterId);
  const byContext = Object.fromEntries(sets.map((row) => [row.context, row]));
  expect(byContext.DIABETES.entries[0]).toMatchObject({
    takingAsPrescribed: 'SOMETIMES',
    tookToday: 'NOT_ASSESSED',
  });
  expect(byContext.HYPERTENSION.entries[0]).toMatchObject({
    tookToday: 'NO',
    takingAsPrescribed: 'NOT_ASSESSED',
  });
});

/**
 * The section is new interactive markup, so it gets its own sweep.
 *
 * It lives here rather than in `accessibility.spec.js` because the setup is the expensive part: a
 * patient, a catalogued medication and an encounter have to exist before there is a card to sweep,
 * and duplicating that into the accessibility suite would double the slowest fixture in it for one
 * assertion. No `Select` is open during the sweep, so the `aria-hidden-focus` exclusion the
 * accessibility suite needs for Radix popups does not apply.
 */
test('the adherence section is axe-clean at phone and desktop widths', async ({ page }) => {
  test.setTimeout(150_000);

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const patientId = await createPatient(page, suffix);
  await addCatalogueMedication(page, 'Amlodipine');
  const encounterId = await createEncounter(page, patientId);

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/encounters/${encounterId}`);
    await page.getByRole('tab', { name: 'Hypertension' }).click();
    await expect(page.getByRole('region', { name: /Amlodipine/ })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('#adherence-section-hypertension')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    // No horizontal page scroll at 375px: a volunteer holding a phone should never have to pan.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  }
});
