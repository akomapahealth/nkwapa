const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * The behaviour #63 asks for, exercised on a real page.
 *
 * The issue asks for "component tests". This repo's jest runs in a node environment with no DOM
 * harness, and three of the four behaviours named — focus return, viewport collision, and no
 * layout shift — are questions about real layout and a real focus ring that jsdom answers by
 * fiction. Playwright answers them by measurement, so the tests live here rather than behind a
 * new testing-library dependency.
 *
 * /dashboard is the subject because it carries several hints at once, which is the only way to
 * test single-open honestly.
 */

/** Every hint trigger is named "Show help: …" by the component. */
function hintTriggers(page) {
  return page.getByRole('button', { name: /^Show help:/ });
}

async function openDashboard(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /today at a glance/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(hintTriggers(page).first()).toBeVisible();
}

test('a hint trigger is a real button with an accessible name and a visible focus ring', async ({
  page,
}) => {
  await openDashboard(page);
  const trigger = hintTriggers(page).first();

  await expect(trigger).toHaveAttribute('type', 'button');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  // The name must carry the help text, not just the word "help": it is the only thing a screen
  // reader announces before the bubble exists.
  const name = await trigger.getAttribute('aria-label');
  expect(name).toMatch(/^Show help: .{10,}/);

  await trigger.focus();
  const ring = await trigger.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, shadow: s.boxShadow };
  });
  expect(ring.outline !== 'none' || ring.shadow !== 'none').toBe(true);
});

test('keyboard opens the bubble, Escape closes it and returns focus to the trigger', async ({
  page,
}) => {
  await openDashboard(page);
  const trigger = hintTriggers(page).first();

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('tooltip')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  // Focus must come back to the trigger. Left on <body>, the next Tab restarts from the top of
  // the page, which is the whole reason this is in the acceptance criteria.
  await expect(trigger).toBeFocused();
});

test('clicking outside closes the bubble', async ({ page }) => {
  await openDashboard(page);
  const trigger = hintTriggers(page).first();

  await trigger.click();
  await expect(page.getByRole('tooltip')).toBeVisible();

  await page.getByRole('heading', { name: /today at a glance/i }).click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('only one bubble is open at a time, including from the keyboard', async ({ page }) => {
  await openDashboard(page);
  const triggers = hintTriggers(page);
  expect(await triggers.count()).toBeGreaterThan(1);

  /*
    Opened with the keyboard on purpose.

    A mouse already gets single-open for free: pressing a second trigger is a pointerdown outside
    the first bubble, so that bubble's own outside-click handler closes it. Enter and Space fire no
    pointerdown, so a keyboard user could stack every hint on the page over the data they explain.
    That path is what the shared registry exists for, and clicking here would test the wrong thing.
  */
  await triggers.nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tooltip')).toHaveCount(1);

  await triggers.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tooltip')).toHaveCount(1);
  await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
});

test('opening a hint shifts nothing on the page', async ({ page }) => {
  await openDashboard(page);
  const heading = page.getByRole('heading', { name: /today at a glance/i });
  const before = await heading.boundingBox();

  await hintTriggers(page).first().click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  const after = await heading.boundingBox();

  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
});

test('the bubble stays inside the viewport on a phone', async ({ page }) => {
  await openDashboard(page);
  await page.setViewportSize({ width: 375, height: 812 });

  const trigger = hintTriggers(page).first();
  await trigger.click();
  const bubble = page.getByRole('tooltip');
  await expect(bubble).toBeVisible();

  const box = await bubble.boundingBox();
  expect(box.x, 'bubble runs off the left edge').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'bubble runs off the right edge').toBeLessThanOrEqual(375);
  expect(box.y, 'bubble runs off the top edge').toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, 'bubble runs off the bottom edge').toBeLessThanOrEqual(812);
});
