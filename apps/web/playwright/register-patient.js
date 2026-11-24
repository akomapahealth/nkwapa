const { expect } = require('@playwright/test');

/**
 * Registration starts with no ID type chosen (#428), so a spec that types a number picks the
 * document first, the way a volunteer must.
 */
async function fillNationalId(page, value, type = 'National ID') {
  await page.getByRole('combobox', { name: 'National ID type', exact: true }).click();
  await page.getByRole('option', { name: type, exact: true }).click();
  // A closing select drops the next fill (R7.1), so wait for it to go.
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByLabel('National ID', { exact: true }).fill(value);
}

module.exports = { fillNationalId };
