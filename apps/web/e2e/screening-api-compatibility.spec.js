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
test.beforeAll(() => requireAuditDatabase());

test('screening saves and corrections sync; characterize old API rejection without changing retry policy', async ({
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
  await page.route('**/sync/push**', async (route) => {
    const target = new URL(route.request().url());
    const old = new URL(process.env.R82_OLD_API_URL);
    target.host = old.host;
    target.protocol = old.protocol;
    const response = await route.fetch({ url: target.href });
    for (const result of (await response.json()).results) oldResults.set(result.id, result);
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
    .poll(async () => {
      const rows = (await readOutboxRows(page)).filter((r) => ids.includes(r.id));
      return ids.every((id) => {
        const row = rows.find((r) => r.id === id);
        return oldResults.get(id).status === 'APPLIED'
          ? !row
          : row && ['blocked', 'retrying'].includes(row.syncState);
      });
    })
    .toBe(true);
  const remaining = (await readOutboxRows(page)).filter((r) => ids.includes(r.id));
  for (let i = 0; i < ids.length; i++) {
    const result = oldResults.get(ids[i]);
    const row = remaining.find((r) => r.id === ids[i]);
    if (result.status !== 'APPLIED')
      expect(JSON.stringify(row.lastFailure)).toContain('baseUpdatedAt');
    evidence.push({
      entityType: corrections[i].entityType,
      oldApi: true,
      result: result.status,
      syncState: row?.syncState ?? 'removed-after-applied',
      lastFailure: row?.lastFailure,
    });
    persist();
  }
});
