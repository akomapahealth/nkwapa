const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');

/*
  Issue #116: a volunteer can see the clinic's patient reminders and schedule a follow-up reminder
  for a patient, without becoming a free-text messaging channel and without seeing staff notices.
*/
test.use({ storageState: storageStateFor('volunteer') });

function inDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const lastName = `Remind-${suffix}`;
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Follow');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-REM-${suffix}`);
  await page.getByPlaceholder('024 123 4567').fill('0241234567');
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  return { clinicId, patientId };
}

test('a volunteer schedules a follow-up reminder and sees it in the ledger', async ({ page }) => {
  const patient = await createPatient(page);

  const card = page.getByTestId('schedule-follow-up-reminder');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByLabel('Return on').fill(inDays(14));
  await card.getByRole('button', { name: 'Schedule reminder' }).click();
  await expect(card.getByText(/Reminder scheduled by SMS/)).toBeVisible({ timeout: 20_000 });

  // The nav entry and the page are reachable as a volunteer.
  await page
    .getByRole('link', { name: /Notifications/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();

  const ledger = await apiRequestAs('volunteer', 'get', `/clinics/${patient.clinicId}/reminders`, {
    clinicId: patient.clinicId,
  });
  expect(ledger.ok()).toBeTruthy();
  const rows = ledger.json().items;
  expect(
    rows.some(
      (row) => row.patientId === patient.patientId && row.templateKey === 'FOLLOWUP_REMINDER_V1',
    ),
  ).toBe(true);
  // Staff lifecycle notices are about colleagues, not patients.
  expect(rows.every((row) => row.patientId !== null)).toBe(true);
});

test('the reminder route takes a date and nothing that could become a message', async ({
  page,
}) => {
  const patient = await createPatient(page);
  const path = `/clinics/${patient.clinicId}/patients/${patient.patientId}/reminders/follow-up`;

  const freeText = await apiRequestAs('volunteer', 'post', path, {
    clinicId: patient.clinicId,
    data: { followUpDate: inDays(7), message: 'Hello from the clinic' },
  });
  expect(freeText.status()).toBe(400);

  const past = await apiRequestAs('volunteer', 'post', path, {
    clinicId: patient.clinicId,
    data: { followUpDate: inDays(-3) },
  });
  expect(past.status()).toBe(400);

  // A patient who is not this clinic's is not found, whatever the volunteer's seat.
  const elsewhere = await apiRequestAs(
    'volunteer',
    'post',
    `/clinics/${patient.clinicId}/patients/${randomUUID()}/reminders/follow-up`,
    { clinicId: patient.clinicId, data: { followUpDate: inDays(7) } },
  );
  expect(elsewhere.status()).toBe(404);
});

test('a reminder can be cancelled by whoever scheduled it, or a manager, while it waits', async ({
  page,
}) => {
  const patient = await createPatient(page);

  // Undo straight from the chart, for a wrong date.
  const card = page.getByTestId('schedule-follow-up-reminder');
  await card.getByLabel('Return on').fill(inDays(10));
  await card.getByRole('button', { name: 'Schedule reminder' }).click();
  await expect(card.getByText(/Reminder scheduled by SMS/)).toBeVisible({ timeout: 20_000 });
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.getByText('Reminder cancelled. Nothing will be sent.')).toBeVisible();

  const schedule = async () => {
    const res = await apiRequestAs(
      'volunteer',
      'post',
      `/clinics/${patient.clinicId}/patients/${patient.patientId}/reminders/follow-up`,
      { clinicId: patient.clinicId, data: { followUpDate: inDays(20) } },
    );
    expect(res.ok(), res.text()).toBeTruthy();
    return res.json().items[0].id;
  };
  const cancelAs = (role, id) =>
    apiRequestAs(role, 'post', `/clinics/${patient.clinicId}/reminders/${id}/cancel`, {
      clinicId: patient.clinicId,
    });

  // A doctor who did not schedule it may not cancel it; a manager may.
  const reminderId = await schedule();
  expect((await cancelAs('doctor', reminderId)).status()).toBe(403);
  const byManager = await cancelAs('staff', reminderId);
  expect(byManager.ok(), byManager.text()).toBeTruthy();
  expect(byManager.json()).toMatchObject({ status: 'FAILED', failureReason: 'CANCELLED_BY_STAFF' });

  // Once cancelled it is not waiting any more.
  const again = await cancelAs('volunteer', reminderId);
  expect(again.status()).toBe(409);
  expect(again.json().code).toBe('REMINDER_NOT_QUEUED');
});
