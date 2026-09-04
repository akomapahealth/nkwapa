const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

/*
  Dark mode, which had never been seen by a user and then had never been checked.

  It did not render at all before #61: `darkMode: ['class']` was configured with nothing applying
  the class and no theme provider anywhere. #61 wired it up and #86 removed the last `dark:`
  utility, so the theme is now entirely a matter of token values -- which is exactly the kind of
  thing that is cheap to verify and expensive to eyeball. #82 booked a dedicated pass for it and
  this is that pass.

  Contrast is the specific risk. Every ratio in MASTER.md section 4 was computed by hand against
  the dark surfaces; axe measures what the browser actually painted.
*/

const THEME_STORAGE_KEY = 'nkwapa-theme';

/** Set before the app boots, so the inline script in layout.tsx paints dark on first paint. */
async function useDarkMode(page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, 'dark');
  }, THEME_STORAGE_KEY);
}

async function assertDarkAndAccessible(page, path) {
  await page.goto(path);
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });

  // Prove the page is genuinely in dark mode before drawing any conclusion from it passing.
  await expect(page.locator('html')).toHaveClass(/dark/);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (violation) => `${path}: ${violation.id} (${violation.nodes.length}) — ${violation.help}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('staff surfaces in dark mode', () => {
  test.use({ storageState: storageStateFor('staff') });

  const ROUTES = [
    '/dashboard',
    '/today',
    '/queues',
    '/patients',
    '/appointments',
    '/admin/users',
    '/admin/duplicates',
  ];

  for (const path of ROUTES) {
    test(`${path} renders dark with no contrast or ARIA violations`, async ({ page }) => {
      await useDarkMode(page);
      await assertDarkAndAccessible(page, path);
    });
  }
});

test.describe('the patient portal in dark mode', () => {
  test.use({ storageState: storageStateFor('patient') });

  const ROUTES = ['/portal', '/portal/health', '/portal/appointments'];

  for (const path of ROUTES) {
    test(`${path} renders dark with no contrast or ARIA violations`, async ({ page }) => {
      await useDarkMode(page);
      await assertDarkAndAccessible(page, path);
    });
  }
});

test.describe('the theme itself', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('dark mode survives a navigation without flashing light', async ({ page }) => {
    /*
      The inline boot script in layout.tsx exists so the class is on <html> before first paint.
      If it regresses, the app renders light and then snaps to dark, which is most visible on the
      slow connections this product is built for.
    */
    await useDarkMode(page);
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveClass(/dark/);

    const backgroundBefore = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );

    await page.goto('/queues');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      backgroundBefore,
    );
  });

  test('light mode is still what an account with no stored preference gets', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});
