const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

// The seeded e2e staff user holds SYSTEM_ADMIN plus DIRECTOR, DOCTOR, and VOLUNTEER at the
// clinic, so every chart section is available here. Per-role visibility is asserted in
// apps/web/lib/patient-chart.test.ts and apps/api/src/patient-chart/*.spec.ts, which can
// exercise roles this single seeded identity cannot.
const ALL_TABS = [
  'Overview',
  'Vitals',
  'Medications',
  'Hypertension',
  'Diabetes',
  'Medical History',
  'Notes',
  'Visits',
  'Patient-reported',
  'Consent',
];

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Chart');
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-CHART-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+/, { timeout: 20_000 });
  const url = new URL(page.url());
  const [, , clinicId, , patientId] = url.pathname.split('/');
  return { clinicId, patientId };
}

test('patient chart exposes every section with stable deep links', async ({ page }) => {
  const { clinicId, patientId } = await createPatient(page);

  for (const name of ALL_TABS) {
    await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
  }

  // Overview leads with pending clinical actions before any chronological history.
  await expect(page.getByRole('heading', { name: 'Needs you now' })).toBeVisible();

  // Selecting a tab writes it to the URL so the section can be linked and bookmarked.
  await page.getByRole('tab', { name: 'Visits', exact: true }).click();
  await expect(page).toHaveURL(/\?tab=visits/);
  await expect(page.getByRole('heading', { name: 'Visit history' })).toBeVisible();

  // A deep link restores the section directly on load.
  await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=vitals`);
  await expect(page.getByRole('tab', { name: 'Vitals', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Recorded vitals' })).toBeVisible();
});

test('unknown and legacy tab values fall back instead of rendering an empty chart', async ({
  page,
}) => {
  const { clinicId, patientId } = await createPatient(page);

  for (const legacyTab of ['trends', 'encounters', 'clinical-notes', 'nonsense']) {
    await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=${legacyTab}`);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // The URL is normalised to what is actually being shown.
    await expect(page).toHaveURL(/\?tab=overview/);
  }
});

test('the legacy patient route redirects into the clinic-scoped chart and keeps the tab', async ({
  page,
}) => {
  const { patientId } = await createPatient(page);

  await page.goto(`/patients/${patientId}?tab=visits`);
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+\?tab=visits/, { timeout: 20_000 });
  await expect(page.getByRole('tab', { name: 'Visits', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.goto(`/patients/${patientId}`);
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+/, { timeout: 20_000 });
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();
});

test('an inactive tab does not fetch its longitudinal data until it is opened', async ({
  page,
}) => {
  const { clinicId, patientId } = await createPatient(page);

  const chartRequests = [];
  await page.route('**/chart/**', async (route) => {
    chartRequests.push(new URL(route.request().url()).pathname);
    await route.continue();
  });

  await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=overview`);
  await expect(page.getByRole('heading', { name: 'Needs you now' })).toBeVisible();

  // Overview needs the summary, but must not pull the vitals or visits histories.
  expect(chartRequests.some((p) => p.endsWith('/chart/summary'))).toBeTruthy();
  expect(chartRequests.some((p) => p.endsWith('/chart/vitals'))).toBeFalsy();
  expect(chartRequests.some((p) => p.endsWith('/chart/visits'))).toBeFalsy();

  await page.getByRole('tab', { name: 'Visits', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visit history' })).toBeVisible();
  // Polled: the section's heading renders before its fetch is issued, so reading the request log
  // the moment the heading appears raced the effect and failed intermittently.
  await expect.poll(() => chartRequests.some((p) => p.endsWith('/chart/visits'))).toBeTruthy();
  expect(chartRequests.some((p) => p.endsWith('/chart/vitals'))).toBeFalsy();
});

test('empty, error, retry, and offline states are all reachable', async ({ page, context }) => {
  const { clinicId, patientId } = await createPatient(page);

  // Empty: a brand new patient has no visits yet.
  await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=visits`);
  await expect(page.getByRole('heading', { name: 'No visits yet' })).toBeVisible();

  // Error plus retry: fail the next visits read, then let the retry succeed.
  let failNext = true;
  await page.route('**/chart/visits*', async (route) => {
    if (failNext) {
      failNext = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL', message: 'Injected failure' }),
      });
      return;
    }
    await route.continue();
  });

  await page.reload();
  await expect(page.getByText('Visit history could not be loaded')).toBeVisible();
  await page.getByRole('button', { name: /try again|retry/i }).click();
  await expect(page.getByRole('heading', { name: 'No visits yet' })).toBeVisible();
  await page.unroute('**/chart/visits*');

  // Offline: the longitudinal read is withheld with an explicit notice, not a spinner.
  // Load the chart first, then drop the connection: switching tabs must stay usable
  // offline, which is the whole point of mirroring the tab without a navigation.
  await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=overview`);
  await expect(page.getByRole('tab', { name: 'Vitals', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('tab', { name: 'Vitals', exact: true }).click();
  await expect(page.getByText('You are offline')).toBeVisible();
  await expect(page).toHaveURL(/\?tab=vitals/);
  await context.setOffline(false);
});

test('chart navigation works by keyboard and at every supported width', async ({ page }) => {
  const { clinicId, patientId } = await createPatient(page);
  await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=overview`);

  const tablist = page.getByRole('tablist', { name: 'Patient chart sections' });
  await expect(tablist).toBeVisible();

  // Roving focus: arrow keys move between tabs and activate the focused one.
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Vitals', exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\?tab=vitals/);

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Medications', exact: true })).toBeFocused();

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    ).toBeFalsy();
  }
});

// #270: synthetic responses exercise the readable alternative without changing seed data.
for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`staff trends retain exact values in chart and table (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const { clinicId, patientId } = await createPatient(page);
    await page.route(`**/patients/${patientId}/trends?*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bp: [
            { t: '2026-10-01T12:00:00Z', sys: 120, dia: 80, source: 'ENCOUNTER' },
            { t: '2026-10-01T13:00:00Z', sys: 150, dia: 90, source: 'ENCOUNTER' },
            { t: '2026-10-03T12:00:00Z', sys: 130, dia: 85, source: 'ENCOUNTER' },
          ],
          glucose: [
            { t: '2026-10-01T12:00:00Z', value: 105, type: 'FASTING', source: 'ENCOUNTER' },
          ],
          measurements: [{ t: '2026-10-01T12:00:00Z', spo2Percent: 98, source: 'ENCOUNTER' }],
          followUp: { requested: 0, confirmed: 0, completed: 0, noShow: 0, closed: 0 },
        }),
      }),
    );
    await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=vitals`);
    const bp = page
      .getByRole('heading', { name: 'Blood pressure trend', exact: true })
      .locator('xpath=ancestor::section[1]');
    const curves = bp.locator('path.recharts-line-curve');
    await expect(curves).toHaveCount(2);
    // Three actual readings form straight line segments, with no spline control points.
    for (const curve of await curves.all()) {
      await expect(curve).toHaveAttribute('d', /L/);
      await expect(curve).not.toHaveAttribute('d', /[CQ]/);
    }
    for (const [title, expectedColumns, values] of [
      [
        'Blood pressure trend',
        ['Systolic (mmHg)', 'Diastolic (mmHg)'],
        ['120', '80', '150', '90', '130', '85'],
      ],
      // Stored as 105 mg/dL; the seeded clinic is in Ghana, so it reads in mmol/L.
      ['Glucose trend', ['Glucose (mmol/L)'], ['5.8']],
      ['SpO₂ trend', ['SpO₂ (%)'], ['98']],
    ]) {
      const section = page
        .getByRole('heading', { name: title, exact: true })
        .locator('xpath=ancestor::section[1]');
      await section.getByRole('button', { name: 'Show table', exact: true }).click();
      const table = page.getByRole('table', { name: title, exact: true });
      await expect(table).toBeVisible();
      if (title === 'Blood pressure trend') {
        // Two readings on one day must both survive in the literal table.
        await expect(table.getByRole('row')).toHaveCount(4);
        await expect(table.getByRole('rowheader', { name: '10/1', exact: true })).toHaveCount(2);
      }
      for (const column of expectedColumns) {
        await expect(table.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
      }
      for (const value of values) {
        await expect(table.getByRole('cell', { name: value, exact: true })).toBeVisible();
      }
      await section.getByRole('button', { name: 'Show chart', exact: true }).click();
      await expect(table).toHaveCount(0);
    }
  });
}
