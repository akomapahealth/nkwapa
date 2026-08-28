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
 * This measures `#main-content`, not `documentElement`. The shell gives main `overflow-auto`, so
 * the document can never report horizontal overflow no matter how wide its content is -- a
 * document-level probe passes every route for the wrong reason. Verified by injecting a 2000px
 * element and watching the document-level number stay at zero. Main scrolling sideways is the
 * real signal: it means content escaped whatever container was supposed to hold it.
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
  { path: '/reminders', heading: /reminders/i },
  { path: '/audit', heading: /audit/i },
  { path: '/admin/users', heading: /staff/i },
  { path: '/admin/clinics', heading: /clinics/i },
];

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const main = document.querySelector('#main-content');
    if (!main) throw new Error('#main-content is missing; the shell did not render');
    const doc = document.documentElement;
    return Math.max(main.scrollWidth - main.clientWidth, doc.scrollWidth - doc.clientWidth);
  });
}

for (const { name, width, height } of BREAKPOINTS) {
  test(`migrated routes stay inside the viewport on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });

    for (const route of ROUTES) {
      await page.goto(route.path);

      // Wait for the page itself, not just navigation: a skeleton has no overflow to find, so
      // measuring too early would pass every route for the wrong reason.
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible({
        timeout: 15_000,
      });

      const overflow = await horizontalOverflow(page);
      expect(overflow, `${route.path} scrolls horizontally at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
}
