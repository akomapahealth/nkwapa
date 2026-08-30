const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/**
 * Refreshing must not take the page away from the person reading it.
 *
 * #23's contract, and the two ways it is usually broken: clearing content while a refetch is in
 * flight, and indicating the refetch with something that resizes and moves the layout.
 *
 * Both were real here. The dashboard's Refresh button swapped its label for "Refreshing" and grew
 * 19px, shifting everything beside it in the header. And `ResourceState` set `aria-busy` and
 * nothing else, so on six of the nine surfaces using it a refresh was completely invisible to a
 * sighted user — indistinguishable from a page that had stopped working.
 */

test.use({ storageState: storageStateFor('staff') });

/** Hold the API open long enough to observe the refreshing state. */
async function slowDown(page, pattern) {
  await page.route(pattern, async (route) => {
    if (route.request().resourceType() === 'document') {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
}

test('a refresh control does not change size when it becomes busy', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
  const refresh = page.getByRole('button', { name: /Refresh/ });
  await expect(refresh).toBeEnabled({ timeout: 20_000 });

  const idle = await refresh.boundingBox();
  await slowDown(page, '**/clinics/*/dashboard*');
  await refresh.click();

  // Busy: the icon spins and a live region announces it, but the word stays put.
  await expect(refresh).toBeDisabled();
  const busy = await refresh.boundingBox();

  expect(
    Math.abs(busy.width - idle.width),
    `the refresh control resized by ${Math.round(busy.width - idle.width)}px while busy`,
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(busy.x - idle.x)).toBeLessThanOrEqual(1);
});

test('a refetch keeps the rows that are already on screen', async ({ page }) => {
  await page.goto('/patients');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
  const rows = page.locator('.MuiDataGrid-row');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);

  await slowDown(page, '**/clinics/*/patients*');
  // Paging re-reads the registry. Deliberately not a search: changing the filter changes the
  // result set, so an empty grid afterwards would be correct and the test would prove nothing.
  await page
    .getByRole('button', { name: /next page/i })
    .first()
    .click()
    .catch(() => {});

  // The point of the whole contract: mid-refetch, the previous result is still readable.
  await expect(rows.first()).toBeVisible();
  expect(await rows.count(), 'the registry blanked while refetching').toBeGreaterThan(0);
});

test('the refresh indicator cannot move the content it sits above', async ({ page }) => {
  await page.goto('/patients');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.MuiDataGrid-row').first()).toBeVisible({ timeout: 30_000 });

  await slowDown(page, '**/clinics/*/patients*');
  await page
    .getByRole('button', { name: /next page/i })
    .first()
    .click()
    .catch(() => {});

  const busyRegion = page.locator('[aria-busy="true"]').first();
  await expect(busyRegion).toBeAttached({ timeout: 10_000 });

  /*
    Taken out of flow, so it cannot push anything down however tall it is. Asserting the CSS
    rather than a pixel measurement, because a pixel measurement passes for the wrong reason when
    the element simply has not rendered yet.
  */
  const position = await busyRegion
    .locator('span[aria-hidden="true"]')
    .first()
    .evaluate((el) => getComputedStyle(el).position)
    .catch(() => null);
  expect(position, 'the refresh indicator is in normal flow and will shift content').toBe(
    'absolute',
  );
});
