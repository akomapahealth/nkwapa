const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

test('login route hands authenticated users back to the workspace', async ({ page }) => {
  await page.goto('/login?next=%2Fdashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Clinic comparison' })).toBeVisible();
});

// W2 (owner decision): one home for the main role, never a stack or a role switcher. This account
// holds every role, so it gets the system administrator's network home.
test('multi-role dashboard is one home for the main role', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { name: 'Clinic comparison' })).toBeVisible();
  await expect(page.locator('[data-main-role]')).toHaveAttribute('data-main-role', 'SYSTEM_ADMIN');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const strip = page.getByRole('list', { name: 'Network overview' });
  await expect(strip.getByRole('listitem')).toHaveCount(4);
  await expect(strip).toContainText('staff accounts');
  await expect(page.getByRole('tablist', { name: 'Dashboard view' })).toHaveCount(0);
  await expect(page.getByText('Today at a glance')).toHaveCount(0);
  // The other roles' sections are not on the page; their work is at most a line each.
  for (const heading of [
    'Recently finalized visits',
    'Patient registrations in the last 30 days',
  ]) {
    await expect(page.getByRole('heading', { name: heading })).toHaveCount(0);
  }
});

const viewports = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`dashboard and chat stay responsive on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Clinic comparison' })).toBeVisible();

    const hasViewportOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasViewportOverflow).toBeFalsy();

    const chatToggle = page.getByTestId('chat-toggle');
    await expect(chatToggle).toBeVisible();
    await chatToggle.click();

    const chatPanel = page.getByTestId('chat-panel');
    await expect(chatPanel).toBeVisible();

    if (viewport.width < 600)
      await expect.poll(async () => Math.round((await chatPanel.boundingBox()).y)).toBe(0);
    const bounds = await chatPanel.boundingBox();
    expect(bounds).not.toBeNull();
    if (viewport.width < 600) {
      expect(bounds.width).toBe(viewport.width);
      expect(bounds.height).toBe(viewport.height);
    } else {
      expect(bounds.width).toBeLessThanOrEqual(viewport.width - 8);
      expect(bounds.height).toBeLessThanOrEqual(viewport.height - 40);
    }
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);

    if (viewport.width >= 1024) {
      expect(bounds.width).toBeGreaterThanOrEqual(380);
      expect(bounds.height).toBeGreaterThanOrEqual(520);
    }
  });
}
