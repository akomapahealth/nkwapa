const { test, expect } = require('@playwright/test');

test.use({ storageState: { cookies: [], origins: [] } });

test('landing page stays standalone from secure sign in', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('See workflow').first()).toBeVisible();
  await expect(page.locator('a[href="/login"], a[href*="/login"]')).toHaveCount(0);
  await expect(page.getByText(/continue to secure sign in/i)).toHaveCount(0);
  await expect(page.getByText(/^get started$/i)).toHaveCount(0);

  const hasViewportOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasViewportOverflow).toBeFalsy();
});

test('protected routes redirect unauthenticated users to /login with next state', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole('heading', { name: /sign in to continue/i })).toBeVisible();
});
