const { expect } = require('@playwright/test');

/**
 * Skip the first-run welcome tour if it is showing.
 *
 * The tour is a modal, so for an identity that has never finished it every click on the page
 * behind it would land on the overlay. Skipping is recorded on the server, so one skip per
 * identity is enough: `auth.setup.js` does it for the deterministic identities, and specs that
 * sign in a brand-new account call this once after landing.
 */
async function skipWelcomeTour(page) {
  const dialog = page.getByRole('dialog', { name: /welcome to nkwapa/i });
  // The tour opens once identity has loaded, a beat after the page itself.
  const shown = await dialog
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).toHaveCount(0);
}

module.exports = { skipWelcomeTour };
