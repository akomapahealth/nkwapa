// #282 landing and What's New evidence: `node capture.cjs <before|after>` from apps/web, with the web
// build served at BASE_URL (default http://localhost:3100). No sign-in or database needed. The long
// release is a temporary harness route (/evidence-282) added to both capture builds, not committed.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = path.join(__dirname, process.argv[2] || 'after');
const summarise = (r) => ({
  violations: r.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    targets: v.nodes.map((n) => n.target.join(' ')),
  })),
  incomplete: r.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.length })),
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const findings = [];
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width > 390 ? 900 : 844 },
        colorScheme: theme,
      });
      const page = await context.newPage();

      await page.goto(BASE + '/');
      await page.waitForLoadState('networkidle').catch(() => {});
      // Scroll through once so every one-shot reveal has played, then back to the top.
      await page.evaluate(async () => {
        for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight / 2) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 150));
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 1200));
      });
      await page.screenshot({
        path: path.join(OUT, `landing-hero--${width}--${theme}.jpg`),
        type: 'jpeg',
        quality: 70,
      });
      await page.screenshot({
        path: path.join(OUT, `landing--${width}--${theme}.jpg`),
        fullPage: true,
        type: 'jpeg',
        quality: 60,
      });
      findings.push({
        name: 'landing',
        width,
        theme,
        height: await page.evaluate(() => document.documentElement.scrollHeight),
        words: await page.evaluate(
          () => document.querySelector('main').innerText.split(/\s+/).length,
        ),
        ...summarise(await new AxeBuilder({ page }).analyze()),
      });

      await page.goto(BASE + '/evidence-282');
      await page.locator('[data-release-banner] button').first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(OUT, `whats-new--${width}--${theme}.jpg`),
        type: 'jpeg',
        quality: 75,
      });
      const measures = await dialog.evaluate((el) => ({
        dialogHeight: Math.round(el.getBoundingClientRect().height),
        itemsShown: [...el.querySelectorAll('li')].filter((li) => li.offsetParent !== null).length,
        tabStops: el.querySelectorAll('a[href], button').length,
      }));
      findings.push({
        name: 'whats-new (39 items)',
        width,
        theme,
        ...measures,
        ...summarise(await new AxeBuilder({ page }).include('[role="dialog"]').analyze()),
      });
      await context.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2));
  await browser.close();
  for (const f of findings)
    console.log(
      f.name,
      f.width,
      f.theme,
      JSON.stringify({
        h: f.height,
        w: f.words,
        d: f.dialogHeight,
        i: f.itemsShown,
        t: f.tabStops,
      }),
      f.violations.map((v) => `${v.id}:${v.impact}:${v.nodes}`).join(' ') || 'clean',
    );
})();
