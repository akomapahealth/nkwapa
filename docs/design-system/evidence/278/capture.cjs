// #278 landing page evidence: `node capture.cjs <before|after>` from the repository root, with
// the web build served at BASE_URL (default http://localhost:3100). No sign-in or database needed.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = path.join(__dirname, process.argv[2] || 'after');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const findings = [];
  for (const theme of ['light', 'dark']) {
    // Full-page shots cannot show a pinned scene, so 1440 is also taken with reduced motion,
    // where every clinic day step and role sits in the page as a plain list.
    for (const [width, reducedMotion] of [
      [1440, 'no-preference'],
      [390, 'no-preference'],
      [1440, 'reduce'],
    ]) {
      const name = reducedMotion === 'reduce' ? 'landing-reduced-motion' : 'landing';
      const context = await browser.newContext({
        viewport: { width, height: width > 390 ? 900 : 844 },
        colorScheme: theme,
        reducedMotion,
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
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({
        path: path.join(OUT, `${name}--${width}--${theme}.jpg`),
        fullPage: width > 390,
        type: 'jpeg',
        quality: 70,
      });
      const r = await new AxeBuilder({ page }).analyze();
      findings.push({
        name,
        width,
        theme,
        height,
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          targets: v.nodes.map((n) => n.target.join(' ')),
        })),
        incomplete: r.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.length })),
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
      f.height,
      f.violations.map((v) => `${v.id}:${v.impact}:${v.nodes}`).join(' ') || 'clean',
    );
})();
