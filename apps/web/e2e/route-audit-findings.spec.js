const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

/**
 * The moderate axe findings the 2.0 route audit (#309) recorded, held at zero (#313).
 *
 * These are best-practice rules, outside the WCAG tags accessibility.spec.js scans with, so
 * nothing else would notice them coming back. Each route is scanned as the identity the audit
 * found it with.
 */
const RULES = ['page-has-heading-one', 'heading-order', 'empty-table-header', 'region'];

const ROUTES = {
  staff: [
    '/stations',
    '/stations/setup',
    '/admin/data-requests',
    '/reports/organization',
    '/settings',
    '/volunteers',
  ],
  manager: ['/stations'],
  volunteer: ['/stations'],
  director: ['/reports/organization'],
  patient: [
    '/portal',
    '/portal/appointments',
    '/portal/appointments/request',
    '/portal/health',
    '/portal/self-reports',
    '/portal/self-reports/new',
  ],
};

for (const [role, routes] of Object.entries(ROUTES)) {
  test.describe(`as ${role}`, () => {
    test.use({ storageState: storageStateFor(role) });

    for (const route of routes) {
      test(`${route} has no heading, region or table-header findings`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
        // Tables and sections arrive after the page's data, so wait for loading to settle.
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

        const { violations } = await new AxeBuilder({ page }).withRules(RULES).analyze();
        const found = violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        );
        const outline = await page
          .locator('h1, h2, h3, h4, h5, h6')
          .evaluateAll((hs) => hs.map((h) => `${h.tagName} ${h.textContent.trim().slice(0, 40)}`));
        expect(found, `Heading outline:\n${outline.join('\n')}`).toEqual([]);
      });
    }
  });
}

// The #313 re-run found the staff view of a patient record's portal access card nesting its
// definition pairs two divs deep, which a screen reader reads as loose text.
test.describe('patient record as staff', () => {
  test.use({ storageState: storageStateFor('staff') });

  for (const width of [390, 1440]) {
    test(`definition lists are well formed at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/patients');
      // The registry renders the table and the phone cards together and hides one, so read the
      // first record link's href whether or not it is the visible copy.
      const link = page.locator('main a[href*="/patients/"]:not([href$="/new"])').first();
      await link.waitFor({ state: 'attached', timeout: 30_000 });
      await page.goto(await link.getAttribute('href'));
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

      const { violations } = await new AxeBuilder({ page })
        .withRules(['definition-list', 'dlitem', ...RULES])
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual(
        [],
      );
    });
  }
});
