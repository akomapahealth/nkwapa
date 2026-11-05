const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

test('login route hands authenticated users back to the workspace', async ({ page }) => {
  await page.goto('/login?next=%2Fdashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Today at a glance')).toBeVisible();
});

// #269: an account with several roles sees one role's section at a time, behind tabs.
test('multi-role dashboard renders the shared sections', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByText('Today at a glance')).toBeVisible();
  const views = page.getByRole('tablist', { name: 'Dashboard view' });
  await expect(views.getByRole('tab')).toHaveText([
    'Clinic trends',
    'Network overview',
    'Doctor queue',
    'Your work today',
  ]);
  for (const [tab, headings] of [
    ['Clinic trends', ['Clinic trends']],
    ['Network overview', ['Network overview']],
    ['Doctor queue', ['Doctor queue', 'Review queue']],
    ['Your work today', ['Your work today']],
  ]) {
    await views.getByRole('tab', { name: tab }).click();
    for (const heading of headings) {
      await expect(
        page.getByRole('tabpanel').getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible();
    }
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

    await expect(page.getByText('Today at a glance')).toBeVisible();

    const hasViewportOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasViewportOverflow).toBeFalsy();

    const chatToggle = page.getByTestId('chat-toggle');
    await expect(chatToggle).toBeVisible();
    await chatToggle.click();

    const chatPanel = page.getByTestId('chat-panel');
    await expect(chatPanel).toBeVisible();

    const bounds = await chatPanel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(bounds.height).toBeLessThanOrEqual(viewport.height - 40);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);

    if (viewport.width >= 1024) {
      expect(bounds.width).toBeGreaterThanOrEqual(380);
      expect(bounds.height).toBeGreaterThanOrEqual(520);
    }
  });
}
