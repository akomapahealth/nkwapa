const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const {
  WIDTHS,
  THEMES,
  INPUTS,
  prepare,
  ready,
  record,
} = require('../playwright/device-matrix.cjs');

for (const role of ['staff', 'doctor', 'volunteer', 'manager', 'director', 'patient'])
  for (const input of INPUTS)
    for (const theme of THEMES)
      test.describe(`${role} ${input} ${theme}`, () => {
        test.use({ storageState: storageStateFor(role), hasTouch: input === 'touch' });
        test('R8.2 home boundaries and short landscape', async ({ page }, info) => {
          test.setTimeout(120_000);
          await prepare(page, theme);
          await page.goto(role === 'patient' ? '/portal' : '/dashboard');
          await ready(page);
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            const row = await record(page, info, `home-${role}-${input}-${theme}-${width}`);
            expect.soft(row.coarse).toBe(input === 'touch');
            expect.soft(row.theme).toBe(theme);
            if (role !== 'patient')
              expect
                .soft(Math.round(row.sidebarWidth))
                .toBe(width < 600 ? 0 : width < 1200 ? 76 : 232);
          }
          await page.setViewportSize({ width: 744, height: 360 });
          await record(page, info, `home-${role}-${input}-${theme}-landscape`);
          for (const width of [320, 600, 840, 1200]) {
            await page.setViewportSize({ width, height: 900 });
            await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
            await record(page, info, `home-${role}-${input}-${theme}-text200-${width}`);
          }
        });
      });
