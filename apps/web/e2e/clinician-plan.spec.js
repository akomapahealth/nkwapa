const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/**
 * The supervising clinician's half of the interview, from both sides of the boundary.
 *
 * The clinical specification says this part shows only for the doctor. The API refuses the route
 * independently and the sync pull withholds the columns, so this covers the third layer: what a
 * volunteer can see on screen. It is asserted as absent rather than disabled, because a disabled
 * section still tells a volunteer what a doctor may do.
 *
 * Run as the scoped `volunteer` and `doctor` identities rather than `staff`, which holds every
 * role at once and so can never show that one seat lacks something.
 */
async function openHypertensionTab(page, label) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill(label);
  await page.getByLabel('Last name', { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`E2E-PLAN-${suffix}`);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/, { timeout: 20_000 });
  const patientId = page.url().split('/').at(-1);

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/clinics\/[^/]+\/encounters$/.test(new URL(response.url()).pathname),
  );
  await page.goto(`/patients/${patientId}/encounters/new`);
  const encounterId = (await (await created).json()).id;

  await page.goto(`/encounters/${encounterId}`);
  await page.getByRole('tab', { name: 'Hypertension' }).click();
  return encounterId;
}

test.describe('as a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('neither the clinician plan nor the classification override is on the page', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openHypertensionTab(page, 'PlanVolunteer');

    await expect(
      page.getByRole('heading', { name: /supervising clinician assessment and plan/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save plan' })).toHaveCount(0);
    await expect(
      page.getByRole('checkbox', { name: 'Record a different classification' }),
    ).toHaveCount(0);

    // The interview itself is theirs to complete.
    await expect(page.getByRole('button', { name: 'Save assessment' })).toBeVisible();
  });
});

test.describe('as a doctor', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('the clinician plan records, and a follow-up window says it will schedule', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openHypertensionTab(page, 'PlanDoctor');

    await expect(
      page.getByRole('heading', { name: /supervising clinician assessment and plan/i }),
    ).toBeVisible();

    // The screening has to exist before a plan can hang off it.
    await page.getByRole('button', { name: 'Save assessment' }).click();
    await expect(page.getByText(/saved (and synced|on this device)/i)).toBeVisible();

    await page.getByRole('checkbox', { name: 'Adjust medication' }).check();
    await page.getByLabel('BP goal systolic (mmHg)').fill('130');
    await page.getByLabel('BP goal diastolic (mmHg)').fill('80');

    await page.getByLabel('Follow-up', { exact: true }).click();
    await page.getByRole('option', { name: 'Within 1 month', exact: true }).click();
    // The window is the input; a concrete date is what schedules the reminder on finalize.
    await expect(page.getByText(/schedules the patient.s follow-up reminder/i)).toBeVisible();

    await page.getByLabel('Follow-up owner').click();
    await page.getByRole('option', { name: 'Akomapa team', exact: true }).click();

    await page.getByRole('button', { name: 'Save plan' }).click();
    await expect(page.getByText('Plan saved.')).toBeVisible();
  });

  /*
    Seeded from the derivation rather than from "Not classified".

    A clinician ticking the box is disagreeing about a degree, not starting from nothing, so
    defaulting to UNKNOWN would make the safe first save a deletion of the finding.
  */
  test('the classification override starts from what the reading implies', async ({ page }) => {
    test.setTimeout(120_000);
    await openHypertensionTab(page, 'PlanOverride');

    const override = page.getByRole('checkbox', { name: 'Record a different classification' });
    const control = page.locator('#htn-classification');
    await expect(override).toBeVisible();
    await expect(control).toHaveCount(0);

    await override.check();
    await expect(control).toBeVisible();
    // No vitals recorded, so the derivation is "Not classified" and the override matches it.
    await expect(control).toHaveText(/not classified/i);
  });
});

/*
  #131: a doctor without signal queues the plan sealed, and nothing on any device can read it.
*/
const { apiRequestAs } = require('../playwright/api-client');
const { readOutboxRows, waitForOutboxDrain } = require('../playwright/outbox');

/** Every record in every IndexedDB store on this device, as one string to search. */
async function dumpDevice(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const names = [...db.objectStoreNames];
          if (!names.length) return resolve('');
          const tx = db.transaction(names, 'readonly');
          const out = {};
          let pending = names.length;
          for (const name of names) {
            const all = tx.objectStore(name).getAll();
            all.onsuccess = () => {
              out[name] = all.result;
              pending -= 1;
              if (pending === 0) {
                db.close();
                resolve(JSON.stringify(out));
              }
            };
          }
        };
      }),
  );
}

test.describe('offline, as a doctor', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('the plan is queued sealed, unreadable on the device, and applied on reconnect', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const encounterId = await openHypertensionTab(page, 'PlanOffline');
    const marker = `sealed-${randomUUID().slice(0, 8)}`;

    await page.getByRole('button', { name: 'Save assessment' }).click();
    await expect(page.getByText(/saved and synced/i)).toBeVisible({ timeout: 30_000 });
    // Wait until the device has fetched the key it seals to, while it still can.
    await page
      .waitForResponse((r) => r.url().includes('/sync/clinician-plan-key'), {
        timeout: 30_000,
      })
      .catch(() => undefined);

    await context.setOffline(true);
    await expect(page.getByText(/saving seals the plan/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('checkbox', { name: 'Adjust medication' }).check();
    await page.getByLabel('Follow-up', { exact: true }).click();
    await page.getByRole('option', { name: 'Within 1 month', exact: true }).click();
    await page.getByLabel('Follow-up owner').click();
    await page.getByRole('option', { name: 'Akomapa team', exact: true }).click();
    await page.getByLabel('Additional comments').fill(marker);
    await page.getByRole('button', { name: 'Queue plan' }).click();
    await expect(page.getByText(/queued on this device, not saved yet/i)).toBeVisible();

    // On the device: a sealed envelope and routing, never the plan.
    const queued = (await readOutboxRows(page)).filter(
      (row) => row.entityType === 'clinician_plan',
    );
    expect(queued).toHaveLength(1);
    const payload = JSON.parse(queued[0].payloadJson);
    expect(payload).toMatchObject({ encounterId, condition: 'HYPERTENSION' });
    expect(Object.keys(payload.sealed).sort()).toEqual(['alg', 'ct', 'ek', 'iv', 'kid', 'v']);
    expect(await dumpDevice(page)).not.toContain(marker);
    expect(await dumpDevice(page)).not.toContain('ADJUST_MEDICATION');

    // Back online: it drains, and the server has the plan and the follow-up date.
    await context.setOffline(false);
    await waitForOutboxDrain(page, expect, { entityType: 'clinician_plan' });
    const clinicId = queued[0].clinicId;
    const encounter = await apiRequestAs('doctor', 'get', `/encounters/${encounterId}`, {
      clinicId,
    });
    expect(encounter.json().carePlan?.followUpDate).toBeTruthy();
    const assessments = await apiRequestAs(
      'doctor',
      'get',
      `/clinics/${clinicId}/patients/${encounter.json().patientId}/hypertension-assessments`,
      { clinicId },
    );
    expect(assessments.ok(), assessments.text()).toBeTruthy();
    expect(assessments.text()).toContain(marker);
    // Applied, and the device still never held it in the clear.
    expect(await dumpDevice(page)).not.toContain(marker);

    // A volunteer on their own device: the pull withholds the plan, so nothing of it lands there.
    const volunteerContext = await page
      .context()
      .browser()
      .newContext({
        storageState: storageStateFor('volunteer'),
      });
    const volunteerPage = await volunteerContext.newPage();
    const pulled = volunteerPage.waitForResponse(
      (response) => new URL(response.url()).pathname === '/sync/pull' && response.ok(),
    );
    await volunteerPage.goto(`/encounters/${encounterId}`);
    await pulled;
    await volunteerPage.getByRole('tab', { name: 'Hypertension' }).click();
    await expect(
      volunteerPage.getByRole('heading', { name: /supervising clinician assessment and plan/i }),
    ).toHaveCount(0);
    expect(await dumpDevice(volunteerPage)).not.toContain(marker);
    await volunteerContext.close();
  });
});
