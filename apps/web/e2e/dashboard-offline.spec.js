const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/*
  OFF-01: losing the connection after the dashboard loaded keeps its figures on screen and says
  when they were loaded, rather than replacing them with an error.
*/

test.use({ storageState: storageStateFor('doctor') });

test('the dashboard keeps its figures when the connection drops', async ({ page, context }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  const sections = page.locator('main h2');
  await expect(sections.first()).toBeVisible();
  const loaded = await sections.allTextContents();

  await context.setOffline(true);

  await expect(page.getByTestId('dashboard-offline-notice')).toContainText(
    'Showing what this page loaded at',
  );
  expect(await sections.allTextContents()).toEqual(loaded);
  await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
  await expect(page.getByText(/could not load|couldn't load/i)).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByTestId('dashboard-offline-notice')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
});
