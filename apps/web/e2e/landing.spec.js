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

const CTA_HREFS = ['mailto:info@akomapa.org', 'https://akomapa.org', '/privacy', '/terms'];

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
    'Patient records and clinic workflows, in one place.',
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

test('shows the real product screenshots above the fold', async ({ page }) => {
  for (const viewport of [VIEWPORTS[2], VIEWPORTS[7]]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const phone = page.locator('#top img[src*="mobile.png"]');
    await expect(phone).toBeVisible();
    expect(await phone.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await expect(page.locator('#top img[src*="desktop.png"]')).toBeVisible();
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

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('content is visible without scrolling it into view', async ({ page }) => {
    await page.goto('/');
    const states = await page
      .locator('[data-reveal], [data-journey-step]')
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).opacity + getComputedStyle(el).visibility),
      );
    expect(states.length).toBeGreaterThan(10);
    expect(new Set(states)).toEqual(new Set(['1visible']));
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
