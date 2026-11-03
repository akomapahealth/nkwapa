const { expect, test } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff'), viewport: { width: 1440, height: 900 } });

test('clinic registry scroll area and table controls are reachable by keyboard', async ({
  page,
}) => {
  await page.goto('/admin/clinics');
  const scrollArea = page.getByRole('region', { name: 'Clinics', exact: true });
  await expect(scrollArea.getByRole('table', { name: 'Clinics', exact: true })).toBeVisible();
  await expect(scrollArea).toHaveAttribute('tabindex', '0');
  await scrollArea.focus();
  await page.keyboard.press('Tab');
  await expect(scrollArea.locator('button:focus').first()).toBeVisible();
});
