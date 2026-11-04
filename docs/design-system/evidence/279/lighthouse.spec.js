const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { test, chromium } = require('@playwright/test');
const { responseFor } = require('./fixtures.cjs');
const { storageStateFor } = require('../../../../apps/web/playwright/roles');

// Lighthouse lives outside the repo so collecting evidence adds no product dependency.
test('Lighthouse accessibility snapshots of every scoped page', async () => {
  test.setTimeout(600000);
  const toolDir = process.env.LIGHTHOUSE_MODULE_DIR;
  test.skip(!toolDir, 'Set LIGHTHOUSE_MODULE_DIR to a temporary installation of lighthouse.');
  const { startFlow } = await import(pathToFileURL(path.join(toolDir, 'lighthouse/core/index.js')));
  const puppeteer = require(path.join(toolDir, 'puppeteer-core'));
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  const out = process.env.EVIDENCE_DIR;
  const scores = [];
  try {
    for (const role of ['public', 'staff']) {
      const context = await browser.createBrowserContext();
      const state =
        role === 'staff'
          ? JSON.parse(fs.readFileSync(storageStateFor('staff'), 'utf8'))
          : { cookies: [], origins: [] };
      await context.setCookie(...state.cookies.map(({ sameSite, ...c }) => ({ ...c, sameSite })));
      const routes =
        role === 'public'
          ? [
              ['privacy', '/privacy'],
              ['terms', '/terms'],
              ['cookies', '/cookies'],
            ]
          : [
              ['status', '/status'],
              ['research', '/research'],
              ['volunteers', '/volunteers'],
              ['screening-days', '/volunteers/events'],
              ['screening-day', '/volunteers/events/synthetic-event'],
            ];
      for (const theme of ['light', 'dark'])
        for (const width of [1440, 390]) {
          for (const [name, url] of routes.filter(
            ([name]) =>
              !process.env.EVIDENCE_VIEWS || process.env.EVIDENCE_VIEWS.split(',').includes(name),
          )) {
            const page = await context.newPage();
            await page.setRequestInterception(true);
            page.on('request', (request) => {
              const body = responseFor(request.url());
              if (body && request.method() === 'GET')
                return request.respond({
                  status: 200,
                  contentType: 'application/json',
                  headers: { 'Access-Control-Allow-Origin': 'http://localhost:3000' },
                  body: JSON.stringify(body),
                });
              return request.continue();
            });
            await page.evaluateOnNewDocument(
              (origins, theme) => {
                for (const origin of origins)
                  if (origin.origin === location.origin)
                    for (const item of origin.localStorage)
                      localStorage.setItem(item.name, item.value);
                localStorage.setItem('nkwapa-theme', theme);
              },
              state.origins,
              theme,
            );
            await page.setViewport({ width, height: width === 1440 ? 900 : 844 });
            await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
            await page.goto('http://localhost:3000' + url, { waitUntil: 'networkidle0' });
            await page.waitForSelector('h1', { timeout: 15000 }).catch(async (error) => {
              await page.screenshot({
                path: path.join(out, `lighthouse-error-${name}-${width}-${theme}.jpg`),
              });
              console.log(
                `Lighthouse page ${name} ended at ${page.url()}: ${await page.evaluate(() => document.body.innerText)}`,
              );
              throw error;
            });
            if (name === 'research')
              await page.waitForFunction(() =>
                document.body.innerText.includes('rx-synthetic-example'),
              );
            if (name === 'volunteers')
              await page.waitForFunction(() => document.body.innerText.includes('Ama Example'));
            await page.evaluate(async () => {
              await document.fonts.ready;
              await Promise.all(
                document
                  .getAnimations()
                  .filter(
                    (a) =>
                      a.timeline instanceof DocumentTimeline &&
                      Number.isFinite(a.effect?.getComputedTiming().endTime),
                  )
                  .map((a) => a.finished.catch(() => {})),
              );
            });
            const flow = await startFlow(page, {
              name: `${name} ${width} ${theme}`,
              config: {
                extends: 'lighthouse:default',
                settings: {
                  onlyCategories: ['accessibility'],
                  formFactor: width === 390 ? 'mobile' : 'desktop',
                  screenEmulation: { disabled: true },
                },
              },
            });
            await flow.snapshot();
            const result = (await flow.createFlowResult()).steps[0].lhr;
            const category = result.categories.accessibility;
            const audits = Object.fromEntries(
              category.auditRefs.map(({ id }) => [id, result.audits[id]]),
            );
            fs.mkdirSync(path.join(out, 'lighthouse'), { recursive: true });
            fs.writeFileSync(
              path.join(out, 'lighthouse', `${name}--${width}--${theme}.json`),
              JSON.stringify(
                {
                  lighthouseVersion: result.lighthouseVersion,
                  fetchTime: result.fetchTime,
                  requestedUrl: result.requestedUrl,
                  finalDisplayedUrl: result.finalDisplayedUrl,
                  gatherMode: result.gatherMode,
                  categories: { accessibility: category },
                  audits,
                },
                null,
                2,
              ),
            );
            await page.close();
            scores.push({ name, width, theme, score: Math.round(category.score * 100) });
            console.log(
              `Lighthouse accessibility ${name} ${width} ${theme}: ${Math.round(category.score * 100)}`,
            );
          }
        }
      await context.close();
    }
  } finally {
    await browser.close();
    const file = path.join(out, 'lighthouse.json');
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    const fresh = new Set(scores.map((x) => `${x.name}|${x.width}|${x.theme}`));
    fs.writeFileSync(
      file,
      JSON.stringify(
        [...previous.filter((x) => !fresh.has(`${x.name}|${x.width}|${x.theme}`)), ...scores],
        null,
        2,
      ),
    );
  }
});
