const { randomUUID } = require('crypto');
const { readFile } = require('fs/promises');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const { clearMailpitInbox, findMessageTo, messageContent } = require('../playwright/mailpit');

/** Referral report (#344): a locked PDF, its passcode shown once, nothing about the patient in mail. */

async function createPatient(page) {
  const lastName = `Referral${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Akosua');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-REF-${lastName}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(lastName) })).toBeVisible({
    timeout: 30_000,
  });
  return lastName;
}

async function openSheet(page) {
  await page.getByRole('button', { name: 'Referral report' }).click();
  const sheet = page.getByRole('dialog', { name: 'Referral report' });
  await expect(sheet.getByRole('checkbox', { name: /At a glance/ })).toBeChecked();
  return sheet;
}

test.describe('doctor', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('makes a locked PDF and shows the passcode once', async ({ page }) => {
    const lastName = await createPatient(page);
    const sheet = await openSheet(page);

    // Nothing is sent until the reason and the patient's agreement are given.
    await sheet.getByRole('button', { name: 'Make report' }).click();
    await expect(sheet.getByText('Say why the patient is being referred.')).toBeVisible();
    await expect(
      sheet.getByText('Confirm the patient agreed to this referral today.'),
    ).toBeVisible();
    await expect(sheet.getByRole('checkbox', { name: /Signed clinical notes/ })).not.toBeChecked();

    await sheet.getByLabel('Reason for referral').fill('Raised blood pressure on two visits.');
    await sheet.getByRole('button', { name: 'Urgent' }).click();
    await sheet.getByLabel('Facility').fill('Regional Hospital');
    await sheet.getByRole('checkbox', { name: /The patient agreed today/ }).check();
    await expect(sheet.locator('p', { hasText: 'What will be shared' })).toContainText(
      'downloaded to this device',
    );
    await sheet.getByRole('button', { name: 'Make report' }).click();

    const done = page.getByRole('dialog', { name: 'Report ready' });
    const passcode = done.getByTestId('referral-passcode');
    await expect(passcode).toHaveText(/^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/);
    await expect(
      done.getByText('Share this code by phone or SMS, not by email. It is shown once.'),
    ).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      done.getByRole('button', { name: 'Download PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^referral-NKP-\d{4}-\d{6}-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    const file = (await readFile(await download.path())).toString('latin1');
    expect(file.startsWith('%PDF-1.7')).toBe(true);
    expect(file).toContain('/CFM /AESV3');
    expect(file).not.toContain(lastName);

    // Closing drops the passcode: the next report starts from a fresh form.
    await done.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Referral report' }).click();
    await expect(page.getByRole('dialog', { name: 'Referral report' })).toBeVisible();
    await expect(page.getByTestId('referral-passcode')).toHaveCount(0);
    await expect(page.getByLabel('Reason for referral')).toHaveValue('');
  });

  test('emails the PDF with a cover note that does not name the patient', async ({ page }) => {
    const recipient = 'e2e.referral@nkwapa.local';
    await clearMailpitInbox(recipient);
    const lastName = await createPatient(page);
    const sheet = await openSheet(page);

    await sheet.getByLabel('Reason for referral').fill('Eye review: possible retinopathy.');
    await sheet.getByRole('button', { name: 'Email', exact: true }).click();
    await sheet.getByLabel('Recipient email').fill(recipient);
    await sheet.getByRole('checkbox', { name: /The patient agreed today/ }).check();
    await sheet.getByRole('button', { name: 'Email report' }).click();

    const done = page.getByRole('dialog', { name: 'Report emailed' });
    await expect(done.getByTestId('referral-passcode')).toBeVisible();
    const passcode = (await done.getByTestId('referral-passcode').innerText()).replace(' ', '');

    const message = await findMessageTo(recipient, { subjectMatch: /Referral report from/ });
    const content = messageContent(message);
    for (const secret of [lastName, 'Akosua', 'retinopathy', passcode]) {
      expect(content).not.toContain(secret);
    }
    expect(message.Attachments).toEqual([
      expect.objectContaining({ ContentType: 'application/pdf' }),
    ]);
    expect(message.Attachments[0].FileName).toMatch(/^referral-report-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test('is unavailable offline and says why', async ({ page, context }) => {
    await createPatient(page);
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Referral report' })).toBeDisabled();
    await expect(page.getByText('Referral report needs a connection')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: 'Referral report' })).toBeEnabled();
  });
});

test.describe('director', () => {
  test.use({ storageState: storageStateFor('director') });

  test('has no referral report action', async ({ page }) => {
    await page.goto('/patients');
    await page.getByLabel('Name, patient code, phone or ID last 4').fill('Unclaimed');
    const row = page.getByRole('row', { name: /Unclaimed/i });
    await row.getByRole('link', { name: /view/i }).click();
    await expect(page.getByRole('heading', { name: /E2E Unclaimed/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Referral report' })).toHaveCount(0);
  });
});
