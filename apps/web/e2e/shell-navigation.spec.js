const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

/**
 * #266: the staff shell changed shape, not who can reach what.
 *
 * EXPECTED is each E2E identity's navigation as `release/dev` rendered it at 6d2a7ef,
 * before the redesigned rail (label, href). Every role must see exactly that set, in that
 * order, on the desktop rail expanded and collapsed and in the phone menu sheet. A difference
 * here is a permission change wearing a design change's clothes.
 *
 * #267 took two items out of the rail on purpose: Notifications (now "Message delivery", a header
 * icon) and Clinic settings (the account menu). UTILITIES is where each role finds them now; with
 * EXPECTED it is the same set every role had before.
 */
const FLAG_OFF = {
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
    ['My Assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
  ],
  volunteer: [
    ['Dashboard', '/dashboard'],
    ['My Assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
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
    ['Today Board', '/today'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
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
    ['New Patient', '/clinics/:clinicId/patients/new'],
  ],
  volunteer: [
    ['Dashboard', '/dashboard'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
  ],
  manager: [
    ['Dashboard', '/dashboard'],
    ['Today Board', '/today'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New Patient', '/clinics/:clinicId/patients/new'],
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
    ['Today Board', '/today'],
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
        staff: ['Dashboard', 'Stations', 'Today Board', 'Queues'],
        doctor: ['Dashboard', 'Stations', 'Queues', 'Patients'],
        volunteer: ['Dashboard', 'Stations', 'Queues', 'Patients'],
        manager: ['Dashboard', 'Stations', 'Today Board', 'Queues'],
        director: ['Dashboard', 'Today Board', 'Queues', 'Patients'],
      }
    : {
        staff: ['Dashboard', 'Today Board', 'My Assigned', 'Queues'],
        doctor: ['Dashboard', 'My Assigned', 'Queues', 'Patients'],
        volunteer: ['Dashboard', 'My Assigned', 'Queues', 'Patients'],
        manager: ['Dashboard', 'Today Board', 'Queues', 'Patients'],
        director: ['Dashboard', 'Today Board', 'Queues', 'Patients'],
      };

const MESSAGE_DELIVERY = ['Message delivery', '/notifications'];
const CLINIC_SETTINGS = ['Clinic settings', '/settings/clinic'];
const UTILITIES = {
  staff: { header: [MESSAGE_DELIVERY], profile: [CLINIC_SETTINGS] },
  doctor: { header: [MESSAGE_DELIVERY], profile: [] },
  volunteer: { header: [MESSAGE_DELIVERY], profile: [] },
  manager: { header: [MESSAGE_DELIVERY], profile: [] },
  director: { header: [MESSAGE_DELIVERY], profile: [CLINIC_SETTINGS] },
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
        expect(await label.evaluate((el) => getComputedStyle(el).position)).not.toBe('absolute');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const primaryLabels = PHONE_PRIMARY[role];
      const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
      expect((await primary.locator('a').allTextContents()).map((text) => text.trim())).toEqual(
        primaryLabels,
      );
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await expectNav(
        page.getByRole('dialog'),
        role,
        EXPECTED[role].filter(([label]) => !primaryLabels.includes(label)),
      );
    });

    test(`${role} finds message delivery in the header and clinic settings in the account menu`, async ({
      page,
    }) => {
      const { header, profile } = UTILITIES[role];
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard');
      const banner = page.getByRole('banner');
      // Wait for whoami, as the rail does, before counting what is absent.
      await expect(page.locator('#workspace-sidebar nav a').first()).toBeVisible({
        timeout: 20_000,
      });

      for (const [label, href] of header) {
        const icon = banner.getByRole('link', { name: label, exact: true });
        await expect(icon).toHaveAttribute('href', href);
        const box = await icon.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        // A ledger of outbound messages: nothing is unread, so the icon carries no badge.
        await expect(icon).toHaveText('');
        await icon.focus();
        await expect(page.getByRole('tooltip')).toHaveText(label);
      }
      await expect(banner.getByRole('link', { name: 'Message delivery' })).toHaveCount(
        header.length,
      );

      await page.getByRole('button', { name: 'User menu' }).click();
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitem', { name: 'Your settings' })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Clinic settings' })).toHaveCount(
        profile.length,
      );
      for (const [label, href] of profile) {
        await expect(menu.getByRole('menuitem', { name: label })).toHaveAttribute('href', href);
      }
      // Escape can land while the menu is still opening; retry until it has closed.
      await expect(async () => {
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden({ timeout: 1_000 });
      }).toPass();

      // Phone: the header has no room for the icon, so both live at the end of the menu sheet.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(banner.getByRole('link', { name: 'Message delivery' })).toBeHidden();
      await page.getByRole('button', { name: 'More', exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect
        .poll(async () => navItems(sheet, 'Account'), { timeout: 20_000 })
        .toEqual([...header, ...profile]);
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
