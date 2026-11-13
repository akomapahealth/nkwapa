const { randomUUID } = require('crypto');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const {
  WIDTHS,
  THEMES,
  INPUTS,
  prepare,
  ready,
  record,
  reachable,
  requireAuditDatabase,
} = require('../playwright/device-matrix.cjs');

test.beforeAll(() => requireAuditDatabase());

async function matrix(page, info, name, { field, value, action } = {}) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    if (field) await expect(field).toHaveValue(value);
    await page.evaluate(() => scrollTo(0, 0));
    await record(page, info, `${name}-${width}`);
    if (action) await reachable(action);
  }
  for (const width of [320, 600, 840, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
      scrollTo(0, 0);
    });
    await record(page, info, `${name}-text200-${width}`);
    if (action) await reachable(action);
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  await page.setViewportSize({ width: 744, height: 360 });
  if (action) await reachable(action);
  await record(page, info, `${name}-landscape`);
  await page.setViewportSize({ width: 1440, height: 900 });
}

for (const input of INPUTS)
  for (const theme of THEMES) {
    test.describe(`staff forms ${input} ${theme}`, () => {
      test.use({ storageState: storageStateFor('staff'), hasTouch: input === 'touch' });
      test('R8.2 registration, encounter tabs and interviews retain entry', async ({
        page,
      }, info) => {
        test.setTimeout(240_000);
        await prepare(page, theme);
        await page.goto('/patients/new');
        await ready(page);
        const first = page.getByLabel('First name', { exact: true });
        await first.fill('Synthetic');
        await page
          .getByLabel('Last name', { exact: true })
          .fill(`Matrix-${randomUUID().slice(0, 8)}`);
        await matrix(page, info, `registration-${input}-${theme}`, {
          field: first,
          value: 'Synthetic',
          action: page.getByRole('button', { name: 'Create patient', exact: true }),
        });
        // A fresh synthetic encounter ensures editable forms, rather than claiming a locked
        // fixture's read-only rendering covered data entry. Never use this spec outside audit DB.
        await page.getByRole('button', { name: 'Create patient', exact: true }).click();
        await page.waitForURL(/\/clinics\/[^/]+\/patients\/[^/]+$/);
        const patientId = page.url().split('/').at(-1);
        const created = page.waitForResponse(
          (r) => r.request().method() === 'POST' && /\/encounters$/.test(new URL(r.url()).pathname),
        );
        await page.goto(`/patients/${patientId}/encounters/new`);
        const response = await created;
        expect(response.ok()).toBe(true);
        const encounterId = (await response.json()).id;
        await page.goto(`/encounters/${encounterId}`);
        await ready(page);
        for (const [tab, save] of [
          ['Vitals', 'Save measurements'],
          ['Hypertension', 'Save assessment'],
          ['Diabetes', 'Save screening'],
        ]) {
          await page.getByRole('tab', { name: tab, exact: true }).click();
          await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute(
            'aria-selected',
            'true',
          );
          const action = page.getByRole('button', { name: save, exact: true });
          await expect(action).toBeVisible();
          await matrix(page, info, `${tab.toLowerCase()}-${input}-${theme}`, { action });
          if (tab !== 'Vitals') {
            // Cover every section, including Review, without Next's autosave or clinical writes.
            const rail = page.getByRole('navigation', { name: `${tab} interview` });
            const sections = await rail.getByRole('button').count();
            for (let i = 0; i < sections; i++) {
              await rail.getByRole('button').nth(i).click();
              for (const width of [320, 840, 1440]) {
                await page.setViewportSize({ width, height: 900 });
                await record(
                  page,
                  info,
                  `${tab.toLowerCase()}-section${i}-${input}-${theme}-${width}`,
                );
                await reachable(action);
              }
            }
          }
        }
        // Conditional care-plan/finalization controls are explicitly outside this draft fixture.
        const fixtures = JSON.parse(fs.readFileSync(process.env.AUDIT_FIXTURES, 'utf8'));
        await page.goto(`/stations/visits/${fixtures.visitId}`);
        await ready(page);
        await matrix(page, info, `station-visit-${input}-${theme}`);
      });
    });
    test.describe(`portal forms ${input} ${theme}`, () => {
      test.use({ storageState: storageStateFor('patient'), hasTouch: input === 'touch' });
      test('R8.2 self-report and appointment drafts survive all boundaries', async ({
        page,
      }, info) => {
        test.setTimeout(180_000);
        await prepare(page, theme);
        for (const [route, name, label] of [
          ['/portal/self-reports/new', 'self-report', 'Notes'],
          ['/portal/appointments/request', 'appointment', 'Anything else your clinic should know?'],
        ]) {
          await page.goto(route);
          await ready(page);
          const field = page.getByLabel(label, { exact: true });
          await field.fill('Synthetic retained device-matrix draft');
          await matrix(page, info, `${name}-${input}-${theme}`, {
            field,
            value: 'Synthetic retained device-matrix draft',
            action: page.locator('main button[type="submit"]'),
          });
        }
      });
    });
  }
