const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/*
  Issue #336: the live follow-up tier. A very high reading warns on the form as it is typed, the
  saved reading moves the chart's tier, and the registry filters by tier. Needs the follow-up flag
  on in both the API and the web build, which the e2e CI job sets.
*/
test.skip(
  process.env.FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED !== 'true' ||
    process.env.NEXT_PUBLIC_FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED !== 'true',
  'Runs only with the follow-up stratification flag on (API and web).',
);

test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const lastName = `Tier-${suffix}`;
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Follow');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-TIER-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  return { chartUrl: new URL(page.url()).pathname, id: page.url().split('/').at(-1), lastName };
}

async function chooseOption(page, label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

test('a very high reading warns as typed, sets the tier, and the registry filters by it', async ({
  page,
}) => {
  const patient = await createPatient(page);
  // Nothing saved yet: the chart says so rather than guessing.
  await expect(page.getByTestId('follow-up-tier')).toContainText('Not yet tiered');

  await page.goto(`/patients/${patient.id}/encounters/new`);
  await page.getByRole('button', { name: 'Continue to vitals' }).click();

  await page.getByLabel('Systolic BP (mmHg)').fill('186');
  await page.getByLabel('Diastolic BP (mmHg)').fill('114');
  await expect(page.getByTestId('danger-sign-repeat')).toBeVisible();

  await chooseOption(page, 'Measurement site', 'Left arm');
  await chooseOption(page, 'Patient position', 'Sitting');
  await chooseOption(page, 'Cuff size', 'Adult');
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/sync/push',
  );
  await page.getByRole('button', { name: 'Save measurements' }).click();
  expect((await saved).ok()).toBeTruthy();

  // Very high with no danger symptom recorded is High, not Urgent: repeat and assess promptly.
  await page.goto(patient.chartUrl);
  const tier = page.getByTestId('follow-up-tier');
  await expect(tier).toContainText('High');
  await tier.getByRole('button', { name: 'Show help: Why this tier' }).click();
  await expect(page.getByRole('tooltip')).toContainText('Repeat the blood pressure now');

  await page.goto('/patients');
  await page.getByLabel('Name, patient code, phone or ID last 4').fill(patient.lastName);
  await page.getByRole('button', { name: 'Filter patients', exact: true }).click();
  await chooseOption(page, 'Follow-up tier', 'High');
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await expect(page).toHaveURL(/riskTier=HIGH/);
  // The search chip repeats the name, so look for the row's link to the chart instead.
  const row = page.locator(`a[href*="${patient.id}"]`);
  await expect(row.first()).toBeAttached();

  await page.getByRole('button', { name: 'Remove Tier filter' }).click();
  await page.getByRole('button', { name: 'Filter patients', exact: true }).click();
  await chooseOption(page, 'Follow-up tier', 'Low');
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await expect(page).toHaveURL(/riskTier=LOW/);
  await expect(row).toHaveCount(0);
});
