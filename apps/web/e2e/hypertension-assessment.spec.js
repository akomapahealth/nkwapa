const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const {
  chooseAnswer,
  question,
  openSection: openInterviewSection,
} = require('../playwright/interview');

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

async function chooseStatus(page, label) {
  await chooseAnswer(question(page, 'Hypertension status'), label);
}

// The interview shows one section at a time; the rail moves between them.
const openSection = (page, name) => openInterviewSection(page, 'Hypertension interview', name);

async function recordVitals(page, systolic, diastolic) {
  await page.getByRole('tab', { name: 'Vitals' }).click();
  await page.getByLabel('Systolic BP (mmHg)').fill(String(systolic));
  await page.getByLabel('Diastolic BP (mmHg)').fill(String(diastolic));
  // A reading without its site fails validation, so the row is never written.
  await page.getByLabel('Measurement site').click();
  await page.getByRole('option', { name: 'Left arm', exact: true }).click();
  const save = page.getByRole('button', { name: 'Save measurements' });
  await save.click();
  // The write is what the interview reads. Switching tabs before it lands reads the previous row.
  await expect(save).toBeEnabled();
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

  // First answer.
  await chooseStatus(page, 'Known hypertension');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('button', { name: 'Save assessment' })).toBeEnabled();
  await expect.poll(async () => (await readAssessments(page, encounterId)).length).toBe(1);

  // The correction. This is the save that used to insert a second row.
  await chooseStatus(page, 'Newly elevated BP');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('button', { name: 'Save assessment' })).toBeEnabled();

  await expect
    .poll(async () =>
      (await readAssessments(page, encounterId)).map((row) => row.hypertensionStatus),
    )
    .toEqual(['NEWLY_ELEVATED_BP']);

  // And the encounter agrees on the next visit, which is what a clinician actually experiences.
  await page.goto(`/encounters/${encounterId}`);
  await page.getByRole('tab', { name: 'Hypertension' }).click();
  await expect(page.getByRole('radio', { name: 'Newly elevated BP', exact: true })).toBeChecked();
});

/**
 * The interview reads today's reading rather than asking for it again.
 *
 * `Vitals` is the only place a measurement is stored, so the interview displaying it is a read.
 * The prompt below is the other half: a reading high enough to be worth confirming should ask the
 * volunteer to rest the patient and repeat, because a single high value is frequently the walk
 * into the room rather than the patient.
 */
test("today's reading, its classification and the repeat prompt all come from the vitals tab", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Repeat');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-REP-${suffix}`);
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
  await recordVitals(page, 162, 98);

  await page.getByRole('tab', { name: 'Hypertension' }).click();
  await openSection(page, /BP control/);

  // Read through from Vitals, never re-entered here.
  //
  // `exact` matters: the `staff` identity holds every role, so the clinician classification block
  // renders too and also names the reading ("Derived from 162/98 mmHg:").
  await expect(page.getByText('162/98 mmHg', { exact: true })).toBeVisible();
  await expect(page.getByText('Stage 2', { exact: true }).first()).toBeVisible();

  // 162/98 is at or above the repeat threshold, so the prompt is shown.
  const prompt = page.getByText(/rest quietly for five minutes/i);
  await expect(prompt).toBeVisible();

  // Recording the repeat answers the prompt, and it goes away.
  await chooseAnswer(question(page, 'BP measurement repeated today'), 'Yes');
  await expect(prompt).toBeHidden();
});

/**
 * A symptom that needs a clinician says so, and offers to record why -- reversibly.
 *
 * The escalation is derived from the same shared function the server recomputes on write, so the
 * notice a volunteer sees and the flag the record stores cannot disagree. It preselects the review
 * reason rather than writing it silently, because the person in the room may know something the
 * thresholds do not.
 */
test('an urgent symptom raises the escalation notice and offers the review reason', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Escalation');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-ESC-${suffix}`);
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

  await openSection(page, /Current symptoms/);
  await expect(page.getByText(/this visit needs a clinician now/i)).toBeHidden();

  await page.getByRole('checkbox', { name: 'Chest pain' }).check();

  const notice = page.getByText(/this visit needs a clinician now/i);
  await expect(notice).toBeVisible();

  await page.getByRole('button', { name: /add to the reasons for clinician review/i }).click();
  await openSection(page, /Actions and referral/);
  await expect(page.getByRole('checkbox', { name: 'Concerning symptoms' })).toBeChecked();

  // Reversible: the volunteer can disagree with what was preselected.
  await page.getByRole('checkbox', { name: 'Concerning symptoms' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Concerning symptoms' })).not.toBeChecked();
});

/**
 * Leaving a tab whose answers fail validation used to switch anyway, and the tab's panel unmounts
 * on switch, so the draft vanished without a word. Now the volunteer stays unless they choose to
 * leave.
 */
test('an unsaved interview is kept when switching tabs fails to save it', async ({ page }) => {
  test.setTimeout(120_000);

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Draft');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-DRAFT-${suffix}`);
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
  await page.getByLabel('Main concern today').click();
  await page.getByRole('option', { name: 'Other', exact: true }).click();
  // "Other" needs a description, so this draft cannot save.

  await page.getByRole('tab', { name: 'Vitals' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expect(dialog.getByText('These answers are not saved yet')).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay and fix' }).click();

  await expect(page.getByRole('tab', { name: 'Hypertension' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Main concern today')).toHaveText(/Other/);
  await expect(page.getByLabel('Describe the concern')).toBeFocused();

  // Leaving is still possible, as a stated choice.
  await page.getByRole('tab', { name: 'Vitals' }).click();
  await dialog.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page.getByRole('tab', { name: 'Vitals' })).toHaveAttribute('aria-selected', 'true');
});

/**
 * What a volunteer records on the encounter's Hypertension tab can be read back from the chart.
 *
 * Found in a demo: Vitals, Diabetes and Hypertension all saved, but the chart had no Hypertension
 * section at all, so the assessment was only reachable by opening the visit again.
 */
test.describe('as a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('a saved hypertension assessment appears on the chart and beside the form', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    await page.goto('/patients/new');
    await page.getByLabel('First name', { exact: true }).fill('Chart');
    await page.getByLabel('Last name', { exact: true }).fill(`HTN-${suffix}`);
    await page.getByLabel('National ID', { exact: true }).fill(`E2E-HTNCHART-${suffix}`);
    await page.getByRole('button', { name: 'Create patient' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
    const chartUrl = new URL(page.url()).pathname;
    const patientId = chartUrl.split('/').at(-1);

    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/clinics\/[^/]+\/encounters$/.test(new URL(response.url()).pathname),
    );
    await page.goto(`/patients/${patientId}/encounters/new`);
    const encounterId = (await (await created).json()).id;

    await page.goto(`/encounters/${encounterId}`);
    await recordVitals(page, 162, 98);
    await page.getByRole('tab', { name: 'Hypertension' }).click();
    await chooseStatus(page, 'Newly elevated BP');
    await page.getByRole('button', { name: 'Save assessment' }).click();
    await expect(page.getByRole('button', { name: 'Save assessment' })).toBeEnabled();

    // Beside the form, as diabetes has always had.
    const history = page.getByRole('heading', { name: 'Longitudinal hypertension history' });
    await expect(history).toBeVisible();
    // And it already includes what was just saved, without a reload: the section heading plus the
    // record's own badge. With nothing saved only the heading is there.
    await expect(page.getByText('Current encounter', { exact: true })).toHaveCount(2);

    await page.goto(chartUrl);
    await expect(page.getByRole('tab', { name: 'Hypertension', exact: true })).toBeVisible();
    await expect(page.getByText('Latest hypertension assessment')).toBeVisible();

    await page.getByRole('tab', { name: 'Hypertension', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=hypertension/);
    await expect(history).toBeVisible();
    await expect(page.getByText('Newly elevated BP').first()).toBeVisible();
    await expect(page.getByText('162/98 mmHg').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Open source visit/ }).first()).toBeVisible();

    // Offline, the section falls back to what this device synced, and says so.
    await page.goto(chartUrl);
    await expect(page.getByRole('heading', { name: 'Needs you now' })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('tab', { name: 'Hypertension', exact: true }).click();
    await expect(page.getByText('Showing records saved on this device')).toBeVisible();
    await expect(page.getByText('Newly elevated BP').first()).toBeVisible();
    await expect(page.getByText('162/98 mmHg').first()).toBeVisible();
    await context.setOffline(false);
  });
});
