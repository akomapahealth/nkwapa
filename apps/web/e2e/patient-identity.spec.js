const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * A merge the preview refuses outright.
 *
 * The state comes from `SEED_SAMPLE_IDENTITY`, because the product cannot produce it: a third
 * chart already answers to the duplicate's code, and manufacturing that by hand means writing
 * SQL. Without it, the only refusal reachable from a seeded database is "the same chart on both
 * sides", and an operator who has never met a real refusal does not know what one looks like.
 *
 * Read-only. Nothing here merges anything, so the file is safe to re-run against a database it
 * has already touched and cannot disturb the duplicate review fixtures.
 */

/** Open a seeded chart by the name only it answers to. */
async function openSeededChart(page, name) {
  await page.goto('/patients');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder(/search by name, patient code/i).fill(name);
  // Matched by name rather than position: the search is debounced, so the first row can still
  // be the unfiltered one when the fill resolves.
  const row = page.getByRole('row', { name: new RegExp(name, 'i') }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('link', { name: /view/i }).click();

  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+/, { timeout: 30_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  return { clinicId, patientId };
}

/** Walk the merge dialog as far as the preview, choosing the duplicate by name. */
async function previewBlockedMerge(page) {
  const survivor = await openSeededChart(page, 'E2E Keep');

  await page.getByRole('button', { name: 'Preview a merge into this chart' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Find the duplicate chart' })).toBeVisible({
    timeout: 20_000,
  });

  await dialog.getByLabel(/Search this clinic/).fill('E2E Duplicate');
  const duplicate = dialog.getByRole('button', { name: /E2E Duplicate Blocked/i }).first();
  await expect(duplicate).toBeVisible({ timeout: 20_000 });
  await duplicate.click();
  await dialog.getByRole('button', { name: 'Preview the merge' }).click();

  return { dialog, survivor };
}

test.describe('a merge the preview refuses', () => {
  test('says the merge cannot go ahead, why, and what to do instead', async ({ page }) => {
    const { dialog } = await previewBlockedMerge(page);

    /*
      The heading is the part that was missing. Blockers and warnings were told apart by colour
      alone, so nothing on screen actually said a blocker was fatal -- an operator had to infer
      it from a disabled button further down the panel.
    */
    await expect(dialog.getByRole('heading', { name: /cannot go ahead/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByText(/already recorded against another chart/i)).toBeVisible();
    // A refusal nobody can act on is a support call.
    await expect(dialog.getByText(/ask a system administrator/i)).toBeVisible();
  });

  test('offers no way to commit it', async ({ page }) => {
    const { dialog } = await previewBlockedMerge(page);
    await expect(dialog.getByRole('heading', { name: /cannot go ahead/i })).toBeVisible({
      timeout: 20_000,
    });

    // Not merely disabled somewhere off screen: the step that commits is not reachable at all.
    await expect(dialog.getByRole('button', { name: /^Merge and retire/ })).toHaveCount(0);
  });

  test('reads without accessibility violations', async ({ page }) => {
    const { dialog } = await previewBlockedMerge(page);
    await expect(dialog.getByRole('heading', { name: /cannot go ahead/i })).toBeVisible({
      timeout: 20_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
