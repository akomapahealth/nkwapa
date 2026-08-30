const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/** The widths the specs commit to supporting. */
const BREAKPOINTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'small laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Access');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-A11Y-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+/, { timeout: 20_000 });
  const url = new URL(page.url());
  const [, , clinicId, , patientId] = url.pathname.split('/');
  return { clinicId, patientId };
}

/**
 * Automated rules catch a real subset of accessibility defects and nothing more. Contrast on
 * rendered charts, the sense of a label, and whether focus order matches reading order still need
 * a person; those are in the operator QA matrix.
 */
async function analyze(page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
}

function describeViolations(violations) {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
    )
    .join('\n\n');
}

test('the patient chart has no automatically detectable accessibility violations', async ({
  page,
}) => {
  const { clinicId, patientId } = await createPatient(page);

  for (const tab of ['overview', 'vitals', 'diabetes', 'visits', 'consent']) {
    await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=${tab}`);
    await expect(page.getByRole('tab', { selected: true })).toBeVisible();

    const { violations } = await analyze(page);
    expect(describeViolations(violations), `tab=${tab}`).toBe('');
  }
});

test('the dashboard, registry, and schedule have no automatically detectable violations', async ({
  page,
}) => {
  // `/appointments` carries a wide data table, a triage panel, and two dialogs, and was outside
  // this sweep until the appointment release gate.
  for (const route of ['/dashboard', '/patients', '/appointments']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const { violations } = await analyze(page);
    expect(describeViolations(violations), route).toBe('');
  }
});

test('a keyboard alone reaches the chart, its tabs, and its content', async ({ page }) => {
  const { clinicId, patientId } = await createPatient(page);
  await page.goto(`/clinics/${clinicId}/patients/${patientId}`);
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();

  // Start from the top of the document, as a keyboard user arriving on the page does, rather
  // than from wherever the previous navigation happened to leave focus.
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Tab');

  // The skip link is the first stop, so a keyboard user does not walk the whole shell first.
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  // Tabs are a roving group: arrows move between them, not Tab.
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Vitals', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeFocused();
});

test('every focused control shows a visible focus indicator', async ({ page }) => {
  const { clinicId, patientId } = await createPatient(page);
  await page.goto(`/clinics/${clinicId}/patients/${patientId}`);
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();

  const focusable = page.locator(
    '#main-content a[href], #main-content button:not([disabled]), [role="tab"]',
  );
  const count = Math.min(await focusable.count(), 15);
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const control = focusable.nth(index);
    if (!(await control.isVisible())) continue;
    await control.focus();

    // Something must change visually on focus, or a keyboard user cannot tell where they are.
    const indicator = await control.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return {
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
      };
    });
    const hasIndicator =
      (indicator.outlineStyle !== 'none' && indicator.outlineWidth !== '0px') ||
      (indicator.boxShadow !== 'none' && indicator.boxShadow !== '');
    expect(hasIndicator, `control ${index} has no focus indicator`).toBe(true);
  }
});

test('the chart stays usable at 200 percent zoom', async ({ page }) => {
  const { clinicId, patientId } = await createPatient(page);

  // 200% zoom at 1280 wide is equivalent to a 640 CSS-pixel viewport, which is what WCAG 1.4.4
  // asks a page to survive without losing content or function.
  await page.setViewportSize({ width: 640, height: 512 });
  await page.goto(`/clinics/${clinicId}/patients/${patientId}`);

  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page scrolls horizontally at 200% zoom').toBeLessThanOrEqual(1);
});

test('reduced motion is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { clinicId, patientId } = await createPatient(page);
  await page.goto(`/clinics/${clinicId}/patients/${patientId}`);

  // The reduce block neutralises motion with 0.01ms rather than 0s, which is deliberate: an
  // animation that never starts also never fires its end event, and code that waits for one would
  // hang. So the assertion is that nothing is perceptibly animated, not that every duration is
  // literally zero.
  const PERCEPTIBLE_MS = 1;
  const animated = await page.evaluate((thresholdMs) => {
    const toMs = (value) =>
      value
        .split(',')
        .map((part) => {
          const trimmed = part.trim();
          return trimmed.endsWith('ms') ? parseFloat(trimmed) : parseFloat(trimmed) * 1000;
        })
        .reduce((longest, current) => Math.max(longest, Number.isFinite(current) ? current : 0), 0);

    return Array.from(document.querySelectorAll('#main-content *'))
      .slice(0, 300)
      .map((node) => {
        const style = window.getComputedStyle(node);
        return {
          selector:
            node.tagName.toLowerCase() +
            (node.className ? `.${String(node.className).split(' ')[0]}` : ''),
          transition: toMs(style.transitionDuration),
          animation: toMs(style.animationDuration),
        };
      })
      .filter((entry) => entry.transition > thresholdMs || entry.animation > thresholdMs);
  }, PERCEPTIBLE_MS);

  expect(animated, 'animation survives prefers-reduced-motion').toEqual([]);
});

for (const breakpoint of BREAKPOINTS) {
  test(`the chart fits a ${breakpoint.name} at ${breakpoint.width} pixels`, async ({ page }) => {
    const { clinicId, patientId } = await createPatient(page);
    await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
    await page.goto(`/clinics/${clinicId}/patients/${patientId}`);

    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${breakpoint.width}px`).toBeLessThanOrEqual(1);
  });
}
