const { test, expect } = require('@playwright/test');

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');
const { clearMailpitInbox, findMessageTo, messageContent } = require('../playwright/mailpit');

/*
  #226: a clinic's volunteer directory, a screening day, its roster, and the roster email.

  The `staff` identity is a director, who holds VOLUNTEER.ROSTER.MANAGE as a manager does. The
  people rostered have no Nkwapa account; the email reaches them anyway, through the ledger.
*/

async function clinicIdFor(role) {
  const whoami = await apiRequestAs(role, 'get', '/auth/whoami');
  return whoami.json().activeClinicId;
}

test.describe('as a director', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('adds two volunteers, rosters them on a screening day, and emails them', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const run = Date.now();
    const people = [
      { name: `Ama Roster ${run}`, email: `roster.ama.${run}@nkwapa.local` },
      { name: `Kofi Roster ${run}`, email: `roster.kofi.${run}@nkwapa.local` },
    ];
    for (const person of people) await clearMailpitInbox(person.email);

    await page.goto('/volunteers');
    await expect(page.getByRole('heading', { name: 'Volunteers', exact: true })).toBeVisible({
      timeout: 20_000,
    });

    for (const person of people) {
      await page.getByRole('button', { name: 'Add volunteer' }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Name').fill(person.name);
      await dialog.getByLabel('Email').fill(person.email);
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toBeHidden();
      // Scoped to the table: the mobile cards render the same names, hidden at this width.
      await expect(
        page.getByRole('table', { name: 'Volunteer directory' }).getByText(person.name),
      ).toBeVisible();
    }

    // The same address again is refused inline, with a way to the existing record.
    await page.getByRole('button', { name: 'Add volunteer' }).first().click();
    const duplicate = page.getByRole('dialog');
    await duplicate.getByLabel('Name').fill('Someone else');
    await duplicate.getByLabel('Email').fill(people[0].email);
    await duplicate.getByRole('button', { name: 'Save' }).click();
    await expect(duplicate.getByText(/already in the directory/i)).toBeVisible();
    await expect(duplicate.getByRole('button', { name: 'Open existing' })).toBeVisible();
    await duplicate.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('link', { name: 'Screening days' }).click();
    await page.getByRole('button', { name: 'New screening day' }).click();
    const form = page.getByRole('dialog');
    const day = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await form.getByLabel('Title').fill(`Saturday screening ${run}`);
    await form.getByLabel(/^Starts/).fill(`${day}T08:00`);
    await form.getByLabel(/^Ends/).fill(`${day}T13:00`);
    await form.getByLabel('Site').fill('Community hall');
    await form.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByRole('heading', { name: `Saturday screening ${run}` })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page
        .getByText('Nobody is scheduled. Add volunteers from the directory.')
        .filter({ visible: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Add volunteers' }).click();
    const picker = page.getByRole('dialog');
    await picker.getByLabel('Search by name or email').fill(`Roster ${run}`);
    for (const person of people) await picker.getByLabel(new RegExp(person.name)).check();
    await picker.getByRole('button', { name: /^Add 2/ }).click();
    await expect(picker).toBeHidden();

    await page.getByRole('button', { name: /Send roster emails/ }).click();
    await expect(page.getByText('Emails queued for 2 volunteers')).toBeVisible();

    // The badges follow the ledger without a reload.
    const roster = page.getByRole('table', { name: 'Volunteers on this screening day' });
    for (const person of people) {
      const row = roster.getByRole('row').filter({ hasText: person.name });
      await expect(row.getByText(/^(Queued|Sending|Sent)/)).toBeVisible();
      await expect(row.getByText(/^Sent/)).toBeVisible({ timeout: 30_000 });
    }

    // A volunteer with no account gets the email, and it carries no link to sign in through.
    const message = await findMessageTo(people[0].email, { subjectMatch: /scheduled/i });
    expect(messageContent(message)).toContain(`Saturday screening ${run}`);
    expect(messageContent(message)).toContain('Community hall');
    expect(message.HTML || '').not.toMatch(/href=/i);
  });
});

for (const role of ['doctor', 'volunteer']) {
  test(`a ${role} is refused the roster API`, async () => {
    const clinicId = await clinicIdFor(role);
    for (const path of ['volunteers', 'screening-events']) {
      const res = await apiRequestAs(role, 'get', `/clinics/${clinicId}/${path}`, { clinicId });
      expect(res.status()).toBe(403);
    }
  });
}

test.describe('as a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('cannot open /volunteers and has no nav entry for it', async ({ page }) => {
    await page.goto('/volunteers');
    await expect(page.getByText("You don't have access to this page")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('link', { name: 'Volunteers', exact: true })).toHaveCount(0);
  });
});
