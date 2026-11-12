const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

/**
 * #268: a volunteer's and a doctor's dashboard lead with the work waiting on them, then counts,
 * then trends, and every chart offers its numbers as a table.
 * #269: so do the manager's and director's, with the clinic's held-up queues as their rows.
 * W2: each person gets one home for their main role (greeting, four figures, own work); an account
 * with several roles has no role switcher, and its other roles' work is at most a line each.
 */

async function needsSection(page, name = 'Needs you now') {
  const section = page.getByRole('region', { name });
  await expect(section).toBeVisible({ timeout: 30_000 });
  return section;
}

/** The work rows sit above the given later heading (counts or trends) in reading order. */
async function expectWorkFirst(page, later = /today at a glance/i, needsName = 'Needs you now') {
  const needs = await page.getByRole('heading', { name: needsName }).boundingBox();
  const next = await page.getByRole('heading', { name: later }).first().boundingBox();
  expect(needs.y).toBeLessThan(next.y);
}

/** The greeting band, then the role's four figures, with the band's actions by name. */
async function expectRoleHome(page, { role, strip, figure, actions }) {
  await expect(page.locator('[data-main-role]')).toHaveAttribute('data-main-role', role);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/^Good |^Welcome/);
  const figures = page.getByRole('list', { name: strip });
  await expect(figures.getByRole('listitem')).toHaveCount(4);
  await expect(figures).toContainText(figure);
  const band = page.getByTestId('volunteer-welcome');
  for (const name of actions) await expect(band.getByRole('link', { name })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Dashboard view' })).toHaveCount(0);
  await expect(page.getByText('Today at a glance')).toHaveCount(0);
}

test.describe('volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  // A phone is a touch device; Desktop Chrome at 390px would still report a mouse pointer.
  test('sees their own work in the first screen on a phone', async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      storageState: storageStateFor('volunteer'),
      baseURL: test.info().project.use.baseURL,
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    const section = await needsSection(page);
    await expectWorkFirst(page);

    const ownWork = section.getByText(/^Today you added/);
    await expect(ownWork).toBeInViewport();

    // The next patient lives on the volunteer's worklist; the row goes there.
    const worklist = section.getByRole('link', { name: /^Open (Stations|My Assigned)$/ });
    await expect(worklist).toHaveAttribute('href', /^\/(stations|my\/assigned)$/);
    await expect(worklist).toBeInViewport();
    const box = await worklist.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await context.close();
  });

  test('can read each chart as a table and back', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    await needsSection(page);

    const toggle = page.getByRole('button', { name: 'Show table' }).first();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    const table = page.locator('main table').first();
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).not.toHaveCount(0);
    const pressed = page.getByRole('button', { name: 'Show chart' }).first();
    await expect(pressed).toHaveAttribute('aria-pressed', 'true');
    await pressed.click();
    await expect(page.locator('main table')).toHaveCount(0);
  });
});

test.describe('doctor', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('leads with reviews, sign-offs and cosigns, each linking to its queue', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    const section = await needsSection(page);
    await expectWorkFirst(page, 'Finalized in the last 14 days');
    await expectRoleHome(page, {
      role: 'DOCTOR',
      strip: 'Your work',
      figure: 'in your queue',
      actions: ['Sign off visits', 'Open queues'],
    });

    // Counts depend on the seed; whatever is waiting, each row opens the matching queue tab.
    const hrefs = await section
      .getByRole('link')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    for (const href of hrefs) {
      expect(['/queues?tab=review', '/queues?tab=finalize', '/queues?tab=cosign']).toContain(href);
    }
    if (hrefs.length === 0) {
      await expect(section.getByText('Nothing is waiting on you right now.')).toBeVisible();
    }
    // A doctor has no volunteer worklist row.
    await expect(section.getByText(/^Today you added/)).toHaveCount(0);
  });
});

test.describe('manager', () => {
  test.use({ storageState: storageStateFor('manager') });

  test('leads with where the clinic queues are held up, then station flow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    const section = await needsSection(page, 'Needs attention');
    await expectRoleHome(page, {
      role: 'MANAGER',
      strip: /^(Station flow today|Today in this clinic)$/,
      figure: /checked in|visits today/,
      actions: ['Open Today Board'],
    });

    const hrefs = await section
      .getByRole('link')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    for (const href of hrefs) expect(href).toBe('/queues');
    await expect(section.getByText(/^Today you added/)).toHaveCount(0);
    await expect(section.getByRole('link', { name: 'Review visits' })).toHaveCount(0);
    // The director's trends are not a manager's home.
    await expect(
      page.getByRole('heading', { name: 'Patient registrations in the last 30 days' }),
    ).toHaveCount(0);
  });
});

test.describe('director', () => {
  test.use({ storageState: storageStateFor('director') });

  test('leads with where the clinic queues are held up, then clinic trends', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    const section = await needsSection(page, 'Needs attention');
    await expectWorkFirst(page, 'Patient registrations in the last 30 days', 'Needs attention');
    await expectRoleHome(page, {
      role: 'DIRECTOR',
      strip: 'Clinic trends',
      figure: 'registered patients',
      actions: [],
    });

    const hrefs = await section
      .getByRole('link')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    for (const href of hrefs) expect(href).toBe('/queues');
    await expect(section.getByText(/^Today you added/)).toHaveCount(0);
    await expect(section.getByRole('link', { name: 'Review visits' })).toHaveCount(0);
  });
});

test.describe('an account holding every role', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('gets one home for its main role, on a far shorter page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Clinic comparison' })).toBeVisible({
      timeout: 30_000,
    });
    await expectRoleHome(page, {
      role: 'SYSTEM_ADMIN',
      strip: 'Network overview',
      figure: 'patients across clinics',
      actions: ['Clinics', 'Staff accounts'],
    });
    // Other roles' work is a line and a link each, to the place that work is done.
    const also = page.getByRole('region', { name: 'Also on your plate' });
    if (await also.count()) {
      const hrefs = await also
        .getByRole('link')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      for (const href of hrefs) expect(href).toMatch(/^\/queues(\?tab=\w+)?$/);
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    // The #229 baseline was 7,342px, and stacking every role section made it 8,178px.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(5_000);
  });
});
