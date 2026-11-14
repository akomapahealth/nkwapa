/* global document */
const { expect } = require('@playwright/test');

// Begin from a known landmark; reach the target using actual Tab events, never target.focus().
async function tabTo(page, target, start = page.locator('main'), insideTablist = false) {
  if (!insideTablist && (await target.getAttribute('role')) === 'tab') {
    const selected = page.getByRole('tab', { selected: true });
    await tabTo(page, selected, start, true);
    for (let i = 0; i < 20; i++) {
      if (await target.evaluate((el) => el === document.activeElement)) return;
      await page.keyboard.press('ArrowRight');
      // Switching an encounter tab awaits autosave. Do not send subsequent arrows while
      // its triggers are disabled; require the settled selection to retain keyboard focus.
      await expect.poll(() => selected.evaluate((el) => el === document.activeElement)).toBe(true);
    }
    throw new Error('Roving tab target was not reached');
  }
  await start.focus();
  for (let i = 0; i < 180; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) {
      await expect(target).toBeInViewport();
      return;
    }
  }
  throw new Error('Keyboard target was not reached in 180 Tab stops');
}

async function keyboardDialog(page, trigger, title, confirm) {
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // Both directions remain inside the modal, and Escape restores the real trigger.
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  const button = dialog.getByRole('button', { name: confirm, exact: true });
  // Start at the modal's current focus, preserving its trap.
  for (let i = 0; i < 20; i++) {
    if (await button.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
}

module.exports = { tabTo, keyboardDialog };
