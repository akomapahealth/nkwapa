const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');
const { requireAuditDatabase } = require('../playwright/device-matrix.cjs');
const { chooseAnswer, question, openSection, answer } = require('../playwright/interview');
const { waitForOutboxDrain, queueOfflineChange, readOutboxRows } = require('../playwright/outbox');

test.use({ storageState: storageStateFor('staff') });
test.skip(
  !process.env.R82_OLD_API_URL,
  'Local characterization requires an isolated pre-unit-5 API.',
);
test.beforeAll(() => requireAuditDatabase());

test('screening corrections sync on current and old APIs after metadata compatibility resend', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const evidence = [];
  const corrections = [];
  const out = process.env.R82_COMPAT_DIR || info.outputPath('compatibility');
  const persist = () => {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, 'screening-compatibility.json'),
      JSON.stringify(evidence, null, 2),
    );
  };
  async function save(entityType, label, matches) {
    const pushed = page.waitForResponse((r) => {
      if (new URL(r.url()).pathname !== '/sync/push' || r.request().method() !== 'POST')
        return false;
      return r
        .request()
        .postDataJSON()
        .some((m) => m.entityType === entityType && matches(m.payloadJson));
    });
    await page.getByRole('button', { name: label, exact: true }).click();
    const response = await pushed;
    expect(response.ok()).toBe(true);
    const mutation = response
      .request()
      .postDataJSON()
      .find((m) => m.entityType === entityType && matches(m.payloadJson));
    const result = (await response.json()).results.find((r) => r.id === mutation.id);
    expect(result.status).toBe('APPLIED');
    await waitForOutboxDrain(page, expect, { entityType });
    await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
    evidence.push({
      entityType,
      baseUpdatedAt: mutation.payloadJson.baseUpdatedAt ?? null,
      result: result.status,
    });
    persist();
    return mutation;
  }
  await page.goto('/patients/new');
  const suffix = randomUUID().slice(0, 10);
  await page.getByLabel('First name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Last name', { exact: true }).fill(`Compatibility-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`R82-COMPAT-${suffix}`);
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/);
  const patientId = page.url().split('/').at(-1);
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/encounters$/.test(new URL(r.url()).pathname),
  );
  await page.goto(`/patients/${patientId}/encounters/new`);
  const encounterId = (await (await created).json()).id;
  await page.goto(`/encounters/${encounterId}`);
  await page.getByRole('tab', { name: 'Vitals', exact: true }).click();
  await page.getByLabel('Systolic BP (mmHg)').fill('128');
  await page.getByLabel('Diastolic BP (mmHg)').fill('84');
  await page.getByLabel('Measurement site', { exact: true }).click();
  await page.getByRole('option', { name: 'Left arm', exact: true }).click();
  await save('encounter_vitals_bundle', 'Save measurements', (p) => p.vitals?.systolicBp === 128);
  await page.getByLabel('Pulse (bpm)').fill('77');
  corrections.push(
    await save('encounter_vitals_bundle', 'Save measurements', (p) => p.vitals?.pulseBpm === 77),
  );

  await page.getByRole('tab', { name: 'Hypertension', exact: true }).click();
  await chooseAnswer(question(page, 'Hypertension status'), 'Known hypertension');
  await save(
    'hypertension_assessment',
    'Save assessment',
    (p) => p.hypertensionStatus === 'KNOWN_HYPERTENSION',
  );
  await chooseAnswer(question(page, 'Hypertension status'), 'Newly elevated BP');
  corrections.push(
    await save(
      'hypertension_assessment',
      'Save assessment',
      (p) => p.hypertensionStatus === 'NEWLY_ELEVATED_BP',
    ),
  );

  await page.getByRole('tab', { name: 'Diabetes', exact: true }).click();
  await openSection(page, 'Diabetes interview', /Control/);
  await page.getByLabel("Today's glucose (mmol/L)").fill('7.0');
  await answer(page, 'When was the sample taken?', 'Fasting');
  await openSection(page, 'Diabetes interview', /Actions and referral/);
  await page.getByLabel('Notes', { exact: true }).fill('Synthetic compatibility first save');
  await save(
    'diabetes_screening',
    'Save screening',
    (p) => p.notes === 'Synthetic compatibility first save',
  );
  await page.getByLabel('Notes', { exact: true }).fill('Synthetic compatibility correction');
  corrections.push(
    await save(
      'diabetes_screening',
      'Save screening',
      (p) => p.notes === 'Synthetic compatibility correction',
    ),
  );
  for (const mutation of corrections)
    expect(Number.isFinite(Date.parse(mutation.payloadJson.baseUpdatedAt))).toBe(true);
  const stored = await apiRequestAs('staff', 'get', `/encounters/${encounterId}`, {
    clinicId: corrections[0].clinicId,
  });
  expect(stored.ok()).toBe(true);
  expect(stored.json().vitals.pulseBpm).toBe(77);
  expect(stored.json().hypertensionAssessment.hypertensionStatus).toBe('NEWLY_ELEVATED_BP');
  expect(stored.json().diabetesScreening.notes).toBe('Synthetic compatibility correction');

  // This is the actual pre-unit-5 API, not a fabricated validation response. Only push traffic
  // is forwarded; authentication, bootstrap and reads continue to use the fresh API.
  expect(process.env.R82_OLD_API_URL).toBeTruthy();
  const oldResults = new Map();
  const attempts = new Map();
  await page.route('**/sync/push**', async (route) => {
    const target = new URL(route.request().url());
    const old = new URL(process.env.R82_OLD_API_URL);
    target.host = old.host;
    target.protocol = old.protocol;
    const response = await route.fetch({ url: target.href });
    const mutations = route.request().postDataJSON();
    for (const result of (await response.json()).results) {
      oldResults.set(result.id, result);
      const mutation = mutations.find((m) => m.id === result.id);
      const history = attempts.get(result.id) || [];
      history.push({ mutation, result });
      attempts.set(result.id, history);
    }
    await route.fulfill({ response });
  });
  const ids = [];
  for (const mutation of corrections) {
    const id = randomUUID();
    ids.push(id);
    await queueOfflineChange(page, {
      ...mutation,
      payloadJson: JSON.stringify(mutation.payloadJson),
      id,
      idempotencyKey: randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect.poll(() => ids.filter((id) => oldResults.has(id)).length).toBe(3);
  await expect
    .poll(() => ids.every((id) => oldResults.get(id)?.status === 'APPLIED'), {
      timeout: 60_000,
      message: 'old API corrections must eventually apply after compatibility resend',
    })
    .toBe(true);
  await waitForOutboxDrain(page, expect);
  const remaining = (await readOutboxRows(page)).filter((r) => ids.includes(r.id));
  expect(remaining).toEqual([]);
  for (let i = 0; i < ids.length; i++) {
    const history = attempts.get(ids[i]);
    const first = history[0];
    const last = history.at(-1);
    const entityType = corrections[i].entityType;
    if (entityType !== 'diabetes_screening') {
      expect(first.result.status).toBe('ERROR');
      expect(JSON.stringify(first.result)).toContain('baseUpdatedAt');
      expect(first.mutation.payloadJson.baseUpdatedAt).toBeTruthy();
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(last.mutation.payloadJson).not.toHaveProperty('baseUpdatedAt');
      const { baseUpdatedAt, ...clinicalPayload } = first.mutation.payloadJson;
      expect(baseUpdatedAt).toBeTruthy();
      expect(last.mutation.payloadJson).toEqual(clinicalPayload);
      expect(last.mutation.id).toBe(first.mutation.id);
      expect(last.mutation.idempotencyKey).toBe(first.mutation.idempotencyKey);
    }
    expect(last.result.status).toBe('APPLIED');
    evidence.push({
      entityType,
      oldApi: true,
      attempts: history,
      syncState: 'removed-after-applied',
    });
    persist();
  }
  const readback = await apiRequestAs('staff', 'get', `/encounters/${encounterId}`, {
    clinicId: corrections[0].clinicId,
  });
  expect(readback.ok()).toBe(true);
  expect(readback.json().vitals.pulseBpm).toBe(77);
  expect(readback.json().hypertensionAssessment.hypertensionStatus).toBe('NEWLY_ELEVATED_BP');
});
