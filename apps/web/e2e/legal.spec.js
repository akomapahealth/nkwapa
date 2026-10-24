const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = [
  { path: '/privacy', title: 'Privacy notice' },
  { path: '/terms', title: 'Terms of use' },
];

test('the landing footer links to both pages', async ({ page }) => {
  await page.goto('/');
  for (const { path, title } of PAGES) {
    await page
      .locator('footer')
      .getByRole('link', { name: title.split(' ')[0] })
      .click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await page.goto('/');
  }
});

for (const { path, title } of PAGES) {
  test.describe(path, () => {
    test('is public, with one h1 and working contents links', async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);

      const contents = page.getByRole('navigation', { name: 'Contents' }).getByRole('link');
      expect(await contents.count()).toBeGreaterThan(5);
      for (const href of await contents.evaluateAll((links) =>
        links.map((link) => link.getAttribute('href')),
      )) {
        await expect(page.locator(href), href).toHaveCount(1);
      }
    });

    test('section links lead back to the landing page', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Product' })
        .click();
      await expect(page).toHaveURL('/#product');
      await expect(page.locator('#product')).toBeInViewport();
    });

    test('fits small and large screens without sideways scrolling', async ({ page }) => {
      for (const viewport of [
        { width: 320, height: 640 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
      }
    });

    test('has no WCAG 2.2 AA violations axe can detect', async ({ page }) => {
      for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations, colorScheme).toEqual([]);
      }
    });
  });
}
