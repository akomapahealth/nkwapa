const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

// #271 follow-up: the /today station board. Seeded E2E identities and synthetic data only.
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

/** A fixed synthetic board with the cases the review named: a 444-minute wait and 1-minute bars. */
function syntheticBoard(now) {
  const staff = { id: 'syn-staff', displayName: 'Akua Mensah' };
  const station = (id, name, kind, sortOrder, capacity, members) => ({
    id,
    name,
    kind,
    sortOrder,
    capacity,
    active: true,
    staff: members,
    inUse: members.length,
    visits: [],
  });
  const visit = (at, id, first, last, minutes, status) => ({
    id,
    status,
    checkInId: id,
    checkInStatus: 'IN_PROGRESS',
    checkedInAt: new Date(now - 500 * 60_000).toISOString(),
    encounterId: null,
    station: { ...at, visits: [] },
    patient: { id, patientCode: `SYN-${id}`, firstName: first, lastName: last, dob: null },
    queuedAt: new Date(now - minutes * 60_000).toISOString(),
    claimedAt: status === 'IN_PROGRESS' ? new Date(now - 60_000).toISOString() : null,
    claimedBy: status === 'IN_PROGRESS' ? staff : null,
    completedBy: null,
    completedAt: null,
    handoffNote: null,
    endReason: null,
    releaseCount: 0,
    previous: null,
  });
  const reg = station('reg', 'Registration', 'INTAKE', 0, 1, [staff]);
  const bp = station('bp', 'Blood pressure', 'BLOOD_PRESSURE', 1, 2, [staff]);
  const eye = station('eye', 'Eye screening', 'EYE', 2, 1, []);
  const review = station('review', 'Review', 'REVIEW', 3, 1, []);
  reg.visits = [
    visit(reg, 'r1', 'Yaw', 'Boateng', 5, 'IN_PROGRESS'),
    visit(reg, 'r2', 'Lila', 'Owusu', 1, 'QUEUED'),
  ];
  bp.visits = [
    visit(bp, 'b1', 'Ama', 'Owusu', 7, 'IN_PROGRESS'),
    visit(bp, 'b2', 'Esi', 'Quaye', 26, 'QUEUED'),
    visit(bp, 'b3', 'Kofi', 'Antwi', 444, 'QUEUED'),
  ];
  eye.visits = [visit(eye, 'e1', 'Nana', 'Asante', 6, 'QUEUED')];
  review.visits = [visit(review, 'v1', 'Kojo', 'Tetteh', 2, 'QUEUED')];
  return {
    date: new Date(now).toISOString().slice(0, 10),
    timezone: 'Africa/Accra',
    stations: [reg, bp, eye, review],
    onShift: [{ user: staff, roleAtShift: 'VOLUNTEER', stationId: bp.id, activeVisitCount: 2 }],
  };
}

test.use({ storageState: storageStateFor('staff'), reducedMotion: 'reduce' });
test('today board', async ({ page }) => {
  test.setTimeout(300_000);
  for (const name of ['today', 'today-synthetic']) {
    await page.unroute('**/stations/board*');
    if (name === 'today-synthetic') {
      const now = Date.now();
      await page.clock.setFixedTime(now);
      await page.route('**/stations/board*', (route) =>
        route.fulfill({ json: syntheticBoard(now) }),
      );
    }
    for (const theme of ['light', 'dark']) {
      await page.addInitScript((theme) => {
        localStorage.setItem('nkwapa-theme', theme);
        localStorage.setItem('nkwapa.sidebar.collapsed', String(window.innerWidth <= 1280));
      }, theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
        await page.goto('/today');
        await expect(page.locator('main h1').first()).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#patient-station-line')).toBeVisible({ timeout: 30_000 });
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
        if (width === 390) {
          // The phone first screen is "Needs you now"; also show the line itself.
          await page
            .locator('#patient-station-line')
            .evaluate((element) => element.scrollIntoView({ block: 'start' }));
          await page.screenshot({
            path: path.join(OUT, `${name}-chart--390--${theme}.jpg`),
            type: 'jpeg',
            quality: 75,
          });
        }
      }
    }
  }
});
