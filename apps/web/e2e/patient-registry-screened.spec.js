const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');

/*
  Issue #224: filter the patient registry by completed-screening date.

  Seeds its own patient rather than reading the shared fixtures, which other specs consume: the
  patient is checked in, moved straight to the Review station, counselled and completed, so it
  qualifies the way a real session does. That needs the station line, so this runs in the CI step
  that builds with FEATURE_STATION_WORKFLOW_ENABLED on, and skips everywhere else.
*/
test.skip(
  process.env.FEATURE_STATION_WORKFLOW_ENABLED !== 'true' ||
    process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED !== 'true',
  'Runs only with the station workflow flag on (API and web).',
);

test.use({ storageState: storageStateFor('staff') });

const THEME_STORAGE_KEY = 'nkwapa-theme';

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const lastName = `Screened-${suffix}`;
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Session');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-SCR-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  return { clinicId, patientId, lastName };
}

async function ensureShift(role, clinicId) {
  const res = await apiRequestAs(role, 'post', `/clinics/${clinicId}/shifts/check-in`, {
    clinicId,
    data: { roleAtShift: 'VOLUNTEER' },
  });
  if (!res.ok()) expect(res.json().code).toBe('SHIFT_ALREADY_ACTIVE');
}

/** Check in, skip straight to Review, counsel and complete: a finished screening, today. */
async function completeScreening({ clinicId, patientId }) {
  await ensureShift('volunteer', clinicId);
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;

  const stations = await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations`, {
    clinicId,
  });
  expect(stations.ok(), stations.text()).toBeTruthy();
  const review = stations
    .json()
    .items.find((station) => station.kind === 'REVIEW' && station.active);
  expect(review, 'the clinic has an active Review station').toBeTruthy();

  const moved = await apiRequestAs(
    'staff',
    'post',
    `/clinics/${clinicId}/checkins/${checkInId}/move`,
    {
      clinicId,
      data: { stationId: review.id, reason: 'E2E: straight to review' },
    },
  );
  expect(moved.ok(), moved.text()).toBeTruthy();

  const visits = await apiRequestAs(
    'staff',
    'get',
    `/clinics/${clinicId}/checkins/${checkInId}/station-visits`,
    { clinicId },
  );
  const openVisit = visits
    .json()
    .items.find((visit) => visit.status === 'QUEUED' && visit.station.id === review.id);
  expect(openVisit, 'the patient is queued at Review').toBeTruthy();

  const claim = await apiRequestAs(
    'volunteer',
    'post',
    `/clinics/${clinicId}/station-visits/${openVisit.id}/claim`,
    { clinicId },
  );
  expect(claim.ok(), claim.text()).toBeTruthy();
  const { encounterId } = claim.json();

  const counselling = await apiRequestAs(
    'volunteer',
    'put',
    `/clinics/${clinicId}/encounters/${encounterId}/counselling`,
    {
      clinicId,
      data: {
        topics: ['BLOOD_PRESSURE'],
        adviceGiven: 'Recheck at the next session.',
        followUpRecommended: false,
        followUpWindow: 'NOT_ASSESSED',
        referralRecommended: false,
      },
    },
  );
  expect(counselling.ok(), counselling.text()).toBeTruthy();

  const done = await apiRequestAs(
    'volunteer',
    'post',
    `/clinics/${clinicId}/station-visits/${openVisit.id}/complete`,
    { clinicId, data: {} },
  );
  expect(done.ok(), done.text()).toBeTruthy();
  expect(done.json()).toMatchObject({ sessionCompleted: true });
}

function describeViolations(violations) {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
    )
    .join('\n\n');
}

async function axe(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations, describeViolations(results.violations)).toEqual([]);
}

test('filters the registry to patients screened today, then clears it', async ({ page }) => {
  test.setTimeout(180_000);
  const patient = await createPatient(page);
  await completeScreening(patient);

  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // Without the filter there is no Screened column.
  await expect(page.getByRole('columnheader', { name: /Screened/ })).toHaveCount(0);

  await page.getByLabel('Name, patient code, phone or ID last 4').fill(patient.lastName);
  await page.getByLabel('Screened', { exact: true }).click();
  await page.getByRole('option', { name: 'Today' }).click();

  await expect(page).toHaveURL(/screenedFrom=\d{4}-\d{2}-\d{2}/);
  await expect(page).toHaveURL(new RegExp(`q=${patient.lastName}`));
  await expect(page.getByText(/^1 patient screened \d{1,2} \w{3} \d{4}$/)).toBeVisible({
    timeout: 20_000,
  });
  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader', { name: /Screened/ })).toBeVisible();
  const row = table.getByRole('row', { name: new RegExp(patient.lastName) });
  await expect(row).toBeVisible();
  // A Review completion has a time, unlike the imported cohort.
  await expect(row).not.toContainText('time not recorded');
  await expect(
    row.getByRole('cell').filter({ hasText: /\d{1,2} \w{3} \d{4}, \d{2}:\d{2}/ }),
  ).toHaveCount(1);

  // The filtered view is a shareable link: a fresh load restores it.
  await page.reload();
  await expect(page.getByText(/^1 patient screened/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Name, patient code, phone or ID last 4')).toHaveValue(
    patient.lastName,
  );

  // Custom range open, light mode.
  await page.getByLabel('Screened', { exact: true }).click();
  await page.getByRole('option', { name: 'Custom range' }).click();
  await expect(page.getByLabel('From')).toBeVisible();
  // Scan once the Select's popup has finished closing, not while it fades over the page.
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByLabel('Screened', { exact: true })).toHaveText('Custom range');
  await axe(page);

  // A reversed range is explained beside the dates and never sent.
  await page.getByLabel(/^To/).fill('2020-01-01');
  await expect(
    page.getByRole('alert').filter({ hasText: 'The end date must be on or after the start date.' }),
  ).toBeVisible();
  await expect(page.getByLabel(/^To/)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Check the screened dates')).toBeVisible();
  await page.getByLabel(/^To/).fill('');

  // Clear just the screened filter from its chip.
  await page.getByRole('button', { name: 'Remove Screened filter' }).click();
  await expect(page).not.toHaveURL(/screenedFrom/);
  await expect(page.getByLabel('Screened', { exact: true })).toHaveText('Any time');
  await expect(page.getByRole('columnheader', { name: /Screened/ })).toHaveCount(0);
  await expect(
    page.getByRole('table').getByRole('row', { name: new RegExp(patient.lastName) }),
  ).toBeVisible();
});

test('the registry with the screened filter open passes axe in dark mode', async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'dark'), THEME_STORAGE_KEY);
  await page.goto('/patients?screenedFrom=2026-10-01&screenedTo=2026-10-15');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByLabel('From')).toHaveValue('2026-10-01', { timeout: 30_000 });
  await expect(
    page
      .getByText(/patients? screened between/)
      .or(page.getByRole('heading', { name: 'No completed screenings' })),
  ).toBeVisible({ timeout: 20_000 });
  await axe(page);
});
