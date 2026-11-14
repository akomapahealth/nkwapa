/* global document, requestAnimationFrame, innerWidth, innerHeight, matchMedia, getComputedStyle, IntersectionObserver */
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const WIDTHS = [320, 390, 599, 600, 744, 839, 840, 1024, 1199, 1200, 1440];
const THEMES = ['light', 'dark'];
const INPUTS = ['mouse', 'touch'];

function requireAuditDatabase(env = process.env) {
  for (const key of ['DATABASE_URL', 'APP_DATABASE_URL']) {
    try {
      if (new URL(env[key]).pathname === '/nkwapa_audit') continue;
    } catch {
      // Never include the supplied connection string in an error.
    }
    throw new Error('BAD-DB: device matrix requires both databases to be nkwapa_audit');
  }
}

async function prepare(page, theme) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((value) => {
    localStorage.setItem('nkwapa-theme', value);
    localStorage.removeItem('nkwapa.sidebar.collapsed');
  }, theme);
}

async function ready(page) {
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  const sync = page.getByTestId('sync-status');
  if (await sync.count()) await expect(sync).toHaveAttribute('data-state', 'synced');
}

async function record(page, info, name, extra = {}) {
  // Let resize observers, measured headers and chart containers settle before measuring.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect.soft
    .poll(
      () =>
        page.evaluate(() => {
          const main = document.querySelector('#main-content');
          return Math.max(
            document.documentElement.scrollWidth - innerWidth,
            main ? main.scrollWidth - main.clientWidth : 0,
          );
        }),
      { timeout: 1500, message: `${name}: settled document/main overflow` },
    )
    .toBeLessThanOrEqual(1);
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const sidebar = document.querySelector('#workspace-sidebar');
    const edge = main?.getBoundingClientRect().right ?? innerWidth;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      coarse: matchMedia('(pointer: coarse)').matches,
      textSize: getComputedStyle(document.documentElement).fontSize,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      mainOverflow: main ? Math.max(0, main.scrollWidth - main.clientWidth) : null,
      h1: document.querySelectorAll('h1').length,
      sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
      selectedTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      overflowingElements: main
        ? [...main.querySelectorAll('*')]
            .filter((el) => el.getBoundingClientRect().right > edge + 1)
            .slice(0, 30)
            .map((el) => ({
              tag: el.tagName,
              id: el.id,
              className: el.getAttribute('class'),
              right: Math.round(el.getBoundingClientRect().right),
              width: Math.round(el.getBoundingClientRect().width),
            }))
        : [],
    };
  });
  const out = process.env.R82_EVIDENCE_DIR || info.outputPath('device-matrix');
  fs.mkdirSync(out, { recursive: true });
  const stem = path.join(out, name);
  await page.screenshot({ path: `${stem}.png`, animations: 'disabled', fullPage: false });
  fs.writeFileSync(`${stem}.json`, JSON.stringify({ name, ...geometry, ...extra }, null, 2));
  expect.soft(geometry.h1, `${name}: heading`).toBe(1);
  return geometry;
}

async function reachable(control) {
  await expect
    .poll(() =>
      control.evaluate(async (el) => {
        // Resize observers can move the sticky action after the first scroll. Re-align it
        // while polling, rather than repeatedly testing an obsolete scroll position.
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        // Check full intersection in the same poll as alignment/hit testing. A separate
        // assertion can sample the portal's scroll restoration after the successful poll.
        const ratio = await new Promise((resolve) => {
          const observer = new IntersectionObserver(([entry]) => {
            observer.disconnect();
            resolve(entry.intersectionRatio);
          });
          observer.observe(el);
        });
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return ratio === 1 && (hit === el || el.contains(hit));
      }),
    )
    .toBe(true);
}

module.exports = {
  WIDTHS,
  THEMES,
  INPUTS,
  requireAuditDatabase,
  prepare,
  ready,
  record,
  reachable,
};
