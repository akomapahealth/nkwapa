const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff'), reducedMotion: 'reduce' });

for (const theme of ['light', 'dark']) {
  test(`registration summarizes existing browser constraints (${theme})`, async ({ page }) => {
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/patients/new');
    const writes = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/patients$/.test(new URL(request.url()).pathname))
        writes.push(request);
    });
    await page.getByRole('button', { name: 'Create patient', exact: true }).click();
    const summary = page.getByRole('alert', { name: 'Unable to save' });
    await expect(summary).toBeVisible();
    for (const id of ['firstName', 'lastName', 'nationalId']) {
      const input = page.locator(`#${id}`);
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toHaveAttribute('aria-describedby', `${id}-error`);
    }
    await summary.getByRole('link', { name: /^Last name:/ }).click();
    await expect(page.getByLabel('Last name', { exact: true })).toBeFocused();
    await page.getByLabel('First name', { exact: true }).fill('Synthetic');
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic');
    await expect(page.getByLabel('First name', { exact: true })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await page.getByLabel('Last name', { exact: true }).fill('Validation');
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic');
    await page.getByRole('combobox', { name: 'National ID type', exact: true }).click();
    await page.getByRole('option', { name: 'No ID document', exact: true }).click();
    await expect(page.getByLabel('National ID', { exact: true })).toHaveCount(0);
    await expect(summary).toHaveCount(0);
    await page.getByLabel('Email', { exact: true }).fill('invalid-email');
    await page.getByRole('button', { name: 'Create patient', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect(writes).toHaveLength(0);
    await page.getByLabel('Email', { exact: true }).fill('');
    await page.route('**/clinics/*/patients', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Registration could not be saved.',
          recoveryAction: 'Review the details and try again.',
        }),
      }),
    );
    await page.getByRole('button', { name: 'Create patient', exact: true }).click();
    await expect(summary).toContainText(
      'Registration could not be saved. Review the details and try again.',
    );
    await expect(summary).not.toContainText('recoveryAction');
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic');
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  });
}

test('record navigation and ID validation preserve the chart and consent contracts', async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Last name', { exact: true }).fill(`Redesign-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-270-${suffix}`);
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/);
  const chart = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: 'Needs you now', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Vitals', exact: true }).click();
  await expect(page).toHaveURL(/tab=vitals/);
  // MASTER R3.8: 40px on a mouse, 44px on touch.
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  await expect(page.getByRole('tab', { name: 'Vitals', exact: true })).toHaveCSS(
    'min-height',
    coarse ? '44px' : '40px',
  );
  await page.goto(`${chart}/edit`);
  await page.getByRole('button', { name: 'Change ID', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Change ID document', exact: true });
  await dialog.getByRole('button', { name: 'Save ID', exact: true }).click();
  await expect(dialog.getByRole('alert', { name: 'Unable to save' })).toBeVisible();
  await expect(dialog.getByLabel('ID number', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(dialog.getByLabel('Reason', { exact: true })).toHaveAttribute(
    'aria-describedby',
    'change-id-reason-error',
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto(`${chart}/consent`);
  const save = page.getByRole('button', { name: 'Record consent', exact: true });
  await expect(save).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(save).toBeEnabled();
  await page.route(
    '**/patients/*/consents',
    (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Consent could not be recorded.',
          recoveryAction: 'Try again.',
        }),
      }),
    { times: 1 },
  );
  await save.click();
  await expect(page.getByRole('alert', { name: 'Unable to save' })).toContainText(
    'Consent could not be recorded. Try again.',
  );
  await expect(page.getByRole('checkbox')).toBeChecked();
  const recorded = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/consents'),
  );
  await save.click();
  const response = await recorded;
  expect(response.ok()).toBeTruthy();
  expect(response.request().postDataJSON()).toMatchObject({
    consentType: 'RESEARCH_DEIDENTIFIED',
    consentVersion: 'v1-en',
  });
  await page.waitForURL((url) => url.pathname === chart);
  await expect(page.getByText('Consent granted', { exact: true })).toBeVisible();
});
