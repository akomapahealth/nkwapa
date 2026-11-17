const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');

/*
  Issue #338: the follow-up worklist. A danger sign makes a patient Urgent, which books one call
  within 48 hours. A volunteer finds it under This week, records an unanswered call in two taps,
  then reaches the patient, ticks a danger sign (the urgent warning shows before saving) and saves.
  The contact moves to Done and the chart lists the attempts. One unanswered call is recorded
  offline and sends on reconnect. Seeds its own patient.
*/
test.skip(
  process.env.FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED !== 'true' ||
    process.env.NEXT_PUBLIC_FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED !== 'true',
  'Runs only with the follow-up stratification flag on (API and web).',
);
test.use({ storageState: storageStateFor('volunteer') });

test('a volunteer works an urgent confirmation call from the worklist', async ({
  page,
  context,
}) => {
  const whoami = (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json();
  const clinicId = whoami.activeClinicId;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const lastName = `Worklist-${suffix}`;

  const patient = await apiRequestAs('volunteer', 'post', `/clinics/${clinicId}/patients`, {
    clinicId,
    headers: { 'Idempotency-Key': randomUUID() },
    data: {
      firstName: 'Kojo',
      lastName,
      nationalIdType: 'NATIONAL_ID',
      nationalId: `E2E-WORK-${suffix}`,
      phoneE164: '+233201234567',
    },
  });
  expect(patient.ok()).toBe(true);
  const patientId = patient.json().id;
  const encounter = await apiRequestAs('volunteer', 'post', `/clinics/${clinicId}/encounters`, {
    clinicId,
    headers: { 'Idempotency-Key': randomUUID() },
    data: { patientId },
  });
  expect(encounter.ok()).toBe(true);
  // 400 mg/dL is a danger sign: the tier goes Urgent and books the confirmation call.
  const reading = await apiRequestAs(
    'volunteer',
    'put',
    `/clinics/${clinicId}/encounters/${encounter.json().id}/diabetes-screening/glucose`,
    {
      clinicId,
      headers: { 'Idempotency-Key': randomUUID() },
      data: { glucoseMgDl: 400, glucoseType: 'RANDOM', collectedAt: new Date().toISOString() },
    },
  );
  expect(reading.ok()).toBe(true);

  await page.goto('/follow-up?tab=week');
  await page.getByLabel('Search by patient name or code').fill(lastName);
  const row = page.getByRole('row').filter({ hasText: lastName });
  await expect(row).toContainText('Confirm they reached care', { timeout: 20_000 });
  await expect(row).toContainText('Urgent');

  // Not reached: two taps, and the contact stays on the list.
  await row.getByRole('button', { name: 'Record' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.locator('a[href="tel:+233201234567"]')).toBeVisible();
  await sheet.getByRole('button', { name: 'Not reached' }).click();
  await sheet.getByRole('button', { name: 'No answer' }).click();
  await expect(sheet).toBeHidden();
  await expect(row).toContainText('Last: not reached');

  // Offline: the list stays, and a call is kept on the device until it reconnects.
  await context.setOffline(true);
  await row.getByRole('button', { name: 'Record' }).click();
  await sheet.getByRole('button', { name: 'Not reached' }).click();
  await sheet.getByRole('button', { name: 'Phone off' }).click();
  await expect(sheet).toBeHidden();
  await expect(row).toContainText('Call saved on this device');
  await context.setOffline(false);
  await expect(row).not.toContainText('Call saved on this device', { timeout: 30_000 });
  await expect(row).toContainText('(2 tries)', { timeout: 20_000 });

  // Reached: a danger sign warns before saving, then the contact is done.
  await row.getByRole('button', { name: 'Record' }).click();
  await sheet.getByRole('button', { name: 'Reached them' }).click();
  await sheet.getByText('Chest pain', { exact: true }).click();
  await expect(sheet.getByTestId('contact-urgent')).toHaveText(
    'Urgent: they need to be seen today.',
  );
  await sheet.getByText('Explained their result', { exact: true }).click();
  await sheet.getByRole('button', { name: 'Save contact' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: lastName })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Done' }).click();
  await page.getByLabel('Search by patient name or code').fill(lastName);
  await expect(page.getByRole('row').filter({ hasText: lastName })).toContainText(
    'Confirm they reached care',
  );

  // The chart lists both attempts.
  await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=overview`);
  const contacts = page.getByRole('region', { name: 'Follow-up contacts' });
  await contacts.getByText('3 recorded attempts').click();
  await expect(contacts).toContainText('Not reached: no answer');
  await expect(contacts).toContainText('Reached');
});
