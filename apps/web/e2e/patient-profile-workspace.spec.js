const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const { overflow } = require('../playwright/responsive-routes');

test.use({ storageState: storageStateFor('staff') });
const widths = [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440];
async function open(page) {
  const suffix = randomUUID().slice(0, 8);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Last name', { exact: true }).fill(`Profile-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`R36-${suffix}`);
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Patient details', exact: true })).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced');
  await page.evaluate(() => document.fonts.ready);
  return new URL(page.url()).pathname;
}
async function scroll(page, y) {
  await page.evaluate((y) => {
    window.scrollTo(0, y);
    document.querySelector('main').scrollTo(0, y);
  }, y);
}
async function shot(page, name) {
  if (!process.env.PROFILE_EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.PROFILE_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.PROFILE_EVIDENCE_DIR, `${name}.png`) });
}
async function noOverflow(page) {
  expect(
    Math.max(...(await overflow(page)).map((x) => x.scrollWidth - x.clientWidth)),
  ).toBeLessThanOrEqual(0);
}
async function actionsVisible(page, includeDetails = false) {
  const actions = page.getByRole('group', { name: 'Patient chart actions' });
  const targets = await actions.locator('a,button').all();
  if (includeDetails) {
    for (const name of ['Link existing app account', 'Preview a merge into this chart'])
      targets.push(page.getByRole('button', { name, exact: true }));
  }
  for (const action of targets) {
    // Center in the usable page instead of accepting a viewport edge behind fixed navigation.
    await action.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await expect(action).toBeInViewport({ ratio: 1 });
    expect((await action.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect
      .poll(() =>
        action.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit === el || el.contains(hit);
        }),
      )
      .toBe(true);
  }
}
for (const theme of ['light', 'dark']) {
  test(`profile responsive identity, chart state and actions: ${theme}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await open(page);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await scroll(page, 0);
      await expect(page.locator('h1')).toContainText('Synthetic Profile-');
      await actionsVisible(page);
      await noOverflow(page);
      await scroll(page, 0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await shot(page, `${theme}-${width}`);
    }
    await page.getByRole('tab', { name: 'Vitals', exact: true }).click();
    for (const width of [390, 1440, 600]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page).toHaveURL(/tab=vitals/);
      await expect(page.getByRole('tab', { name: 'Vitals', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(
        page.getByRole('heading', { name: 'Recorded vitals', exact: true }),
      ).toBeVisible();
    }
  });
  test(`profile scroll handover and enlarged text: ${theme}`, async ({ page }) => {
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page);
    await scroll(page, 0);
    const context = page.locator('[data-visible]');
    await expect(context).toHaveAttribute('data-visible', 'false');
    await scroll(page, 600);
    await expect(context).toHaveAttribute('data-visible', 'true');
    await expect(context).toContainText('Synthetic Profile-');
    const bar = await context.boundingBox();
    const shell = await page.locator('header').first().boundingBox();
    expect(Math.abs(bar.y - (shell.y + shell.height))).toBeLessThanOrEqual(1);
    await shot(page, `${theme}-compact`);
    await scroll(page, 0);
    await expect(context).toHaveAttribute('data-visible', 'false');
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    for (const width of [320, 390, 600, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await actionsVisible(page, true);
      await noOverflow(page);
      await shot(page, `${theme}-text200-${width}`);
    }
  });
}

test('profile identity can wrap long values without losing keyboard actions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const chart = await open(page);
  const patientId = chart.split('/').at(-1);
  await page.route(`**/patients/${patientId}?clinicId=*`, async (route) => {
    if (route.request().method() !== 'GET' || route.request().resourceType() === 'document')
      return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.patient.firstName = 'SyntheticVeryLongPatientIdentityWithoutSpaces';
    body.patient.lastName = 'Long family name for responsive chart review';
    body.patient.patientCode = 'NKP-SYNTHETIC-VERYLONGPATIENTCODEWITHOUTSPACES';
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.locator('h1')).toContainText('SyntheticVeryLong');
  await actionsVisible(page);
  await noOverflow(page);
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/tab=vitals/);
  await expect(page.getByRole('tab', { name: 'Vitals', exact: true })).toBeFocused();
  await shot(page, 'long-identity-keyboard');
});

test('compact identity follows shell geometry and yields to keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await scroll(page, 600);
  const context = page.locator('[data-visible]');
  await expect(context).toHaveAttribute('data-visible', 'true');
  const before = await context.boundingBox();
  await page.keyboard.press('[');
  await expect.poll(async () => (await context.boundingBox()).width).toBeGreaterThan(before.width);
  const tab = page.getByRole('tab', { name: 'Overview', exact: true });
  await tab.focus();
  await tab.evaluate((el) => {
    const top = document.querySelector('header').getBoundingClientRect().bottom;
    const main = document.querySelector('main');
    main.scrollBy(0, el.getBoundingClientRect().top - top);
    window.scrollBy(0, el.getBoundingClientRect().top - top);
  });
  await expect(tab).toBeFocused();
  await expect(context).toHaveAttribute('data-visible', 'false');
});
