const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

/*
  The patient portal, signed in as a patient.

  Roughly 2,900 lines of portal screens were migrated in #86 and not one of them was ever loaded
  by this suite, because the suite had no patient: every spec ran as staff, and staff do not have
  a portal. That made the portal simultaneously the largest and the least verified part of the
  migration. `playwright/roles.js` now carries a `patient` identity, seeded and linked to a real
  patient record through `Patient.portalUserId`.
*/

test.use({ storageState: storageStateFor('patient') });

/** Every portal route, with something on it that proves the right screen rendered. */
const PORTAL_ROUTES = [
  { path: '/portal', heading: /your care snapshot/i },
  { path: '/portal/health', heading: /blood pressure trend/i },
  // Deliberately the same screen as /portal/health; both route files render HealthPortalScreen.
  { path: '/portal/self-reports', heading: /blood pressure trend/i },
  { path: '/portal/appointments', heading: /appointments and requests/i },
  { path: '/portal/appointments/request', heading: /visit request details/i },
  { path: '/portal/self-reports/new', heading: /measurement details/i },
];

/** Staff surfaces a patient must never be shown the contents of. */
const STAFF_ROUTES = [
  '/dashboard',
  '/patients',
  '/today',
  '/queues',
  '/admin/users',
  '/admin/duplicates',
  '/audit',
];

for (const route of PORTAL_ROUTES) {
  test(`the portal renders ${route.path} for a patient`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: route.heading })).toBeVisible({
      timeout: 20_000,
    });

    /*
      The portal must be showing this patient's own record, not the state it falls back to when
      the account is not linked. That fallback renders on a healthy page, so a spec that only
      checks the route loaded would pass while every patient saw "ask your clinic to link this
      account".
    */
    await expect(page.getByText(/link this account|not linked to a patient record/i)).toHaveCount(
      0,
    );
  });
}

test('a patient is refused every staff surface', async ({ page }) => {
  // The boundary #82 cares about most, and the one identity that could never be used to test it.
  for (const path of STAFF_ROUTES) {
    await page.goto(path);
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/do not have access|don't have access/i),
      `${path} did not refuse a patient`,
    ).toBeVisible({ timeout: 20_000 });
  }
});

test('the portal has no automatically detectable accessibility violations', async ({ page }) => {
  const failures = [];
  for (const route of PORTAL_ROUTES) {
    await page.goto(route.path);
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    for (const violation of results.violations) {
      failures.push(
        `${route.path}: ${violation.id} (${violation.nodes.length}) — ${violation.help}`,
      );
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('a patient can reach every portal action by keyboard', async ({ page }) => {
  await page.goto('/portal');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });

  // Every stop must show where it is. Focus that lands somewhere invisible is focus lost.
  const stops = [];
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const ring = style.getPropertyValue('--tw-ring-shadow');
      return {
        name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.tagName,
        visible: el.getBoundingClientRect().width > 0,
        focusVisible:
          style.outlineStyle !== 'none' ||
          Number.parseFloat(style.outlineWidth) > 0 ||
          (ring !== '' && ring !== '0 0 #0000'),
      };
    });
    if (!stop) break;
    stops.push(stop);
  }

  expect(stops.length, 'nothing on the portal was reachable by keyboard').toBeGreaterThan(3);
  const blind = stops.filter((stop) => stop.visible && !stop.focusVisible);
  expect(
    blind.map((stop) => stop.name),
    'these take focus with no visible indicator',
  ).toEqual([]);
});
