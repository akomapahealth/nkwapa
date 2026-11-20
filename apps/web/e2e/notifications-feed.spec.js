const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/*
  From tablet width the bell opens the latest notifications in place; phones go to the page. The
  page lists rows by day, not a grid of cards.
*/

test.use({ storageState: storageStateFor('manager') });

test('the bell opens a panel on a computer and goes to the page on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  const bell = page.getByRole('banner').getByLabel(/^Notifications/);
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Mark all read' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'See all notifications' })).toHaveAttribute(
    'href',
    '/notifications',
  );
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();

  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(page.getByRole('banner').getByLabel(/^Notifications/)).toHaveAttribute(
    'aria-haspopup',
    'dialog',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('banner').getByLabel(/^Notifications/)).toHaveAttribute(
    'href',
    '/notifications',
  );
});

test('the page lists notifications by day in one column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  const lists = page.getByRole('main').getByRole('list');
  await expect(lists.first().or(page.getByText('No notifications yet'))).toBeVisible();
  if (await lists.count()) {
    const widths = await lists.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().width),
    );
    const rows = await lists
      .first()
      .locator(':scope > li')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    // Rows span the list: one per line, no card grid.
    for (const width of rows) expect(width).toBeGreaterThanOrEqual(widths[0] - 4);
  }
});
