const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const { hitTarget } = require('../playwright/hit-target');

/**
 * #266: the staff shell changed shape, not who can reach what.
 *
 * EXPECTED is each E2E identity's navigation as `release/dev` rendered it at 6d2a7ef,
 * before the redesigned rail (label, href). Every role must see exactly that set, in that
 * order, on the desktop rail expanded and collapsed and in the phone menu sheet. A difference
 * here is a permission change wearing a design change's clothes.
 *
 * #267 took items out of the rail on purpose: the Notifications bell (a header icon for everyone)
 * and Message delivery and Clinic settings (the account menu). UTILITIES is where each role finds them now; with
 * EXPECTED it is the same set every role had before.
 */
const FLAG_OFF = {
  staff: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['My assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Research exports', '/research'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Organization report', '/reports/organization'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
    ['Cross-clinic duplicates', '/admin/duplicates/cross-clinic'],
  ],
  doctor: [
    ['Dashboard', '/dashboard'],
    ['My assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
  ],
  volunteer: [
    ['Dashboard', '/dashboard'],
    ['My assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
  ],
  manager: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
  director: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Research exports', '/research'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
};

// Independent station-enabled expectations, from the seeded roles' permissions in
// apps/api/src/auth/constants/permissions.ts: director cannot work stations.
// Keep flag-off sets above as the historical contract, without importing production nav helpers.
const FLAG_ON = {
  staff: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Research exports', '/research'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Organization report', '/reports/organization'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
    ['Cross-clinic duplicates', '/admin/duplicates/cross-clinic'],
  ],
  doctor: [
    ['Dashboard', '/dashboard'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
  ],
  volunteer: [
    ['Dashboard', '/dashboard'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
  ],
  manager: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
  director: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Research exports', '/research'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
};
const EXPECTED =
  process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED === 'true' ? FLAG_ON : FLAG_OFF;

// Independent seeded-role presentation contract, not production partition code.
const PHONE_PRIMARY =
  process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED === 'true'
    ? {
        staff: ['Dashboard', 'Stations', 'Today board', 'Queues'],
        doctor: ['Dashboard', 'Stations', 'Queues', 'Patients'],
        volunteer: ['Dashboard', 'Stations', 'Queues', 'Patients'],
        manager: ['Dashboard', 'Stations', 'Today board', 'Queues'],
        director: ['Dashboard', 'Today board', 'Queues', 'Patients'],
      }
    : {
        staff: ['Dashboard', 'Today board', 'My assigned', 'Queues'],
        doctor: ['Dashboard', 'My assigned', 'Queues', 'Patients'],
        volunteer: ['Dashboard', 'My assigned', 'Queues', 'Patients'],
        manager: ['Dashboard', 'Today board', 'Queues', 'Patients'],
        director: ['Dashboard', 'Today board', 'Queues', 'Patients'],
      };

const MESSAGE_DELIVERY = ['Message delivery', '/notifications/delivery'];
const CLINIC_SETTINGS = ['Clinic settings', '/settings/clinic'];
const UTILITIES = {
  staff: { profile: [MESSAGE_DELIVERY, CLINIC_SETTINGS] },
  doctor: { profile: [MESSAGE_DELIVERY] },
  volunteer: { profile: [MESSAGE_DELIVERY] },
  manager: { profile: [MESSAGE_DELIVERY] },
  director: { profile: [MESSAGE_DELIVERY, CLINIC_SETTINGS] },
};

const SIDEBAR_KEY = 'nkwapa.sidebar.collapsed';

/** The rendered set, with the active clinic's id written as `:clinicId`. */
async function navItems(scope, label = 'Workspace') {
  return scope
    .locator(`nav[aria-label="${label}"] a`)
    .evaluateAll((links) =>
      links.map((a) => [
        a.textContent.trim(),
        a.getAttribute('href').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, ':clinicId'),
      ]),
    );
}

/** The rail fills in once whoami resolves; wait for the expected count, then compare. */
async function expectNav(scope, role, expected = EXPECTED[role]) {
  await expect
    .poll(async () => (await navItems(scope)).length, { timeout: 20_000 })
    .toBe(expected.length);
  expect(await navItems(scope)).toEqual(expected);
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

      await page.setViewportSize({ width: 744, height: 844 });
      await expectNav(rail, role);
      await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBe(76);
      for (const link of await rail.locator('nav a').all()) {
        const label = link.locator('span');
        expect(await label.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
      }
      const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
      await trigger.click();
      const drawer = page.getByRole('dialog', { name: 'Workspace menu' });
      await expectNav(drawer, role);
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();
      await page.setViewportSize({ width: 390, height: 844 });
      const primaryLabels = PHONE_PRIMARY[role];
      const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
      expect(
        await primary
          .locator('a')
          .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))),
      ).toEqual(primaryLabels);
      const shortLabels = { Dashboard: 'Home', 'Today board': 'Today', 'My assigned': 'Assigned' };
      for (const full of primaryLabels)
        await expect(
          primary.getByRole('link', { name: full, exact: true }).locator('span:visible'),
        ).toHaveText(shortLabels[full] ?? full);
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await expectNav(
        page.getByRole('dialog'),
        role,
        EXPECTED[role].filter(([label]) => !primaryLabels.includes(label)),
      );
    });

    test(`${role} finds the bell in the header and message delivery in the account menu`, async ({
      page,
    }) => {
      const { profile } = UTILITIES[role];
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard');
      const banner = page.getByRole('banner');
      // Wait for whoami, as the rail does, before counting what is absent.
      await expect(page.locator('#workspace-sidebar nav a').first()).toBeVisible({
        timeout: 20_000,
      });

      // The bell's name carries the unread count ("Notifications, 2 unread") when there is one.
      const bell = banner.getByRole('link', { name: /^Notifications/ });
      await expect(bell).toHaveAttribute('href', '/notifications');
      const box = await hitTarget(bell);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      await bell.focus();
      await expect(page.getByRole('tooltip')).toHaveText(/^Notifications/);
      await expect(banner.getByRole('link', { name: 'Message delivery' })).toHaveCount(0);

      await page.getByRole('button', { name: 'User menu' }).click();
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitem', { name: 'Your settings' })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Clinic settings' })).toHaveCount(
        profile.filter(([label]) => label === 'Clinic settings').length,
      );
      for (const [label, href] of profile) {
        await expect(menu.getByRole('menuitem', { name: label })).toHaveAttribute('href', href);
      }
      // Escape can land while the menu is still opening; retry until it has closed.
      await expect(async () => {
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden({ timeout: 1_000 });
      }).toPass();

      // Phone: the bell stays in the header; the account items close the menu sheet.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(banner.getByRole('link', { name: /^Notifications/ })).toBeVisible();
      await page.getByRole('button', { name: 'More', exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect
        .poll(async () => navItems(sheet, 'Account'), { timeout: 20_000 })
        .toEqual(profile);
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
    await expect(page.getByTestId('figure-strip')).toBeVisible({ timeout: 15_000 });
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
