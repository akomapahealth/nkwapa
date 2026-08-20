const path = require('path');
const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const authFile = path.join(__dirname, '..', 'playwright', '.auth', 'staff.json');

test.use({ storageState: authFile });

// The seeded e2e staff user holds SYSTEM_ADMIN plus DIRECTOR, DOCTOR, and VOLUNTEER at the
// clinic, so every chart section is available here. Per-role visibility is asserted in
// apps/web/lib/patient-chart.test.ts and apps/api/src/patient-chart/*.spec.ts, which can
// exercise roles this single seeded identity cannot.
const ALL_TABS = [
  'Overview',
  'Vitals',
  'Medications',
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
  await page.getByLabel('First name *').fill('Chart');
  await page.getByLabel('Last name *').fill(`E2E-${suffix}`);
  await page.getByLabel('National ID *').fill(`E2E-CHART-${suffix}`);
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
  await expect(page.getByRole('heading', { name: 'Pending clinical actions' })).toBeVisible();

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
  await expect(page.getByRole('heading', { name: 'Pending clinical actions' })).toBeVisible();

  // Overview needs the summary, but must not pull the vitals or visits histories.
  expect(chartRequests.some((p) => p.endsWith('/chart/summary'))).toBeTruthy();
  expect(chartRequests.some((p) => p.endsWith('/chart/vitals'))).toBeFalsy();
  expect(chartRequests.some((p) => p.endsWith('/chart/visits'))).toBeFalsy();

  await page.getByRole('tab', { name: 'Visits', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visit history' })).toBeVisible();
  expect(chartRequests.some((p) => p.endsWith('/chart/visits'))).toBeTruthy();
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
