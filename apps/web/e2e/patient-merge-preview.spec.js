const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

/**
 * The merge preview, and the confirmation in front of it.
 *
 * Every chart this suite acts on is created by the suite. Merging is irreversible, so a spec
 * pointed at a seeded fixture destroys it: running against SEED_SAMPLE_DUPLICATES' Akua Boateng
 * pair would take it out of the review queue permanently and break duplicate-review.spec.js on
 * the next run against the same database. Creating a throwaway pair costs two form submissions
 * and makes the suite re-runnable against a database it has already touched.
 *
 * What matters most here is what the preview promises. Merge is the one action in this product a
 * person cannot undo from the product, and a panel that under-reported what it was about to do
 * would look correct from the outside on the day it shipped.
 */

const DOB = '1991-03-08';

/** Two charts for the same imaginary person, differing only in national ID. */
async function createDuplicatePair(page) {
  const run = randomUUID().replaceAll('-', '').slice(0, 10);
  const charts = [];

  for (const suffix of ['a', 'b']) {
    await page.goto('/patients/new');
    await page.getByLabel('First name', { exact: true }).fill('Merge');
    await page.getByLabel('Last name', { exact: true }).fill(`E2E-${run}`);
    await page.getByLabel('Date of birth').fill(DOB);
    await page.getByLabel('National ID', { exact: true }).fill(`E2E-MERGE-${run}-${suffix}`);
    await page.getByRole('button', { name: 'Create patient' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+/, { timeout: 20_000 });

    const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
    const code = await page
      .getByText(/^NKP-\d{4}-\d{6}$/)
      .first()
      .innerText();
    charts.push({ clinicId, patientId, code });
  }

  return { run, canonical: charts[0], duplicate: charts[1] };
}

/** Opens the merge dialog on a chart and returns it. */
async function openMergeDialog(page, chart) {
  await page.goto(`/clinics/${chart.clinicId}/patients/${chart.patientId}`);
  await page.getByRole('button', { name: 'Preview a merge into this chart' }).click();
  const dialog = page.getByRole('dialog');
  // Wait for the step, not just the dialog: typing into a panel that has not settled is how a
  // real operator loses their first keystrokes, and the suite should not paper over that.
  await expect(dialog.getByRole('heading', { name: 'Find the duplicate chart' })).toBeVisible({
    timeout: 20_000,
  });
  return dialog;
}

/** Walks step one, landing on the preview. */
async function selectDuplicate(dialog, run, duplicateCode) {
  await dialog.getByLabel(/Search this clinic/).fill(`Merge E2E-${run}`);
  await expect(dialog.getByRole('button', { name: new RegExp(duplicateCode) })).toBeVisible({
    timeout: 20_000,
  });
  await dialog.getByRole('button', { name: new RegExp(duplicateCode) }).click();
  await dialog.getByRole('button', { name: 'Preview the merge' }).click();
}

test.describe('a system admin merging two charts', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('shows what the merge would do before anything changes', async ({ page }) => {
    const { run, canonical, duplicate } = await createDuplicatePair(page);
    const dialog = await openMergeDialog(page, canonical);

    // Step one says which chart survives, before a duplicate has even been picked.
    await expect(dialog.getByText(`${canonical.code} is the chart that survives`)).toBeVisible();

    await selectDuplicate(dialog, run, duplicate.code);

    await expect(
      dialog.getByRole('heading', { name: 'Check what the merge would do' }),
    ).toBeVisible({ timeout: 20_000 });
    // Read-only, and it says so.
    await expect(dialog.getByText(/Nothing has changed yet/)).toBeVisible();

    // The shared comparison table, located the same way duplicate-review.spec.js locates it.
    await expect(dialog.getByRole('rowheader', { name: 'Date of birth' })).toBeVisible();
    await expect(
      dialog.getByRole('columnheader', { name: new RegExp(canonical.code) }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('columnheader', { name: new RegExp(duplicate.code) }),
    ).toBeVisible();

    // What moves, and which codes still find the record afterwards.
    await expect(dialog.getByRole('heading', { name: 'What moves' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Chart codes' })).toBeVisible();
    await expect(dialog.getByText(new RegExp(`Searching for.*${duplicate.code}`))).toBeVisible();

    // A fresh chart has no app account, and the panel says so rather than staying silent.
    await expect(dialog.getByText(/Neither chart has an app account/)).toBeVisible();

    // Nothing has been written: both charts still open on their own.
    await page.goto(`/clinics/${duplicate.clinicId}/patients/${duplicate.patientId}`);
    await expect(page.getByText(duplicate.code).first()).toBeVisible({ timeout: 20_000 });
  });

  test('will not commit until the retiring chart code is typed back', async ({ page }) => {
    const { run, canonical, duplicate } = await createDuplicatePair(page);
    const dialog = await openMergeDialog(page, canonical);
    await selectDuplicate(dialog, run, duplicate.code);

    await dialog.getByRole('button', { name: 'Continue' }).click({ timeout: 20_000 });
    await expect(dialog.getByRole('heading', { name: 'Confirm the merge' })).toBeVisible();
    // The consequence is stated for these two charts specifically, not as a generic warning.
    await expect(
      dialog.getByText(`${duplicate.code} stops being a chart anyone can open.`),
    ).toBeVisible();

    // The surviving chart's code is not the one being retired.
    await dialog.getByLabel(new RegExp(`Type ${duplicate.code}`)).fill(canonical.code);
    await dialog.getByRole('button', { name: new RegExp(`Merge and retire`) }).click();
    await expect(dialog.getByRole('alert')).toContainText(duplicate.code);

    // Still on the confirmation, and the duplicate is still a chart.
    await expect(dialog.getByRole('heading', { name: 'Confirm the merge' })).toBeVisible();
    await page.goto(`/clinics/${duplicate.clinicId}/patients/${duplicate.patientId}`);
    await expect(page.getByText(duplicate.code).first()).toBeVisible({ timeout: 20_000 });
  });

  test('retires the duplicate and leaves its code finding the surviving chart', async ({
    page,
  }) => {
    const { run, canonical, duplicate } = await createDuplicatePair(page);
    const dialog = await openMergeDialog(page, canonical);
    await selectDuplicate(dialog, run, duplicate.code);

    await dialog.getByRole('button', { name: 'Continue' }).click({ timeout: 20_000 });
    await dialog.getByLabel(new RegExp(`Type ${duplicate.code}`)).fill(duplicate.code);
    await dialog.getByRole('button', { name: new RegExp('Merge and retire') }).click();

    await expect(page.getByText(new RegExp(`${duplicate.code} was merged into`))).toBeVisible({
      timeout: 30_000,
    });

    // The retired chart's own address now resolves to the surviving one, which is the promise
    // the preview made about chart codes.
    await page.goto(`/clinics/${duplicate.clinicId}/patients/${duplicate.patientId}`);
    await page.waitForURL(`**/clinics/${canonical.clinicId}/patients/${canonical.patientId}`, {
      timeout: 30_000,
    });

    // And previewing the same pair again refuses, with a reason and a next step.
    const reopened = await openMergeDialog(page, canonical);
    await reopened.getByLabel(/Search this clinic/).fill(duplicate.code);
    await expect(reopened.getByText(/No other chart in this clinic matches/)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('closing the panel changes nothing', async ({ page }) => {
    const { run, canonical, duplicate } = await createDuplicatePair(page);
    const dialog = await openMergeDialog(page, canonical);
    await selectDuplicate(dialog, run, duplicate.code);
    await expect(
      dialog.getByRole('heading', { name: 'Check what the merge would do' }),
    ).toBeVisible({ timeout: 20_000 });

    await dialog.getByRole('button', { name: 'Back' }).click();
    await page.keyboard.press('Escape');

    await page.goto(`/clinics/${duplicate.clinicId}/patients/${duplicate.patientId}`);
    await expect(page.getByText(duplicate.code).first()).toBeVisible({ timeout: 20_000 });
  });

  test('reads and operates at every width, and by keyboard', async ({ page }) => {
    const { run, canonical, duplicate } = await createDuplicatePair(page);

    /*
      The preview is a dialog rather than a route, so the shared responsive and dark-mode sweeps
      in responsive-migration.spec.js and dark-mode.spec.js cannot reach it. It is the densest
      thing in the product -- a comparison table, a definition list and two selects -- so the same
      contract is asserted here instead of assumed.
    */
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const dialog = await openMergeDialog(page, canonical);
      await selectDuplicate(dialog, run, duplicate.code);
      await expect(
        dialog.getByRole('heading', { name: 'Check what the merge would do' }),
      ).toBeVisible({ timeout: 20_000 });

      // The wide comparison table scrolls inside its own container; the page never does.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);

      const violations = (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations;
      expect(
        violations,
        violations.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n'),
      ).toEqual([]);

      await page.keyboard.press('Escape');
    }

    // Escape closes it, and the flow is reachable without a pointer.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/clinics/${canonical.clinicId}/patients/${canonical.patientId}`);
    const trigger = page.getByRole('button', { name: 'Preview a merge into this chart' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('a clinical role', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('is not offered the merge at all', async ({ page }) => {
    await page.goto('/patients');
    await expect(page.getByRole('heading', { name: /patient/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    // Duplicate repair is a system-admin card. A doctor holds neither PATIENT.MERGE nor
    // PATIENT.DUPLICATE.REVIEW, and the API refuses the preview route independently.
    await expect(page.getByRole('button', { name: /Preview a merge/ })).toHaveCount(0);
  });
});
