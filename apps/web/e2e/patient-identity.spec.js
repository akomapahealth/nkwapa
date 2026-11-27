const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');
const { fillNationalId } = require('../playwright/register-patient');

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

  await page.getByLabel('Name, patient code, phone or ID last 4').fill(name);
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

/**
 * Middle names (#342). Unlike the tests above, these register charts: each run uses its own
 * random name and date of birth, so reruns never match an earlier run's charts.
 */
test.describe('middle names', () => {
  const { randomUUID } = require('crypto');
  const { apiRequestAs } = require('../playwright/api-client');
  const letters = () =>
    randomUUID()
      .replace(/[^a-f]/g, '')
      .slice(0, 6)
      .replace(/^./, (c) => c.toUpperCase());
  const dob = () =>
    `19${50 + Math.floor(Math.random() * 50)}-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`;

  test('a patient with four names is registered, read back in full and found by a middle name', async ({
    page,
  }) => {
    const tag = letters();
    const born = dob();
    await page.goto('/patients/new');
    await page.getByLabel('First name', { exact: true }).fill('Nana');
    const middle = page.getByLabel('Middle name(s)', { exact: true });
    await expect(middle).toHaveAccessibleDescription(/All other names, separated by spaces/);
    await expect(middle).toHaveAttribute('autocomplete', 'additional-name');
    await middle.fill(`Kwame  ${tag}`);
    await page.getByLabel('Last name', { exact: true }).fill('Tuffour');
    await page.getByLabel('Date of birth', { exact: true }).fill(born);
    await fillNationalId(page, `E2E-MID-${randomUUID()}`);
    await page.getByRole('button', { name: 'Create patient', exact: true }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+/, { timeout: 30_000 });
    const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');

    await expect(
      page.getByRole('heading', { level: 1, name: `Nana Kwame ${tag} Tuffour`, exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // The registry finds the chart by a middle name alone.
    await page.goto('/patients');
    await page.getByLabel('Name, patient code, phone or ID last 4').fill(tag);
    // By role, so the table's hidden duplicate link never stands in for the visible one.
    await expect(
      page
        .getByRole('link')
        .and(page.locator(`[href$="/patients/${patientId}"]`))
        .first(),
    ).toBeVisible({ timeout: 30_000 });

    // The same person registered again without the middle name is a duplicate candidate.
    const again = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/patients`, {
      clinicId,
      data: {
        firstName: 'Nana',
        lastName: 'Tuffour',
        dob: born,
        nationalIdType: 'NONE',
        residentialLocationStatus: 'NOT_RECORDED',
      },
    });
    expect(again.ok()).toBe(true);
    // Scored directly: the queue's scan stops at 500 pairs, which a long-lived e2e database passes.
    const preview = await apiRequestAs(
      'staff',
      'get',
      `/admin/patients/merge/preview?canonicalPatientId=${patientId}&sourcePatientId=${again.json().id}`,
    );
    expect(preview.ok()).toBe(true);
    expect(preview.json().duplicateSignal.reasons).toContain('NAME_AND_DOB');
  });

  test('a 120-character middle name wraps on the chart and the registry card at 360px', async ({
    page,
  }) => {
    // The active clinic, from where the registration page's "back" link points.
    await page.goto('/patients/new');
    const registry = await page
      .getByRole('link', { name: 'Back to patients', exact: true })
      .getAttribute('href');
    const clinicId = registry.split('/')[2];
    const tag = letters();
    const created = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/patients`, {
      clinicId,
      data: {
        firstName: 'Long',
        middleName: `${tag}${'a'.repeat(120 - tag.length)}`,
        lastName: 'Middle',
        nationalIdType: 'NONE',
        residentialLocationStatus: 'NOT_RECORDED',
      },
    });
    expect(created.ok()).toBe(true);
    const patient = created.json();
    expect(patient.middleName).toHaveLength(120);

    await page.setViewportSize({ width: 360, height: 800 });
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await page.goto(`/clinics/${clinicId}/patients/${patient.id}`);
    await expect(page.getByRole('heading', { level: 1, name: /^Long .* Middle$/ })).toBeVisible({
      timeout: 30_000,
    });
    expect(await sideways()).toBe(0);

    await page.goto('/patients');
    await page.getByLabel('Name, patient code, phone or ID last 4').fill(tag);
    await expect(
      page.getByRole('article', { name: new RegExp(`^Long ${tag}a+ Middle$`) }).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    expect(await sideways()).toBe(0);
  });
});
