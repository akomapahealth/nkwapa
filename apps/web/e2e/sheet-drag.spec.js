const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const bundleFixture = require('./component-fixtures/bundle.cjs');
let bundle;
test.beforeAll(async () => {
  bundle = await bundleFixture({ entry: 'DraggableSheet.tsx' });
});
test.use({ reducedMotion: 'no-preference' });
async function mount(page, theme = 'light', width = 390) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/privacy');
  await page.evaluate((theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.body.innerHTML = '<main id="component-fixture"></main>';
  }, theme);
  await page.addScriptTag({ content: bundle });
}
async function open(page, side) {
  await page.getByRole('button', { name: `Open ${side}`, exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})));
  });
  return sheet;
}
async function start(page, sheet) {
  const handle = sheet.getByRole('button', { name: /^Close sheet/ });
  const box = await handle.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  return { handle, point };
}
async function position(sheet) {
  return sheet.evaluate((el) => {
    const values = getComputedStyle(el).translate.split(' ').map(parseFloat);
    return [values[0] || 0, values[1] || 0];
  });
}
for (const theme of ['light', 'dark']) {
  for (const side of ['bottom', 'top', 'left', 'right']) {
    test(`handle tracks, resists, reverses, cancels and dismisses: ${theme} ${side}`, async ({
      page,
    }) => {
      await mount(page, theme);
      const sheet = await open(page, side);
      const horizontal = ['left', 'right'].includes(side);
      const sign = ['left', 'top'].includes(side) ? -1 : 1;
      let { handle, point } = await start(page, sheet);
      const move = async (distance) =>
        page.mouse.move(
          point.x + (horizontal ? distance * sign : 0),
          point.y + (horizontal ? 0 : distance * sign),
        );
      await move(60);
      expect((await position(sheet))[horizontal ? 0 : 1]).toBeCloseTo(60 * sign, 0);
      await move(-80);
      const resisted = Math.abs((await position(sheet))[horizontal ? 0 : 1]);
      expect(resisted).toBeGreaterThan(0);
      expect(resisted).toBeLessThan(32);
      await move(100);
      await move(50); // Reverse a large pull back towards the workspace.
      await page.mouse.up();
      await expect(sheet).toBeVisible();
      await expect
        .poll(async () => Math.abs((await position(sheet))[horizontal ? 0 : 1]))
        .toBeLessThan(0.1);
      ({ handle, point } = await start(page, sheet));
      await move(70);
      await handle.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
      await page.mouse.up();
      await expect
        .poll(async () => Math.abs((await position(sheet))[horizontal ? 0 : 1]))
        .toBeLessThan(0.1);
      await expect(sheet.getByRole('textbox', { name: 'Draft text' })).toHaveValue(
        'Retain this draft',
      );
      ({ point } = await start(page, sheet));
      await move(200);
      await page.mouse.up();
      await expect(sheet).toBeHidden();
      await expect(page.getByRole('button', { name: `Open ${side}`, exact: true })).toBeFocused();
    });
  }
  test(`widths, long scroll, targets, enlarged text and axe: ${theme}`, async ({ page }) => {
    await mount(page, theme);
    for (const width of [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const side of ['bottom', 'right']) {
        const sheet = await open(page, side);
        const handle = sheet.getByRole('button', { name: /^Close sheet/ });
        const bounds = await handle.boundingBox();
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(
          0,
        );
        const body = sheet.getByTestId('scroll-body');
        await body.hover();
        await page.mouse.wheel(0, 300);
        await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        await expect(sheet).not.toHaveAttribute('data-dragging');
        await sheet.getByRole('button', { name: 'Final action', exact: true }).click();
        await expect(sheet.getByRole('button', { name: 'Final action reached' })).toBeVisible();
        if (process.env.DESIGN_SHEET_DIR) {
          fs.mkdirSync(process.env.DESIGN_SHEET_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(process.env.DESIGN_SHEET_DIR, `${side}-${width}-${theme}.png`),
          });
        }
        if (width === 390) {
          const results = await new AxeBuilder({ page }).analyze();
          expect(results.violations).toEqual([]);
        }
        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    const sheet = await open(page, 'bottom');
    await sheet.getByRole('button', { name: 'Final action', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Final action reached' })).toBeVisible();
    await sheet.getByRole('button', { name: /^Close sheet/ }).focus();
    await page.keyboard.press('Enter');
    await expect(sheet).toBeHidden();
  });
}
test('interrupted settle, capture loss, resize, Escape, navigation and repeated opening', async ({
  page,
}) => {
  await mount(page);
  let sheet = await open(page, 'bottom');
  let { point } = await start(page, sheet);
  await page.mouse.move(point.x, point.y + 40);
  await page.mouse.move(point.x, point.y + 30);
  await page.mouse.up();
  ({ point } = await start(page, sheet));
  const before = (await position(sheet))[1];
  await page.mouse.move(point.x, point.y + 12);
  expect((await position(sheet))[1]).toBeCloseTo(before + 12, 0);
  await page.setViewportSize({ width: 600, height: 900 });
  await expect.poll(async () => (await position(sheet))[1]).toBe(0);
  await page.mouse.up();
  const lost = await start(page, sheet);
  await page.mouse.move(lost.point.x, lost.point.y + 50);
  await lost.handle.evaluate((el) => el.releasePointerCapture(1));
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await position(sheet))[1])).toBeLessThan(0.1);
  ({ point } = await start(page, sheet));
  await page.mouse.move(point.x, point.y + 50);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  for (let i = 0; i < 3; i++) {
    sheet = await open(page, 'bottom');
    expect((await position(sheet))[1] || 0).toBe(0);
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  }
  sheet = await open(page, 'bottom');
  await page.evaluate(() => {
    history.pushState({}, '', '#sheet');
    history.back();
  });
  await expect(sheet).toBeHidden();
});
test('reduced motion keeps direct input and removes the release spring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mount(page);
  const sheet = await open(page, 'bottom');
  const { point } = await start(page, sheet);
  await page.mouse.move(point.x, point.y + 20);
  expect((await position(sheet))[1]).toBe(20);
  await page.mouse.up();
  expect((await position(sheet))[1]).toBe(0);
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('touch ownership, second pointer exclusion and short outward flick', async ({ page }) => {
  await mount(page);
  const sheet = await open(page, 'bottom');
  const handle = sheet.getByRole('button', { name: /^Close sheet/ });
  const box = await handle.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 0 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x, y: y + 40, id: 0 }],
  });
  expect((await position(sheet))[1]).toBeCloseTo(40, 0);
  await handle.dispatchEvent('pointerdown', {
    pointerId: 99,
    isPrimary: false,
    button: 0,
    clientY: y + 200,
  });
  await handle.dispatchEvent('pointermove', { pointerId: 99, isPrimary: false, clientY: y + 300 });
  expect((await position(sheet))[1]).toBeCloseTo(40, 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => Math.abs((await position(sheet))[1])).toBeLessThan(0.1);
  // Explicit timestamps make the release-velocity check deterministic, independent of runner speed.
  await handle.evaluate((el) => {
    const send = (type, y, time) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientY: y,
      });
      Object.defineProperty(event, 'timeStamp', { value: time });
      el.dispatchEvent(event);
    };
    // Retain a real pointer capture from a real pointer-down instead of fabricating capture.
    el.dataset.flickReady = 'true';
    window.sheetFlick = send;
  });
  await start(page, sheet);
  await handle.evaluate((el) => {
    const start = el.getBoundingClientRect().top + 22;
    window.sheetFlick('pointermove', start + 40, performance.now() + 10);
    window.sheetFlick('pointerup', start + 40, performance.now() + 11);
  });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
});

for (const side of ['bottom', 'right']) {
  test(`cross-axis movement does not become a close click: ${side}`, async ({ page }) => {
    await mount(page);
    const sheet = await open(page, side);
    for (const distance of [12, 90]) {
      const { point } = await start(page, sheet);
      await page.mouse.move(
        point.x + (side === 'bottom' ? distance : 0),
        point.y + (side === 'right' ? distance : 0),
      );
      await page.mouse.up();
      await expect(sheet).toHaveAttribute('data-state', 'open');
      await expect(sheet).toBeVisible();
      await expect.poll(() => position(sheet)).toEqual([0, 0]);
    }
    await expect(sheet.getByRole('textbox', { name: 'Draft text' })).toHaveValue(
      'Retain this draft',
    );
  });
}

// R7.1: 240ms in and 190ms out on the drawer curve from a pointer; reduced motion fades only;
// keyboard opens and closes do not wait for an animation.
async function sampleSheet(sheet, milliseconds) {
  return sheet.evaluate((el, milliseconds) => {
    const animations = el.getAnimations();
    animations.forEach((animation) => {
      animation.pause();
      animation.currentTime = milliseconds;
    });
    const style = getComputedStyle(el);
    const result = {
      duration: style.animationDuration,
      easing: style.animationTimingFunction,
      opacity: Number(style.opacity),
      transform: style.transform,
    };
    animations.forEach((animation) => animation.finish());
    return result;
  }, milliseconds);
}

for (const reduced of [false, true]) {
  test(`sheet timing from a pointer${reduced ? ', fade only with reduced motion' : ''}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await mount(page);
    await page.getByRole('button', { name: 'Open bottom', exact: true }).click();
    const sheet = page.getByRole('dialog');
    const enter = await sampleSheet(sheet, 100);
    expect(enter.duration).toBe(reduced ? '0.2s' : '0.24s');
    if (reduced) {
      // The keyframe still runs, with every translate and scale variable at rest.
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(enter.transform);
      expect(enter.opacity).toBeGreaterThan(0);
      expect(enter.opacity).toBeLessThan(1);
    } else {
      expect(enter.easing).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
      expect(enter.transform).not.toBe('none');
    }
    // Slow the clock so a 190ms exit cannot finish before it is sampled.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
    await page.mouse.click(200, 40);
    const closing = page.locator('[role="dialog"][data-state="closed"]');
    const exit = await sampleSheet(closing, 60);
    expect(exit.duration).toBe(reduced ? '0.16s' : '0.19s');
    await expect(sheet).toBeHidden();
  });
}

test('keyboard opens and closes a sheet without waiting', async ({ page }) => {
  await mount(page);
  const trigger = page.getByRole('button', { name: 'Open bottom', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS('animation-duration', '1e-05s');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});
