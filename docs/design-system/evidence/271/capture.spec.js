const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

// #271 station workflows evidence. Seeded E2E identities and synthetic data only.
const { apiRequestAs } = require(process.env.WEB_DIR + '/playwright/api-client');
const OUT = process.env.EVIDENCE_DIR;
const findings = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2)),
);

/** Wait for entrance animations; spinners and skeleton pulses loop forever, so skip those. */
async function settle(page) {
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
}

// One synthetic chart is created once and reused for before/after evidence.
test.use({ storageState: storageStateFor('staff'), reducedMotion: 'reduce' });
test('station workflows', async ({ page }) => {
  test.setTimeout(300_000);
  const fixturePath =
    process.env.EVIDENCE_FIXTURE || path.join(require('os').tmpdir(), 'nkwapa-271-fixture.json');
  let fixture;
  if (fs.existsSync(fixturePath)) fixture = JSON.parse(fs.readFileSync(fixturePath));
  else {
    await page.goto('/patients/new');
    await page.getByLabel('First name', { exact: true }).fill('Synthetic');
    await page.getByLabel('Last name', { exact: true }).fill('Redesign271');
    await page.getByLabel('National ID', { exact: true }).fill('E2E-REDESIGN-271-' + Date.now());
    await page.getByRole('button', { name: 'Create patient' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/);
    const chart = new URL(page.url()).pathname;
    const [, , clinicId, , patientId] = chart.split('/');
    const check = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
      clinicId,
      data: { patientId },
    });
    expect(check.ok(), check.text()).toBeTruthy();
    const shift = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/shifts/check-in`, {
      clinicId,
      data: { roleAtShift: 'VOLUNTEER' },
    });
    if (!shift.ok()) expect(shift.json().code).toBe('SHIFT_ALREADY_ACTIVE');
    const board = await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, {
      clinicId,
    });
    const visit = board
      .json()
      .stations.flatMap((s) => s.visits)
      .find((v) => v.checkInId === check.json().id);
    const claim = await apiRequestAs(
      'staff',
      'post',
      `/clinics/${clinicId}/station-visits/${visit.id}/claim`,
      { clinicId },
    );
    expect(claim.ok(), claim.text()).toBeTruthy();
    fixture = { chart, visit: `/stations/visits/${visit.id}` };
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  }
  for (const [name, route] of [
    ['today', '/today'],
    ['stations', '/stations'],
    ['setup', '/stations/setup'],
    ['visit', fixture.visit],
    ['assigned', '/my/assigned'],
  ]) {
    for (const theme of ['light', 'dark']) {
      await page.addInitScript((theme) => {
        localStorage.setItem('nkwapa-theme', theme);
        localStorage.setItem('nkwapa.sidebar.collapsed', String(window.innerWidth <= 1280));
      }, theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
        await page.goto(route);
        await expect(page.locator('main h1').first()).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await settle(page);
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({
          path: path.join(OUT, `${name}--${width}--${theme}.jpg`),
          fullPage: width > 390,
          type: 'jpeg',
          quality: 70,
        });
        const r = await new AxeBuilder({ page }).analyze();
        findings.push({
          name,
          width,
          theme,
          height: await page.evaluate(() => document.documentElement.scrollHeight),
          violations: r.violations
            .filter((v) => ['serious', 'critical'].includes(v.impact))
            .map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => n.target.join(' ')),
            })),
        });
        // Supplement the first-screen phone evidence with the chart's visible mobile scale.
        if (
          name === 'today' &&
          width === 390 &&
          (await page.locator('#patient-station-line').count())
        ) {
          await page
            .locator('#patient-station-line')
            .evaluate((element) => element.scrollIntoView({ block: 'start' }));
          await page.screenshot({
            path: path.join(OUT, `today-chart--390--${theme}.jpg`),
            type: 'jpeg',
            quality: 80,
          });
        }
      }
    }
  }
});
