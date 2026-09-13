const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/**
 * The supervising clinician's half of the interview, from both sides of the boundary.
 *
 * The clinical specification says this part shows only for the doctor. The API refuses the route
 * independently and the sync pull withholds the columns, so this covers the third layer: what a
 * volunteer can see on screen. It is asserted as absent rather than disabled, because a disabled
 * section still tells a volunteer what a doctor may do.
 *
 * Run as the scoped `volunteer` and `doctor` identities rather than `staff`, which holds every
 * role at once and so can never show that one seat lacks something.
 */
async function openHypertensionTab(page, label) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill(label);
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-PLAN-${suffix}`);
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
  return encounterId;
}

test.describe('as a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('neither the clinician plan nor the classification override is on the page', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openHypertensionTab(page, 'PlanVolunteer');

    await expect(
      page.getByRole('heading', { name: /supervising clinician assessment and plan/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save plan' })).toHaveCount(0);
    await expect(
      page.getByRole('checkbox', { name: 'Record a different classification' }),
    ).toHaveCount(0);

    // The interview itself is theirs to complete.
    await expect(page.getByRole('button', { name: 'Save assessment' })).toBeVisible();
  });
});

test.describe('as a doctor', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('the clinician plan records, and a follow-up window says it will schedule', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openHypertensionTab(page, 'PlanDoctor');

    await expect(
      page.getByRole('heading', { name: /supervising clinician assessment and plan/i }),
    ).toBeVisible();

    // The screening has to exist before a plan can hang off it.
    await page.getByRole('button', { name: 'Save assessment' }).click();
    await expect(page.getByText(/saved (and synced|on this device)/i)).toBeVisible();

    await page.getByRole('checkbox', { name: 'Adjust medication' }).check();
    await page.getByLabel('BP goal systolic (mmHg)').fill('130');
    await page.getByLabel('BP goal diastolic (mmHg)').fill('80');

    await page.getByLabel('Follow-up', { exact: true }).click();
    await page.getByRole('option', { name: 'Within 1 month', exact: true }).click();
    // The window is the input; a concrete date is what schedules the reminder on finalize.
    await expect(page.getByText(/schedules the patient.s follow-up reminder/i)).toBeVisible();

    await page.getByLabel('Follow-up owner').click();
    await page.getByRole('option', { name: 'Akomapa team', exact: true }).click();

    await page.getByRole('button', { name: 'Save plan' }).click();
    await expect(page.getByText('Plan saved.')).toBeVisible();
  });

  /*
    Seeded from the derivation rather than from "Not classified".

    A clinician ticking the box is disagreeing about a degree, not starting from nothing, so
    defaulting to UNKNOWN would make the safe first save a deletion of the finding.
  */
  test('the classification override starts from what the reading implies', async ({ page }) => {
    test.setTimeout(120_000);
    await openHypertensionTab(page, 'PlanOverride');

    const override = page.getByRole('checkbox', { name: 'Record a different classification' });
    const control = page.locator('#htn-classification');
    await expect(override).toBeVisible();
    await expect(control).toHaveCount(0);

    await override.check();
    await expect(control).toBeVisible();
    // No vitals recorded, so the derivation is "Not classified" and the override matches it.
    await expect(control).toHaveText(/not classified/i);
  });
});
