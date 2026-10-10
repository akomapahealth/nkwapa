const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

// Regression cover for a transient /auth/whoami failure being reported as a permissions
// problem. Identity is the gate for every guarded route, so a slow or flaky first load used
// to strand a fully-authorized user on "You don't have access to this page" until they
// hard-refreshed the browser.

test('a transient identity failure recovers on its own instead of denying access', async ({
  page,
}) => {
  let failures = 0;
  await page.route('**/auth/whoami', async (route) => {
    // Fail the first attempt only; the built-in retry should ride over it.
    if (failures === 0) {
      failures += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Injected failure' }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/dashboard');

  await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible({
    timeout: 30_000,
  });
  expect(failures).toBe(1);
});

test('a sustained identity failure explains itself and offers a retry, never a false denial', async ({
  page,
}) => {
  let failing = true;
  await page.route('**/auth/whoami', async (route) => {
    if (failing) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Injected failure' }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/dashboard');

  // The retry budget is spent, so the real problem is finally surfaced. It must read as a
  // connectivity problem, not as a revoked role.
  await expect(page.getByText("We couldn't confirm your access")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
  await expect(page.getByText(/contact a clinic administrator/i)).toHaveCount(0);

  // Recovering does not require a hard refresh.
  failing = false;
  await page.getByRole('button', { name: /try again/i }).click();
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible({
    timeout: 30_000,
  });
});
