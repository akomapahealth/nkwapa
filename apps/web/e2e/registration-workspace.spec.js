const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const { overflow } = require('../playwright/responsive-routes');

test.use({ storageState: storageStateFor('staff') });
const widths = [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440];
const endpoint = /\/clinics\/[^/]+\/patients$/;
async function open(page, route = '/patients/new') {
  await page.goto(route);
  await expect(
    page.getByRole('heading', { name: 'Register a new patient', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced');
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
}
async function choose(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}
async function fill(page) {
  await page.getByLabel('First name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Last name', { exact: true }).fill('Registration');
  await page.getByLabel('National ID', { exact: true }).fill('SYN-R35-ID');
}
async function noOverflow(page) {
  expect(
    Math.max(...(await overflow(page)).map((x) => x.scrollWidth - x.clientWidth)),
  ).toBeLessThanOrEqual(0);
}
async function finalActions(page) {
  const actions = page.getByRole('group', { name: 'Registration actions', exact: true });
  await actions.scrollIntoViewIfNeeded();
  for (const action of [
    actions.getByRole('button', { name: 'Create patient', exact: true }),
    actions.getByRole('link', { name: 'Cancel', exact: true }),
  ]) {
    await expect(action).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        action.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return hit === el || el.contains(hit);
        }),
      )
      .toBe(true);
    const box = await action.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}
async function shot(page, name, fullPage = false) {
  if (!process.env.REGISTRATION_EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.REGISTRATION_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.REGISTRATION_EVIDENCE_DIR, `${name}.png`),
    fullPage,
  });
}
for (const theme of ['light', 'dark']) {
  test(`registration boundaries retain fields and expose final actions: ${theme}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await open(page);
    await fill(page);
    await page.getByLabel('Date of birth', { exact: true }).fill('1990-04-12');
    await page.getByLabel('Email', { exact: true }).fill('synthetic@nkwapa.local');
    await choose(page, 'Sex', 'Female');
    await choose(page, 'Location status', 'Recorded');
    await choose(page, 'Region', 'Greater Accra');
    await choose(page, 'District', 'Accra Metropolitan');
    await page.getByLabel('Community / town', { exact: true }).fill('Synthetic community');
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic');
      await expect(page.getByLabel('Date of birth', { exact: true })).toHaveValue('1990-04-12');
      await expect(page.getByLabel('Sex', { exact: true })).toHaveText('Female');
      await expect(page.getByLabel('District', { exact: true })).toHaveText('Accra Metropolitan');
      await expect(page.getByLabel('Community / town', { exact: true })).toHaveValue(
        'Synthetic community',
      );
      await expect(page.getByLabel('National ID', { exact: true })).toHaveValue('SYN-R35-ID');
      expect(
        await page
          .getByRole('group', { name: 'Registration actions' })
          .evaluate((el) => getComputedStyle(el).position),
      ).toBe(width < 600 ? 'fixed' : 'static');
      const first = await page.getByLabel('First name', { exact: true }).boundingBox();
      const last = await page.getByLabel('Last name', { exact: true }).boundingBox();
      if (width >= 600) expect(Math.abs(first.y - last.y)).toBeLessThan(1);
      else expect(last.y).toBeGreaterThan(first.y);
      await finalActions(page);
      await noOverflow(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `registration-${width}-${theme}`, true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await finalActions(page);
    await noOverflow(page);
    await shot(page, `registration-enlarged-actions-${theme}`);
    await page.getByLabel('First name', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Create patient', exact: true }).click();
    await expect(page.getByLabel('First name', { exact: true })).toBeFocused();
    await expect(page.getByRole('alert', { name: 'Unable to save' })).toContainText('First name:');
    await page
      .getByRole('alert', { name: 'Unable to save' })
      .getByRole('link', { name: /^First name:/ })
      .click();
    await expect(page.getByLabel('First name', { exact: true })).toBeFocused();
    await shot(page, `registration-enlarged-error-${theme}`);
  });
}
test('both registration routes keep their own clinic payload and registry links', async ({
  page,
}) => {
  await open(page);
  const registry = await page
    .getByRole('link', { name: 'Back to Patients', exact: true })
    .getAttribute('href');
  const clinic = registry.split('/')[2];
  const bodies = [];
  await page.route(endpoint, (route) => {
    bodies.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 400, json: { message: 'Synthetic registration refusal' } });
  });
  for (const route of ['/patients/new', `/clinics/${clinic}/patients/new`]) {
    await open(page, route);
    await fill(page);
    await page.getByRole('button', { name: 'Create patient', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Unable to save' })).toContainText(
      'Synthetic registration refusal',
    );
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic');
    await expect(page.getByRole('link', { name: 'Cancel', exact: true })).toHaveAttribute(
      'href',
      registry,
    );
    await expect(page.getByRole('link', { name: 'Back to Patients', exact: true })).toHaveAttribute(
      'href',
      registry,
    );
  }
  expect(bodies).toHaveLength(2);
  for (const value of bodies) {
    expect(value.url).toContain(`/clinics/${clinic}/patients`);
    expect(value.body).toMatchObject({
      firstName: 'Synthetic',
      lastName: 'Registration',
      sex: 'UNKNOWN',
      nationalIdType: 'OTHER',
      nationalId: 'SYN-R35-ID',
      residentialLocationStatus: 'NOT_RECORDED',
    });
    expect(value.body.dob).toBeUndefined();
  }
});
test('repeated synchronous submits share one pending request and refusal allows retry', async ({
  page,
}) => {
  await open(page);
  await fill(page);
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route(endpoint, async (route) => {
    calls++;
    await gate;
    await route.fulfill({ status: 400, json: { message: 'Synthetic retry allowed' } });
  });
  await page.locator('form').evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: 'Creating...', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('alert', { name: 'Unable to save' })).toContainText(
    'Synthetic retry allowed',
  );
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  await expect.poll(() => calls).toBe(2);
});
test('no-ID payload omits the retained number; duplicate dialog keeps values and recovery', async ({
  page,
}) => {
  await open(page);
  await fill(page);
  let body;
  let conflict = false;
  await page.route(endpoint, (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      status: 409,
      json: conflict
        ? {
            details: {
              existingPatient: {
                id: 'synthetic-existing',
                patientCode: 'SYN-EXISTING',
                firstName: 'Synthetic',
                lastName: 'Existing',
                nationalIdLast4: '0035',
              },
            },
          }
        : { message: 'Synthetic duplicate without details' },
    });
  });
  await choose(page, 'National ID type', 'No ID document');
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Unable to save' })).toContainText(
    'Synthetic duplicate without details',
  );
  expect(body.nationalIdType).toBe('NONE');
  expect(body.nationalId).toBeUndefined();
  await choose(page, 'National ID type', 'National ID');
  await expect(page.getByLabel('National ID', { exact: true })).toHaveValue('SYN-R35-ID');
  conflict = true;
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Patient already exists', exact: true });
  await expect(dialog.getByText('Synthetic Existing', { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Open existing patient', exact: true }),
  ).toHaveAttribute('href', /\/patients\/synthetic-existing$/);
  await dialog.getByRole('button', { name: 'Review details', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic');
  await expect(page.getByLabel('National ID', { exact: true })).toHaveValue('SYN-R35-ID');
});
test('offline registration retains entered fields, reports the connection and can retry', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await fill(page);
  await context.setOffline(true);
  await expect(
    page.getByText('You are offline. Connect to create this patient record.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Unable to save' })).toBeVisible();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic');
  await expect(page).toHaveURL(/\/patients\/new$/);
  await context.setOffline(false);
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 400, json: { message: 'Synthetic connected retry' } }),
  );
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Unable to save' })).toContainText(
    'Synthetic connected retry',
  );
});

test('duplicate recovery actions fit enlarged phone text and return to entered details', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await fill(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 409,
      json: {
        details: {
          existingPatient: {
            id: 'synthetic-existing',
            patientCode: 'SYN-' + '0000000000'.repeat(5),
            firstName: 'Synthetic',
            lastName: 'LongIdentity'.repeat(4),
            nationalIdLast4: '0035',
          },
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Create patient', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Patient already exists', exact: true });
  for (const action of [
    dialog.getByRole('link', { name: 'Open existing patient', exact: true }),
    dialog.getByRole('button', { name: 'Review details', exact: true }),
  ]) {
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport({ ratio: 1 });
  }
  expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  await shot(page, 'registration-duplicate-enlarged');
  await dialog.getByRole('button', { name: 'Review details', exact: true }).click();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Synthetic');
});
