const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const { answer, question } = require('../playwright/interview');
const { waitForOutboxDrain } = require('../playwright/outbox');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Diabetes');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-DIABETES-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  return page.url().split('/').at(-1);
}

async function createEncounter(page, patientId) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/clinics\/[^/]+\/encounters$/.test(new URL(response.url()).pathname),
  );
  await page.goto(`/patients/${patientId}/encounters/new`);
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const encounter = await response.json();
  await page.goto(`/encounters/${encounter.id}`);
  await page.getByRole('tab', { name: 'Diabetes' }).click();
  return encounter.id;
}

async function chooseContext(page, option) {
  await answer(page, 'When was the sample taken?', option);
}

async function saveAndSync(page) {
  await page.getByRole('button', { name: 'Save screening' }).click();
  // Waiting for a push response would catch whichever pass happened to be in flight, which may
  // predate this save. The queue draining is the thing that actually means "it reached the server".
  await waitForOutboxDrain(page, expect, { entityType: 'diabetes_screening' });
}

test('diabetes screening round-trips longitudinally, offline, read-only, and responsively', async ({
  page,
  context,
}) => {
  // Multi-phase: two encounters, a finalize, an offline edit, and a reconnect round-trip.
  test.setTimeout(150_000);
  const patientId = await createPatient(page);
  const firstEncounterId = await createEncounter(page, patientId);

  // The seeded clinic is in Ghana, so glucose is typed in mmol/L. A mg/dL number is refused.
  await page.getByLabel("Today's glucose (mmol/L)").fill('126');
  await page.getByRole('button', { name: 'Save screening' }).click();
  await expect(
    page.getByText('Enter a reading from 0 to 33.3 mmol/L, to one decimal place.'),
  ).toBeVisible();

  // A meter reading mg/dL can switch this entry; the reading converts rather than changing
  // meaning, and switching back restores it.
  await page.getByLabel("Today's glucose (mmol/L)").fill('7.0');
  await page.getByRole('combobox', { name: 'Glucose unit' }).click();
  await page.getByRole('option', { name: 'mg/dL', exact: true }).click();
  await expect(page.getByLabel("Today's glucose (mg/dL)")).toHaveValue('126');
  await page.getByRole('combobox', { name: 'Glucose unit' }).click();
  await page.getByRole('option', { name: 'mmol/L', exact: true }).click();
  await expect(page.getByLabel("Today's glucose (mmol/L)")).toHaveValue('7');
  await chooseContext(page, 'Fasting');
  // The value only appears once the status says one is known, which is what stops a record
  // holding both a number and "never checked".
  await answer(page, 'Most recent HbA1c', 'Value known');
  await page.getByLabel('HbA1c (%)').fill('6.5');
  await page.getByLabel('Frequent urination').check();
  await page.getByLabel('Notes').fill('First encounter screening');
  await saveAndSync(page);

  await expect(page.getByRole('button', { name: 'Save screening' })).toBeEnabled();
  await page.getByLabel("Today's glucose (mmol/L)").focus();
  // The reading's own unit switch comes next, then the sample timing.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Glucose unit' })).toBeFocused();
  await page.keyboard.press('Tab');
  // A radio group takes focus on its picked answer.
  await expect(
    question(page, 'When was the sample taken?').getByRole('radio', {
      name: 'Fasting',
      exact: true,
    }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'Submit for Review' }).click();
  await page.getByRole('button', { name: 'Mark Reviewed' }).click();
  await page.getByRole('button', { name: 'Finalize' }).click();
  await page
    .getByRole('dialog', { name: 'Finalize this visit?' })
    .getByRole('button', { name: 'Finalize visit' })
    .click();
  await page.getByRole('tab', { name: 'Diabetes' }).click();
  await expect(page.getByText('This screening is read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save screening' })).toHaveCount(0);

  const secondEncounterId = await createEncounter(page, patientId);
  expect(secondEncounterId).not.toBe(firstEncounterId);
  await page.getByLabel("Today's glucose (mmol/L)").fill('9.4');
  // The interview refuses a reading with no timing: an unknown-context glucose is never
  // classified, so storing one would record a number nobody can act on.
  await chooseContext(page, 'Random');
  await page.getByLabel('Fatigue').check();
  await page.getByLabel('Notes').fill('Second encounter screening');
  await saveAndSync(page);

  await context.setOffline(true);
  await page.getByLabel('Notes').fill('Second encounter screening updated offline');
  await page.getByRole('button', { name: 'Save screening' }).click();
  await expect(
    page.getByText('Diabetes screening saved on this device and pending sync.'),
  ).toBeVisible();

  await context.setOffline(false);
  // The queued edit is gone from the outbox only once the server reported it applied, so this is
  // proof it landed rather than a guess about timing.
  await waitForOutboxDrain(page, expect, { entityType: 'diabetes_screening' });

  // One navigation, with a short poll only for read-after-write lag.
  await expect(async () => {
    await page.goto(`/patients/${patientId}`);
    await page.getByRole('tab', { name: 'Diabetes' }).click();
    await expect(page.getByText('First encounter screening')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Second encounter screening updated offline')).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 30_000 });

  await expect(page.getByRole('link', { name: 'Open source visit' })).toHaveCount(2);

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
  }
});

/**
 * The two symptom lists answer different questions, and only one of them stops a visit.
 *
 * `symptoms` asks about the past month; the urgent list asks about this minute. The clinical
 * specification names vomiting, confusion, difficulty breathing and loss of consciousness as
 * requiring immediate review while listing none of them in its own checklist.
 */
/**
 * The refetch that follows a save must not overwrite what was typed while it was in flight.
 *
 * The encounter page passes `onSaved={fetchData}`, so every save hands this form a fresh object
 * for the same record. The form re-seeded itself from it, which reset every answer entered since
 * the save -- with the save message still reporting success, and nothing on screen to say the
 * entry had been discarded. It surfaced as an intermittent failure of the offline round-trip
 * above, where the replayed edit carried the previous answers.
 *
 * Held open deliberately rather than raced: without the delay this passes by luck whenever the
 * refetch happens to land first.
 */
test('a refetch landing mid-edit does not discard what was typed', async ({ page }) => {
  test.setTimeout(150_000);
  const patientId = await createPatient(page);
  const encounterId = await createEncounter(page, patientId);

  await page.getByLabel("Today's glucose (mmol/L)").fill('8.3');
  await chooseContext(page, 'Random');
  await page.getByLabel('Notes').fill('Saved answer');
  await saveAndSync(page);

  let release = () => {};
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`**/encounters/${encounterId}`, async (route) => {
    await held;
    await route.continue();
  });

  // Save again so a refetch is in flight, then answer while it is.
  await page.getByRole('button', { name: 'Save screening' }).click();
  await page.getByLabel('Notes').fill('Typed while the refetch was in flight');
  await page.getByLabel("Today's glucose (mmol/L)").fill('8.6');

  release();

  await expect(page.getByLabel('Notes')).toHaveValue('Typed while the refetch was in flight');
  await expect(page.getByLabel("Today's glucose (mmol/L)")).toHaveValue('8.6');

  // And the answers that survived on screen are the ones that reach the server.
  await saveAndSync(page);
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('tab', { name: 'Diabetes' }).click();
  await expect(page.getByText('Typed while the refetch was in flight')).toBeVisible();
});

test('an urgent symptom escalates, and a past-month symptom does not', async ({ page }) => {
  test.setTimeout(120_000);
  const patientId = await createPatient(page);
  await createEncounter(page, patientId);

  const notice = page.getByText(/this visit needs a clinician now/i);
  await expect(notice).toBeHidden();

  // A month-ago symptom is worth recording and is not an emergency.
  await page.getByLabel('Fatigue').check();
  await expect(notice).toBeHidden();

  await page.getByLabel('Vomiting').check();
  await expect(notice).toBeVisible();

  await page.getByRole('button', { name: /add to the reasons for clinician review/i }).click();
  await expect(page.getByRole('checkbox', { name: 'Hyperglycemia symptoms' })).toBeChecked();
});

/**
 * PHQ-2 is scored only once both items are answered.
 *
 * A running total over one answer reads as a completed screen sitting halfway to the cut-off,
 * which is the misreading the nullable column exists to prevent.
 */
test('the PHQ-2 score appears only when the screen is complete, and alerts at the cut-off', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const patientId = await createPatient(page);
  await createEncounter(page, patientId);

  await expect(page.getByText(/score appears once both questions are answered/i)).toBeVisible();

  await answer(page, 'Little interest or pleasure in doing things?', 'Nearly every day');
  await expect(page.getByText(/score appears once both questions are answered/i)).toBeVisible();
  await expect(page.getByText(/PHQ-2 score/)).toBeHidden();

  await answer(page, 'Feeling down, depressed, or hopeless?', 'Several days');

  await expect(page.getByText('PHQ-2 score:')).toBeVisible();
  await expect(page.getByText('4 / 6')).toBeVisible();
  await expect(page.getByText(/should be reviewed by a clinician/i)).toBeVisible();
});
