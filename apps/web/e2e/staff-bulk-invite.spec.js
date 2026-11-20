const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');

test.use({ storageState: storageStateFor('staff') });

/**
 * Inviting a list of colleagues from a spreadsheet export (#383). The file is read in the
 * browser; each row then goes out as an ordinary invitation, so this checks the review step
 * (bad rows flagged and fixable, a role required on every row) and that the rows really land.
 */
const RUN = Date.now();
const EMAILS = [`e2e.bulk.a.${RUN}@nkwapa.local`, `e2e.bulk.b.${RUN}@nkwapa.local`];
const FIXED = `e2e.bulk.c.${RUN}@nkwapa.local`;

// Shaped like a Google Forms export: a timestamp, a consent column to ignore, one broken address.
const CSV = [
  'Timestamp,Full Name ,Email Address,Phone Number ,Updates by email?',
  `11/15/2026 9:28:14,Kofi Bulk Mensah ,${EMAILS[0]},0240000001,Yes`,
  `11/15/2026 9:33:09,AMA BULK,${EMAILS[1]},0240000002,No`,
  `11/15/2026 9:35:43,Yaw Bulk,e2e.bulk.c.${RUN}.nkwapa.local,0240000003,Maybe`,
].join('\n');

test.afterAll(async () => {
  // Leave no open invitations behind for the next run's counts.
  const clinics = await apiRequestAs('staff', 'get', '/auth/whoami');
  const clinicId = (await clinics.json())?.activeClinicId;
  if (!clinicId) return;
  const list = await apiRequestAs('staff', 'get', `/clinics/${clinicId}/staff-invites`, {
    clinicId,
  });
  const { items = [] } = await list.json();
  for (const invite of items.filter((item) => item.email.includes(`.${RUN}@`))) {
    await apiRequestAs('staff', 'delete', `/clinics/${clinicId}/staff-invites/${invite.id}`, {
      clinicId,
    });
  }
});

test('a CSV becomes reviewed, fixed invitations', async ({ page }) => {
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import invitations' });

  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'volunteers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });

  const rows = dialog.getByRole('table', { name: 'Rows to invite' });
  await expect(rows.getByRole('row', { name: 'Row 2' })).toContainText('Choose a role');
  await expect(rows.getByRole('row', { name: 'Row 4' })).toContainText('Check the email');
  // The shouting capitals became a name.
  await expect(rows.getByLabel('Name, row 3')).toHaveValue('Ama Bulk');

  // A broken row starts unticked; fixing it and ticking it brings it back.
  await rows.getByLabel('Email, row 4').fill(FIXED);
  await rows.getByLabel('Include row 4').check();

  await dialog.getByRole('combobox', { name: 'Role for selected' }).click();
  await page.getByRole('option', { name: 'Volunteer' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);

  const send = dialog.getByRole('button', { name: 'Send 3 invitations' });
  await expect(send).toBeEnabled();
  await send.click();

  await expect(dialog.getByText('3 sent', { exact: true })).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Done' }).click();

  const table = page.getByRole('table', { name: 'Staff invitations' });
  for (const email of [...EMAILS, FIXED]) {
    await expect(table.getByRole('row').filter({ hasText: email })).toBeVisible();
  }
});
