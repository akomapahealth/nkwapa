const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Vitals');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-VITALS-${suffix}`);
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
  await expect(page.getByRole('button', { name: 'Continue to Vitals' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Vitals' }).click();
  return encounter.id;
}

async function chooseOption(page, label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function fillMeasurements(page) {
  await page.getByLabel('Systolic BP (mmHg)').fill('120');
  await page.getByLabel('Diastolic BP (mmHg)').fill('80');
  await chooseOption(page, 'Measurement site', 'Left arm');
  await chooseOption(page, 'Patient position', 'Sitting');
  await chooseOption(page, 'Cuff size', 'Adult');
  await page.getByLabel('Pulse (bpm)').fill('72');
  await page.getByLabel('Respiratory rate (/min)').fill('16');
  await page.getByLabel('SpO₂ (%)').fill('98');
  await page.getByLabel('Temperature (°C)').fill('37');
  await chooseOption(page, 'Temperature source', 'Oral');
  await page.getByLabel('Weight (kg)').fill('70');
  await page.getByLabel('Height (cm)').fill('170');
  await chooseOption(page, 'Smoking status', 'Never');
  await chooseOption(page, 'Smokeless tobacco', 'Not assessed');
  await chooseOption(page, 'Passive exposure', 'No');
  await chooseOption(page, 'Readiness to quit', 'Not applicable');
  await chooseOption(page, 'Counseling given', 'No');
}

test('expanded vitals save, replay offline, review, finalize, and stay responsive', async ({
  page,
  context,
}) => {
  const patientId = await createPatient(page);
  const encounterId = await createEncounter(page, patientId);

  await page.getByLabel('Systolic BP (mmHg)').fill('120');
  await page.getByRole('button', { name: 'Save measurements' }).click();
  await expect(
    page.getByText('Enter systolic and diastolic blood pressure together.').first(),
  ).toBeVisible();

  await fillMeasurements(page);
  await expect(page.getByText('24.2', { exact: true })).toBeVisible();
  const onlinePush = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/sync/push',
  );
  await page.getByRole('button', { name: 'Save measurements' }).click();
  expect((await onlinePush).ok()).toBeTruthy();

  await page.goto(`/encounters/${encounterId}`);
  await expect(page.getByLabel('Pulse (bpm)')).toHaveValue('72');
  await expect(page.getByText('24.2', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.getByLabel('Pulse (bpm)').fill('80');
  await chooseOption(page, 'Smoking status', 'Current');
  await page.getByRole('button', { name: 'Save measurements' }).click();
  await expect(page.getByText('Measurements saved on this device and pending sync.')).toBeVisible();

  const queuedBundles = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('outbox', 'readonly');
          const count = transaction.objectStore('outbox').count();
          count.onerror = () => reject(count.error);
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  expect(queuedBundles).toBeGreaterThan(0);

  const reconnectPush = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/sync/push',
  );
  await context.setOffline(false);
  expect((await reconnectPush).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('Pulse (bpm)')).toHaveValue('80');

  const reviewPush = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/sync/push',
  );
  await page.getByRole('button', { name: 'Mark tobacco reviewed' }).click();
  expect((await reviewPush).ok()).toBeTruthy();
  await expect(page.getByText(/Reviewed \d/)).toBeVisible();

  await page.getByLabel('Systolic BP (mmHg)').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Diastolic BP (mmHg)')).toBeFocused();

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

  await page.getByRole('button', { name: 'Submit for Review' }).click();
  await page.getByRole('button', { name: 'Mark Reviewed' }).click();
  await page.getByRole('button', { name: 'Finalize' }).click();
  await expect(page.getByRole('heading', { name: 'Clinical measurements' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save measurements' })).toHaveCount(0);
  await expect(page.getByText('80 bpm', { exact: true })).toBeVisible();
});
