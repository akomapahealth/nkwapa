const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

// Render the shipped foundation CSS with synthetic content. This is a test-only
// specimen, not a new product route or a migration of #265's shared components.
const SPECIMEN = `
<article data-foundations style="max-width:64rem;margin:auto;padding:1.5rem">
  <header style="margin-bottom:2rem">
    <h1 class="type-page-title">Ruled Chart foundations</h1>
    <p class="type-body" style="margin-top:.75rem;max-width:65ch">Synthetic specimen. Not a patient record.</p>
  </header>
  <section class="border-rule-strong" style="border-top-width:2px;border-top-style:solid;padding-top:1rem">
    <h2 class="type-record-title">Ama Example with a deliberately long record heading</h2>
    <p class="type-meta" style="margin-top:.5rem;color:hsl(var(--muted-foreground))">Synthetic identity for layout checks</p>
    <h3 class="type-section-title" style="margin-top:1.5rem">Screening summary</h3>
    <p class="type-label" style="margin-top:.75rem">Completed screenings</p>
    <p class="type-metric">12</p>
    <p class="type-data"><span data-digits="ones">1111</span> / <span data-digits="eights">8888</span></p>
  </section>
  <section class="border-rule" style="border-top-width:1px;border-top-style:solid;margin-top:1.5rem;padding-top:1rem">
    <h2 class="type-section-title">Status surfaces</h2>
    <ul style="display:grid;gap:.75rem;margin-top:1rem">
      <li data-tone="success" class="bg-success-surface text-success-ink type-body" style="padding:1rem">Synced</li>
      <li data-tone="info" class="bg-info-surface text-info-ink type-body" style="padding:1rem">Awaiting review</li>
      <li data-tone="warning" class="bg-warning-surface text-warning-ink type-body" style="padding:1rem">Held offline</li>
      <li data-tone="destructive" class="bg-destructive-surface text-destructive-ink type-body" style="padding:1rem">Save failed</li>
    </ul>
  </section>
</article>`;

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`foundation roles, surfaces and zoom (${theme}, ${width}px)`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('nkwapa-theme', value), theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/privacy');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.evaluate((html) => {
        const main = document.querySelector('main');
        main.className = '';
        main.innerHTML = html;
      }, SPECIMEN);
      await page.evaluate(() => document.fonts.ready);
      const styles = await page.evaluate(() => {
        const get = (role) => {
          const el = document.querySelector(`.type-${role}`);
          const css = getComputedStyle(el);
          return {
            font: css.fontFamily,
            size: css.fontSize,
            lineHeight: css.lineHeight,
            weight: css.fontWeight,
            figures: css.fontVariantNumeric,
          };
        };
        const luminance = (value) => {
          const rgb = value
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((n) => n / 255);
          return rgb
            .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        };
        const tones = [...document.querySelectorAll('[data-tone]')].map((el) => {
          const css = getComputedStyle(el);
          const [low, high] = [luminance(css.color), luminance(css.backgroundColor)].sort(
            (a, b) => a - b,
          );
          return {
            name: el.dataset.tone,
            ratio: (high + 0.05) / (low + 0.05),
            background: css.backgroundColor,
          };
        });
        return {
          roles: Object.fromEntries(
            [
              'page-title',
              'record-title',
              'section-title',
              'body',
              'label',
              'meta',
              'metric',
              'data',
            ].map((role) => [role, get(role)]),
          ),
          tones,
          digits: ['ones', 'eights'].map(
            (kind) =>
              document.querySelector(`[data-digits="${kind}"]`).getBoundingClientRect().width,
          ),
        };
      });
      for (const role of ['page-title', 'record-title'])
        expect(styles.roles[role].font).toMatch(/Source.?Serif.?4/i);
      for (const role of ['section-title', 'body', 'label', 'meta', 'metric', 'data'])
        expect(styles.roles[role].font).toMatch(/IBM.?Plex.?Sans/i);
      expect(styles.roles['page-title'].size).toBe(width === 390 ? '30px' : '36px');
      expect(styles.roles['record-title'].size).toBe(width === 390 ? '24px' : '30px');
      for (const [role, size, lineHeight, weight] of [
        ['section-title', '18px', '28px', '600'],
        ['body', '16px', '24px', '400'],
        ['label', '14px', '20px', '500'],
        ['meta', '12px', '16px', '400'],
        ['metric', '32px', '36px', '600'],
        ['data', '14px', '20px', '400'],
      ]) {
        expect(styles.roles[role]).toMatchObject({ size, lineHeight, weight });
      }
      expect(styles.roles.metric.figures).toContain('tabular-nums');
      expect(styles.roles.data.figures).toContain('tabular-nums');
      expect(styles.digits[0]).toBeCloseTo(styles.digits[1], 2);
      for (const tone of styles.tones) {
        expect(tone.background).not.toBe('rgba(0, 0, 0, 0)');
        expect(tone.ratio).toBeGreaterThanOrEqual(4.5);
      }
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      if (process.env.DESIGN_FOUNDATIONS_DIR) {
        fs.mkdirSync(process.env.DESIGN_FOUNDATIONS_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.DESIGN_FOUNDATIONS_DIR, `specimen-${width}-${theme}.jpg`),
          fullPage: true,
          type: 'jpeg',
          quality: 85,
        });
      }
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      const zoomed = await page.locator('[data-foundations]').evaluate((el) => ({
        client: el.clientWidth,
        scroll: el.scrollWidth,
        body: getComputedStyle(el.querySelector('.type-body')).fontSize,
      }));
      expect(zoomed.body).toBe('32px');
      expect(zoomed.scroll).toBeLessThanOrEqual(zoomed.client);
    });
  }
}
