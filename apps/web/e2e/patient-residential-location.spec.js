const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

async function chooseSelect(page, label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  // A closing Radix select still owns the page; typing before it unmounts is dropped.
  await expect(page.getByRole('listbox')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Filter patients', exact: true }).click();
  await chooseSelect(page, 'Region', 'Greater Accra');
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await expect(page.getByText('Region Greater Accra')).toBeVisible();
  await expect(page.getByRole('cell', { name: lastName })).toBeVisible();

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

async function startRecordedPatient(page, prefix) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill(prefix);
  const lastName = `Home-${suffix}`;
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page
    .getByLabel('National ID', { exact: true })
    .fill(`E2E-${prefix.toUpperCase()}-${suffix}`);
  await chooseSelect(page, 'Location status', 'Recorded');
  await chooseSelect(page, 'Region', 'Greater Accra');
  return lastName;
}

test('#343 saves a Digital Address, landmark and a pasted map position', async ({ page }) => {
  const lastName = await startRecordedPatient(page, 'Pasted');

  const address = page.getByLabel('Ghana Digital Address', { exact: true });
  await address.fill('12345');
  await address.blur();
  await expect(page.getByText(/Enter it like GA-183-8164/)).toBeVisible();
  // A blocked submit never reaches the server or the outbox.
  await page.getByRole('button', { name: 'Create patient' }).click();
  await expect(page).toHaveURL(/\/patients\/new/);

  await address.fill('ga1838164');
  await address.blur();
  await expect(address).toHaveValue('GA-183-8164');
  await page.getByLabel('Nearest landmark', { exact: true }).fill('Opposite the Methodist church');

  const pasteField = page.getByLabel('Shared location', { exact: true });
  await pasteField.fill('blue kiosk by the church');
  await pasteField.press('Enter');
  await expect(page.getByText(/No coordinates found/)).toBeVisible();
  await pasteField.fill('https://www.google.com/maps/@5.6037,-0.187,15z');
  await pasteField.press('Enter');
  await expect(page.getByText('5.603700, -0.187000')).toBeVisible();
  await expect(page.getByText(/Pasted from a shared location/)).toBeVisible();

  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });

  // In the chart header, so a caller sees it first, and in the Overview summary.
  await expect(page.locator('header').getByText('GA-183-8164')).toBeVisible();
  await expect(page.getByText('GA-183-8164')).toHaveCount(2);
  await expect(page.getByText('Opposite the Methodist church')).toBeVisible();
  const mapLink = page.getByRole('link', { name: /Open in Google Maps/ });
  await expect(mapLink).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=5.6037,-0.187',
  );
  await expect(mapLink).toHaveAttribute('target', '_blank');

  // The registry narrows to patients a home visit can find.
  const clinicId = page.url().match(/\/clinics\/([^/]+)\//)[1];
  await page.goto(`/clinics/${clinicId}/patients?residentialDetail=POSITION&q=${lastName}`);
  await expect(page.getByRole('button', { name: 'Remove Home details filter' })).toBeVisible();
  await expect(page.getByRole('cell', { name: lastName })).toBeVisible();
  await page.goto(`/clinics/${clinicId}/patients?residentialDetail=DIGITAL_ADDRESS&q=${lastName}`);
  await expect(page.getByRole('cell', { name: lastName })).toBeVisible();
});

test.describe('#343 device location at a home visit', () => {
  test.use({
    permissions: ['geolocation'],
    geolocation: { latitude: 6.688512, longitude: -1.624431, accuracy: 18 },
  });

  test('asks before saving, shows accuracy, and clears with the status', async ({ page }) => {
    await startRecordedPatient(page, 'Device');
    await page.getByLabel('Nearest landmark', { exact: true }).fill('Blue kiosk');

    await page.getByRole('button', { name: "Use this device's location" }).click();
    const confirm = page.getByRole('group', { name: "Is the patient's home here?" });
    await expect(confirm).toContainText('accurate to about 18 m');
    // Nothing is set until the home is confirmed.
    await expect(page.getByRole('link', { name: /Check on map/ })).toHaveCount(0);
    await confirm.getByRole('button', { name: 'Yes, save this position' }).click();
    await expect(page.getByText('6.688512, -1.624431')).toBeVisible();
    await expect(page.getByText(/This device, at a home visit · ±18 m/)).toBeVisible();

    await page.getByRole('button', { name: 'Create patient' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByRole('link', { name: /Open in Google Maps/ })).toBeVisible();

    // Switching away from Recorded clears every new field, in the form and on the server.
    await page.goto(`${page.url()}/edit`);
    await expect(page.getByLabel('Nearest landmark', { exact: true })).toHaveValue('Blue kiosk');
    await chooseSelect(page, 'Location status', 'Unknown');
    await expect(page.getByLabel('Nearest landmark', { exact: true })).toHaveValue('');
    await expect(page.getByText('6.688512, -1.624431')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByText(/residential location is not known/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Open in Google Maps/ })).toHaveCount(0);
  });
});
