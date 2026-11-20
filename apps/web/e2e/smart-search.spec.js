const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

const bar = (page) =>
  page.getByRole('combobox', { name: 'Search pages, actions, patients and staff' });
const results = (page) => page.getByRole('listbox', { name: 'Results' });

test.describe('smart search as a system admin with several clinics', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('the magnifier and Cmd/Ctrl+K open the bar, and Enter goes to the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    const header = page.getByRole('banner');
    const trigger = header.getByRole('button', { name: 'Search', exact: true });
    await expect(trigger).toBeVisible();

    // The switcher no longer stretches across the navbar on desktop.
    const clinic = header.getByRole('combobox', { name: /Active clinic:/ });
    expect((await clinic.boundingBox()).width).toBeLessThanOrEqual(20 * 16 + 1);

    await trigger.click();
    await expect(bar(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.keyboard.press('ControlOrMeta+k');
    await bar(page).fill('follow');
    await expect(results(page).getByRole('option').first()).toContainText('Follow-up');
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/follow-up/);
  });
});

test.describe('smart search as a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('offers no admin pages and never asks for staff', async ({ page }) => {
    const staffRequests = [];
    page.on('request', (request) => {
      if (/\/users\/search/.test(request.url())) staffRequests.push(request.url());
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    await page.getByRole('banner').getByRole('button', { name: 'Search', exact: true }).click();
    const patients = page.waitForResponse((r) => /\/patients\/search/.test(r.url()));
    await bar(page).fill('staff');
    await patients;
    await expect(results(page).getByRole('option', { name: /Roles and access/ })).toHaveCount(0);
    expect(staffRequests).toEqual([]);
  });

  test('on a phone it opens from the More sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Search', exact: true }),
    ).toBeHidden();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: /Search pages/ })
      .click();
    await expect(bar(page)).toBeFocused();
  });
});
