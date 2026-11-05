const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

/*
  #229 Phase 00: the "before" picture for the Nkwapa 2.0 redesign.

  Not a test of anything. It walks each role's top routes at the three QA-matrix widths, in light
  and dark, saves a full-page screenshot of each, and records axe's serious/critical findings, so
  every later phase has something to compare against. It skips itself unless DESIGN_BASELINE=1,
  because CI has no use for 120 screenshots and the run takes minutes.

  Output goes to DESIGN_BASELINE_DIR (default: the OS temp dir), never into the repo: Playwright
  wipes test-results/ on every run, and ~120 images do not belong in git. Screenshots use seeded
  E2E data only; never point this at a database holding real patients.
*/

const ENABLED = process.env.DESIGN_BASELINE === '1';
const OUT_DIR =
  process.env.DESIGN_BASELINE_DIR || path.join(require('os').tmpdir(), 'nkwapa-design-baseline');
const THEME_STORAGE_KEY = 'nkwapa-theme';
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];
const THEMES = ['light', 'dark'];

const PLAN = {
  public: ['/', '/privacy'],
  staff: [
    '/dashboard',
    '/today',
    '/queues',
    '/patients',
    '/appointments',
    '/audit',
    '/metrics',
    '/admin/users',
    '/admin/clinics',
    '/reports/organization',
  ],
  doctor: ['/dashboard', '/queues', '/patients'],
  volunteer: ['/dashboard', '/patients', '/patients/new'],
  manager: ['/dashboard', '/today', '/queues'],
  director: ['/dashboard', '/metrics', '/audit'],
  patient: ['/portal', '/portal/appointments', '/portal/health'],
};

function slug(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/[\]]/g, '_');
}

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set DESIGN_BASELINE=1 to capture the #229 design baseline.');

const findings = [];

test.afterAll(() => {
  if (!ENABLED) return;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'axe.json'), JSON.stringify(findings, null, 2));
});

for (const [role, routes] of Object.entries(PLAN)) {
  test.describe(role, () => {
    if (role !== 'public') test.use({ storageState: storageStateFor(role) });
    test.use({ reducedMotion: 'reduce' });

    for (const route of routes) {
      test(`${role} ${route}`, async ({ page }) => {
        test.setTimeout(240_000);
        for (const theme of THEMES) {
          await page.addInitScript(
            ([key, value]) => window.localStorage.setItem(key, value),
            [THEME_STORAGE_KEY, theme],
          );
          for (const viewport of VIEWPORTS) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto(route);
            await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
            await page.waitForLoadState('networkidle').catch(() => {});

            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            const file = path.join(OUT_DIR, role, `${slug(route)}--${viewport.name}--${theme}.jpg`);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 70 });

            // Axe once per theme, at desktop and mobile; tablet rarely differs in violations.
            if (viewport.name === 'tablet') continue;
            const results = await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
              .analyze();
            findings.push({
              role,
              route,
              theme,
              viewport: viewport.name,
              horizontalOverflow: scrollWidth > viewport.width,
              violations: results.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                nodes: v.nodes.length,
                help: v.help,
              })),
            });
          }
        }
      });
    }
  });
}
