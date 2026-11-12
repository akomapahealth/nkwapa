const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const KEY = 'nkwapa.sidebar.collapsed';
const widthOf = (rail) => rail.evaluate((el) => el.getBoundingClientRect().width);
async function settle(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
}
async function capture(page, name) {
  const out = process.env.DESIGN_SHELL_DIR;
  if (!out) return;
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
}
test.use({ storageState: storageStateFor('staff') });
for (const theme of ['light', 'dark']) {
  test(`shell boundaries, icon rail and short-height navigation: ${theme}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(
      ({ theme, key }) => {
        localStorage.setItem('nkwapa-theme', theme);
        localStorage.removeItem(key);
      },
      { theme, key: KEY },
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    const rail = page.locator('#workspace-sidebar');
    await expect.poll(() => widthOf(rail)).toBe(232);
    await expect(page.getByTestId('figure-strip')).toBeVisible();
    await capture(page, `desktop-expanded-${theme}`);
    for (const width of [390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 640 });
      const phone = width < 600;
      if (phone) await expect(rail).toBeHidden();
      else await expect.poll(() => widthOf(rail)).toBe(width < 1200 ? 76 : 232);
      await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible({
        visible: phone,
      });
      await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible({
        visible: width >= 1200,
      });
      await expect(
        page.getByRole('banner').getByRole('link', { name: 'Message delivery' }),
      ).toBeVisible({ visible: !phone });
      await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
      if (!phone) {
        const bounds = await rail.locator('nav a').evaluateAll((links) =>
          links.map((el) => {
            const label = el.querySelector('span');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = getComputedStyle(label).font;
            const wordsFit =
              innerWidth >= 1200 ||
              label.textContent
                .split(/[\s-]+/)
                .every((word) => ctx.measureText(word).width <= label.clientWidth + 1);
            const range = document.createRange();
            range.selectNodeContents(label);
            const text = range.getBoundingClientRect(),
              box = el.getBoundingClientRect();
            return {
              name: el.textContent,
              wordsFit,
              w: box.width,
              h: box.height,
              hiddenLabel: getComputedStyle(label).position === 'absolute',
              fits:
                innerWidth < 1200 ||
                (text.left >= box.left - 1 &&
                  text.right <= box.right + 1 &&
                  text.height <= box.height),
            };
          }),
        );
        for (const row of bounds) {
          expect(row.w, row.name).toBeGreaterThanOrEqual(44);
          expect(row.h, row.name).toBeGreaterThanOrEqual(44);
          expect(row.fits, row.name).toBe(true);
          if (width >= 1200)
            expect(row.wordsFit, `${row.name}: avoid isolated word fragments`).toBe(true);
          expect(row.hiddenLabel).toBe(width < 1200);
        }
        const last = rail.getByRole('link', { name: 'Cross-clinic duplicates', exact: true });
        await last.focus();
        const box = await last.boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(640);
      }
      await expect
        .poll(() =>
          page.evaluate(() =>
            Math.max(
              document.documentElement.scrollWidth - innerWidth,
              document.querySelector('main').scrollWidth -
                document.querySelector('main').clientWidth,
            ),
          ),
        )
        .toBeLessThanOrEqual(1);
      await capture(page, `boundary-${width}-${theme}`);
    }
    await page.setViewportSize({ width: 600, height: 640 });
    await settle(page);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
    // Text scaling independently of viewport reflow: longest words must still wrap.
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    const last = rail.getByRole('link', { name: 'Cross-clinic duplicates', exact: true });
    await last.focus();
    expect(await last.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await capture(page, `text-scale-${theme}`);
  });

  test(`desktop preference survives compact layouts and reload: ${theme}`, async ({ page }) => {
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/queues');
    const rail = page.locator('#workspace-sidebar');
    await expect.poll(() => widthOf(rail)).toBe(232);
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect.poll(() => widthOf(rail)).toBe(64);
    await capture(page, `desktop-collapsed-${theme}`);
    for (const width of [1199, 600, 390, 1200]) {
      await page.setViewportSize({ width, height: 800 });
      if (width >= 600) await expect.poll(() => widthOf(rail)).toBe(width < 1200 ? 76 : 64);
      await page.locator('body').press('[');
      if (width < 1200)
        expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('true');
    }
    await expect.poll(() => widthOf(rail)).toBe(232);
    await page.reload();
    await expect.poll(() => widthOf(rail)).toBe(232);
    await page.locator('body').press('[');
    await page.reload();
    await expect.poll(() => widthOf(rail)).toBe(64);
    await page.setViewportSize({ width: 744, height: 800 });
    await expect.poll(() => widthOf(rail)).toBe(76);
    await page.reload();
    await expect.poll(() => widthOf(rail)).toBe(76);
    await page.setViewportSize({ width: 1440, height: 800 });
    await expect.poll(() => widthOf(rail)).toBe(64);
  });
}

test('keyboard collapse is instant, guarded, and retains focus and current route', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/admin/duplicates/cross-clinic');
  const rail = page.locator('#workspace-sidebar');
  await expect(rail.locator('[aria-current="page"]')).toHaveText('Cross-clinic duplicates');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  for (const tag of ['input', 'textarea', 'select', 'div']) {
    await page.evaluate((tag) => {
      const el = document.createElement(tag);
      if (tag === 'div') el.contentEditable = 'true';
      el.id = 'shortcut-guard';
      document.querySelector('main').append(el);
      el.focus();
    }, tag);
    await page.keyboard.press('[');
    expect(await widthOf(rail)).toBe(232);
    await page.locator('#shortcut-guard').evaluate((el) => el.remove());
  }
  for (const modifier of ['Control', 'Meta', 'Alt', 'Shift']) {
    await page.locator('body').press(`${modifier}+[`);
    expect(await widthOf(rail)).toBe(232);
  }
  for (const width of [64, 232, 64]) {
    await page.locator('body').press('[');
    expect(await widthOf(rail)).toBe(width);
    expect(await rail.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  }
  const link = rail.getByRole('link', { name: 'Cross-clinic duplicates', exact: true });
  await link.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Cross-clinic duplicates');
  expect(await link.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 744, height: 800 });
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await rail.getByRole('link', { name: 'Queues', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/queues$/);
});

test('unavailable storage still renders and toggles navigation', async ({ page }) => {
  await page.addInitScript((key) => {
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) {
      if (k === key) throw new Error('blocked');
      return get.call(this, k);
    };
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new Error('blocked');
      return set.call(this, k, v);
    };
  }, KEY);
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/queues');
  const rail = page.locator('#workspace-sidebar');
  await expect.poll(() => widthOf(rail)).toBe(232);
  await page.locator('body').press('[');
  expect(await widthOf(rail)).toBe(64);
});

test('pointer collapse interrupts from current width and reduced motion removes movement', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/queues');
  const rail = page.locator('#workspace-sidebar');
  await expect.poll(() => widthOf(rail)).toBe(232);
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  const sampled = await rail.evaluate(async (el) => {
    const transition = el.getAnimations().find((a) => a.transitionProperty === 'width');
    if (!transition) return null;
    transition.pause();
    transition.currentTime = 80;
    const before = el.getBoundingClientRect().width;
    document
      .querySelector('[aria-controls="workspace-sidebar"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const reversed = el.getAnimations().find((a) => a.transitionProperty === 'width');
    return { before, start: parseFloat(reversed?.effect.getKeyframes()[0].width) };
  });
  expect(sampled).not.toBeNull();
  expect(sampled.before).toBeGreaterThan(64);
  expect(sampled.before).toBeLessThan(232);
  expect(sampled.start).toBeCloseTo(sampled.before, 0);
  await expect.poll(() => widthOf(rail)).toBe(232);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect.poll(() => widthOf(rail)).toBe(64);
  expect(
    await rail.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration)),
  ).toBeLessThan(0.001);
});

test('phone sheet retains utilities and closes when the persistent rail becomes available', async ({
  page,
}) => {
  await page.setViewportSize({ width: 599, height: 640 });
  await page.goto('/queues');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('link', { name: 'New Patient', exact: true })).toBeVisible();
  await sheet.getByRole('link', { name: 'Clinic settings', exact: true }).focus();
  await capture(page, 'phone-sheet-focus');
  await page.setViewportSize({ width: 600, height: 640 });
  await expect(sheet).toBeHidden();
  await expect(page.locator('#workspace-sidebar')).toBeVisible();
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Clinic settings', exact: true })).toBeVisible();
});

for (const theme of ['light', 'dark']) {
  test(`tablet drawer dismissal, focus and route changes: ${theme}`, async ({ page }) => {
    await page.addInitScript(
      ({ theme, key }) => {
        localStorage.setItem('nkwapa-theme', theme);
        localStorage.setItem(key, 'true');
      },
      { theme, key: KEY },
    );
    await page.setViewportSize({ width: 744, height: 900 });
    await page.goto('/patients');
    const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
    const drawer = page.getByRole('dialog', { name: 'Workspace menu', exact: true });
    await trigger.click();
    await expect(drawer.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await settle(page);
    await capture(page, `tablet-drawer-open-${theme}`);
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Tab');
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await settle(page);
    await page.mouse.click(730, 450);
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await settle(page);
    const handle = drawer.getByRole('button', {
      name: 'Close sheet (or drag left to dismiss)',
      exact: true,
    });
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 150, y, { steps: 8 });
    await page.mouse.up();
    await expect(drawer).toBeHidden();
    await trigger.click();
    await drawer.getByRole('link', { name: 'Queues', exact: true }).click();
    await expect(page).toHaveURL(/\/queues$/);
    await expect(drawer).toBeHidden();
    await trigger.click();
    await page.setViewportSize({ width: 599, height: 900 });
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => widthOf(page.locator('#workspace-sidebar'))).toBe(64);
  });
}
