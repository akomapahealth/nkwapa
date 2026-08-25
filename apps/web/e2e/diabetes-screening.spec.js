const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const { waitForOutboxDrain } = require('../playwright/outbox');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name *').fill('Diabetes');
  await page.getByLabel('Last name *').fill(`E2E-${suffix}`);
  await page.getByLabel('National ID *').fill(`E2E-DIABETES-${suffix}`);
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
  await page.getByLabel('Glucose context').click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function saveAndSync(page) {
  await page.getByRole('button', { name: 'Save diabetes screening' }).click();
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

  await page.getByLabel('Glucose (mg/dL)').fill('601');
  await page.getByRole('button', { name: 'Save diabetes screening' }).click();
  await expect(page.getByText('Glucose must be a whole number from 0 to 600 mg/dL.')).toBeVisible();

  await page.getByLabel('Glucose (mg/dL)').fill('126');
  await chooseContext(page, 'Fasting');
  await page.getByLabel('HbA1c (%)').fill('6.5');
  await page.getByLabel('Polyuria').check();
  await page.getByLabel('Clinical notes').fill('First encounter screening');
  await saveAndSync(page);

  await expect(page.getByRole('button', { name: 'Save diabetes screening' })).toBeEnabled();
  await page.getByLabel('Glucose (mg/dL)').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Glucose context')).toBeFocused();

  await page.getByRole('button', { name: 'Submit for Review' }).click();
  await page.getByRole('button', { name: 'Mark Reviewed' }).click();
  await page.getByRole('button', { name: 'Finalize' }).click();
  await page.getByRole('tab', { name: 'Diabetes' }).click();
  await expect(page.getByText('This screening is read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save diabetes screening' })).toHaveCount(0);

  const secondEncounterId = await createEncounter(page, patientId);
  expect(secondEncounterId).not.toBe(firstEncounterId);
  await page.getByLabel('Glucose (mg/dL)').fill('170');
  await chooseContext(page, 'Unknown / not documented');
  await page.getByLabel('Fatigue').check();
  await page.getByLabel('Clinical notes').fill('Second encounter screening');
  await saveAndSync(page);

  await context.setOffline(true);
  await page.getByLabel('Clinical notes').fill('Second encounter screening updated offline');
  await page.getByRole('button', { name: 'Save diabetes screening' }).click();
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
