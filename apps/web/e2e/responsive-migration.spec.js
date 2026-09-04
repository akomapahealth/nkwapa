const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * Every migrated route, at every width the design system commits to.
 *
 * The Phase 6 migration touched roughly thirty surfaces, and the existing suite checks horizontal
 * overflow on three of them. The rest were covered by "do a manual pass at 375, 768, 1024 and
 * 1440", which is a real instruction that nobody performs twice. This performs it.
 *
 * Overflow is the specific failure a layout migration causes: a fixed min-width, a wide table
 * that escapes its scroll container, a decorative element that is not clipped. It is invisible on
 * a laptop and makes a page unusable on the phone a volunteer actually carries.
 *
 * 640 is in the list because it is what 1280 becomes at 200% zoom, which is WCAG 1.4.4.
 *
 * Two things about how this is written are deliberate.
 *
 * It measures `#main-content`, not `documentElement`. The shell gives main `overflow-auto`, so the
 * document can never report horizontal overflow however wide its content grows -- the obvious
 * probe passes every route for the wrong reason. Verified by injecting a 2000px element and
 * watching the document number stay at zero while the main number went to 1657.
 *
 * It loads each route once and resizes, rather than navigating per breakpoint. Fifty navigations
 * tripped the API rate limiter and took six unrelated specs down with it. Ten navigations and
 * fifty resizes measure the same thing, because a resize re-runs layout and layout is the subject.
 */
const BREAKPOINTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: '200% zoom', width: 640, height: 512 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'small laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** Routes with a stable address and no fixture setup. Heading proves the page really rendered. */
const ROUTES = [
  { path: '/dashboard', heading: /today at a glance/i },
  { path: '/today', heading: /today board/i },
  { path: '/my/assigned', heading: /my assigned/i },
  { path: '/queues', heading: /queues/i },
  { path: '/patients', heading: /patients/i },
  { path: '/appointments', heading: /appointments/i },
  { path: '/notifications', heading: /notifications/i },
  { path: '/audit', heading: /audit/i },
  { path: '/admin/users', heading: /staff/i },
  { path: '/admin/clinics', heading: /clinics/i },
  { path: '/admin/duplicates', heading: /duplicate review/i },
];

function horizontalOverflow(page) {
  return page.evaluate(() => {
    const main = document.querySelector('#main-content');
    if (!main) throw new Error('#main-content is missing; the shell did not render');
    const doc = document.documentElement;
    return Math.max(main.scrollWidth - main.clientWidth, doc.scrollWidth - doc.clientWidth);
  });
}

for (const route of ROUTES) {
  test(`${route.path} stays inside the viewport at every supported width`, async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS[BREAKPOINTS.length - 1]);
    await page.goto(route.path);
    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible({
      timeout: 15_000,
    });

    for (const { name, width, height } of BREAKPOINTS) {
      await page.setViewportSize({ width, height });
      const overflow = await horizontalOverflow(page);
      expect(
        overflow,
        `${route.path} scrolls horizontally on ${name} (${width}px)`,
      ).toBeLessThanOrEqual(1);
    }
  });
}

/*
  The portal, at the same widths.

  It needs its own block because it needs its own identity: a staff account has no portal, which
  is why roughly 2,900 lines of migrated portal screens sat outside this pass entirely. The
  breakpoint list and the load-wide-then-resize sequence are the same, for the same reasons.
*/
test.describe('the patient portal', () => {
  test.use({ storageState: storageStateFor('patient') });

  const PORTAL_ROUTES = [
    { path: '/portal', heading: /your care snapshot/i },
    { path: '/portal/health', heading: /blood pressure trend/i },
    { path: '/portal/appointments', heading: /appointments and requests/i },
    { path: '/portal/appointments/request', heading: /visit request details/i },
    { path: '/portal/self-reports/new', heading: /measurement details/i },
  ];

  for (const route of PORTAL_ROUTES) {
    test(`${route.path} stays inside the viewport at every supported width`, async ({ page }) => {
      await page.setViewportSize(BREAKPOINTS[BREAKPOINTS.length - 1]);
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible({
        timeout: 15_000,
      });

      for (const { name, width, height } of BREAKPOINTS) {
        await page.setViewportSize({ width, height });
        const overflow = await horizontalOverflow(page);
        expect(
          overflow,
          `${route.path} scrolls horizontally on ${name} (${width}px)`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});
