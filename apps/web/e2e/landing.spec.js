const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.use({ storageState: { cookies: [], origins: [] } });

/** docs/design/landing-page-redesign.md section 8, plus a short laptop and a landscape phone. */
const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 700 },
  { width: 844, height: 390 },
];

const CTA_HREFS = [
  'mailto:info@akomapa.org',
  'https://akomapa.org',
  '/privacy',
  '/terms',
  '/cookies',
  '/login?next=%2Fstatus',
];

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y <= document.documentElement.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  });
}

test('says what Nkwapa is in a single h1', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'One record for every visit, even offline.',
  );
});

test('fits every supported viewport without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
  }
});

test('status panel opens by keyboard, lists components, and copies a readable report', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  let requests = 0;
  await page.route('**/status', (route) => {
    requests += 1;
    return route.fulfill({
      json: {
        status: 'degraded',
        checkedAt: '2026-10-25T00:00:00.000Z',
        components: ['database', 'redis', 'queues', 'email', 'auth', 'web'].map((name) => ({
          name,
          state: name === 'email' ? 'degraded' : 'operational',
          reason: name === 'email' ? 'SEND_FAILED' : 'OK',
          latencyMs: 12,
        })),
      },
    });
  });
  await page.goto('/');
  const trigger = page.locator('footer [data-status-trigger]');
  await expect(trigger).toContainText('Degraded');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'System status' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Some systems are degraded')).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(6);
  await expect(dialog.getByText('The last send failed')).toBeVisible();
  // Once on load and once on open, never on a timer (#201 follow-up).
  expect(requests).toBe(2);
  await dialog.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => requests).toBe(3);
  await dialog.getByRole('button', { name: 'Copy report' }).click();
  await expect(dialog.locator('[aria-live]')).toHaveText('Report copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    '| Email | Degraded |',
  );
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('status panel reports API failure at narrow widths and with reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/status', (route) => route.abort());
  await page.goto('/');
  const trigger = page.locator('footer [data-status-trigger]');
  await expect(trigger).toContainText('API unreachable');
  await trigger.click();
  await expect(page.getByRole('dialog').getByText('The API could not be reached.')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
});

test('status shows a neutral check, then gives up on a silent API after ten seconds', async ({
  page,
}) => {
  await page.clock.install();
  await page.route('**/status', () => undefined);
  await page.goto('/');
  const trigger = page.locator('footer [data-status-trigger]');
  await expect(trigger).toContainText('Checking system status');
  await expect(trigger.locator('span').first()).not.toHaveClass(/bg-destructive/);
  await page.clock.fastForward(10_000);
  await expect(trigger).toContainText('API unreachable');
});

test('opens on a real clinic photograph, with nothing competing with it', async ({ page }) => {
  for (const viewport of [VIEWPORTS[2], VIEWPORTS[7]]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const photo = page.locator('#top img[src*="Akomapa-17"]');
    await expect(photo).toBeInViewport();
    expect(await photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    // Eager and high priority: the LCP must not wait for a lazy-load observer or for hydration.
    await expect(photo).toHaveAttribute('fetchpriority', 'high');
  }
  // #282: one picture in the hero; the product screens start in the sections below it.
  await expect(page.locator('#top img')).toHaveCount(1);
  // No photograph on the page carries a caption.
  await expect(page.locator('main figcaption')).toHaveCount(0);
});

test('the about photograph ends at full width once scrolled in', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await scrollThrough(page);
  const photo = page.locator('[data-expand]');
  await photo.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(1200);
  // Every inset back to zero (or no clip at all): no digit other than 0 left in the value.
  expect(await photo.evaluate((el) => getComputedStyle(el).clipPath)).toMatch(/^[^1-9]*$/);
});

test('every link goes somewhere real', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  for (const href of hrefs) {
    if (href.startsWith('#')) {
      expect(await page.locator(href).count(), href).toBe(1);
    } else {
      expect(CTA_HREFS, href).toContain(href);
    }
  }
  await expect(page.locator('[data-cta="contact"]').first()).toHaveAttribute(
    'href',
    'mailto:info@akomapa.org',
  );
});

test('the release banner names the latest version and stays dismissed', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('complementary', { name: 'Latest release' });
  await expect(banner).toContainText(/Nkwapa \d+\.\d+/);
  await banner.getByRole('button', { name: 'Dismiss the release update' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-release-banner]')).toHaveCount(0);
});

test("the release banner opens what's new and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page
    .getByRole('complementary', { name: 'Latest release' })
    .getByRole('button', { name: /Nkwapa \d+\.\d+\.\d+ is out now/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(/What's new in Nkwapa/);
  await expect(dialog.getByRole('heading', { level: 3 }).first()).toBeVisible();
  // Only the list scrolls: the close button stays in view, and Tab reaches the change list.
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport();
  await expect(dialog.getByRole('region', { name: 'Changes in this release' })).toBeVisible();
  // Let the entrance finish so axe measures settled colours; the heartbeat pulse loops forever.
  await dialog.evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('mobile menu opens, navigates, and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open menu' });

  await trigger.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await menu.getByRole('link', { name: 'How it works' }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator('#how-it-works')).toBeInViewport();
});

test('the theme toggle overrides a dark OS setting and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveClass(/\bdark\b/);

  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(html).not.toHaveClass(/\bdark\b/);

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(html).toHaveClass(/\bdark\b/);
});

test('scroll reveals finish with all content visible', async ({ page }) => {
  await page.goto('/');
  await scrollThrough(page);
  await page.waitForTimeout(1000);
  const hidden = await page
    .locator('[data-reveal]')
    .evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== '1').length);
  expect(hidden).toBe(0);
});

test('the clinic day and role deck pin on wide screens and end on their last step', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('[data-journey-pinned]')).toHaveCount(1);
  await expect(page.locator('[data-deck-pinned]')).toHaveCount(1);
  await scrollThrough(page);
  await page.locator('#care-teams').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-step-text]').last()).toBeVisible();
  await page.locator('#about').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-deck-text]').last()).toBeVisible();
});

test('smooth scrolling leaves the keyboard, find-in-page targets and dialogs native', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\blenis\b/);

  // Keyboard scrolling is the browser's own, not intercepted.
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('End');
  await expect
    .poll(() => page.evaluate(() => scrollY + innerHeight >= document.body.scrollHeight - 2))
    .toBe(true);

  // An element scrolled into view natively stays put rather than being dragged back.
  await page.evaluate(() =>
    document.getElementById('about').scrollIntoView({ behavior: 'instant' }),
  );
  await page.waitForTimeout(500);
  await expect(page.locator('#about')).toBeInViewport();

  // The wheel does not move the page behind an open dialog.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page
    .getByRole('complementary', { name: 'Latest release' })
    .getByRole('button', { name: /Nkwapa \d+\.\d+\.\d+ is out now/ })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(40, 450);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('content is visible without scrolling it into view', async ({ page }) => {
    await page.goto('/');
    const states = await page
      .locator('[data-reveal], [data-journey-step], [data-deck-item]')
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).opacity + getComputedStyle(el).visibility),
      );
    expect(states.length).toBeGreaterThan(10);
    expect(new Set(states)).toEqual(new Set(['1visible']));
  });

  test('the clinic day is a plain list with every step and image showing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-journey-pinned]')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
    const steps = page.locator('[data-journey-step]');
    await expect(steps).toHaveCount(5);
    for (const step of await steps.all()) {
      await step.scrollIntoViewIfNeeded();
      await expect(step.locator('h3')).toBeVisible();
      await expect(step.locator('img').first()).toBeVisible();
    }
  });

  test('has no WCAG 2.2 AA violations axe can detect', async ({ page }) => {
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, colorScheme).toEqual([]);
    }
  });
});
