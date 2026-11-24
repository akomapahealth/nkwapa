const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');
const { answer, question } = require('../playwright/interview');
const { keyboardDialog } = require('../playwright/clinical-keyboard.cjs');
const { readLocalTable } = require('../playwright/local-db');
const { fillNationalId } = require('../playwright/register-patient');
const { readOutboxRows } = require('../playwright/outbox');

const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').origin;

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
  await fillNationalId(page, `E2E-STN-${suffix}`);
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
  await volunteerPage.getByRole('button', { name: /^(Choose station|Station )/ }).click();
  const bpButton = volunteerPage
    .getByRole('dialog', { name: 'Choose your station' })
    .getByRole('button', { name: /^Blood pressure/ });
  // Selecting the current station clears it; close the sheet instead when already there.
  if ((await bpButton.getAttribute('aria-pressed')) !== 'true') await bpButton.click();
  else await volunteerPage.keyboard.press('Escape');
  // The next patient is the ticket (article); everyone after is a queue row (li).
  const row = volunteerPage.locator('article, li', { hasText: patient.name }).filter({
    has: volunteerPage.getByRole('button', { name: 'Take patient' }),
  });
  // Scope to this run's patient; prior interrupted runs may leave the same handoff note.
  await expect(row.last().getByText('Reports headaches this week.')).toBeVisible({
    timeout: 20_000,
  });
  await row.last().getByRole('button', { name: 'Take patient' }).click();
  await volunteerPage.waitForURL(/\/stations\/visits\//, { timeout: 20_000 });
  await volunteerPage.getByLabel('Systolic BP (mmHg)').fill('150');
  await volunteerPage.getByLabel('Diastolic BP (mmHg)').fill('95');
  await volunteerPage.getByLabel('Measurement site').click();
  await volunteerPage.getByRole('option', { name: /left arm/i }).click();
  // The station shows only its own groups.
  await expect(volunteerPage.getByLabel('Weight (kg)')).toHaveCount(0);
  // Handing on before saving used to drop the typed reading; now it asks first.
  await volunteerPage.getByRole('button', { name: /^Send to Glucose/ }).click();
  const unsaved = volunteerPage.getByRole('alertdialog').or(volunteerPage.getByRole('dialog'));
  await expect(unsaved.getByText('Blood pressure is not saved')).toBeVisible();
  await unsaved.getByRole('button', { name: 'Go back and save' }).click();
  await expect(volunteerPage).toHaveURL(/\/stations\/visits\//);
  await volunteerPage.getByRole('button', { name: 'Save measurements' }).click();
  await expect(volunteerPage.getByText('Measurements saved and synced.')).toBeVisible({
    timeout: 20_000,
  });
  await volunteerPage.getByLabel('Note for the next station').fill('BP high, recheck at review.');
  await volunteerPage.getByRole('button', { name: /^Send to Glucose/ }).click();
  // Back at the queue, told where the patient went (screening-day feedback, 2026-11-21).
  await volunteerPage.waitForURL(/\/stations(\?|$)/, { timeout: 20_000 });
  await expect(volunteerPage.getByText(/Patient No\. \d+ handed on to Glucose/)).toBeVisible();
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
  // R8.4: the review volunteer's real note must reach a different doctor's cosign.
  const notePath = `/clinics/${clinicId}/encounters/${encounterId}/clinical-note`;
  const reviewContext = await browser.newContext({ storageState: storageStateFor('volunteer') });
  const reviewPage = await reviewContext.newPage();
  await reviewPage.goto(`/stations/visits/${review.at.visit.id}`);
  await reviewPage.getByRole('button', { name: 'Start HAP note', exact: true }).click();
  await reviewPage.getByLabel(/^History$/i).fill('Synthetic station history.');
  await reviewPage
    .getByLabel(/^Assessment$/i)
    .fill('Elevated blood pressure and glucose require follow-up.');
  await reviewPage.getByLabel(/^Plan$/i).fill('Review with the supervising clinician.');
  await reviewPage.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(reviewPage.getByText('Draft saved.', { exact: true })).toBeVisible();
  await keyboardDialog(
    reviewPage,
    reviewPage.getByRole('button', { name: 'Submit for cosign', exact: true }),
    'Submit this HAP note?',
    'Continue',
  );
  await expect(reviewPage.getByText('Pending cosign', { exact: true })).toBeVisible();
  const submitted = await apiRequestAs('volunteer', 'get', notePath, { clinicId });
  expect(submitted.json().status).toBe('PENDING_COSIGN');
  expect(submitted.json().assignedDoctor).toBeNull();
  await reviewContext.close();
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
  await doctorPage.getByRole('tab', { name: 'Clinical note', exact: true }).click();
  await keyboardDialog(
    doctorPage,
    doctorPage.getByRole('button', { name: 'Cosign note', exact: true }),
    'Cosign this HAP note?',
    'Cosign note',
  );
  await expect(doctorPage.getByRole('term').filter({ hasText: /^Cosigned$/ })).toBeVisible();
  const signed = await apiRequestAs('doctor', 'get', notePath, { clinicId });
  expect(signed.json().status).toBe('COSIGNED');

  await doctorPage.getByRole('tab', { name: 'Hypertension', exact: true }).click();
  await answer(doctorPage, 'Hypertension status', 'Newly elevated BP');
  await doctorPage.getByRole('button', { name: 'Save assessment', exact: true }).click();
  await expect(doctorPage.getByText(/saved and synced/i)).toBeVisible();
  await doctorPage.getByLabel('BP goal systolic (mmHg)').fill('130');
  await doctorPage.getByLabel('BP goal diastolic (mmHg)').fill('80');
  await answer(doctorPage, 'Follow-up', 'Within 1 month');
  await answer(doctorPage, 'Follow-up owner', 'Akomapa team');
  await doctorPage.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(doctorPage.getByText('Plan saved.', { exact: true })).toBeVisible();
  await doctorPage.getByRole('tab', { name: 'Diabetes', exact: true }).click();
  await doctorPage.getByRole('button', { name: 'Save screening', exact: true }).click();
  await expect(doctorPage.getByText(/saved and synced/i)).toBeVisible();
  await doctorPage.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await keyboardDialog(
    doctorPage,
    doctorPage.getByRole('button', { name: 'Finalize', exact: true }),
    'Finalize this visit?',
    'Finalize visit',
  );
  await expect(doctorPage.getByRole('button', { name: 'Save screening', exact: true })).toHaveCount(
    0,
  );
  const finalized = await apiRequestAs('doctor', 'get', `/encounters/${encounterId}`, { clinicId });
  expect(finalized.json().status).toBe('FINALIZED');
  expect(finalized.json().vitals.systolicBp).toBe(150);
  expect(finalized.json().hypertensionAssessment.hypertensionStatus).toBe('NEWLY_ELEVATED_BP');
  expect(finalized.json().diabetesScreening).toBeTruthy();
  expect(finalized.json().carePlan.followUpDate).toBeTruthy();
  await doctorContext.close();
});

/*
  The intake volunteer chooses which interviews to run, and an interview that already holds
  answers opens by itself on the next visit to the station, so nothing recorded is hidden.
*/
test('intake runs the interviews the volunteer chooses, and reopens a saved one', async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_FEATURE_GUIDED_CHRONIC_TABS_ENABLED !== 'true',
    'The interviews run only with the guided chronic tabs flag on.',
  );
  test.setTimeout(150_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const intake = await boardVisit('staff', clinicId, checkIn.json().id);
  const claim = await apiRequestAs(
    'staff',
    'post',
    `/clinics/${clinicId}/station-visits/${intake.visit.id}/claim`,
    { clinicId },
  );
  expect(claim.ok(), claim.text()).toBeTruthy();

  await page.goto(`/stations/visits/${intake.visit.id}`);
  const choices = page.getByRole('group', { name: 'Interviews to run' });
  const hypertension = choices.getByRole('button', { name: 'Hypertension interview' });
  const diabetes = choices.getByRole('button', { name: 'Diabetes interview' });
  await expect(hypertension).toHaveAttribute('aria-pressed', 'false', { timeout: 20_000 });
  await expect(diabetes).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('navigation', { name: 'Hypertension interview' })).toHaveCount(0);

  await hypertension.click();
  await answer(page, 'Hypertension status', 'Known hypertension');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText(/saved (and synced|on this device)/i)).toBeVisible();

  // Back at the station later: the saved interview is open, the untouched one is not.
  await page.reload();
  await expect(hypertension).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  await expect(diabetes).toHaveAttribute('aria-pressed', 'false');
  await expect(
    question(page, 'Hypertension status').getByRole('radio', {
      name: 'Known hypertension',
      exact: true,
    }),
  ).toBeChecked();
});

/*
  #427: a glucose reading that reaches the server after the review visit opened (entered late
  from paper, or held in a device outbox) shows up without reopening the page, and says so.
*/
test('the review summary picks up a reading saved after it opened (#427)', async ({ page }) => {
  test.setTimeout(150_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;

  // Every stop before review is handed on with nothing recorded.
  let next = await claimNext('staff', clinicId, checkInId);
  const encounterId = next.claimed.encounterId;
  while (next.at.station.kind !== 'REVIEW') {
    const done = await complete('staff', clinicId, next.at.visit.id);
    expect(done.ok(), done.text()).toBeTruthy();
    next = await claimNext('staff', clinicId, checkInId);
  }

  await page.goto(`/stations/visits/${next.at.visit.id}`);
  const glucoseCell = page.locator('dl > div').filter({ hasText: 'Blood glucose' });
  await expect(glucoseCell.getByText('Not recorded')).toBeVisible({ timeout: 20_000 });
  // Typing in counselling must survive the refresh.
  await page.getByLabel('Advice given').fill('Recheck fasting glucose.');

  const reading = await apiRequestAs(
    'staff',
    'put',
    `/clinics/${clinicId}/encounters/${encounterId}/diabetes-screening/glucose`,
    {
      clinicId,
      data: { glucoseMgDl: 210, glucoseType: 'RANDOM', collectedAt: new Date().toISOString() },
    },
  );
  expect(reading.ok(), reading.text()).toBeTruthy();

  // One poll is six seconds; allow two.
  await expect(glucoseCell.getByText(/^Added at /)).toBeVisible({ timeout: 15_000 });
  await expect(glucoseCell.getByText('Not recorded')).toHaveCount(0);
  await expect(page.getByLabel('Advice given')).toHaveValue('Recheck fasting glucose.');
});

test('handing on a station with nothing recorded asks first, and Skip keeps a reason (#424)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;

  let next = await claimNext('staff', clinicId, checkInId);
  while (next.at.station.kind !== 'GLUCOSE') {
    const done = await complete('staff', clinicId, next.at.visit.id);
    expect(done.ok(), done.text()).toBeTruthy();
    next = await claimNext('staff', clinicId, checkInId);
  }

  await page.goto(`/stations/visits/${next.at.visit.id}`);
  const send = page.getByRole('button', { name: /^Send to / });
  await send.click({ timeout: 20_000 });
  const ask = page.getByRole('group', { name: /^Nothing was recorded at .+\. Hand on anyway\?$/ });
  await expect(ask).toBeVisible();
  const skip = ask.getByRole('button', { name: 'Skip this station' });
  await expect(skip).toBeDisabled();
  // Go back stays on the visit, at the station's own form.
  await ask.getByRole('button', { name: 'Go back' }).click();
  await expect(ask).toHaveCount(0);
  await expect(page).toHaveURL(/\/stations\/visits\//);

  await page.getByLabel('Note for the next station').fill('No strips left.');
  await send.click();
  await ask.getByLabel('Why was nothing recorded?').fill('Out of glucose strips');
  await skip.click();
  await page.waitForURL(/\/stations(\?|$)/, { timeout: 20_000 });

  const timeline = await apiRequestAs(
    'staff',
    'get',
    `/clinics/${clinicId}/checkins/${checkInId}/station-visits`,
    { clinicId },
  );
  const glucose = timeline.json().items.find((stop) => stop.station.kind === 'GLUCOSE');
  expect(glucose).toMatchObject({ status: 'SKIPPED', endReason: 'Out of glucose strips' });
  // The next station still reads the note, from a stop marked skipped.
  const after = await boardVisit('staff', clinicId, checkInId);
  expect(after.visit.previous).toMatchObject({
    status: 'SKIPPED',
    handoffNote: 'No strips left.',
  });
});

test('a refer-today reading travels with the patient to review (#415)', async ({ page }) => {
  test.setTimeout(180_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;

  let next = await claimNext('staff', clinicId, checkInId);
  const encounterId = next.claimed.encounterId;
  while (next.at.station.kind !== 'BLOOD_PRESSURE') {
    expect((await complete('staff', clinicId, next.at.visit.id)).ok()).toBeTruthy();
    next = await claimNext('staff', clinicId, checkInId);
  }

  // A crisis reading at Blood pressure suggests its own hand-off note.
  await page.goto(`/stations/visits/${next.at.visit.id}`);
  await page.getByLabel('Systolic BP (mmHg)').fill('184');
  await page.getByLabel('Diastolic BP (mmHg)').fill('112');
  await page.getByLabel('Measurement site').click();
  await page.getByRole('option', { name: /left arm/i }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save measurements' }).click();
  // The station's own crisis alert stays as it was; the flag is in addition to it.
  await page.getByRole('button', { name: "I've told a clinician" }).click({ timeout: 20_000 });
  await expect(page.getByText('Measurements saved and synced.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Note for the next station')).toHaveValue('BP 184/112, refer today');
  await page.getByRole('button', { name: /^Send to / }).click();
  await page.waitForURL(/\/stations(\?|$)/, { timeout: 20_000 });

  // The next station sees the flag and the reading, with no note needed.
  next = await claimNext('staff', clinicId, checkInId);
  expect(next.at.visit.lineFlags).toEqual([
    expect.objectContaining({ kind: 'REFER_TODAY', source: 'BP', systolic: 184, diastolic: 112 }),
  ]);
  await page.goto(`/stations/visits/${next.at.visit.id}`);
  await expect(page.getByTestId('line-flag-chip').first()).toHaveText('Refer today', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('line-flags-notice')).toContainText(
    /BP 184\/112 at Blood pressure, /,
  );

  while (next.at.station.kind !== 'REVIEW') {
    expect((await complete('staff', clinicId, next.at.visit.id)).ok()).toBeTruthy();
    next = await claimNext('staff', clinicId, checkInId);
  }
  const counselling = await apiRequestAs(
    'staff',
    'put',
    `/clinics/${clinicId}/encounters/${encounterId}/counselling`,
    {
      clinicId,
      data: {
        topics: ['BLOOD_PRESSURE'],
        adviceGiven: 'Recheck BP today.',
        followUpRecommended: true,
        followUpWindow: 'WITHIN_1_MONTH',
        referralRecommended: false,
      },
    },
  );
  expect(counselling.ok(), counselling.text()).toBeTruthy();

  // Review lists the flag; completing without a referral asks, and Go back stays.
  await page.goto(`/stations/visits/${next.at.visit.id}`);
  await expect(page.getByTestId('line-flags-notice')).toContainText(
    'Red flags raised along the line',
    {
      timeout: 20_000,
    },
  );
  await page.getByRole('button', { name: 'Complete session' }).click();
  const ask = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expect(
    ask.getByText('No referral recorded for a refer-today reading. Complete anyway?'),
  ).toBeVisible();
  await ask.getByRole('button', { name: 'Go back and record it' }).click();
  await expect(page).toHaveURL(/\/stations\/visits\//);
  await page.getByRole('button', { name: 'Complete session' }).click();
  await ask.getByRole('button', { name: 'Complete anyway' }).click();
  await page.waitForURL(/\/stations(\?|$)/, { timeout: 20_000 });
  expect(await boardVisit('staff', clinicId, checkInId)).toBeNull();
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

/*
  #426: on a phone with a flaky signal the eye history kept resetting. Going offline disabled the
  form (focus lost) and coming back reloaded it over the typing.
*/
test('eye history keeps its typing through a connection flicker on a phone (#426)', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  let next = await claimNext('staff', clinicId, checkIn.json().id);
  while (next.at.station.kind !== 'EYE') {
    expect((await complete('staff', clinicId, next.at.visit.id)).ok()).toBeTruthy();
    next = await claimNext('staff', clinicId, checkIn.json().id);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/stations/visits/${next.at.visit.id}`);
  await page.getByLabel('The patient has an eye complaint').click();
  const history = page.getByLabel('Brief eye history');
  await history.fill('Blurred since June');

  // The caret goes to the start, then the connection drops and returns: it must stay put.
  await history.evaluate((field) => {
    field.focus();
    field.setSelectionRange(0, 0);
  });
  await context.setOffline(true);
  // Since #423 Save keeps working offline, on the device.
  await expect(
    page.getByText(/Offline\. Saving keeps the examination on this device/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save eye examination' })).toBeEnabled();
  await expect(history).toBeEnabled();
  await expect(history).toBeFocused();
  await history.pressSequentially('Right eye. ');
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Save eye examination' })).toBeEnabled();
  await history.pressSequentially('Itchy. ');
  await expect(history).toHaveValue('Right eye. Itchy. Blurred since June');

  await page.getByRole('button', { name: 'Save eye examination' }).click();
  await expect(page.getByText('Eye examination saved.')).toBeVisible({ timeout: 20_000 });
  await expect(history).toHaveValue('Right eye. Itchy. Blurred since June');
});

/*
  #423: the signal drops mid-patient. The visit this device holds reopens from its copy, the
  reading saves on the device, and the hand-off queues behind it. Once the server is back the
  patient reaches the next station with the reading. The phone still says it is online, as on
  screening day: only the API is unreachable.
*/
test('a hand-off made without a connection reaches the next station with the reading (#423)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;
  let next = await claimNext('staff', clinicId, checkInId);
  while (next.at.station.kind !== 'BLOOD_PRESSURE') {
    expect((await complete('staff', clinicId, next.at.visit.id)).ok()).toBeTruthy();
    next = await claimNext('staff', clinicId, checkInId);
  }
  const visitId = next.at.visit.id;
  // From the station line, as a volunteer comes: the device keeps a copy of both.
  await page.goto('/stations');
  await expect(page.getByRole('heading', { name: 'With you now' })).toBeVisible({
    timeout: 20_000,
  });
  await page.goto(`/stations/visits/${visitId}`);
  await expect(page.getByLabel('Systolic BP (mmHg)')).toBeVisible({ timeout: 20_000 });

  // The visit itself cannot be fetched: it opens from this device's copy.
  const visitRoute = `${API_ORIGIN}/clinics/${clinicId}/station-visits/${visitId}`;
  await page.route(visitRoute, (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByText(/this visit opened from this device/)).toBeVisible({
    timeout: 20_000,
  });
  await page.unroute(visitRoute);

  // Now nothing reaches the API.
  const unreachable = (route) => route.abort('internetdisconnected');
  await page.route(`${API_ORIGIN}/**`, unreachable);
  await page.getByLabel('Systolic BP (mmHg)').fill('150');
  await page.getByLabel('Diastolic BP (mmHg)').fill('95');
  await page.getByLabel('Measurement site').click();
  await page.getByRole('option', { name: /left arm/i }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save measurements' }).click();
  await expect(page.getByText('Measurements saved on this device and pending sync.')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel('Note for the next station').fill('Taken offline (#423).');
  await page.getByRole('button', { name: /^Send to / }).click();
  await page.waitForURL(/\/stations\?.*queued=1/, { timeout: 30_000 });
  await expect(page.getByText(/It is sent when the connection returns/)).toBeVisible();

  // The board loads again but nothing has synced: the patient shows as handed on, not held.
  await page.unroute(`${API_ORIGIN}/**`, unreachable);
  await page.route(`${API_ORIGIN}/sync/**`, unreachable);
  await page.reload();
  await expect(page.getByTestId('handed-on-offline').first()).toBeVisible({ timeout: 20_000 });

  // The reading is queued ahead of the hand-off, so the server applies it first.
  const queued = (await readOutboxRows(page, clinicId)).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const handOff = queued.findIndex(
    (row) => row.entityType === 'station_visit_complete' && row.entityId === visitId,
  );
  const reading = queued.findIndex((row) => /vitals/.test(row.entityType));
  expect(handOff).toBeGreaterThan(-1);
  expect(reading).toBeGreaterThan(-1);
  expect(reading).toBeLessThan(handOff);

  // Back online: the patient is waiting at the next station, with the reading and the note.
  await page.unroute(`${API_ORIGIN}/sync/**`, unreachable);
  await page.reload();
  await expect
    .poll(async () => (await boardVisit('staff', clinicId, checkInId))?.visit.status, {
      timeout: 60_000,
    })
    .toBe('QUEUED');
  const at = await boardVisit('staff', clinicId, checkInId);
  expect(at.station.kind).not.toBe('BLOOD_PRESSURE');
  expect(at.visit.previous?.handoffNote).toBe('Taken offline (#423).');
  const encounter = await apiRequestAs('staff', 'get', `/encounters/${at.visit.encounterId}`, {
    clinicId,
  });
  expect(encounter.json().vitals).toMatchObject({ systolicBp: 150, diastolicBp: 95 });
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

    // #269: one lane per open station, each saying in words who is waiting and for how long.
    const lanes = page.getByTestId('station-lane');
    await expect(lanes).toHaveCount(body.stations.filter((station) => station.active).length);
    await expect(lanes.filter({ hasText: intake.name })).toContainText(
      /No one waiting|\d+ waiting, longest/,
    );
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
  await expect(page.getByRole('heading', { name: 'Station line' })).toBeVisible({
    timeout: 20_000,
  });
  // A busy station folds patients past the first eight; this one queued last.
  await expect(page.getByTestId('patient-wait-track').first()).toBeVisible({ timeout: 20_000 });
  // Each click renames its button "Show fewer", so take the first remaining one each time.
  const more = page.getByRole('button', { name: /^Show \d+ more$/ });
  while ((await more.count()) > 0) await more.first().click();
  // The bar opens the patient's menu, which says who handed them over.
  // The day number leads the bar's name (#413).
  await page
    .getByRole('button', { name: new RegExp(`^No\\. \\d+, ${patient.name}, With staff`) })
    .click();
  await expect(
    page.getByRole('menu').getByText(`Assigned by ${assigned.json().assignedBy.displayName}`),
  ).toBeVisible();
  await page.keyboard.press('Escape');

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

test("a volunteer screening on someone else's account is named on each stop (#227)", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  await ensureShift('volunteer', clinicId);
  // An interrupted prior run may have left this test account screening under a volunteer's
  // name. Establish the precondition this scenario asserts, through the same normal API as
  // its cleanup below; historical completed stops are untouched.
  const volunteerId = (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json().userId;
  const startingBoard = (
    await apiRequestAs('volunteer', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
  ).json();
  const startingShift = startingBoard.onShift.find((member) => member.user.id === volunteerId);
  expect(startingShift).toBeTruthy();
  const startingScreener = await apiRequestAs(
    'volunteer',
    'patch',
    `/clinics/${clinicId}/shifts/${startingShift.shiftId}/screener`,
    { clinicId, data: { isAccountHolder: true } },
  );
  expect(startingScreener.ok(), startingScreener.text()).toBeTruthy();

  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const checkInId = checkIn.json().id;
  const intake = await claimNext('staff', clinicId, checkInId);
  expect((await complete('staff', clinicId, intake.at.visit.id)).ok()).toBeTruthy();

  const volunteerContext = await browser.newContext({
    storageState: storageStateFor('volunteer'),
  });
  const volunteerPage = await volunteerContext.newPage();
  try {
    // On the account, but someone without one is doing the screening.
    await volunteerPage.goto('/stations');
    await expect(volunteerPage.getByRole('heading', { name: 'Stations' })).toBeVisible({
      timeout: 20_000,
    });
    await volunteerPage.getByRole('button', { name: /^(Choose station|Station )/ }).click();
    const bpButton = volunteerPage
      .getByRole('dialog', { name: 'Choose your station' })
      .getByRole('button', { name: /^Blood pressure/ });
    // Selecting the current station clears it; close the sheet instead when already there.
    if ((await bpButton.getAttribute('aria-pressed')) !== 'true') await bpButton.click();
    else await volunteerPage.keyboard.press('Escape');
    const holder = volunteerPage.getByRole('checkbox', { name: "I'm the one screening" });
    await expect(holder).toBeChecked({ timeout: 20_000 });
    await holder.click();
    await volunteerPage.getByRole('button', { name: 'Save name' }).click();
    await expect(volunteerPage.getByText('Enter the name of the person screening.')).toBeVisible();
    await volunteerPage.getByLabel('Name of the person screening').fill('Ama Mensah');
    await volunteerPage.getByRole('button', { name: 'Save name' }).click();
    await expect(volunteerPage.getByText('Now recording as Ama Mensah.')).toBeVisible({
      timeout: 20_000,
    });

    // The next patient is the ticket (article); everyone after is a queue row (li).

    const row = volunteerPage.locator('article, li', { hasText: patient.name }).filter({
      has: volunteerPage.getByRole('button', { name: 'Take patient' }),
    });
    await row.last().getByRole('button', { name: 'Take patient' }).click();
    await volunteerPage.waitForURL(/\/stations\/visits\//, { timeout: 20_000 });
    await expect(volunteerPage.getByText(/Recording as Ama Mensah on .+'s account/)).toBeVisible({
      timeout: 20_000,
    });
    await volunteerPage.getByLabel('Systolic BP (mmHg)').fill('128');
    await volunteerPage.getByLabel('Diastolic BP (mmHg)').fill('82');
    await volunteerPage.getByLabel('Measurement site').click();
    await volunteerPage.getByRole('option', { name: /left arm/i }).click();
    await volunteerPage.getByRole('button', { name: 'Save measurements' }).click();
    await expect(volunteerPage.getByText('Measurements saved and synced.')).toBeVisible({
      timeout: 20_000,
    });
    await volunteerPage.getByRole('button', { name: /^Send to Glucose/ }).click();
    await volunteerPage.waitForURL(/\/stations(\?|$)/, { timeout: 20_000 });
  } finally {
    await volunteerContext.close();
  }

  // The stop names both: the account stays the one that completed it.
  const timeline = await apiRequestAs(
    'staff',
    'get',
    `/clinics/${clinicId}/checkins/${checkInId}/station-visits`,
    { clinicId },
  );
  const bp = timeline.json().items.find((stop) => stop.station.kind === 'BLOOD_PRESSURE');
  expect(bp).toMatchObject({ status: 'COMPLETED', performedByName: 'Ama Mensah' });
  const account = bp.completedBy.displayName;

  // The manager's board names who is screening on the account.
  await page.goto('/today');
  await expect(page.getByText(`${account} (Ama Mensah screening)`).first()).toBeVisible({
    timeout: 20_000,
  });

  // A manager corrects the stop from the next station's visit, with a reason, picking the person
  // from the clinic's volunteer directory (#226).
  const kwame = `Kwame Asante ${Date.now()}`;
  const contact = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/volunteers`, {
    clinicId,
    data: { displayName: kwame, email: `kwame.${Date.now()}@nkwapa.local` },
  });
  expect(contact.ok(), contact.text()).toBeTruthy();
  const glucose = timeline.json().items.find((stop) => stop.station.kind === 'GLUCOSE');
  await page.goto(`/stations/visits/${glucose.id}`);
  const bpStop = page.getByRole('listitem').filter({ hasText: 'Blood pressure ·' });
  await bpStop.getByRole('button', { name: 'Correct who did this' }).click();
  await bpStop.getByLabel('Who actually did it').fill(kwame);
  await bpStop.getByRole('button', { name: kwame, exact: true }).click();
  await expect(bpStop.getByRole('button', { name: kwame, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await bpStop.getByRole('button', { name: 'Save correction' }).click();
  await expect(bpStop.getByText('Say why this is being corrected.')).toBeVisible();
  await bpStop.getByLabel('Reason for the correction').fill('Ama handed over before this patient');
  await bpStop.getByRole('button', { name: 'Save correction' }).click();
  await expect(bpStop.getByText(`${kwame} · signed in as ${account}`)).toBeVisible({
    timeout: 20_000,
  });

  // Back to the account holder, so later specs start from the default.
  const board = (
    await apiRequestAs('volunteer', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
  ).json();
  const mine = board.onShift.find((member) => member.user.id === bp.completedBy.id);
  const reset = await apiRequestAs(
    'volunteer',
    'patch',
    `/clinics/${clinicId}/shifts/${mine.shiftId}/screener`,
    { clinicId, data: { isAccountHolder: true } },
  );
  expect(reset.ok(), reset.text()).toBeTruthy();
  const left = await apiRequestAs(
    'staff',
    'post',
    `/clinics/${clinicId}/checkins/${checkInId}/cancel`,
    { clinicId, data: { reason: 'Test finished' } },
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
    const rows = await readLocalTable(page, 'ops_cache');
    return Object.fromEntries(rows.map((row) => [row.key, row]));
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
      // Heading visibility precedes the board + shifts fetch. Leaving now correctly aborts
      // that read; first wait for the saved copy whose later survival this test asserts.
      await expect
        .poll(async () => Object.keys(await readOpsCacheRows(page)).join(','))
        .toContain('|station-workspace');
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
    await expect
      .poll(async () => Boolean((await readOpsCacheRows(page))[`${clinicId}|station-workspace`]))
      .toBe(true);
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

test('closing a station clears it from the volunteer working there, who is told why (#228)', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const clinicId = (await apiRequestAs('staff', 'get', '/auth/whoami')).json().activeClinicId;
  const name = `Closing ${randomUUID().slice(0, 8)}`;
  const created = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/stations`, {
    clinicId,
    data: { kind: 'CUSTOM', name },
  });
  expect(created.ok(), created.text()).toBeTruthy();
  const stationId = created.json().id;
  const close = () =>
    apiRequestAs('staff', 'patch', `/clinics/${clinicId}/stations/${stationId}`, {
      clinicId,
      data: { active: false },
    });

  const context = await browser.newContext({ storageState: storageStateFor('volunteer') });
  try {
    await ensureShift('volunteer', clinicId);
    const page = await context.newPage();
    await page.goto('/stations');
    await page.getByRole('button', { name: /^(Choose station|Station )/ }).click();
    const choice = page
      .getByRole('dialog', { name: 'Choose your station' })
      .getByRole('button', { name: new RegExp(`^${name}`) });
    await choice.click();
    await expect(page.getByRole('button', { name: `Station ${name}` })).toBeVisible({
      timeout: 20_000,
    });

    const closed = await close();
    expect(closed.ok(), closed.text()).toBeTruthy();

    // The page polls the line every 12 s; the closure reaches it on the next poll.
    await expect(page.getByText(`${name} was closed. Choose another station.`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Choose where you are working today.')).toBeVisible();
    await expect(choice).toHaveCount(0);
    const board = (
      await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
    ).json();
    expect(board.onShift.some((member) => member.stationId === stationId)).toBe(false);
  } finally {
    // Never leave an open station behind for the full-route test.
    await close();
    await context.close();
  }
});

test('each check-in gets the next day number, called out instead of the name (#413)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const first = await createPatient(page);
  const second = await createPatient(page);
  const { clinicId } = first;
  const checkIn = (patientId, id = randomUUID()) =>
    apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
      clinicId,
      data: { id, patientId },
    });

  // Two devices at the same moment: the numbers still differ, one after the other.
  const ids = [randomUUID(), randomUUID()];
  const [a, b] = await Promise.all([
    checkIn(first.patientId, ids[0]),
    checkIn(second.patientId, ids[1]),
  ]);
  expect(a.ok(), a.text()).toBeTruthy();
  expect(b.ok(), b.text()).toBeTruthy();
  const numbers = [a.json().dayNumber, b.json().dayNumber];
  for (const n of numbers) expect(Number.isInteger(n) && n > 0).toBe(true);
  expect(Math.abs(numbers[0] - numbers[1])).toBe(1);

  // A replay of the same check-in keeps its number rather than taking a new one.
  const replay = await checkIn(first.patientId, ids[0]);
  expect(replay.ok(), replay.text()).toBeTruthy();
  expect(replay.json().dayNumber).toBe(numbers[0]);

  // The station visit carries it, and the visit header shows it large.
  const at = await boardVisit('staff', clinicId, ids[1]);
  expect(at.visit.dayNumber).toBe(numbers[1]);
  await page.goto(`/stations/visits/${at.visit.id}`);
  await expect(page.getByRole('heading', { level: 1, name: second.name })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(`No. ${numbers[1]}`, { exact: true })).toBeVisible();

  // Register and start: the new patient's number is the first thing to write down.
  await ensureShift('staff', clinicId);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Line');
  await page.getByLabel('Last name', { exact: true }).fill(`Numbered-${suffix}`);
  await fillNationalId(page, `E2E-NUM-${suffix}`);
  await page.getByRole('button', { name: 'Register and start' }).click();
  // Staff is at no station, so the patient is checked in and waits at the first one.
  await page.waitForURL(/\/stations\?registered=1&no=\d+$/, { timeout: 20_000 });
  await expect(page.getByText(/^Patient number \d+\. Write it on their card\.$/)).toBeVisible();
});

test('a returning patient: check in and start, already on the line, and where they are (#414)', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const away = await createPatient(page);
  const returning = await createPatient(page);
  const { clinicId } = away;
  const board = (
    await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
  ).json();
  const first = board.stations
    .filter((station) => station.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];

  // Staff is at no station: Check in and start checks the patient in and says where they wait.
  await page.goto('/patients');
  const search = page.getByLabel('Name, patient code, phone or ID last 4');
  await search.fill(away.name);
  const row = page.getByRole('row', { name: new RegExp(away.name) });
  await row.getByRole('button', { name: 'Check in and start' }).click();
  await expect(
    page.getByText(
      new RegExp(`is checked in\\. Waiting at ${first.name}\\. .* is No\\. \\d+ today`),
    ),
  ).toBeVisible({ timeout: 20_000 });
  // Straight on to the next patient.
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();

  // Already on the line: the row says where, in place of a second check-in.
  await search.fill(away.name);
  await expect(row.getByText(new RegExp(`^No\\. \\d+ · At ${first.name}$`))).toBeVisible({
    timeout: 20_000,
  });
  await expect(row.getByRole('button', { name: /^Check in/ })).toHaveCount(0);

  // A second check-in from elsewhere is refused with where they are.
  const again = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: away.patientId },
  });
  expect(again.status()).toBe(409);
  expect(again.json().message).toMatch(
    new RegExp(`^Already on the line: No\\. \\d+, waiting at ${first.name} since `),
  );

  // A volunteer at the first station takes a returning patient straight to their visit.
  await ensureShift('volunteer', clinicId);
  const volunteerId = (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json().userId;
  const shift = (
    await apiRequestAs('volunteer', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
  )
    .json()
    .onShift.find((member) => member.user.id === volunteerId);
  const place = (stationId) =>
    apiRequestAs('volunteer', 'patch', `/clinics/${clinicId}/shifts/${shift.shiftId}/station`, {
      clinicId,
      data: { stationId },
    });
  const previous = shift.stationId ?? null;
  expect((await place(first.id)).ok()).toBeTruthy();
  const volunteerContext = await browser.newContext({
    storageState: storageStateFor('volunteer'),
  });
  try {
    const volunteerPage = await volunteerContext.newPage();
    await volunteerPage.goto('/patients');
    await volunteerPage.getByLabel('Name, patient code, phone or ID last 4').fill(returning.name);
    await volunteerPage
      .getByRole('row', { name: new RegExp(returning.name) })
      .getByRole('button', { name: 'Check in and start' })
      .click();
    await volunteerPage.waitForURL(/\/stations\/visits\/[^/?]+\?registered=1$/, {
      timeout: 20_000,
    });
    await expect(
      volunteerPage.getByText(/^Patient number \d+\. Write it on their card\.$/),
    ).toBeVisible();
  } finally {
    await volunteerContext.close();
    await place(previous);
  }
});

test('a station asks a doctor, the doctor on shift takes it, and the station sees who (#418)', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const patient = await createPatient(page);
  const { clinicId } = patient;
  await ensureShift('staff', clinicId);
  const doctorShift = await apiRequestAs('doctor', 'post', `/clinics/${clinicId}/shifts/check-in`, {
    clinicId,
    data: { roleAtShift: 'DOCTOR' },
  });
  if (!doctorShift.ok()) expect(doctorShift.json().code).toBe('SHIFT_ALREADY_ACTIVE');
  const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
    clinicId,
    data: { patientId: patient.patientId },
  });
  expect(checkIn.ok(), checkIn.text()).toBeTruthy();
  const { at } = await claimNext('staff', clinicId, checkIn.json().id);

  // The station asks: urgency is required, the reason a list, no free text to reach a push.
  await page.goto(`/stations/visits/${at.visit.id}`);
  await page.getByRole('button', { name: 'Ask a doctor' }).click();
  const dialog = page.getByRole('dialog');
  const send = dialog.getByRole('button', { name: 'Send to doctors' });
  await expect(send).toBeDisabled();
  await dialog.getByText('Now', { exact: true }).click();
  await dialog.getByText('High BP', { exact: true }).click();
  await send.click();
  await expect(page.getByTestId('doctor-request-chip')).toHaveText('Doctor needed now');

  // The doctor's bell says where and which number, never who.
  const tiles = await apiRequestAs('doctor', 'get', '/me/notifications');
  const tile = tiles
    .json()
    .items.find(
      (item) =>
        item.kind === 'DOCTOR_REQUEST' && item.doctorRequest?.stationVisitId === at.visit.id,
    );
  expect(tile).toMatchObject({
    title: 'Doctor needed now',
    url: `/stations/visits/${at.visit.id}`,
  });
  expect(tile.body).toContain(`No. ${at.visit.dayNumber}, high BP`);
  expect(JSON.stringify(tile)).not.toContain(patient.name.split(' ')[1]);

  const doctor = await browser.newContext({ storageState: storageStateFor('doctor') });
  const doctorPage = await doctor.newPage();
  await doctorPage.goto('/notifications');
  const row = doctorPage.getByRole('listitem').filter({ hasText: tile.body }).first();
  await row.getByRole('button', { name: "I'm on it" }).click({ timeout: 20_000 });
  await expect(row.getByTestId('notification-owner')).toHaveText("You're on it");
  await doctor.close();

  // The station sees who took it, and the button gives way to the chip.
  await page.reload();
  await expect(page.getByTestId('doctor-request-chip')).toHaveText(/ on it$/, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Ask a doctor' })).toHaveCount(0);
});

/*
  #419: at the review station the most urgent patient is listed first, not the oldest. Two
  patients reach review; the newer one carries a high glucose reading. Taking opens the visit,
  and someone at another station sees no review list.
*/
test('the review list puts a flagged patient first, and Take opens the visit (#419)', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const plain = await createPatient(page);
  const flagged = await createPatient(page);
  const { clinicId } = plain;
  await ensureShift('staff', clinicId);

  /** Hands every stop before review on with nothing recorded; review stays waiting. */
  async function toReview(patient, beforeFirstHandOff) {
    const checkIn = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/checkins`, {
      clinicId,
      data: { patientId: patient.patientId },
    });
    expect(checkIn.ok(), checkIn.text()).toBeTruthy();
    const checkInId = checkIn.json().id;
    let first = true;
    for (;;) {
      const at = await boardVisit('staff', clinicId, checkInId);
      if (at.station.kind === 'REVIEW') return at;
      const { claimed } = await claimNext('staff', clinicId, checkInId);
      if (first && beforeFirstHandOff) await beforeFirstHandOff(claimed.encounterId);
      first = false;
      const done = await complete('staff', clinicId, at.visit.id);
      expect(done.ok(), done.text()).toBeTruthy();
    }
  }

  const plainAt = await toReview(plain);
  const flaggedAt = await toReview(flagged, async (encounterId) => {
    const reading = await apiRequestAs(
      'staff',
      'put',
      `/clinics/${clinicId}/encounters/${encounterId}/diabetes-screening/glucose`,
      {
        clinicId,
        data: { glucoseMgDl: 450, glucoseType: 'RANDOM', collectedAt: new Date().toISOString() },
      },
    );
    expect(reading.ok(), reading.text()).toBeTruthy();
  });
  expect(flaggedAt.visit.lineFlags.length).toBeGreaterThan(0);

  // The volunteer works the review station for this test, then goes back where they were.
  await ensureShift('volunteer', clinicId);
  const volunteerId = (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json().userId;
  const shift = (
    await apiRequestAs('volunteer', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
  )
    .json()
    .onShift.find((member) => member.user.id === volunteerId);
  const place = (stationId) =>
    apiRequestAs('volunteer', 'patch', `/clinics/${clinicId}/shifts/${shift.shiftId}/station`, {
      clinicId,
      data: { stationId },
    });
  const previous = shift.stationId ?? null;
  expect((await place(plainAt.station.id)).ok()).toBeTruthy();

  const volunteerContext = await browser.newContext({
    storageState: storageStateFor('volunteer'),
  });
  try {
    const volunteerPage = await volunteerContext.newPage();
    await volunteerPage.goto('/stations');
    const list = volunteerPage.getByTestId('review-waiting-list');
    await expect(list).toBeVisible({ timeout: 20_000 });
    const rows = list.getByTestId('review-waiting-row');
    await expect(rows.filter({ hasText: plain.name })).toHaveCount(1, { timeout: 20_000 });
    await expect(rows.filter({ hasText: flagged.name })).toHaveCount(1);
    // Leftover patients may sit between them; only the order of these two matters.
    const names = await rows.allInnerTexts();
    const position = (name) => names.findIndex((text) => text.includes(name));
    expect(position(flagged.name)).toBeLessThan(position(plain.name));
    const flaggedRow = rows.filter({ hasText: flagged.name });
    await expect(flaggedRow.getByTestId('line-flag-chip')).toBeVisible();
    await expect(flaggedRow).toContainText(/Glucose /);
    // The Stations item carries the count while this person is at review.
    await expect(
      volunteerPage.getByRole('link', { name: /^Stations, \d+ waiting for review$/ }).first(),
    ).toBeAttached({ timeout: 20_000 });

    await flaggedRow.getByRole('button', { name: /^Take patient/ }).click();
    await volunteerPage.waitForURL(`**/stations/visits/${flaggedAt.visit.id}`, {
      timeout: 20_000,
    });
    const release = await apiRequestAs(
      'volunteer',
      'post',
      `/clinics/${clinicId}/station-visits/${flaggedAt.visit.id}/release`,
      { clinicId, data: { reason: 'E2E cleanup' } },
    );
    expect(release.ok(), release.text()).toBeTruthy();

    // At any other station there is no review list.
    const board = (
      await apiRequestAs('volunteer', 'get', `/clinics/${clinicId}/stations/board`, { clinicId })
    ).json();
    const elsewhere = board.stations.find((station) => station.kind !== 'REVIEW' && station.active);
    expect((await place(elsewhere.id)).ok()).toBeTruthy();
    await volunteerPage.goto('/stations');
    await expect(volunteerPage.getByRole('heading', { name: 'Stations' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(volunteerPage.getByText(`Next at ${elsewhere.name}`)).toBeVisible({
      timeout: 20_000,
    });
    await expect(volunteerPage.getByTestId('review-waiting-list')).toHaveCount(0);
  } finally {
    await volunteerContext.close();
    await place(previous);
  }
});
