const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/**
 * The cross-clinic duplicate investigation.
 *
 * Leans on `SEED_SAMPLE_CROSS_CLINIC`, which stages an active Kumasi clinic beside the demo clinic
 * and an inactive Tamale clinic, with three pairs across them:
 *
 *   - Efua Asante, demo and Kumasi: same name, birthday and phone -> "Very likely"
 *   - Yaw / Yao Darko, demo and Kumasi: similar name, same birthday and email -> "Possible"
 *   - Abena Sarpong, Kumasi and the inactive Tamale clinic -> must not appear at all
 *
 * What the suite protects is the line between investigating and acting: every pair says merge is
 * not allowed and why, and nothing on the page can record a decision or start a merge.
 *
 * The page renders two trees for the pair list -- cards below lg and a DataGrid from lg up -- so
 * locators go through the grid on desktop and through the cards on a phone.
 */

const PAGE = '/admin/duplicates/cross-clinic';

async function openInvestigation(page) {
  await page.goto(PAGE);
  await expect(
    page.locator('#main-content').getByRole('heading', { name: /cross-clinic duplicates/i }),
  ).toBeVisible({ timeout: 30_000 });
}

function clinicPairs(page) {
  return page.getByRole('list', { name: /likely duplicates by clinic pair/i });
}

test.describe('a system admin investigating', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('sizes the burden per clinic pair, active clinics only', async ({ page }) => {
    await openInvestigation(page);

    const pairs = clinicPairs(page);
    const demoKumasi = pairs.getByRole('button', { name: /Demo and .*Kumasi|Kumasi and .*Demo/ });
    await expect(demoKumasi).toBeVisible({ timeout: 20_000 });
    // Two seeded pairs share this clinic pair; the counts are written, not only drawn.
    await expect(demoKumasi).toContainText(/2\s*pairs/);
    await expect(demoKumasi).toContainText(/1 very likely, 1 possible/);

    // The inactive clinic is excluded from the scan, not merely hidden from one view.
    await expect(pairs.getByText(/Tamale/)).toHaveCount(0);
    await expect(page.getByText(/Abena Sarpong/)).toHaveCount(0);

    for (const label of [
      'Pairs across clinics',
      'Very likely',
      'Clinics affected',
      'Organisations',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('shows both clinics, both codes, the reasons, and that merge is not allowed', async ({
    page,
  }) => {
    await openInvestigation(page);
    const grid = page.getByRole('table');

    const efua = grid.getByRole('row').filter({ hasText: 'Efua Asante' });
    await expect(efua).toHaveCount(1, { timeout: 20_000 });
    await expect(efua).toContainText(/Nkwapa Clinic - Kumasi/);
    await expect(efua).toContainText(/NKP-\d{4}-\d{6}[\s\S]*NKP-\d{4}-\d{6}/);
    await expect(efua).toContainText(/same name and date of birth/i);
    await expect(efua).toContainText('Not allowed');
  });

  test('compares a pair read-only, with the reason merge is refused', async ({ page }) => {
    await openInvestigation(page);
    const grid = page.getByRole('table');
    await grid
      .getByRole('row')
      .filter({ hasText: 'Efua Asante' })
      .getByRole('button', { name: 'Compare' })
      .click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: /compare two charts/i })).toBeVisible();
    await expect(sheet.getByText(/these charts belong to different clinics/i)).toBeVisible();
    await expect(sheet.getByRole('heading', { name: /investigation only/i })).toBeVisible();

    // Nothing that writes: no decision, and no way into the merge preview.
    for (const name of [/not a duplicate/i, /confirm duplicate/i, /preview merging/i, /^merge/i]) {
      await expect(sheet.getByRole('button', { name })).toHaveCount(0);
      await expect(sheet.getByRole('link', { name })).toHaveCount(0);
    }
  });

  test('narrows the list to one clinic pair without moving the totals', async ({ page }) => {
    await openInvestigation(page);
    const pairs = clinicPairs(page);
    const demoKumasi = pairs.getByRole('button', { name: /Demo and .*Kumasi|Kumasi and .*Demo/ });
    await expect(demoKumasi).toBeVisible({ timeout: 20_000 });
    const before = await pairs.innerText();

    await demoKumasi.click();
    await expect(demoKumasi).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/^Only pairs between /)).toBeVisible();
    await expect(
      page
        .getByRole('table')
        .getByText(/Efua Asante/)
        .first(),
    ).toBeVisible({
      timeout: 20_000,
    });

    // The burden describes every pair, whichever clinic pair is being read.
    expect(await pairs.innerText()).toBe(before);

    await page.getByRole('button', { name: 'All clinic pairs' }).click();
    await expect(demoKumasi).toHaveAttribute('aria-pressed', 'false');
  });

  test('exports the counts, and only the counts', async ({ page }) => {
    await openInvestigation(page);
    await expect(clinicPairs(page)).toBeVisible({ timeout: 20_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export counts' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^cross-clinic-duplicates-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    const stream = await download.createReadStream();
    let csv = '';
    for await (const chunk of stream) csv += chunk.toString('utf8');
    expect(csv).toMatch(/Clinic A,Clinic B,Same organisation,Pairs/);
    expect(csv).toMatch(/Kumasi/);
    // A clinic-level count, never a patient.
    expect(csv).not.toMatch(/Efua|Asante|Darko|NKP-/);
  });

  test('is reachable from the review queue when it shows every clinic', async ({ page }) => {
    await page.goto('/admin/duplicates');
    await expect(page.getByRole('heading', { name: /duplicate review/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: /^all clinics/i }).click();
    await page.getByRole('link', { name: /open investigation/i }).click();
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('lists pairs as cards that name each clinic', async ({ page }) => {
      await openInvestigation(page);
      const card = page.getByTestId('duplicate-pair-card').filter({ hasText: 'Efua Asante' });
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toContainText(/Nkwapa Clinic - Kumasi/);
      await expect(card).toContainText('Merge not available');
    });
  });
});

for (const role of ['doctor', 'volunteer']) {
  test.describe(`a ${role}`, () => {
    test.use({ storageState: storageStateFor(role) });

    test('cannot open the investigation or see it in the navigation', async ({ page }) => {
      await page.goto(PAGE);

      await expect(page.getByText(/do not have access|don't have access/i).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('heading', { name: /cross-clinic duplicates/i })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /cross-clinic duplicates/i })).toHaveCount(0);
      await expect(page.getByText(/Efua Asante/)).toHaveCount(0);
    });
  });
}
