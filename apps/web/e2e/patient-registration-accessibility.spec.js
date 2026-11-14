const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('volunteer'), reducedMotion: 'reduce' });

// #261: the Sex trigger had no accessible name, despite a visible label beside it.
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`registration controls are named and keyboard accessible (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await page.addInitScript((value) => localStorage.setItem('nkwapa-theme', value), theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/patients/new');
      await expect(page.getByRole('heading', { name: 'Register a new patient' })).toBeVisible();

      const sex = page.getByRole('combobox', { name: 'Sex', exact: true });
      await expect(sex).toBeVisible();
      // Tab backward from the next field; date inputs have browser-specific segment stops.
      // National ID follows Identity: after Sex come its section help button, then the ID type.
      await page.getByRole('combobox', { name: 'National ID type', exact: true }).focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(sex).toBeFocused();
      await sex.press('Space');
      await expect(page.getByRole('option', { name: 'Unknown', exact: true })).toBeFocused();
      const female = page.getByRole('option', { name: 'Female', exact: true });
      await expect(female).toBeVisible();
      await page.keyboard.press('f');
      await expect(female).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(sex).toHaveText('Female');
      await expect(sex).toBeFocused();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual(
        [],
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    });
  }
}
