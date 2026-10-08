const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('volunteer') });

/**
 * The welcome tour (#189), replayed from the user menu.
 *
 * The deterministic identities skipped it during setup, which is itself the "Skip persists"
 * check: had the skip not reached the server, every spec after setup would open behind a modal.
 * What is left to prove is the tour's own behaviour, reached the way anyone would reach it again.
 */
async function openTour(page) {
  await page.goto('/dashboard');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
  // Nothing opens on its own: this identity has already been through the tour.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Welcome to Nkwapa' })).toBeVisible();
  return dialog;
}

test('walks forward and back, then finishes', async ({ page }) => {
  const dialog = await openTour(page);
  await expect(dialog.getByRole('img', { name: /^Step 1 of \d+$/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Next' }).click();
  // A volunteer is pointed at a page a volunteer can open.
  await expect(dialog.getByRole('heading', { name: /your day starts/i })).toBeVisible();
  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog.getByRole('heading', { name: 'Welcome to Nkwapa' })).toBeVisible();

  // Arrow keys move through it; the last step trades Skip and Next for "Get started".
  for (let i = 0; i < 10; i += 1) {
    if (await dialog.getByRole('button', { name: 'Get started' }).isVisible()) break;
    await page.keyboard.press('ArrowRight');
  }
  await expect(dialog.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Escape leaves the tour and it stays gone after a reload', async ({ page }) => {
  await openTour(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
