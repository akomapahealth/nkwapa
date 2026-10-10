const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');

/*
  Issue #167: the station line, end to end.

  A checked-in patient joins the first station's queue; two volunteers race for them and one
  wins; each station records only its own measurements into the shared encounter; the review
  station counsels and completes the session; a doctor finds it waiting for review.

  The flag decides who owns a checked-in patient, so this spec runs only in the CI step that
  builds with FEATURE_STATION_WORKFLOW_ENABLED on. Everywhere else it skips, and the assignment
  specs run against the flag-off behaviour they were written for.
*/
test.skip(
  process.env.FEATURE_STATION_WORKFLOW_ENABLED !== 'true' ||
    process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED !== 'true',
  'Runs only with the station workflow flag on (API and web).',
);

test.use({ storageState: storageStateFor('staff') });

async function createPatient(page) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const lastName = `Station-${suffix}`;
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Line');
  await page.getByLabel('Last name', { exact: true }).fill(lastName);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-STN-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  return { clinicId, patientId, name: `Line ${lastName}` };
}

/** Each identity needs an active shift to take a patient. One already running is fine. */
async function ensureShift(role, clinicId) {
  const res = await apiRequestAs(role, 'post', `/clinics/${clinicId}/shifts/check-in`, {
    clinicId,
    data: { roleAtShift: 'VOLUNTEER' },
  });
  if (!res.ok()) expect(res.json().code).toBe('SHIFT_ALREADY_ACTIVE');
}

async function boardVisit(role, clinicId, checkInId) {
  const res = await apiRequestAs(role, 'get', `/clinics/${clinicId}/stations/board`, { clinicId });
  expect(res.ok()).toBeTruthy();
  for (const station of res.json().stations) {
    const visit = station.visits.find((candidate) => candidate.checkInId === checkInId);
    if (visit) return { station, visit };
  }
  return null;
}

async function claimNext(role, clinicId, checkInId) {
  const at = await boardVisit(role, clinicId, checkInId);
  const claim = await apiRequestAs(
    role,
    'post',
    `/clinics/${clinicId}/station-visits/${at.visit.id}/claim`,
    { clinicId },
  );
  expect(claim.ok(), claim.text()).toBeTruthy();
  return { at, claimed: claim.json() };
}

async function complete(role, clinicId, visitId, data = {}) {
  return apiRequestAs(role, 'post', `/clinics/${clinicId}/station-visits/${visitId}/complete`, {
    clinicId,
    data,
  });
}

test('a patient moves through every station and reaches a doctor', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  await ensureShift('volunteer', clinicId);

  // Check in: the patient lands in the first station's queue with no manager involved.
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;
  const first = await boardVisit('staff', clinicId, checkInId);
  expect(first.station.kind).toBe('INTAKE');
  expect(first.visit.status).toBe('QUEUED');

  // Two volunteers take the same patient at the same moment: exactly one gets them.
  const [a, b] = await Promise.all([
    apiRequestAs('staff', 'post', `/clinics/${clinicId}/station-visits/${first.visit.id}/claim`, {
      clinicId,
    }),
    apiRequestAs(
      'volunteer',
      'post',
      `/clinics/${clinicId}/station-visits/${first.visit.id}/claim`,
      { clinicId },
    ),
  ]);
  const outcomes = [a, b].map((res) => (res.ok() ? 'won' : res.json().code)).sort();
  expect(outcomes).toEqual(['STATION_VISIT_ALREADY_CLAIMED', 'won']);
  const intakeHolder = a.ok() ? 'staff' : 'volunteer';
  const encounterId = (a.ok() ? a : b).json().encounterId;
  expect(encounterId).toBeTruthy();

  // Intake hands on with a note the next station will see.
  const intakeDone = await complete(intakeHolder, clinicId, first.visit.id, {
    handoffNote: 'Reports headaches this week.',
  });
  expect(intakeDone.ok(), intakeDone.text()).toBeTruthy();

  // Blood pressure, through the UI, as the volunteer.
  const volunteerContext = await browser.newContext({
    storageState: storageStateFor('volunteer'),
  });
  const volunteerPage = await volunteerContext.newPage();
  await volunteerPage.goto('/stations');
  await expect(volunteerPage.getByRole('heading', { name: 'Stations' })).toBeVisible({
    timeout: 20_000,
  });
  const bpButton = volunteerPage.getByRole('button', { name: /^Blood pressure/ });
  if ((await bpButton.getAttribute('aria-pressed')) !== 'true') await bpButton.click();
  await expect(volunteerPage.getByText('Reports headaches this week.')).toBeVisible({
    timeout: 20_000,
  });
  const row = volunteerPage.locator('div', { hasText: patient.name }).filter({
    has: volunteerPage.getByRole('button', { name: 'Take patient' }),
  });
  await row.last().getByRole('button', { name: 'Take patient' }).click();
  await volunteerPage.waitForURL(/\/stations\/visits\//, { timeout: 20_000 });
  await volunteerPage.getByLabel('Systolic BP (mmHg)').fill('150');
  await volunteerPage.getByLabel('Diastolic BP (mmHg)').fill('95');
  await volunteerPage.getByLabel('Measurement site').click();
  await volunteerPage.getByRole('option', { name: /left arm/i }).click();
  // The station shows only its own groups.
  await expect(volunteerPage.getByLabel('Weight (kg)')).toHaveCount(0);
  await volunteerPage.getByRole('button', { name: 'Save measurements' }).click();
  await expect(volunteerPage.getByText('Measurements saved and synced.')).toBeVisible({
    timeout: 20_000,
  });
  await volunteerPage.getByLabel('Note for the next station').fill('BP high, recheck at review.');
  await volunteerPage.getByRole('button', { name: /^Send to Glucose/ }).click();
  await volunteerPage.waitForURL(/\/stations$/, { timeout: 20_000 });
  await volunteerContext.close();

  // Glucose: the reading alone.
  const glucose = await claimNext('volunteer', clinicId, checkInId);
  expect(glucose.at.station.kind).toBe('GLUCOSE');
  const reading = await apiRequestAs(
    'volunteer',
    'put',
    `/clinics/${clinicId}/encounters/${encounterId}/diabetes-screening/glucose`,
    {
      clinicId,
      data: { glucoseMgDl: 210, glucoseType: 'RANDOM', collectedAt: new Date().toISOString() },
    },
  );
  expect(reading.ok(), reading.text()).toBeTruthy();
  expect((await complete('volunteer', clinicId, glucose.at.visit.id)).ok()).toBeTruthy();

  // Anthropometry: a sectioned bundle through the offline replay path. It must not erase BP.
  const anthropometry = await claimNext('volunteer', clinicId, checkInId);
  expect(anthropometry.at.station.kind).toBe('ANTHROPOMETRY');
  const push = await apiRequestAs('volunteer', 'post', `/sync/push?clinicId=${clinicId}`, {
    clinicId,
    data: [
      {
        id: randomUUID(),
        entityType: 'encounter_vitals_bundle',
        entityId: randomUUID(),
        operation: 'UPSERT',
        clinicId,
        idempotencyKey: randomUUID(),
        payloadJson: {
          schemaVersion: 2,
          sections: ['anthropometry'],
          encounterId,
          vitalsId: randomUUID(),
          vitals: { weightKg: 80, heightCm: 160 },
        },
      },
    ],
  });
  expect(push.ok(), push.text()).toBeTruthy();
  const encounter = await apiRequestAs('doctor', 'get', `/encounters/${encounterId}`, { clinicId });
  expect(encounter.json().vitals).toMatchObject({
    systolicBp: 150,
    diastolicBp: 95,
    weightKg: 80,
    heightCm: 160,
    bmi: 31.2,
  });
  expect(encounter.json().diabetesScreening).toMatchObject({ glucoseMgDl: 210 });
  expect((await complete('volunteer', clinicId, anthropometry.at.visit.id)).ok()).toBeTruthy();

  // Eye station, through the UI: acuity, the penlight and ophthalmoscopy tables, a referral.
  const eye = await claimNext('volunteer', clinicId, checkInId);
  expect(eye.at.station.kind).toBe('EYE');
  const eyeContext = await browser.newContext({ storageState: storageStateFor('volunteer') });
  const eyePage = await eyeContext.newPage();
  await eyePage.goto(`/stations/visits/${eye.at.visit.id}`);
  await expect(eyePage.getByRole('button', { name: 'Save eye examination' })).toBeVisible({
    timeout: 20_000,
  });
  await eyePage.getByLabel('Right eye (OD), unaided').click();
  await eyePage.getByRole('option', { name: '6/18 (20/60)' }).click();
  await eyePage.getByLabel('Left eye (OS), unaided').click();
  await eyePage.getByRole('option', { name: '6/6 (20/20)' }).click();
  await eyePage.getByLabel('Right eye (OD), pinhole').click();
  await eyePage.getByRole('option', { name: '6/9 (20/30)' }).click();
  // One button per table, penlight then ophthalmoscopy. Locators wait, unlike .all(), which
  // would read the page while the closing dropdown still hides it from the accessibility tree.
  const markRestNormal = eyePage.getByRole('button', { name: 'Mark the rest normal' });
  await markRestNormal.nth(0).click();
  await markRestNormal.nth(1).click();
  await eyePage
    .getByRole('group', { name: 'Macula, Left eye (OS)' })
    .getByRole('button', { name: 'Abnormal' })
    .click();
  await eyePage.getByLabel('What was seen: Macula, Left eye (OS)').fill('Hard exudates');
  await eyePage.getByLabel('Signs of diabetes seen').click();
  await eyePage.getByLabel('Refer to an eye specialist').click();
  await eyePage.getByLabel('Referral note').fill('Fundus review for diabetic retinopathy');
  await eyePage.getByRole('button', { name: 'Save eye examination' }).click();
  await expect(eyePage.getByText('Eye examination saved.')).toBeVisible({ timeout: 20_000 });
  await eyeContext.close();
  const eyeRecord = await apiRequestAs(
    'doctor',
    'get',
    `/clinics/${clinicId}/encounters/${encounterId}/eye-screening`,
    { clinicId },
  );
  expect(eyeRecord.json().record).toMatchObject({
    vaOdUnaided: '6/18',
    vaOsUnaided: '6/6',
    vaOdPinhole: '6/9',
    diabeticSignsSeen: true,
    referralRecommended: true,
  });
  // 13 structures for each eye, every one recorded.
  expect(eyeRecord.json().record.findings).toHaveLength(26);
  expect(eyeRecord.json().record.findings).toContainEqual({
    eye: 'OS',
    structure: 'MACULA',
    result: 'ABNORMAL',
    note: 'Hard exudates',
  });
  expect((await complete('volunteer', clinicId, eye.at.visit.id)).ok()).toBeTruthy();

  // Review: no session completes without counselling.
  const review = await claimNext('volunteer', clinicId, checkInId);
  expect(review.at.station.kind).toBe('REVIEW');
  const tooEarly = await complete('volunteer', clinicId, review.at.visit.id);
  expect(tooEarly.status()).toBe(409);
  expect(tooEarly.json().code).toBe('COUNSELLING_REQUIRED');
  const counselling = await apiRequestAs(
    'volunteer',
    'put',
    `/clinics/${clinicId}/encounters/${encounterId}/counselling`,
    {
      clinicId,
      data: {
        topics: ['BLOOD_PRESSURE', 'GLUCOSE_DIABETES'],
        adviceGiven: 'Reduce salt; recheck BP and fasting glucose.',
        followUpRecommended: true,
        followUpWindow: 'WITHIN_1_MONTH',
        referralRecommended: false,
      },
    },
  );
  expect(counselling.ok(), counselling.text()).toBeTruthy();
  const done = await complete('volunteer', clinicId, review.at.visit.id);
  expect(done.ok(), done.text()).toBeTruthy();
  expect(done.json()).toMatchObject({ sessionCompleted: true, nextVisitId: null });

  // The session is over: the patient is off the line and the encounter waits for a doctor.
  expect(await boardVisit('staff', clinicId, checkInId)).toBeNull();
  const reviewed = await apiRequestAs('doctor', 'get', `/encounters/${encounterId}`, { clinicId });
  expect(reviewed.json().status).toBe('IN_REVIEW');
  const locked = await apiRequestAs(
    'volunteer',
    'put',
    `/clinics/${clinicId}/encounters/${encounterId}/counselling`,
    {
      clinicId,
      data: {
        expectedVersion: 1,
        topics: [],
        adviceGiven: 'changed',
        followUpRecommended: false,
        followUpWindow: 'NOT_ASSESSED',
        referralRecommended: false,
      },
    },
  );
  expect(locked.json().code).toBe('COUNSELLING_LOCKED');

  // The doctor sees the whole session on one screen.
  const doctorContext = await browser.newContext({ storageState: storageStateFor('doctor') });
  const doctorPage = await doctorContext.newPage();
  await doctorPage.goto(`/encounters/${encounterId}`);
  await doctorPage.getByRole('tab', { name: 'Station session' }).click();
  await expect(doctorPage.getByText('Results from today’s stations')).toBeVisible({
    timeout: 20_000,
  });
  await expect(doctorPage.getByText('150/95 mmHg')).toBeVisible();
  await expect(doctorPage.getByText('BP high, recheck at review.')).toBeVisible();
  await expect(doctorPage.getByText('OD 6/9 · OS 6/6')).toBeVisible();
  await expect(
    doctorPage.getByText('1 abnormal finding · diabetic signs · referral recommended'),
  ).toBeVisible();
  await expect(doctorPage.getByText(/recommended follow-up\s+within 1 month/)).toBeVisible();
  await doctorContext.close();
});

test('manager assignment is refused while the station line runs', async ({ page }) => {
  const patient = await createPatient(page);
  const { clinicId } = patient;
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  const res = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/assignments`, {
    clinicId,
    data: {
      patientCheckInId: checkIn.json().id,
      assignedVolunteerId: randomUUID(),
      assignedDoctorId: randomUUID(),
    },
  });
  expect(res.status()).toBe(409);
  expect(res.json().code).toBe('STATION_WORKFLOW_ACTIVE');

  // And the patient who left is taken off the line.
  const left = await apiRequestAs(
    'staff',
    'post',
    `/clinics/${clinicId}/checkins/${checkIn.json().id}/cancel`,
    { clinicId, data: { reason: 'Left before intake' } },
  );
  expect(left.ok(), left.text()).toBeTruthy();
  expect(await boardVisit('staff', clinicId, checkIn.json().id)).toBeNull();
});

test.describe('station flow metrics on the dashboard (#24)', () => {
  test('show wait and service time from real visits, to managers only', async ({ page }) => {
    const patient = await createPatient(page);
    const { clinicId } = patient;
    await ensureShift('staff', clinicId);
    const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
      clinicId,
      data: { patientId: patient.patientId },
    });
    expect(checkIn.ok(), checkIn.text()).toBeTruthy();
    const first = await claimNext('staff', clinicId, checkIn.json().id);
    expect((await complete('staff', clinicId, first.at.visit.id)).ok()).toBeTruthy();

    const metrics = await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/metrics`, {
      clinicId,
    });
    expect(metrics.ok(), metrics.text()).toBeTruthy();
    const body = metrics.json();
    expect(body.live).toBe(true);
    expect(body.checkIns.total).toBeGreaterThanOrEqual(1);
    const intake = body.stations.find((station) => station.kind === 'INTAKE');
    expect(intake.seen).toBeGreaterThanOrEqual(1);
    expect(intake.wait.n).toBeGreaterThanOrEqual(1);
    // Aggregates only: the patient is nowhere in it.
    expect(JSON.stringify(body)).not.toContain(patient.patientId);
    expect(JSON.stringify(body)).not.toContain(checkIn.json().id);

    // A volunteer works the line but does not run it.
    const volunteer = await apiRequestAs(
      'volunteer',
      'get',
      `/clinics/${clinicId}/stations/metrics`,
      {
        clinicId,
      },
    );
    expect(volunteer.status()).toBe(403);

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Station flow' })).toBeVisible({
      timeout: 20_000,
    });
    const table = page.getByTestId('station-flow-table');
    await expect(table.getByRole('rowheader', { name: new RegExp(intake.name) })).toBeVisible();
  });

  for (const theme of ['light', 'dark']) {
    test(`the station flow section is accessible (${theme})`, async ({ page }, testInfo) => {
      await page.addInitScript(
        (value) => window.localStorage.setItem('nkwapa-theme', value),
        theme,
      );
      await page.goto('/dashboard');
      const section = page.locator('section[aria-labelledby="station-flow-heading"]');
      await expect(section.getByRole('heading', { name: 'Station flow' })).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page })
        .include('section[aria-labelledby="station-flow-heading"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
      await section.screenshot({ path: testInfo.outputPath(`station-flow-${theme}.png`) });
    });
  }
});

test.describe('station capacity (#32)', () => {
  test('a manager sets how many a station sees at once, and the board shows places in use', async ({
    page,
  }) => {
    const patient = await createPatient(page);
    const { clinicId } = patient;
    const stations = (
      await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations`, { clinicId })
    ).json().items;
    const intake = stations.find((station) => station.kind === 'INTAKE');

    await page.goto('/stations/setup');
    await expect(page.getByTestId('station-setup-list')).toBeVisible({ timeout: 20_000 });
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    const row = page.getByTestId('station-setup-row').filter({
      has: page.locator(`#station-name-${intake.id}`),
    });
    await row.getByLabel('Sees at once').fill('3');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`${intake.name} saved.`)).toBeVisible();

    const saved = (
      await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations`, { clinicId })
    ).json().items;
    expect(saved.find((station) => station.id === intake.id).capacity).toBe(3);

    // One patient taken at intake: the board counts the place in use against capacity.
    await ensureShift('staff', clinicId);
    const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
      clinicId,
      data: { patientId: patient.patientId },
    });
    const taken = await claimNext('staff', clinicId, checkIn.json().id);
    const board = (
      await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
    ).json();
    const intakeOnBoard = board.stations.find((station) => station.id === intake.id);
    expect(intakeOnBoard.capacity).toBe(3);
    expect(intakeOnBoard.inUse).toBeGreaterThanOrEqual(1);

    const metrics = (
      await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/metrics`, { clinicId })
    ).json();
    expect(metrics.stations.find((station) => station.stationId === intake.id)).toMatchObject({
      capacity: 3,
    });

    // Put it back for the other specs.
    await complete('staff', clinicId, taken.at.visit.id);
    await apiRequestAs('staff', 'patch', `/clinics/${clinicId}/stations/${intake.id}`, {
      clinicId,
      data: { capacity: 1 },
    });
  });

  test('only a manager sets capacity, and only to something real', async ({ page }) => {
    const patient = await createPatient(page);
    const { clinicId } = patient;
    const station = (
      await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations`, { clinicId })
    ).json().items[0];
    const asVolunteer = await apiRequestAs(
      'volunteer',
      'patch',
      `/clinics/${clinicId}/stations/${station.id}`,
      { clinicId, data: { capacity: 4 } },
    );
    expect(asVolunteer.status()).toBe(403);
    const zero = await apiRequestAs(
      'staff',
      'patch',
      `/clinics/${clinicId}/stations/${station.id}`,
      {
        clinicId,
        data: { capacity: 0 },
      },
    );
    expect(zero.status()).toBe(400);
  });
});

test('a manager hands a waiting patient to a volunteer on shift', async ({ page }) => {
  const patient = await createPatient(page);
  const { clinicId } = patient;
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;
  await ensureShift('volunteer', clinicId);
  const volunteer = (await apiRequestAs('volunteer', 'get', '/auth/whoami', { clinicId })).json();
  const waiting = await boardVisit('staff', clinicId, checkInId);

  // The board offers the volunteer, and a volunteer cannot hand patients out.
  const board = (
    await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
  ).json();
  expect(board.onShift.map((member) => member.user.id)).toContain(volunteer.userId);
  const refused = await apiRequestAs(
    'volunteer',
    'post',
    `/clinics/${clinicId}/station-visits/${waiting.visit.id}/assign`,
    { clinicId, data: { assigneeUserId: volunteer.userId } },
  );
  expect(refused.status()).toBe(403);

  const assigned = await apiRequestAs(
    'staff',
    'post',
    `/clinics/${clinicId}/station-visits/${waiting.visit.id}/assign`,
    { clinicId, data: { assigneeUserId: volunteer.userId } },
  );
  expect(assigned.ok(), assigned.text()).toBeTruthy();
  expect(assigned.json()).toMatchObject({
    status: 'IN_PROGRESS',
    claimedBy: { id: volunteer.userId },
    assignedBy: { id: expect.any(String) },
  });

  // The volunteer now holds the patient, exactly as if they had claimed them.
  const held = await boardVisit('volunteer', clinicId, checkInId);
  expect(held.visit.claimedBy.id).toBe(volunteer.userId);
  const again = await apiRequestAs(
    'staff',
    'post',
    `/clinics/${clinicId}/station-visits/${waiting.visit.id}/assign`,
    { clinicId, data: { assigneeUserId: randomUUID() } },
  );
  expect(again.status()).toBe(400);

  await page.goto('/today');
  await expect(
    page.getByText(`Assigned by ${assigned.json().assignedBy.displayName}`),
  ).toBeVisible();

  const left = await apiRequestAs(
    'staff',
    'post',
    `/clinics/${clinicId}/checkins/${checkInId}/cancel`,
    {
      clinicId,
      data: { reason: 'Test finished' },
    },
  );
  expect(left.ok(), left.text()).toBeTruthy();
});

test.describe('the station screens keep separate offline copies (#197)', () => {
  /*
    /today (the station line board) and /stations used to cache different shapes under one key.
    Opening one after the other in the same browser handed /stations the board's bare shape and
    it threw on render. Every role below holds OPS.STATION.READ, so each can open both screens.
  */

  /** The device's ops_cache rows, keyed by `${clinicId}|${kind}`. */
  async function readOpsCacheRows(page) {
    return page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('NkwapaDb');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const all = db.transaction('ops_cache', 'readonly').objectStore('ops_cache').getAll();
            all.onsuccess = () => {
              db.close();
              resolve(Object.fromEntries(all.result.map((row) => [row.key, row])));
            };
            all.onerror = () => reject(all.error);
          };
        }),
    );
  }

  async function putOpsCacheRows(page, rows) {
    await page.evaluate(
      (records) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('NkwapaDb');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('ops_cache', 'readwrite');
            for (const record of records) tx.objectStore('ops_cache').put(record);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
      rows,
    );
  }

  /** A page that records every uncaught error, so a crash fails the test even if it recovers. */
  async function watchedPage(browser, role) {
    const context = await browser.newContext({ storageState: storageStateFor(role) });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    return { context, page, errors };
  }

  async function openBoard(page) {
    const loaded = page.waitForResponse((res) => res.url().includes('/stations/board'));
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Station line' })).toBeVisible({
      timeout: 20_000,
    });
    await loaded;
  }

  async function openStations(page) {
    await page.goto('/stations');
    await expect(page.getByRole('heading', { name: 'Stations' })).toBeVisible({
      timeout: 20_000,
    });
  }

  for (const role of ['staff', 'doctor', 'volunteer']) {
    test(`${role}: the board, then stations, then the board again, in one browser`, async ({
      browser,
    }) => {
      const { context, page, errors } = await watchedPage(browser, role);

      await openBoard(page);
      // Let the board's copy reach the device before the next screen reads the cache.
      await expect
        .poll(async () => Object.keys(await readOpsCacheRows(page)).join(','))
        .toContain('|station-board');
      await openStations(page);
      await expect(page.getByText('This page ran into a problem')).toHaveCount(0);
      await openBoard(page);
      await expect(page.getByText('This page ran into a problem')).toHaveCount(0);

      // One row per screen, each its own shape.
      await expect
        .poll(async () => Object.keys(await readOpsCacheRows(page)).join(','))
        .toContain('|station-workspace');
      const rows = Object.values(await readOpsCacheRows(page));
      const board = rows.find((row) => row.kind === 'station-board');
      const workspace = rows.find((row) => row.kind === 'station-workspace');
      expect(typeof board.data.timezone).toBe('string');
      expect(typeof workspace.data.board.timezone).toBe('string');
      expect(Array.isArray(workspace.data.shifts.items)).toBe(true);

      expect(errors).toEqual([]);
      await context.close();
    });
  }

  test('a device already holding wrong-shaped copies recovers on its first visit', async ({
    browser,
  }) => {
    const { context, page, errors } = await watchedPage(browser, 'staff');
    await openBoard(page);
    await expect
      .poll(async () => Object.keys(await readOpsCacheRows(page)).join(','))
      .toContain('|station-board');
    const good = Object.values(await readOpsCacheRows(page)).find(
      (row) => row.kind === 'station-board',
    );
    const clinicId = good.clinicId;

    // Each screen's row holds the other screen's shape, as a device in the field might.
    await putOpsCacheRows(page, [
      { ...good, key: `${clinicId}|station-workspace`, kind: 'station-workspace' },
      {
        ...good,
        data: { board: good.data, shifts: { date: good.date, timezone: 'x', items: [] } },
      },
    ]);

    // Hold the live board back, so each screen can only draw what the device saved.
    await context.route('**/stations/board*', (route) => route.abort());
    await page.goto('/stations');
    await expect(page.getByText('This page ran into a problem')).toHaveCount(0);
    await expect
      .poll(async () => Boolean((await readOpsCacheRows(page))[`${clinicId}|station-workspace`]))
      .toBe(false);
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Station line' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('This page ran into a problem')).toHaveCount(0);
    await expect
      .poll(async () => Boolean((await readOpsCacheRows(page))[`${clinicId}|station-board`]))
      .toBe(false);

    // Back online, both screens load and save their own shapes again.
    await context.unroute('**/stations/board*');
    await openStations(page);
    await openBoard(page);
    await expect
      .poll(async () => {
        const rows = await readOpsCacheRows(page);
        return [`${clinicId}|station-board`, `${clinicId}|station-workspace`].every(
          (key) => rows[key],
        );
      })
      .toBe(true);

    expect(errors).toEqual([]);
    await context.close();
  });
});
