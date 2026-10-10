const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/*
  Issue #117: the dashboard loads with a clean console.

  The pre-paint theme script used to throw `SyntaxError: missing ) after argument list` on every
  page load, so the console always showed an error and a real one was easy to miss. This holds the
  line: no uncaught page error and no console error while the dashboard loads, for each role.
  Nothing is filtered out; an error that appears here is a real failure to fix.
*/
for (const role of ['staff', 'doctor', 'volunteer']) {
  test.describe(`as ${role}`, () => {
    test.use({ storageState: storageStateFor(role) });

    test('the dashboard loads without a console error', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
      });

      await page.goto('/dashboard');
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState('networkidle');

      expect(errors).toEqual([]);
    });
  });
}

test.describe('the pre-paint theme script', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('applies a saved dark theme before the app hydrates', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('nkwapa-theme', 'dark'));
    // Read <html> as soon as the document is parsed, before React has run.
    await page.goto('/dashboard', { waitUntil: 'commit' });
    await page.waitForFunction(() => document.readyState !== 'loading');
    const early = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains('dark'),
      colorScheme: document.documentElement.style.colorScheme,
    }));
    expect(early).toEqual({ dark: true, colorScheme: 'dark' });
  });
});
