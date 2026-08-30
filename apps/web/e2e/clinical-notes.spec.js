const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

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
  await page.getByRole('button', { name: 'Continue to Vitals' }).click();
  return encounter.id;
}

test('doctor authors, signs, amends, and securely loses note access offline', async ({
  page,
  context,
}) => {
  const encounterId = await createEncounter(page);
  await page.goto(`/encounters/${encounterId}?tab=clinical-note`);
  await page.getByRole('tab', { name: 'Clinical Note' }).click();

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
