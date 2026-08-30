const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

async function chooseSelect(page, label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('records a residential location, distinguishes it from the clinic, and filters the registry', async ({
  page,
}) => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const lastName = `Residence-${suffix}`;

  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Location');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-LOC-${suffix}`);

  // Region/district are disabled until the location is deliberately recorded.
  await expect(page.getByLabel('Region', { exact: true })).toBeDisabled();
  await chooseSelect(page, 'Location status', 'Recorded');
  await chooseSelect(page, 'Region', 'Greater Accra');
  await chooseSelect(page, 'District', 'Accra Metropolitan');
  await page.getByLabel('Community / town').fill('Osu');

  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });

  // Detail page: residential location is present and clearly separated.
  await expect(page.getByRole('heading', { name: 'Residential location' })).toBeVisible();
  await expect(page.getByText('Osu, Accra Metropolitan, Greater Accra')).toBeVisible();

  const clinicId = page.url().match(/\/clinics\/([^/]+)\//)[1];

  // Registry: filter by region and confirm the active-filter chip + result.
  // The registry renders both a mobile card list and the desktop DataGrid in
  // the DOM (breakpoint-hidden via CSS); target the grid cell the default
  // desktop viewport actually shows to avoid a strict-mode double match.
  await page.goto(`/clinics/${clinicId}/patients`);
  await chooseSelect(page, 'Region', 'Greater Accra');
  await expect(page.getByText('Region: Greater Accra')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: lastName })).toBeVisible();

  // No horizontal overflow across breakpoints.
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBeFalsy();
  }
});

test('represents an unknown residential location deliberately', async ({ page }) => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);

  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Unknown');
  await page.getByLabel('Last name', { exact: true }).fill(`Location-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-UNK-${suffix}`);
  await chooseSelect(page, 'Location status', 'Unknown');

  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });

  await expect(page.getByRole('heading', { name: 'Residential location' })).toBeVisible();
  await expect(page.getByText(/residential location is not known/i)).toBeVisible();
});
