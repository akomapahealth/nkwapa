const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const { chooseAnswer, question } = require('../playwright/interview');

const { storageStateFor } = require('../playwright/roles');
test.use({ storageState: storageStateFor('staff') });

async function createEncounter(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Clinical');
  await page.getByLabel('Last name', { exact: true }).fill(`Note-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-NOTE-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const patientId = page.url().split('/').at(-1);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/clinics\/[^/]+\/encounters$/.test(new URL(response.url()).pathname),
  );
  await page.goto(`/patients/${patientId}/encounters/new`);
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const encounter = await response.json();
  await page.getByRole('button', { name: 'Continue to vitals' }).click();
  return encounter.id;
}

test('doctor authors, signs, amends, and securely loses note access offline', async ({
  page,
  context,
}) => {
  const encounterId = await createEncounter(page);
  await page.goto(`/encounters/${encounterId}?tab=clinical-note`);
  await page.getByRole('tab', { name: 'Clinical note' }).click();

  await expect(page.getByText('No HAP note for this encounter', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start HAP note' }).click();

  await page.getByLabel('History').fill('Patient reports intermittent headache for two days.');
  await page.getByLabel('Assessment').fill('Stable examination with no red-flag symptoms.');
  await page.getByLabel('Plan').fill('Hydration, return precautions, and follow-up in one week.');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await expect(page.getByText('Draft saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign note' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Submit this HAP note?' });
  await expect(confirmation).toContainText('Future corrections must be appended as addenda');
  await confirmation.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Cosigned', { exact: true })).toBeVisible();
  await expect(page.getByText('Note signed. Its content is now immutable.')).toBeVisible();
  await expect(page.getByLabel('History')).toHaveCount(0);

  await page.getByRole('button', { name: 'Add addendum' }).click();
  const addendum = page.getByRole('dialog', { name: 'Append an addendum' });
  await addendum.getByLabel('Reason').fill('Follow-up clarification');
  await addendum.getByLabel('Addendum').fill('Follow-up may occur sooner if symptoms worsen.');
  await addendum.getByRole('button', { name: 'Append addendum' }).click();
  await expect(page.getByText('Amended', { exact: true })).toBeVisible();
  await expect(page.getByText('Follow-up clarification')).toBeVisible();

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

  await context.setOffline(true);
  await expect(page.getByText('Clinical notes require a secure connection')).toBeVisible();
  await expect(page.getByText('Patient reports intermittent headache for two days.')).toHaveCount(
    0,
  );
  await context.setOffline(false);
});

/**
 * The generated draft.
 *
 * Composed server-side from the encounter's interviews and written through the ordinary draft
 * path, so every note invariant still decides whether it lands. The clinician edits and signs it;
 * nothing here is signed automatically.
 */
test('the note can be drafted from the interviews, and regenerating is safe', async ({ page }) => {
  test.setTimeout(150_000);
  const encounterId = await createEncounter(page);
  // The helper continues into the vitals step; land on the encounter itself.
  await page.goto(`/encounters/${encounterId}`);

  // Record something for the generator to describe.
  await page.getByRole('tab', { name: 'Hypertension' }).click();
  await chooseAnswer(question(page, 'Hypertension status'), 'Known hypertension');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText(/saved (and synced|on this device)/i)).toBeVisible();

  await page.getByRole('tab', { name: 'Clinical note' }).click();
  await page.getByRole('button', { name: 'Draft from the interviews' }).click();

  await expect(page.getByText(/Draft written from the interviews/i)).toBeVisible();
  const history = page.getByLabel('History');
  await expect(history).toContainText('was seen for a hypertension follow-up');
  await expect(history).toContainText('known hypertension');

  /*
    Regeneration replaces rather than appends.

    A patient with both conditions has two interviews; appending would duplicate a section every
    time the button was pressed. Pressing it twice must produce the same note.
  */
  const first = await history.inputValue();
  await page.getByRole('button', { name: 'Draft from the interviews' }).click();
  // Replacing typed text asks first, in the app's own dialog rather than the browser's.
  await page
    .getByRole('dialog', { name: 'Replace the draft?' })
    .getByRole('button', { name: 'Replace draft' })
    .click();
  await expect(page.getByText(/Draft written from the interviews/i)).toBeVisible();
  expect(await history.inputValue()).toBe(first);

  // It is a draft, not a signed note: the clinician still reviews and submits.
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
});

/* Replacing text somebody typed is destructive, so it asks first. */
test('regenerating over an edited draft asks before discarding it', async ({ page }) => {
  test.setTimeout(150_000);
  const encounterId = await createEncounter(page);
  await page.goto(`/encounters/${encounterId}`);

  await page.getByRole('tab', { name: 'Hypertension' }).click();
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText(/saved (and synced|on this device)/i)).toBeVisible();

  await page.getByRole('tab', { name: 'Clinical note' }).click();
  await page.getByRole('button', { name: 'Start HAP note' }).click();
  await page.getByLabel('History').fill('Typed by the clinician.');

  await page.getByRole('button', { name: 'Draft from the interviews' }).click();
  const confirm = page.getByRole('dialog', { name: 'Replace the draft?' });
  await expect(confirm).toContainText(/is lost/i);
  // The safe choice has focus, so a reflexive Enter keeps the typing.
  await expect(confirm.getByRole('button', { name: 'Keep it' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Keep it' }).click();
  await expect(confirm).toHaveCount(0);

  await expect(page.getByLabel('History')).toHaveValue('Typed by the clinician.');
});

/* R4.1: a note waiting on this doctor says so first, and cosigning still asks before freezing it. */
test('a note awaiting this doctor leads with the cosign band', async ({ page }) => {
  const encounterId = await createEncounter(page);
  const whoami = page.waitForResponse((response) => response.url().includes('/auth/whoami'));
  await page.route(/\/clinical-note$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const { userId } = await (await whoami).json();
    return route.fulfill({
      json: {
        id: 'synthetic-note',
        clinicId: 'c',
        patientId: 'p',
        encounterId,
        status: 'PENDING_COSIGN',
        version: 2,
        history: 'Synthetic history.',
        assessment: 'Synthetic assessment.',
        plan: 'Synthetic plan.',
        authorUserId: 'synthetic-volunteer',
        authorRole: 'VOLUNTEER',
        author: { id: 'synthetic-volunteer', displayName: 'Synthetic Volunteer' },
        assignedDoctor: { id: userId, displayName: 'Synthetic Doctor' },
        assignedVolunteerNameSnapshot: 'Synthetic Volunteer',
        assignedDoctorNameSnapshot: 'Synthetic Doctor',
        submittedAt: '2026-11-10T09:40:00Z',
        createdAt: '2026-11-10T09:00:00Z',
        updatedAt: '2026-11-10T09:40:00Z',
        addenda: [],
      },
    });
  });
  await page.goto(`/encounters/${encounterId}?tab=clinical-note`);
  await page.getByRole('tab', { name: 'Clinical note' }).click();

  const band = page.getByRole('region', { name: 'Waiting for your cosign' });
  await expect(band).toBeVisible();
  await expect(page.getByText('Synthetic history.')).toBeVisible();
  await expect(page.getByLabel('History')).toHaveCount(0);
  // Submission time is shown in Accra time (UTC+0): 09:40Z.
  await expect(page.getByText('Nov 10, 9:40 AM')).toBeVisible();

  await band.getByRole('button', { name: 'Cosign note' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cosign this HAP note?' });
  await expect(dialog).toContainText('the note Synthetic Volunteer wrote');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Pending cosign', { exact: true })).toBeVisible();
});
