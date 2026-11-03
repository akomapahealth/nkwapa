const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');

test.skip(
  process.env.FEATURE_STATION_WORKFLOW_ENABLED !== 'true' ||
    process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED !== 'true',
  'Station workflow must be on in both API and web build.',
);
test.use({ storageState: storageStateFor('manager') });

function syntheticBoard(now) {
  const staff = { id: 'synthetic-staff', displayName: 'Synthetic Screener' };
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
  const bp = station('bp', 'Blood pressure', 'BLOOD_PRESSURE', 1, 2, [staff]);
  const eye = station('eye', 'Eye screening', 'EYE', 2, 1, []);
  const review = station('review', 'Review', 'REVIEW', 3, 1, []);
  const visit = (id, minutes, status, at) => ({
    id,
    status,
    checkInId: id,
    checkInStatus: 'IN_PROGRESS',
    checkedInAt: new Date(now - 60 * 60_000).toISOString(),
    encounterId: null,
    station: at,
    patient: { id, patientCode: `SYN-${id}`, firstName: 'Synthetic', lastName: id, dob: null },
    queuedAt: new Date(now - minutes * 60_000).toISOString(),
    // Claimed time deliberately differs: every bar must use queuedAt.
    claimedAt: status === 'IN_PROGRESS' ? new Date(now - 2 * 60_000).toISOString() : null,
    claimedBy: status === 'IN_PROGRESS' ? staff : null,
    completedBy: null,
    completedAt: null,
    handoffNote: null,
    endReason: null,
    releaseCount: 0,
    previous: null,
  });
  bp.visits = [
    visit('WithStaff', 7, 'IN_PROGRESS', { ...bp }),
    visit('Waiting', 12, 'QUEUED', { ...bp }),
    visit('LongWait', 26, 'QUEUED', { ...bp }),
    visit('Boundary', 20, 'QUEUED', { ...bp }),
  ];
  review.visits = [visit('Review', 5, 'QUEUED', { ...review })];
  return {
    date: new Date(now).toISOString().slice(0, 10),
    timezone: 'Africa/Accra',
    stations: [bp, eye, review],
    onShift: [{ user: staff, roleAtShift: 'VOLUNTEER', stationId: bp.id, activeVisitCount: 1 }],
  };
}

for (const theme of ['light', 'dark']) {
  test(`patient station lanes preserve exact waits, states, staffing and table in ${theme}`, async ({
    page,
  }) => {
    const now = Date.now();
    await page.clock.setFixedTime(now);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.route('**/stations/board*', (route) => route.fulfill({ json: syntheticBoard(now) }));
    await page.goto('/today');
    const needs = page.getByRole('region', { name: 'Needs you now' });
    await expect(needs.getByText('1 patient waiting over 20 minutes')).toBeVisible();
    await expect(needs.getByText('2 open stations have no staff')).toBeVisible();
    await expect(needs.getByText('1 patient waiting at the review station')).toBeVisible();
    const rows = page.getByTestId('patient-station-row');
    await expect(rows).toHaveCount(5);
    // One lane per station; that station's patients sit side by side in it.
    await expect(page.getByTestId('patient-station-lane')).toHaveCount(3);
    const bpLane = page.getByTestId('patient-station-lane').filter({ hasText: 'Blood pressure' });
    await expect(bpLane.getByTestId('patient-station-row')).toHaveCount(4);
    await expect(bpLane.getByText('1 waiting over 20 min', { exact: true })).toBeVisible();
    const [first, second] = await bpLane
      .getByTestId('patient-wait-bar')
      .evaluateAll((bars) => bars.slice(0, 2).map((bar) => bar.getBoundingClientRect().y));
    expect(second).toBe(first);
    for (const [name, minutes, status] of [
      ['WithStaff', 7, 'With staff'],
      ['Waiting', 12, 'Waiting'],
      ['LongWait', 26, 'Waiting over 20 min'],
      ['Boundary', 20, 'Waiting'],
    ]) {
      const row = rows.filter({ hasText: `Synthetic ${name},` });
      await expect(row).toContainText(`Synthetic ${name}, ${status}, ${minutes} min`);
      await expect(row).toContainText(`Synthetic ${name.charAt(0)}. ${minutes} min`);
      const bar = row.getByTestId('patient-wait-bar');
      await expect(bar).toHaveAttribute('data-minutes', String(minutes));
      const ratio = await bar.evaluate(
        (el) =>
          el.getBoundingClientRect().width /
          el.closest('[data-testid="patient-wait-track"]').getBoundingClientRect().width,
      );
      expect(ratio).toBeCloseTo(minutes / 40, 2);
      // Labels sit inside long bars and beside short ones; neither is cut off.
      expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await expect(page.getByTestId('patient-wait-track').first()).toHaveAttribute(
      'data-scale',
      '40',
    );
    await expect(page.getByText('Staffed 1 of 2', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'On shift' })
        .getByText('Synthetic Screener', { exact: true }),
    ).toBeVisible();
    const needsBox = await needs.boundingBox();
    const lineBox = await page
      .getByRole('heading', { name: 'Patients at each station' })
      .boundingBox();
    expect(needsBox.y).toBeLessThan(lineBox.y);
    // Actions live in the bar's menu, not on the lane.
    await rows.filter({ hasText: 'Synthetic WithStaff,' }).getByRole('button').click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('With Synthetic Screener', { exact: true })).toBeVisible();
    for (const item of ['Move', 'Release', 'Left', 'Open'])
      await expect(menu.getByRole('menuitem', { name: item, exact: true })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Assign', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Assign', exact: true })).toHaveCount(0);
    // "Needs you now" opens the existing dialogs for the oldest wait and an unstaffed station.
    await needs.getByRole('button', { name: 'Move a patient' }).click();
    await expect(page.getByRole('dialog', { name: 'Move patient' })).toContainText(
      'Synthetic LongWait',
    );
    await page.getByRole('button', { name: 'Cancel' }).click();
    await needs.getByRole('button', { name: 'Assign staff' }).click();
    await expect(page.getByRole('dialog', { name: 'Assign patient' })).toContainText(
      'Synthetic Review',
    );
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Show data table' }).click();
    const table = page.getByRole('table', {
      name: 'Station line, exact patient queue times and staffing',
    });
    await expect(table.getByRole('row').filter({ hasText: 'Synthetic WithStaff' })).toContainText(
      '7',
    );
    await expect(table.getByRole('row').filter({ hasText: 'Synthetic LongWait' })).toContainText(
      'Waiting over 20 min',
    );
    await page.getByRole('button', { name: 'Show station line' }).click();
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(rows.first()).toBeVisible();
      await expect(page.getByTestId('station-minute-scale').first()).toBeVisible();
      await expect(page.getByText(/The dashed guide marks 20 minutes/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  });
}

test.describe('screening error recovery', () => {
  test.use({ storageState: storageStateFor('staff') });
  test('blood pressure errors link to fields, retain corrections and preserve saved units', async ({
    page,
  }) => {
    const { apiRequestAs } = require('../playwright/api-client');
    test.setTimeout(90_000);
    await page.goto('/patients/new');
    await page.getByLabel('First name', { exact: true }).fill('Synthetic');
    await page.getByLabel('Last name', { exact: true }).fill('Screening271');
    await page.getByLabel('National ID', { exact: true }).fill(`E2E-SCREENING-271-${Date.now()}`);
    await page.getByRole('button', { name: 'Create patient' }).click();
    await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/);
    const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
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
    const bp = board.json().stations.find((station) => station.kind === 'BLOOD_PRESSURE');
    const move = await apiRequestAs(
      'staff',
      'post',
      `/clinics/${clinicId}/checkins/${check.json().id}/move`,
      { clinicId, data: { stationId: bp.id, reason: 'Synthetic screening validation test' } },
    );
    expect(move.ok(), move.text()).toBeTruthy();
    const updated = await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, {
      clinicId,
    });
    const visit = updated
      .json()
      .stations.flatMap((station) => station.visits)
      .find((visit) => visit.checkInId === check.json().id);
    const claim = await apiRequestAs(
      'staff',
      'post',
      `/clinics/${clinicId}/station-visits/${visit.id}/claim`,
      { clinicId },
    );
    expect(claim.ok(), claim.text()).toBeTruthy();
    await page.goto(`/stations/visits/${visit.id}`);
    await page.getByLabel('Systolic BP (mmHg)').fill('301');
    await page.getByLabel('Diastolic BP (mmHg)').fill('80');
    await page.getByLabel('Measurement site', { exact: true }).click();
    await page.getByRole('option', { name: /left arm/i }).click();
    await page.getByRole('button', { name: 'Save measurements' }).click();
    const summary = page.getByRole('alert', { name: 'Check measurements' });
    await expect(summary).toBeVisible();
    await expect(page.getByLabel('Systolic BP (mmHg)')).toHaveAttribute('aria-invalid', 'true');
    await summary.getByRole('link', { name: /Systolic BP/ }).click();
    await expect(page.getByLabel('Systolic BP (mmHg)')).toBeFocused();
    await page.getByLabel('Systolic BP (mmHg)').fill('128');
    await expect(page.getByLabel('Systolic BP (mmHg)')).toHaveValue('128');
    await page.getByRole('button', { name: 'Save measurements' }).click();
    await expect(page.getByText('Measurements saved and synced.')).toBeVisible();
    await expect(summary).toHaveCount(0);
    const saved = await apiRequestAs('staff', 'get', `/encounters/${claim.json().encounterId}`, {
      clinicId,
    });
    expect(saved.json().vitals).toMatchObject({ systolicBp: 128, diastolicBp: 80 });
  });
});

test('long-wait action names only the three oldest patients and keeps the full count', async ({
  page,
}) => {
  const now = Date.now();
  await page.clock.setFixedTime(now);
  const board = syntheticBoard(now);
  const bp = board.stations[0];
  const template = bp.visits.find((visit) => visit.id === 'LongWait');
  for (const minutes of [27, 28, 29, 30])
    bp.visits.push({
      ...template,
      id: `Long${minutes}`,
      patient: { ...template.patient, id: `Long${minutes}`, lastName: `Long${minutes}` },
      queuedAt: new Date(now - minutes * 60_000).toISOString(),
    });
  await page.route('**/stations/board*', (route) => route.fulfill({ json: board }));
  await page.goto('/today');
  const needs = page.getByRole('region', { name: 'Needs you now' });
  await expect(needs.getByText('5 patients waiting over 20 minutes')).toBeVisible();
  await expect(
    needs.getByText(
      /Synthetic Long30, 30 min.*Synthetic Long29, 29 min.*Synthetic Long28, 28 min.*and 2 more/,
    ),
  ).toBeVisible();
  await expect(needs.getByText(/Synthetic Long27/)).toHaveCount(0);
  await expect(page.getByTestId('patient-station-row')).toHaveCount(9);
});

test('a wait past the scale fills its lane and keeps its real minutes', async ({ page }) => {
  const now = Date.now();
  await page.clock.setFixedTime(now);
  const board = syntheticBoard(now);
  const bp = board.stations[0];
  const template = bp.visits.find((visit) => visit.id === 'LongWait');
  bp.visits.push({
    ...template,
    id: 'Overnight',
    patient: { ...template.patient, id: 'Overnight', lastName: 'Overnight' },
    queuedAt: new Date(now - 444 * 60_000).toISOString(),
  });
  await page.route('**/stations/board*', (route) => route.fulfill({ json: board }));
  await page.goto('/today');
  const row = page.getByTestId('patient-station-row').filter({ hasText: 'Synthetic Overnight,' });
  await expect(row).toContainText('Synthetic O. 444 min');
  const ratio = await row
    .getByTestId('patient-wait-bar')
    .evaluate(
      (el) =>
        el.getBoundingClientRect().width /
        el.closest('[data-testid="patient-wait-track"]').getBoundingClientRect().width,
    );
  expect(ratio).toBeCloseTo(1, 2);
  await expect(page.getByTestId('patient-wait-track').first()).toHaveAttribute('data-scale', '40');
});
