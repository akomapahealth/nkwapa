const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

/**
 * #266: the staff shell changed shape, not who can reach what.
 *
 * EXPECTED is each E2E identity's navigation as `release/dev` rendered it at 6d2a7ef,
 * before the redesigned rail (label, href). Every role must see exactly that set, in that
 * order, on the desktop rail expanded and collapsed and in the phone menu sheet. A difference
 * here is a permission change wearing a design change's clothes. #267 moves Notifications and
 * Clinic settings out of the rail and updates this list on purpose.
 */
const EXPECTED = {
  staff: [
    ['Dashboard', '/dashboard'],
    ['Today Board', '/today'],
    ['My Assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Notifications', '/notifications'],
    ['Research exports', '/research'],
    ['Clinic settings', '/settings/clinic'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Organization report', '/reports/organization'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
    ['Cross-clinic duplicates', '/admin/duplicates/cross-clinic'],
  ],
  doctor: [
    ['Dashboard', '/dashboard'],
    ['My Assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
    ['Notifications', '/notifications'],
  ],
  volunteer: [
    ['Dashboard', '/dashboard'],
    ['My Assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
    ['Notifications', '/notifications'],
  ],
  manager: [
    ['Dashboard', '/dashboard'],
    ['Today Board', '/today'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Notifications', '/notifications'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
  director: [
    ['Dashboard', '/dashboard'],
    ['Today Board', '/today'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Notifications', '/notifications'],
    ['Research exports', '/research'],
    ['Clinic settings', '/settings/clinic'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
};

const SIDEBAR_KEY = 'nkwapa.sidebar.collapsed';

/** The rendered set, with the active clinic's id written as `:clinicId`. */
async function navItems(scope) {
  return scope
    .locator('nav[aria-label="Workspace"] a')
    .evaluateAll((links) =>
      links.map((a) => [
        a.textContent.trim(),
        a.getAttribute('href').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, ':clinicId'),
      ]),
    );
}

/** The rail fills in once whoami resolves; wait for the expected count, then compare. */
async function expectNav(scope, role) {
  await expect
    .poll(async () => (await navItems(scope)).length, { timeout: 20_000 })
    .toBe(EXPECTED[role].length);
  expect(await navItems(scope)).toEqual(EXPECTED[role]);
}

for (const role of Object.keys(EXPECTED)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role) });

    test(`${role} sees the same navigation on the rail, collapsed and in the phone sheet`, async ({
      page,
    }) => {
      await page.addInitScript((key) => localStorage.setItem(key, 'false'), SIDEBAR_KEY);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard');
      const rail = page.locator('#workspace-sidebar');
      await expectNav(rail, role);

      await page.getByRole('button', { name: 'Collapse navigation' }).click();
      await expectNav(rail, role);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expectNav(page.getByRole('dialog'), role);
    });
  });
}

test.describe('rail behaviour', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('marks the current page, collapses from the keyboard and names icons on focus', async ({
    page,
  }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'false'), SIDEBAR_KEY);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/queues');
    const rail = page.locator('#workspace-sidebar');
    const current = rail.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('Queues');

    const toggle = page.getByRole('button', { name: 'Collapse navigation' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await rail.evaluate((el) => el.getBoundingClientRect().width)).toBe(232);

    // `[` collapses; it must not fire while typing.
    await page.locator('body').press('[');
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBe(64);

    // Collapsed, each icon keeps its name for assistive tech and shows it on keyboard focus.
    const queues = rail.getByRole('link', { name: 'Queues', exact: true });
    await queues.focus();
    await expect(page.getByRole('tooltip')).toHaveText('Queues');
    const box = await queues.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);

    await page.locator('body').press('[');
    await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible();
  });

  test('the rail and its edge run the full height of a long page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /today at a glance/i })).toBeVisible({
      timeout: 15_000,
    });
    const { rail, doc } = await page.evaluate(() => ({
      rail: document.getElementById('workspace-sidebar').getBoundingClientRect().height,
      doc: document.documentElement.scrollHeight,
    }));
    expect(doc).toBeGreaterThan(700);
    expect(rail).toBeGreaterThanOrEqual(doc - 1);
  });

  test('the header names the clinic and the role in text, with one refresh', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    const header = page.getByRole('banner');
    await expect(header.getByText('Doctor', { exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Sync now' })).toHaveCount(1);
    await expect(header.getByRole('button', { name: /refresh/i })).toHaveCount(0);
  });
});
