const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * R7.5: a read that failed never reads as "nothing here", and every failure offers a way back.
 * The offline-versus-empty chart cases live with their panels (medication-reconciliation,
 * medical-history); these are the shared surfaces.
 */

test('a staff directory that fails to load says so and retries, instead of "No users found"', async ({
  page,
}) => {
  let failing = true;
  await page.route(/\/clinics\/[^/]+\/chat\/users$/, (route) =>
    failing ? route.fulfill({ status: 503, body: '{}' }) : route.fallback(),
  );
  await page.goto('/today');
  const opener = page.getByRole('button', { name: 'Open chat' });
  await expect(opener).toBeVisible({ timeout: 30_000 });
  await opener.click();
  await page.getByRole('button', { name: 'New message' }).first().click();

  await expect(page.getByText('The staff list could not load')).toBeVisible();
  await expect(page.getByText(/No users found|No other staff/)).toHaveCount(0);

  failing = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('The staff list could not load')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Loading staff' })).toHaveCount(0);
});

test('avatars take a measured per-person tone, the same on every surface', async ({ page }) => {
  await page.goto('/account');
  const profile = page.locator('#main-content [data-avatar-tone]').first();
  await expect(profile).toBeVisible({ timeout: 30_000 });
  const tone = await profile.getAttribute('data-avatar-tone');
  expect(Number(tone)).toBeGreaterThanOrEqual(1);
  expect(Number(tone)).toBeLessThanOrEqual(8);
  // The header avatar is the same person, so the same tone.
  await expect(page.locator('header [data-avatar-tone]').first()).toHaveAttribute(
    'data-avatar-tone',
    tone,
  );
  const colours = await profile.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colours.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(colours.background).not.toBe(colours.color);
});

test('the not-found page is one calm sheet with a way back, and no eyebrow', async ({ page }) => {
  await page.goto('/this-route-does-not-exist');
  await expect(
    page.getByRole('heading', { level: 1, name: "This page couldn't be found" }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open dashboard' })).toBeVisible();
  await expect(page.getByText('Recovery actions')).toHaveCount(0);
  await expect(page.getByText('Page status')).toHaveCount(0);
});
