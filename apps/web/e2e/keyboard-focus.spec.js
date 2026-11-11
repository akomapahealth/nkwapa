const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');

/**
 * R7.2 keyboard and focus polish (WCAG 2.2 AA 2.4.7, 2.4.11, 2.1.1, 2.4.3).
 *
 * Each case fixes something a tab-walk over real routes found: the first control after "Skip to
 * main content" scrolled under the sticky header, Button rings faded in over 150 ms, the page
 * behind an open Select stayed focusable (axe `aria-hidden-focus`), and the public pages
 * smooth-scrolled on every Tab.
 */

/** How much of the focused element is covered by something else, sampled on a 5x5 grid. */
function coveredShare() {
  const el = document.activeElement;
  const r = el.getBoundingClientRect();
  let covered = 0;
  let total = 0;
  for (let i = 1; i <= 5; i++) {
    for (let j = 1; j <= 5; j++) {
      const x = r.left + (r.width * i) / 6;
      const y = r.top + (r.height * j) / 6;
      if (y < 0 || y > innerHeight) continue;
      total++;
      const hit = document.elementFromPoint(x, y);
      if (hit && !el.contains(hit) && !hit.contains(el)) covered++;
    }
  }
  return total ? covered / total : 1;
}

/** True when the focused element shows an outline or a ring in this frame, without waiting. */
function indicatorNow() {
  const s = getComputedStyle(document.activeElement);
  const outline =
    s.outlineStyle !== 'none' &&
    parseFloat(s.outlineWidth) > 0 &&
    !/rgba\(0, 0, 0, 0\)/.test(s.outlineColor);
  return outline || /0px 0px 0px [1-9]/.test(s.boxShadow);
}

async function skipThenTab(page) {
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText(/Skip to (main )?content/);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.keyboard.press('Tab');
}

for (const [role, route, widths] of [
  ['staff', '/patients/new', [1440, 390]],
  ['staff', '/dashboard', [390]],
  ['patient', '/portal/self-reports/new', [390]],
]) {
  test.describe(`${role} ${route}`, () => {
    test.use({ storageState: storageStateFor(role) });
    for (const width of widths) {
      test(`the first control after the skip link clears the sticky header at ${width}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
        await page.goto(route);
        await expect(page.locator('main h1').first()).toBeVisible();
        await skipThenTab(page);
        expect(await page.evaluate(coveredShare)).toBe(0);
        expect(await page.evaluate(indicatorNow)).toBe(true);
      });
    }
  });
}

test.describe('workspace', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('a focused control near the bottom clears the bottom nav and the chat button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/patients');
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.locator('main').focus();
    // Walk the registry: every stop must be fully visible, including the ones the browser
    // scrolls up from under the fixed chrome.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const inMain = await page.evaluate(() => !!document.activeElement.closest('main'));
      if (!inMain) break;
      expect(await page.evaluate(coveredShare), `stop ${i}`).toBe(0);
    }
  });

  test('a button ring is on screen in the frame focus arrives', async ({ page }) => {
    await page.goto('/queues');
    const refresh = page.getByRole('button', { name: 'Refresh queues' });
    await expect(refresh).toBeVisible();
    // A keypress first, so Chromium treats the focus that follows as keyboard focus.
    await expect(refresh).toBeEnabled();
    await page.keyboard.press('Shift');
    await refresh.focus();
    await expect(refresh).toBeFocused();
    expect(await page.evaluate(indicatorNow)).toBe(true);
  });

  test('the page behind an open Select is inert, and focus returns to the trigger', async ({
    page,
  }) => {
    await page.goto('/admin/users');
    const trigger = page.locator('#staff-status-filter');
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    const behind = () =>
      page.locator('#workspace-sidebar').evaluate((el) => !!el.closest('[inert]'));
    expect(await behind()).toBe(true);
    const result = await new AxeBuilder({ page }).withRules(['aria-hidden-focus']).analyze();
    expect(result.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(await behind()).toBe(false);
  });
});

test.describe('public pages', () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'no-preference' });

  test('Tab scrolls the landing page at once, and the skip link lands on main', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await skipThenTab(page);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    const now = await page.evaluate(() => scrollY);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => scrollY)).toBe(now);
    await expect(page.locator(':focus')).toBeInViewport();
  });

  test('a clicked section link still glides to its section', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'About' }).first().click();
    await page.waitForTimeout(60);
    const early = await page.evaluate(() => scrollY);
    await expect(page.locator('#about')).toBeInViewport({ timeout: 5000 });
    expect(early).toBeLessThan(await page.evaluate(() => scrollY));
    await expect(page).toHaveURL(/#about$/);
  });
});
