const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');
const { readOutboxRows } = require('../playwright/outbox');

test.use({ storageState: storageStateFor('staff') });
const widths = [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440];
const patient = {
  id: 'synthetic-registry-r33',
  patientCode: 'SYN-R33-0001',
  firstName: 'Synthetic',
  lastName: 'Registry',
  phoneE164: '+233240000001',
  nationalIdLast4: '0001',
};
const endpoint = /\/clinics\/[^/]+\/patients\?/;
async function mockRegistry(page, options = {}) {
  await page.route(endpoint, (route) =>
    route.fulfill({ json: { items: [patient], total: 30, page: 1, pageSize: 10, ...options } }),
  );
}
async function open(page, url = '/patients') {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible();
}
async function sheet(page) {
  await page.getByRole('button', { name: 'Filter patients', exact: true }).click();
  return page.getByRole('dialog', { name: 'Filter patients', exact: true });
}
async function choose(page, label, value) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}
async function shot(page, name, fullPage = true) {
  if (!process.env.REGISTRY_EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.REGISTRY_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.REGISTRY_EVIDENCE_DIR, name + '.png'),
    fullPage,
  });
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
}
for (const theme of ['light', 'dark']) {
  test(`registry boundaries, final actions and accessibility: ${theme}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await mockRegistry(page);
    await open(page, '/patients?q=Synthetic&page=2&sortBy=name&sortDir=desc');
    const url = page.url();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const tableFits = await page
        .locator('.data-table-adaptive')
        .evaluate(
          (el) =>
            el.clientWidth >= 60 * parseFloat(getComputedStyle(document.documentElement).fontSize),
        );
      const active = page.locator(tableFits ? '.data-table-grid' : '.data-table-cards');
      await expect(active).toBeVisible();
      await expect(active.getByRole('button', { name: 'Check in', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Next page', exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport({
        ratio: 1,
      });
      await noOverflow(page);
      expect(page.url()).toBe(url);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `registry-${width}-${theme}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await noOverflow(page);
    await page.getByRole('button', { name: 'Check in', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await shot(page, `registry-enlarged-${theme}`);
  });
  test(`filter Sheet retains selection across widths and dismissal: ${theme}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await mockRegistry(page);
    await open(page);
    await page.setViewportSize({ width: 390, height: 900 });
    const dialog = await sheet(page);
    await choose(page, 'Region', 'Greater Accra');
    await choose(page, 'District', 'Accra Metropolitan');
    await page.getByLabel('Community', { exact: true }).fill('Synthetic town');
    await choose(page, 'Screened', 'Custom range');
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect(dialog).toBeVisible();
      await expect(page.getByLabel('Community', { exact: true })).toHaveValue('Synthetic town');
      await expect(page.getByLabel('District', { exact: true })).toHaveText('Accra Metropolitan');
      await expect(page.getByLabel('From', { exact: true })).toBeVisible();
      const box = await dialog.boundingBox();
      expect(Math.round(box.x + box.width)).toBe(width);
      if (width < 600) expect(box.y).toBeGreaterThan(0);
      else expect(Math.round(box.y)).toBe(0);
      await noOverflow(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await shot(page, `filter-${width}-${theme}`);
    }
    await page.getByLabel('From', { exact: true }).fill('2026-10-01');
    await page.getByRole('button', { name: 'Show results', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Filter patients', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Remove Region filter' })).toBeVisible();
    await sheet(page);
    await expect(page.getByLabel('Screened', { exact: true })).toHaveText('Custom range');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Filter patients', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Remove Region filter' }).click();
    await expect(page).not.toHaveURL(/residentialRegion|residentialDistrict/);
    await page.getByRole('button', { name: 'Clear all filters', exact: true }).click();
    await expect(page).not.toHaveURL(/screenedFrom|residentialCommunity/);
  });
}

test('search shortcut respects typing, filters and the existing URL state', async ({ page }) => {
  await mockRegistry(page);
  await open(page, '/patients?page=2&sortBy=name&sortDir=desc');
  await page.locator('#main-content').focus();
  await page.keyboard.press('/');
  const search = page.getByLabel('Name, patient code, phone or ID last 4');
  await expect(search).toBeFocused();
  await search.fill('Synthetic');
  await page.keyboard.press('/');
  await expect(search).toHaveValue('Synthetic/');
  await expect(page).toHaveURL(/q=Synthetic%2F/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page).toHaveURL(/sortBy=name/);
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await sheet(page);
  const community = page.getByLabel('Community', { exact: true });
  await community.fill('Clinic');
  await community.press('/');
  await expect(community).toHaveValue('Clinic/');
});

test('invalid and server-refused dates remain editable after dismissing the Sheet', async ({
  page,
}) => {
  await mockRegistry(page);
  await open(page);
  await sheet(page);
  await choose(page, 'Screened', 'Custom range');
  await page.getByLabel('From', { exact: true }).fill('2026-10-15');
  await page.getByLabel('To (optional)', { exact: true }).fill('2026-10-01');
  await expect(page.getByLabel('To (optional)', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit screened dates' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit screened dates' }).click();
  await page.getByLabel('To (optional)', { exact: true }).fill('2026-10-16');
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 400,
      json: {
        message: 'Screened range refused',
        fieldErrors: [{ field: 'screenedFrom', message: 'Synthetic range refusal' }],
      },
    }),
  );
  await page.getByLabel('From', { exact: true }).fill('2026-10-14');
  await expect(page.getByLabel('From', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Synthetic range refusal' }),
  ).toBeVisible();
});

for (const status of [403, 503]) {
  test(`a refused first registry read stays unknown: ${status}`, async ({ page }) => {
    await page.route(endpoint, (route) =>
      route.fulfill({ status, json: { message: 'Synthetic read refused' } }),
    );
    await open(page);
    await expect(
      page.getByText("We couldn't load the patient registry", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No patients in this clinic yet' })).toHaveCount(
      0,
    );
    await mockRegistry(page);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('table')).toContainText('Synthetic Registry');
  });
}

test('retained offline and stale results remain identified and actionable', async ({
  page,
  context,
}) => {
  await mockRegistry(page);
  await open(page);
  await expect(page.getByRole('table')).toContainText('Synthetic Registry');
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic refresh failed' } }),
  );
  await page.getByLabel('Name, patient code, phone or ID last 4').fill('Synthetic');
  await expect(
    page.getByText('Showing the last version that loaded', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Synthetic Registry');
  await context.setOffline(true);
  await expect(page.getByTestId('stale-data-notice')).toContainText('You are offline');
  await expect(page.getByRole('table')).toContainText('Synthetic Registry');
  await context.setOffline(false);
});

test('read-only registry hides create and check-in actions, including swipe', async ({ page }) => {
  await page.route('**/auth/whoami', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.effectivePermissionsForActiveClinic = ['PATIENT.SEARCH', 'PATIENT.READ'];
    await route.fulfill({ response, json: data });
  });
  await mockRegistry(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByRole('article', { name: 'Synthetic Registry' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New patient', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check in', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Synthetic Registry', exact: true })).toBeVisible();
});

async function swipe(page, { cancel = false, vertical = false, distance = 130 } = {}) {
  const heading = page.getByRole('article', { name: 'Synthetic Registry' }).getByRole('heading');
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    // Measure under touch: a coarse pointer shows the swipe hint, which moves the rows down.
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await heading.scrollIntoViewIfNeeded();
    const box = await heading.boundingBox();
    const x = box.x + Math.min(box.width - 16, 220);
    const y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x - (vertical ? 0 : 20), y: y + (vertical ? 20 : 0) }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x - distance, y: y + (vertical ? 100 : 0) }],
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`swipe cancels safely and shares refusal and duplicate guards with buttons: ${reducedMotion}`, async ({
    page,
  }) => {
    await mockRegistry(page);
    let writes = 0;
    await page.route('**/clinics/*/checkins', async (route) => {
      writes++;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({
        status: 409,
        json: { code: 'PATIENT_ALREADY_CHECKED_IN', message: 'Already checked in' },
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion });
    await open(page);
    await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeEnabled();
    await swipe(page, { cancel: true });
    await swipe(page, { vertical: true });
    await swipe(page, { distance: 30 });
    expect(writes).toBe(0);
    await swipe(page);
    await swipe(page);
    await expect(
      page.getByText(/already checked in today, so they were not added again/),
    ).toBeVisible();
    expect(writes).toBe(1);
    await expect(page.getByRole('article', { name: 'Synthetic Registry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeEnabled();
    await swipe(page, { cancel: true });
    const button = page.getByRole('button', { name: 'Check in', exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => writes).toBe(2);
    await expect(button).toBeEnabled();
    await swipe(page, { cancel: true });
    await button.focus();
    await page.keyboard.press('Space');
    await expect.poll(() => writes).toBe(3);
    await expect(button).toBeEnabled();
  });
}

test('real registry check-in queues offline and replays once without removing the patient', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const clinicId = (await apiRequestAs('staff', 'get', '/auth/whoami')).json().activeClinicId;
  const suffix = randomUUID().slice(0, 8);
  const created = await apiRequestAs('staff', 'post', `/clinics/${clinicId}/patients`, {
    clinicId,
    data: {
      firstName: 'Synthetic',
      lastName: `Registry-${suffix}`,
      nationalIdType: 'OTHER',
      nationalId: `SYN-R33-${suffix}`,
      sex: 'OTHER',
    },
  });
  expect(created.ok(), created.text()).toBeTruthy();
  const id = created.json().id;
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `/clinics/${clinicId}/patients?q=Registry-${suffix}`);
  const card = page.getByRole('article', { name: `Synthetic Registry-${suffix}` });
  await expect(card).toBeVisible();
  await context.setOffline(true);
  await card.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByText(/checked in on this device and will reach/)).toBeVisible();
  await expect(card).toBeVisible();
  await expect.poll(async () => (await readOutboxRows(page)).length).toBe(1);
  await context.setOffline(false);
  await expect.poll(async () => (await readOutboxRows(page)).length, { timeout: 45000 }).toBe(0);
  await card.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(
    page.getByText(/already checked in today, so they were not added again/),
  ).toBeVisible();
  // The station board is the only place an arrival can be counted, and it needs the station
  // workflow, which the smoke build leaves off. The refusal message above covers that build.
  if (process.env.FEATURE_STATION_WORKFLOW_ENABLED !== 'true') return;
  const board = await apiRequestAs('staff', 'get', `/clinics/${clinicId}/stations/board`, {
    clinicId,
  });
  const arrivals = board
    .json()
    .stations.flatMap((station) => station.visits)
    .filter((visit) => visit.patientId === id || visit.patient?.id === id);
  expect(arrivals.length).toBe(1);
});

for (const theme of ['light', 'dark']) {
  test(`long names, enlarged text and keyboard final actions: ${theme}`, async ({ page }) => {
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await mockRegistry(page, {
      items: [
        {
          ...patient,
          firstName: 'SyntheticLongUnbrokenPatientNameForWrapping',
          lastName: 'Registry with several additional family names',
        },
      ],
      total: 1,
    });
    await open(page);
    await expect(page.getByRole('article')).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await noOverflow(page);
    const card = page.getByRole('article');
    expect(
      await card.getByRole('heading').evaluate((el) => getComputedStyle(el).fontFamily),
    ).toMatch(/ibmPlexSans/i);
    const action = card.getByRole('button', { name: 'Check in', exact: true });
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport({ ratio: 1 });
    const box = await action.boundingBox();
    const nav = await page
      .getByRole('navigation', { name: 'Primary', exact: true })
      .boundingBox()
      .catch(() => null);
    if (nav) expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
    let writes = 0;
    await page.route('**/clinics/*/checkins', (route) => {
      writes++;
      return route.fulfill({ status: 403, json: { message: 'Synthetic check-in refused' } });
    });
    await action.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Synthetic check-in refused', { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    await expect(action).toBeEnabled();
    await sheet(page);
    await noOverflow(page);
    await page.getByRole('button', { name: 'Show results', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Show results', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await shot(page, `filter-enlarged-${theme}`, false);
    await page.keyboard.press('Escape');
    await shot(page, `long-name-${theme}`, false);
  });
}
