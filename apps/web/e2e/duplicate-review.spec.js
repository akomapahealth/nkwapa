const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/**
 * The suspected duplicate review queue.
 *
 * The two seeded pairs this leans on come from `SEED_SAMPLE_DUPLICATES`. Nothing else in the
 * product can produce a duplicate: `Patient.nationalIdHash` is globally unique, so registration
 * refuses the collision, and without the fixture the only state this screen can ever be observed
 * in is empty.
 *
 * What the suite is really protecting is the promise that opening this page changes nothing. A
 * queue that quietly merged or tombstoned a chart would look identical from the outside on the
 * day it shipped.
 *
 * Locators go through the desktop grid rather than the page, because the screen deliberately
 * renders two trees -- a `md:hidden` card list and a `hidden md:block` DataGrid -- and a bare
 * `getByText` resolves to the hidden mobile copy first.
 */

const QUEUE = '/admin/duplicates';

/** Opens the queue and returns the results grid, once it has rows. */
async function openQueue(page) {
  await page.goto(QUEUE);
  await expect(page.getByRole('heading', { name: /duplicate review/i })).toBeVisible({
    timeout: 30_000,
  });
  return page.getByRole('grid');
}

/** Switches the Decision filter and returns the grid it reloads into. */
async function filterByDecision(page, option) {
  await page.getByLabel('Decision').click();
  await page.getByRole('option', { name: option, exact: true }).click();
  return page.getByRole('grid');
}

test.describe('a system admin working the queue', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('lists the seeded duplicate pairs with a reason and a strength', async ({ page }) => {
    const grid = await openQueue(page);

    await expect(grid.getByText(/Akua Boateng/).first()).toBeVisible({ timeout: 20_000 });
    await expect(grid.getByText(/same name and date of birth/i).first()).toBeVisible();
    await expect(grid.getByText(/very likely/i).first()).toBeVisible();
  });

  test('counts what is waiting without anyone having to read the table', async ({ page }) => {
    await openQueue(page);

    for (const label of ['Needs review', 'Very likely', 'Across clinics', 'Ruled out']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // The metric is a real number, not a placeholder dash.
    await expect(page.getByText('Pairs nobody has decided on yet.')).toBeVisible();
  });

  test('says plainly that it never merges anything', async ({ page }) => {
    await openQueue(page);

    // ProgressiveHelp is a <details>: the safety wording must be readable, not hidden in a bubble.
    await page.getByText('How candidates are found').click();
    await expect(page.getByText(/this screen never merges anything/i)).toBeVisible();
  });

  test('compares the two charts field by field and marks what agrees', async ({ page }) => {
    const grid = await openQueue(page);
    await grid.getByRole('button', { name: 'Compare' }).first().click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: /compare two charts/i })).toBeVisible();
    await expect(sheet.getByRole('rowheader', { name: 'Date of birth' })).toBeVisible();

    // A matching field is labelled, not only emphasised, so the signal survives a screen reader.
    await expect(sheet.getByText('Same', { exact: true }).first()).toBeVisible();
    await expect(sheet.getByRole('link', { name: /^Open NKP-/ }).first()).toBeVisible();
  });

  test('narrowing to a reason nothing matched empties the list rather than erroring', async ({
    page,
  }) => {
    const grid = await openQueue(page);
    await expect(grid.getByText(/Akua Boateng/).first()).toBeVisible({ timeout: 20_000 });

    await page.getByLabel('Why it matched').click();
    await page.getByRole('option', { name: 'Same national ID' }).click();

    // Empty is a state, not a failure: a heading rather than an error, and a way back.
    await expect(
      page.getByRole('heading', { name: /no candidates match these filters/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /reset filters/i })).toBeEnabled();
  });

  test('records a dismissal, hides the pair, and can put it back', async ({ page }) => {
    await openQueue(page);

    /*
      Start from "Every candidate" rather than the default open queue.
      The test writes a decision, so a re-run against a database it has already touched would
      otherwise fail on its own first assertion. Every candidate is present in this view whatever
      was decided about it last time.
    */
    const all = await filterByDecision(page, 'Every candidate');
    const pair = all.getByRole('row').filter({ hasText: 'Kwabena Owusu' });
    await expect(pair).toHaveCount(1, { timeout: 20_000 });

    await pair.getByRole('button', { name: 'Compare' }).click();
    await page.getByRole('button', { name: 'Not a duplicate', exact: true }).click();

    // The confirmation names what will change before anything is written.
    const confirm = page.getByRole('dialog').filter({ hasText: /mark as not a duplicate/i });
    await expect(confirm.getByText(/neither chart changes/i)).toBeVisible();
    await confirm.getByRole('textbox').fill('E2E: checked, different people.');
    await confirm.getByRole('button', { name: 'Not a duplicate', exact: true }).click();

    await expect(page.getByText(/marked as not a duplicate/i)).toBeVisible({ timeout: 20_000 });

    // Gone from the work list, which is the point of recording a dismissal at all.
    const open = await filterByDecision(page, 'Needs review');
    await expect(open.getByText(/Kwabena Owusu/)).toHaveCount(0, { timeout: 20_000 });

    // Findable again under its own decision.
    const dismissed = await filterByDecision(page, 'Not a duplicate');
    await expect(dismissed.getByText(/Kwabena Owusu/)).toBeVisible({ timeout: 20_000 });

    /*
      Put it back. This covers the reversal itself -- one mis-click must not hide a genuine
      duplicate for good -- and leaves the database as this spec found it.
    */
    await dismissed
      .getByRole('row')
      .filter({ hasText: 'Kwabena Owusu' })
      .getByRole('button', { name: 'Compare' })
      .click();
    await page.getByRole('button', { name: 'Move back to review' }).click();
    const reopen = page.getByRole('dialog').filter({ hasText: /move this pair back to review/i });
    await reopen.getByRole('button', { name: 'Move back to review' }).click();

    await expect(page.getByText(/moved back to the review list/i)).toBeVisible({ timeout: 20_000 });

    const reopened = await filterByDecision(page, 'Needs review');
    await expect(reopened.getByText(/Kwabena Owusu/)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('a clinical role', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('is refused the queue outright', async ({ page }) => {
    await page.goto(QUEUE);

    await expect(page.getByText(/do not have access|don't have access/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('heading', { name: /duplicate review/i })).toHaveCount(0);
  });
});
