const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });
const OUT = '/private/tmp/claude-501/-Users-nanaagyei-Documents-Codes-Projects-nkwapa/32bc4bbd-56ab-4669-b094-b63cd43bf424/scratchpad/qa';

async function openChart(page, name) {
  await page.goto('/patients');
  await page.getByPlaceholder(/search by name, patient code/i).fill(name);
  const row = page.getByRole('row', { name: new RegExp(name, 'i') });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('link', { name: /view/i }).click();
  await expect(page.getByRole('heading', { name: 'Portal account' })).toBeVisible({ timeout: 30_000 });
}

const overflow = (page) =>
  page.evaluate(() => {
    const m = document.querySelector('#main-content');
    return m ? m.scrollWidth - m.clientWidth : 0;
  });

test('QA: reading the card, no raw enums', async ({ page }) => {
  await openChart(page, 'Lifecycle');
  const card = page.getByRole('heading', { name: 'Portal account' }).locator('../..');
  const text = await card.innerText();
  for (const enumWord of ['UNLINKED', 'LINKED', 'INVITED', 'MERGED', 'PENDING', 'CANCELLED', 'EXPIRED']) {
    expect(text, `raw enum ${enumWord} leaked to staff`).not.toContain(enumWord);
  }
  expect(text).toContain('No portal access');
  await expect(page.getByRole('button', { name: /resend invite email/i })).toHaveCount(0);
  console.log('QA1 no-raw-enums: PASS');
});

test('QA: previous invitations disclosure works by keyboard', async ({ page }) => {
  await openChart(page, 'Lifecycle');
  const toggle = page.getByRole('button', { name: /previous invitations/i });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#portal-previous-invites')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  console.log('QA2 disclosure-keyboard: PASS');
});

test('QA: controls do not resize when busy', async ({ page }) => {
  await openChart(page, 'Lifecycle');
  // Create a phone-only invite so the manual instructions and copy button render.
  await page.getByRole('button', { name: /create portal invite|replace invitation/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email', { exact: true }).fill('');
  await dialog.getByLabel('Phone', { exact: true }).fill('+233201234588');
  await dialog.getByLabel('Valid for').click();
  await page.getByRole('option', { name: '7 days' }).click();
  const expiryPreview = await dialog.getByText(/^Expires /).innerText();
  expect(expiryPreview).toMatch(/Expires \w+ \d+, \d{4}/);
  await dialog.getByRole('button', { name: /create invite|replace invitation/i }).click();
  await expect(page.getByText('Invitation waiting')).toBeVisible({ timeout: 20_000 });

  const copy = page.getByRole('button', { name: /copy instructions/i });
  const before = await copy.boundingBox();
  await copy.click();
  await page.waitForTimeout(300);
  const after = await copy.boundingBox();
  expect(Math.abs(after.width - before.width), 'copy button changed width').toBeLessThan(1);
  expect(Math.abs(after.height - before.height), 'copy button changed height').toBeLessThan(1);
  console.log(`QA3 copy-button-stable: PASS (${before.width}px -> ${after.width}px)`);
});

test('QA: manual instructions carry the code and no identifying detail', async ({ page }) => {
  await openChart(page, 'Lifecycle');
  const pre = page.locator('pre');
  await expect(pre).toBeVisible();
  const text = await pre.innerText();
  expect(text).toMatch(/NKP-\d{4}-\d{6}/);
  expect(text).toContain('Sign in at:');
  expect(text).toContain('Valid until:');
  expect(text.toLowerCase()).not.toContain('lifecycle');
  expect(text.toLowerCase()).not.toContain('1969');
  console.log('QA4 instructions-safe: PASS');
});

test('QA: a blocked clipboard says so instead of doing nothing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      get: () => ({ writeText: () => Promise.reject(new Error('blocked')) }),
    });
  });
  await openChart(page, 'Lifecycle');
  const copy = page.getByRole('button', { name: /copy instructions/i });
  await copy.click();
  await expect(page.getByText(/would not let the page copy/i)).toBeVisible();
  console.log('QA5 clipboard-refusal-visible: PASS');
});

test('QA: cancel confirms, backing out changes nothing, chart never blanks', async ({ page }) => {
  await openChart(page, 'Lifecycle');
  await page.getByRole('button', { name: /^cancel invitation$/i }).first().click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(/no longer be able to claim/i)).toBeVisible();
  await expect(confirm.getByText('+233201234588')).toBeVisible();
  await confirm.getByRole('button', { name: /keep invitation/i }).click();
  await expect(page.getByText('Invitation waiting')).toBeVisible();

  await page.getByRole('button', { name: /^cancel invitation$/i }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^cancel invitation$/i }).click();
  // The chart heading must survive the mutation: cancel used to set page-level loading.
  await expect(page.getByRole('heading', { name: 'Portal account' })).toBeVisible();
  await expect(page.getByText('No portal access').first()).toBeVisible({ timeout: 20_000 });
  console.log('QA6 cancel-confirm-and-no-blank: PASS');
});

test('QA: widths and 200 percent zoom', async ({ page }) => {
  await openChart(page, 'Lifecycle');
  await page.getByRole('button', { name: /previous invitations/i }).click();
  for (const [label, vp] of Object.entries({
    phone: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    laptop: { width: 1024, height: 768 },
    desktop: { width: 1440, height: 900 },
    'zoom200': { width: 640, height: 512 },
  })) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(150);
    const px = await overflow(page);
    expect(px, `${label} overflows by ${px}px`).toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { name: 'Portal account' })).toBeVisible();
    console.log(`QA7 ${label} (${vp.width}px): overflow=${px}px PASS`);
  }
  await page.screenshot({ path: `${OUT}-final.png` });
});
