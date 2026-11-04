// #280 motion and feedback evidence: `node capture.cjs <before|after>` from the repository root,
// with a web build served at BASE_URL (default http://localhost:3100). No sign-in or API needed.
// The harness route (/evidence-280) is a temporary page added to both capture builds only; it
// renders the shared DashboardLoadingState, Checkbox, Tabs and two toasts. It is not committed.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = path.join(__dirname, process.argv[2] || 'after');

async function axe(page, name, width, theme, findings) {
  const r = await new AxeBuilder({ page }).analyze();
  findings.push({
    name,
    width,
    theme,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      targets: v.nodes.map((n) => n.target.join(' ')),
    })),
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const findings = [];
  const measures = {};

  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width > 390 ? 900 : 844 },
        colorScheme: theme,
      });
      const page = await context.newPage();

      // Landing photographs while the real images are still on the wire: hold their requests
      // open, so the frame shows exactly what a slow connection shows first.
      await page.route(/_next\/image\?url=%2Fimages%2FAkomapa/, () => new Promise(() => {}));
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: path.join(OUT, `landing-images-pending--${width}--${theme}.jpg`),
        type: 'jpeg',
        quality: 70,
      });
      await page.unrouteAll({ behavior: 'ignoreErrors' });

      // Harness: skeleton, controls, an error toast and a success toast.
      await page.goto(BASE + '/evidence-280');
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.getByRole('button', { name: 'Show error toast' }).click();
      await page.getByRole('button', { name: 'Show success toast' }).click();
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(OUT, `harness--${width}--${theme}.jpg`),
        fullPage: true,
        type: 'jpeg',
        quality: 75,
      });
      if (theme === 'light') {
        measures[width] = await page.evaluate(() => {
          const box = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const before = getComputedStyle(el, '::before');
            return {
              visible: [Math.round(r.width), Math.round(r.height)],
              target:
                before.content && before.content !== 'none'
                  ? [parseFloat(before.width), parseFloat(before.height)]
                  : [Math.round(r.width), Math.round(r.height)],
            };
          };
          const status = document.querySelector('[role="status"][aria-busy="true"]');
          return {
            checkbox: box(document.querySelector('#harness-check')),
            toastClose: box(document.querySelector('[data-sonner-toast] [data-close-button]')),
            loadingRegion: status
              ? { name: status.getAttribute('aria-label'), text: status.textContent.slice(0, 60) }
              : null,
            alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent),
            liveRegions: [...document.querySelectorAll('[aria-live]')].map(
              (n) => `${n.tagName.toLowerCase()} ${n.getAttribute('aria-live')}`,
            ),
            tabTransition: getComputedStyle(document.querySelector('[role="tab"]'))
              .transitionProperty,
          };
        });
      }
      await axe(page, 'harness', width, theme, findings);
      await context.close();
    }
  }

  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'measures.json'), JSON.stringify(measures, null, 2) + '\n');
  await browser.close();
  console.log(
    findings.map((f) => `${f.name} ${f.width} ${f.theme}: ${f.violations.length}`).join('\n'),
  );
})();
