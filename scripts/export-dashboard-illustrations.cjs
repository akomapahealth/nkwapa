/* global document, window -- evaluated inside Playwright, not Node. */
/* Export only the owner-selected rest frames. Run from any directory, then Prettier the two TS outputs. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'apps/web/public/lottie');
const components = path.join(root, 'apps/web/components/dashboard');
const colours = {
  'rgb(0,0,0)': 'var(--illustration-line)',
  'rgb(29,28,29)': 'var(--illustration-line)',
  'rgb(255,255,255)': 'var(--illustration-fill)',
  'rgb(250,245,247)': 'var(--illustration-fill)',
  'rgb(189,0,45)': 'var(--illustration-accent)',
  'rgb(37,204,110)': 'hsl(var(--success-ink))',
  'rgb(45,207,31)': 'hsl(var(--success-ink))',
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="art"></div>');
    await page.addScriptTag({ path: require.resolve('lottie-web/build/player/lottie_light.js') });
    for (const [name, frame] of [
      ['Hello', 60],
      ['checklist', 98],
    ]) {
      const data = JSON.parse(fs.readFileSync(path.join(assets, `${name}.json`), 'utf8'));
      let svg = await page.evaluate(
        async ({ data, frame }) => {
          const container = document.querySelector('#art');
          container.innerHTML = '';
          const player = window.lottie.loadAnimation({
            container,
            animationData: data,
            renderer: 'svg',
            loop: false,
            autoplay: false,
          });
          await new Promise((resolve) => player.addEventListener('DOMLoaded', resolve));
          player.goToAndStop(frame, true);
          const result = container.querySelector('svg').cloneNode(true);
          result.removeAttribute('style');
          result.setAttribute('width', '100%');
          result.setAttribute('height', '100%');
          return result.outerHTML;
        },
        { data, frame },
      );
      for (const [from, to] of Object.entries(colours)) svg = svg.split(from).join(to);
      svg = svg.replace(/-?\d+\.\d{4,}/g, (n) => String(Math.round(Number(n) * 1000) / 1000));
      svg = svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
      const stem = name.toLowerCase();
      fs.writeFileSync(path.join(assets, `${stem}-rest.svg`), svg);
      fs.writeFileSync(
        path.join(components, `${stem}-rest.ts`),
        `// Generated from ${name}.json at frame ${frame} using lottie-web 5.13.0. See public/lottie/SOURCES.md.\nexport const ${stem}Rest = ${JSON.stringify(svg)};\n`,
      );
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
