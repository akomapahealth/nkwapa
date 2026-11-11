const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');
const { overflow } = require('../playwright/responsive-routes');

test.use({ storageState: storageStateFor('staff') });
const widths = [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440];
async function openEncounter(page) {
  const suffix = randomUUID().slice(0, 8);
  await page.goto('/patients/new');
  await page.getByLabel('First name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Last name', { exact: true }).fill(`Vitals-${suffix}`);
  await page.getByLabel('National ID', { exact: true }).fill(`R37-${suffix}`);
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/);
  const [, , clinicId, , patientId] = new URL(page.url()).pathname.split('/');
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/encounters$/.test(new URL(r.url()).pathname),
  );
  await page.goto(`/patients/${patientId}/encounters/new`);
  const created = await response;
  expect(created.ok()).toBe(true);
  const encounterId = (await created.json()).id;
  await page.goto(`/encounters/${encounterId}`);
  await page.getByRole('tab', { name: 'Vitals', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Vitals and tobacco screening' })).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced');
  await page.evaluate(() => document.fonts.ready);
  return { clinicId, patientId, encounterId };
}
async function shot(page, name) {
  if (!process.env.VITALS_EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.VITALS_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.VITALS_EVIDENCE_DIR, `${name}.png`) });
}
async function noOverflow(page) {
  // ResponsiveContainer and measured action clearance settle after a resize.
  await expect
    .poll(async () => Math.max(...(await overflow(page)).map((x) => x.scrollWidth - x.clientWidth)))
    .toBeLessThanOrEqual(0);
}
async function actionVisible(page, name) {
  const target = page.getByRole('button', { name, exact: true });
  await target.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await expect(target).toBeInViewport({ ratio: 1 });
  expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(
    await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el || el.contains(hit);
    }),
  ).toBe(true);
}
for (const theme of ['light', 'dark']) {
  test(`encounter vitals layout, retained entry, keyboard and enlarged text: ${theme}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openEncounter(page);
    await page.getByLabel('Systolic BP (mmHg)').fill('128');
    await page.getByLabel('Diastolic BP (mmHg)').fill('84');
    await page.getByLabel('Notes', { exact: true }).fill('Synthetic retained context');
    await page.getByLabel('Systolic BP (mmHg)').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Diastolic BP (mmHg)')).toBeFocused();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByLabel('Systolic BP (mmHg)')).toHaveValue('128');
      await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(
        'Synthetic retained context',
      );
      await noOverflow(page);
      await actionVisible(page, 'Save measurements');
      await actionVisible(page, 'Mark tobacco reviewed');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page
        .getByLabel('Systolic BP (mmHg)')
        .evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await shot(page, `encounter-${theme}-${width}`);
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    for (const width of [320, 390, 600, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await actionVisible(page, 'Save measurements');
      await actionVisible(page, 'Mark tobacco reviewed');
      await shot(page, `encounter-${theme}-text200-${width}`);
    }
  });
}

test('encounter Crisis saves first, requires acknowledgement, and does not repeat after completed resave', async ({
  page,
}) => {
  const { clinicId, encounterId } = await openEncounter(page);
  await page.getByLabel('Systolic BP (mmHg)').fill('182');
  await page.getByLabel('Diastolic BP (mmHg)').fill('96');
  await page.getByLabel('Measurement site', { exact: true }).click();
  await page.getByRole('option', { name: 'Left arm', exact: true }).click();
  await page.getByRole('button', { name: 'Save measurements', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'This visit needs a clinician now' });
  await expect(dialog).toBeVisible();
  const saved = await apiRequestAs('staff', 'get', `/encounters/${encounterId}`, { clinicId });
  expect(saved.json().vitals).toMatchObject({ systolicBp: 182, diastolicBp: 96 });
  await expect(dialog.getByRole('button')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: "I've told a clinician" })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await shot(page, 'encounter-crisis');
  await dialog.getByRole('button', { name: "I've told a clinician" }).click();
  const save = page.getByRole('button', { name: 'Save measurements', exact: true });
  await expect(save).toBeEnabled();
  await page.getByLabel('Pulse (bpm)').fill('76');
  const push = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/sync/push',
  );
  await save.click();
  expect((await push).ok()).toBe(true);
  await expect(save).toBeEnabled();
  await expect(dialog).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`chart vitals retains provenance, cursor records and trend selection: ${theme}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    const { clinicId, patientId, encounterId } = await openEncounter(page);
    const record = (id, systolicBp) => ({
      id,
      encounterId,
      encounterStatus: 'FINALIZED',
      locked: true,
      encounterCreatedAt: '2026-11-09T12:00:00Z',
      recordedAt: '2026-11-09T12:00:00Z',
      updatedAt: '2026-11-09T12:00:00Z',
      recordedBy: { id: 'synthetic-author', displayName: 'Synthetic Screener' },
      clinic: { id: clinicId, name: 'Synthetic Clinic' },
      systolicBp,
      diastolicBp: 84,
      pulseBpm: 76,
      temperatureCelsius: 37,
      respiratoryRate: 16,
      spo2Percent: 98,
      weightKg: 70,
      heightCm: 170,
      bmi: 24.2,
      notes: 'Synthetic provenance and measurements only.',
    });
    const cursors = [];
    await page.route('**/chart/vitals*', (route) => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      cursors.push(cursor);
      return route.fulfill({
        json: {
          items: [record(cursor ? 'older' : 'newer', cursor ? 120 : 128)],
          nextCursor: cursor ? null : 'synthetic-older',
        },
      });
    });
    await page.route(`**/patients/${patientId}/trends?*`, (route) =>
      route.fulfill({
        json: {
          bp: [{ t: '2026-11-09T12:00:00Z', sys: 128, dia: 84, source: 'ENCOUNTER' }],
          glucose: [],
          measurements: [
            { t: '2026-11-09T12:00:00Z', spo2Percent: 98, weightKg: 70, source: 'ENCOUNTER' },
          ],
          followUp: { requested: 0, confirmed: 0, completed: 0, noShow: 0, closed: 0 },
        },
      }),
    );
    await page.goto(`/clinics/${clinicId}/patients/${patientId}?tab=vitals`);
    const history = page.getByRole('list', { name: 'Recorded vitals history' });
    await expect(history).toContainText('Blood pressure 128/84 mmHg');
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(history.getByRole('listitem')).toHaveCount(2);
    expect(cursors).toEqual([null, 'synthetic-older']);
    await expect(history).toContainText('Synthetic Screener');
    await expect(history).toContainText('Synthetic Clinic');
    await expect(history.getByRole('link', { name: 'Open source visit' }).first()).toHaveAttribute(
      'href',
      new RegExp(encounterId),
    );
    await page.getByRole('button', { name: /^Weight/ }).click();
    await expect(page.getByRole('heading', { name: 'Weight trend', exact: true })).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect(history.getByRole('listitem')).toHaveCount(2);
      await expect(page.getByRole('button', { name: /^Weight/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('tab', { name: 'Vitals', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await noOverflow(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await history.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await shot(page, `history-${theme}-${width}`);
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    for (const width of [320, 390, 600, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await history
        .getByRole('link', { name: 'Open source visit' })
        .first()
        .evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await shot(page, `history-${theme}-text200-${width}`);
    }
    expect(cursors).toHaveLength(2);
  });
}

test('measurement errors describe the actual context, temperature and source controls', async ({
  page,
}) => {
  await openEncounter(page);
  await page.getByLabel('Systolic BP (mmHg)').fill('128');
  await page.getByLabel('Diastolic BP (mmHg)').fill('84');
  await page.getByLabel('Temperature (°C)', { exact: true }).fill('99');
  for (const label of ['Measurement site', 'Patient position', 'Cuff size', 'Temperature source']) {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByRole('option', { name: 'Other', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save measurements', exact: true }).click();
  for (const label of [
    'Other site',
    'Other position',
    'Other cuff size',
    'Other temperature source',
    'Temperature (°C)',
  ]) {
    const field = page.getByLabel(label, { exact: true });
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const messageId = await field.getAttribute('aria-describedby');
    expect(messageId).toBeTruthy();
    const message = page.locator(`[id="${messageId}"]`);
    await expect(message).toHaveCount(1);
    await expect(message).not.toBeEmpty();
  }
  await page.getByLabel('Temperature (°C)', { exact: true }).fill('37');
  await expect(page.getByLabel('Temperature (°C)', { exact: true })).toHaveValue('37');
  await expect(page.getByLabel('Systolic BP (mmHg)')).toHaveValue('128');
});

test('finalized measurements keep values and units readable without save controls', async ({
  page,
}) => {
  test.setTimeout(180000);
  const { encounterId } = await openEncounter(page);
  await page.route(`**/encounters/${encounterId}`, async (route) => {
    if (route.request().method() !== 'GET' || route.request().resourceType() === 'document')
      return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.status = 'FINALIZED';
    body.vitals = {
      id: 'synthetic-finalized-vitals',
      systolicBp: 128,
      diastolicBp: 84,
      pulseBpm: 76,
      temperatureCelsius: 37,
      respiratoryRate: 16,
      spo2Percent: 98,
      weightKg: 70,
      heightCm: 170,
      bmi: 24.2,
      notes: 'Synthetic finalized context.',
    };
    await route.fulfill({ response, json: body });
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Clinical measurements', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save measurements', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('128/84 mmHg', { exact: true })).toBeVisible();
    await expect(page.getByText('76 bpm', { exact: true })).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page
      .getByRole('heading', { name: 'Clinical measurements', exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, `readonly-${theme}-1440`);
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    for (const width of [320, 390, 600, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page
        .getByRole('heading', { name: 'Clinical measurements', exact: true })
        .evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await shot(page, `readonly-${theme}-text200-${width}`);
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  }
});
