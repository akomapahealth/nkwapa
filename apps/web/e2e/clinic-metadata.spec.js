const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/**
 * Clinic location and zone metadata in the admin registry.
 *
 * Almost everything here is a refusal, on purpose. Rejected submissions persist nothing, so
 * the suite can assert the rules without leaving rows behind for the specs that run after it
 * against the same seeded database.
 *
 * The one clinic this does create is named with a "zz" prefix. `getBootstrapActiveClinicId`
 * falls back to the first switchable clinic, and the switcher is ordered by name, so a clinic
 * that sorted ahead of "Nkwapa Clinic - Demo" would change which clinic every later spec lands
 * in. Sorting last removes that entirely.
 *
 * Locators go through the dialog rather than the page: the registry deliberately renders two
 * trees, an `md:hidden` card list and a `hidden md:block` DataGrid, so a bare getByText
 * resolves to the hidden mobile copy first.
 */

const REGISTRY = '/admin/clinics';

async function openRegistry(page) {
  await page.goto(REGISTRY);
  // Scoped to main on purpose. Unscoped, this also matches the "Clinics" item in the shell
  // nav, so a screen that had crashed into its error boundary still looked like it loaded.
  await expect(
    page.locator('#main-content').getByRole('heading', { name: /^clinics$/i }),
  ).toBeVisible({ timeout: 30_000 });
}

async function openCreateDialog(page) {
  await openRegistry(page);
  await page.getByRole('button', { name: 'Create clinic', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /create clinic/i })).toBeVisible();
  return dialog;
}

const submit = (dialog) => dialog.getByRole('button', { name: /create clinic/i }).click();

test.describe('clinic metadata validation', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('derives a location code from the name, so the required field is one keystroke', async ({
    page,
  }) => {
    const dialog = await openCreateDialog(page);

    await dialog.getByLabel('Name').fill('Ridge Teaching Clinic');

    await expect(dialog.getByLabel('Location code')).toHaveValue('ridge-teaching-clinic');
  });

  test('refuses a clinic with no location code', async ({ page }) => {
    const dialog = await openCreateDialog(page);

    await dialog.getByLabel('Name').fill('Ridge Teaching Clinic');
    await dialog.getByLabel('Location code').fill('');
    await submit(dialog);

    await expect(dialog.getByRole('alert').filter({ hasText: /location code/i })).toBeVisible();
    // Refused in the browser, so nothing was sent and nothing was written.
    await expect(dialog).toBeVisible();
  });

  test('refuses a location code that is not slug-shaped', async ({ page }) => {
    const dialog = await openCreateDialog(page);

    await dialog.getByLabel('Name').fill('Ridge Teaching Clinic');
    await dialog.getByLabel('Location code').fill('Ridge Clinic');
    await submit(dialog);

    await expect(
      dialog
        .getByRole('alert')
        .filter({ hasText: /lowercase letters, digits and single hyphens/i }),
    ).toBeVisible();
  });

  test('will not accept a time zone that is not a real IANA zone', async ({ page }) => {
    const dialog = await openCreateDialog(page);

    await dialog.getByLabel('Name').fill('Ridge Teaching Clinic');
    const timezone = dialog.getByLabel('Time zone');
    await timezone.click();
    // One letter away from a real zone, and the typo that motivated the whole change.
    await timezone.fill('Africa/Akra');

    await expect(dialog.getByRole('listbox')).toContainText(/no time zone matches/i);

    // Typing never commits: the field keeps the zone that was actually selected, so an
    // invalid zone cannot leave this form at all.
    await timezone.press('Escape');
    await expect(timezone).toHaveValue('Africa/Accra');
  });

  test('moves focus to the first field that failed, not the submit button', async ({ page }) => {
    const dialog = await openCreateDialog(page);

    await dialog.getByLabel('Location code').fill('');
    await submit(dialog);

    // Name is first in the form order and is also empty, so that is where focus belongs.
    await expect(dialog.getByLabel('Name')).toBeFocused();
  });

  test('filters the time zone list instead of asking anyone to scroll 400 entries', async ({
    page,
  }) => {
    const dialog = await openCreateDialog(page);

    const timezone = dialog.getByLabel('Time zone');
    await timezone.click();
    await timezone.fill('accra');

    const listbox = dialog.getByRole('listbox');
    await expect(listbox.getByRole('option', { name: /Africa\/Accra/ })).toBeVisible();
    await expect(listbox.getByRole('option', { name: /Europe\/London/ })).toHaveCount(0);
  });

  test('picks a time zone by keyboard alone', async ({ page }) => {
    const dialog = await openCreateDialog(page);

    const timezone = dialog.getByLabel('Time zone');
    await timezone.click();
    await timezone.fill('Europe/London');
    await timezone.press('ArrowDown');
    await timezone.press('Enter');

    await expect(timezone).toHaveValue('Europe/London');
  });
});

test.describe('clinic metadata visibility', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('shows each clinic its location code and time zone', async ({ page }) => {
    await openRegistry(page);

    const grid = page.getByRole('grid');
    await expect(grid.getByText('nkwapa-clinic-demo')).toBeVisible();
    await expect(grid.getByText('Africa/Accra').first()).toBeVisible();
  });

  test('counts the clinics whose metadata reporting cannot rely on', async ({ page }) => {
    await openRegistry(page);

    // Scoped to the metric card: "Needs attention" is also the label of the filter button.
    await expect(
      page.getByText('Needs attention', { exact: true }).and(page.locator('div')),
    ).toBeVisible();
  });

  test('narrows the registry to clinics that need attention', async ({ page }) => {
    await openRegistry(page);

    await page.getByRole('button', { name: 'Needs attention' }).click();

    // The seeded clinic is valid, so this view is empty and says so rather than looking broken.
    await expect(page.getByText(/no clinic has a metadata problem/i)).toBeVisible();
    await expect(page.getByText('View: Needs attention')).toBeVisible();
  });
});

test.describe('creating a clinic', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('refuses a location code another clinic in the organization already holds', async ({
    page,
  }) => {
    const dialog = await openCreateDialog(page);

    await dialog.getByLabel('Name').fill('Duplicate Code Clinic');
    // The code the seeded clinic already owns. The browser cannot know this, so the refusal
    // has to come back from the API as a 409 and land on the field.
    await dialog.getByLabel('Location code').fill('nkwapa-clinic-demo');
    await submit(dialog);

    await expect(dialog.getByText(/already uses the location code|already used/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toBeVisible();
  });

  test('saves a clinic once its metadata is complete', async ({ page }) => {
    // Unique per run so a re-run against the same database does not collide with itself,
    // and "zz" so it never becomes the first switchable clinic for any later spec.
    const suffix = Date.now().toString(36);
    const name = `zz E2E Metadata Clinic ${suffix}`;
    const locationCode = `zz-e2e-metadata-${suffix}`;

    const dialog = await openCreateDialog(page);
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Location code').fill(locationCode);
    await dialog.getByLabel('Zone code').fill('e2e-zone');
    await submit(dialog);

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('grid').getByText(locationCode)).toBeVisible({ timeout: 15_000 });
  });
});
