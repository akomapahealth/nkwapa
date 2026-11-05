const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

/**
 * #268: a volunteer's and a doctor's dashboard lead with the work waiting on them, then today's
 * counts, then trends, and every chart offers its numbers as a table.
 * #269: so do the manager's, director's and system administrator's, with the clinic's held-up
 * queues as their rows, and an account with several roles sees one role's section at a time.
 */

async function needsSection(page) {
  const section = page.getByRole('region', { name: 'Needs you now' });
  await expect(section).toBeVisible({ timeout: 30_000 });
  return section;
}

/** "Needs you now" sits above "Today at a glance" in reading order. */
async function expectWorkFirst(page) {
  const needs = await page.getByRole('heading', { name: 'Needs you now' }).boundingBox();
  const glance = await page.getByRole('heading', { name: /today at a glance/i }).boundingBox();
  expect(needs.y).toBeLessThan(glance.y);
}

test.describe('volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('sees their own work in the first screen on a phone', async ({ page }) => {
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
    await expectWorkFirst(page);

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

for (const role of ['manager', 'director']) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role) });

    test('leads with where the clinic queues are held up, then clinic trends', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard');
      const section = await needsSection(page);
      await expectWorkFirst(page);

      const hrefs = await section
        .getByRole('link')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      for (const href of hrefs) expect(href).toBe('/queues');
      // Not a volunteer's or doctor's own rows.
      await expect(section.getByText(/^Today you added/)).toHaveCount(0);
      await expect(section.getByRole('link', { name: 'Review visits' })).toHaveCount(0);

      // One role, so no view switcher; the oversight section is on the page.
      await expect(page.getByRole('tablist', { name: 'Dashboard view' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Clinic trends', exact: true })).toBeVisible();
    });
  });
}

test.describe('an account holding every role', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('sees one role section at a time, on a far shorter page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    await needsSection(page);
    const views = page.getByRole('tablist', { name: 'Dashboard view' });
    await expect(views.getByRole('tab', { name: 'Clinic trends' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await page.waitForLoadState('networkidle').catch(() => {});
    // The #229 baseline was 7,342px, and stacking every role section made it 8,178px.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(5_000);
  });

  test('opens on the role section chosen last time (#315)', async ({ page }) => {
    await page.goto('/dashboard');
    const views = page.getByRole('tablist', { name: 'Dashboard view' });
    const network = views.getByRole('tab', { name: 'Network overview' });
    await network.click();
    await expect(network).toHaveAttribute('aria-selected', 'true');

    await page.reload();
    await expect(network).toHaveAttribute('aria-selected', 'true');
    await expect(views.getByRole('tab', { name: 'Clinic trends' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
