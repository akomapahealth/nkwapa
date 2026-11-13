const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');
const { prepare, ready } = require('../playwright/device-matrix.cjs');
const { tabTo, keyboardDialog } = require('../playwright/clinical-keyboard.cjs');

test.use({ storageState: storageStateFor('staff') });

test('R8.7 clinical forms and note confirmation work by keyboard', async ({ page }) => {
  test.setTimeout(240_000);
  await prepare(page, 'light');
  await page.goto('/patients/new');
  await ready(page);
  const first = page.getByLabel('First name', { exact: true });
  await tabTo(page, first);
  await page.keyboard.type('Keyboard');
  const suffix = randomUUID().slice(0, 8);
  await tabTo(page, page.getByLabel('Last name', { exact: true }));
  await page.keyboard.type(`R87-${suffix}`);
  await tabTo(page, page.getByLabel('National ID', { exact: true }));
  await page.keyboard.type(`R87-${suffix}`);
  await tabTo(page, page.getByRole('button', { name: 'Create patient', exact: true }));
  await page.keyboard.press('Enter');
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
  for (const [tab, action] of [
    ['Vitals', 'Save measurements'],
    ['Hypertension', 'Save assessment'],
    ['Diabetes', 'Save screening'],
  ]) {
    const trigger = page.getByRole('tab', { name: tab, exact: true });
    await tabTo(page, trigger);
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-selected', 'true');
    if (tab === 'Vitals') {
      const pulse = page.getByLabel('Pulse (bpm)', { exact: true });
      await tabTo(page, pulse);
      await page.keyboard.type('72');
      await expect(pulse).toHaveValue('72');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
    } else {
      const rail = page.getByRole('navigation', { name: `${tab} interview` });
      const sections = await rail.getByRole('button').count();
      for (let i = 0; i < sections; i++) {
        await tabTo(page, rail.getByRole('button').nth(i));
        await page.keyboard.press('Enter');
        await expect(rail.getByRole('button').nth(i)).toHaveAttribute('aria-current', 'step');
      }
    }
    const save = page.getByRole('button', { name: action, exact: true });
    await tabTo(page, save);
    expect(
      await save.evaluate((el) => {
        const s = getComputedStyle(el);
        return (
          (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
        );
      }),
    ).toBe(true);
    // Includes conditional interview widgets that the read-only route fixture may not expose.
    const axe = await new AxeBuilder({ page }).analyze();
    expect.soft(axe.violations, tab).toEqual([]);
  }
  const note = page.getByRole('tab', { name: 'Clinical note', exact: true });
  await tabTo(page, note);
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'Start HAP note', exact: true }));
  await page.keyboard.press('Enter');
  for (const label of ['History', 'Assessment', 'Plan']) {
    await tabTo(page, page.getByLabel(label, { exact: true }));
    await page.keyboard.type(`Synthetic keyboard ${label.toLowerCase()}.`);
  }
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await keyboardDialog(
    page,
    page.getByRole('button', { name: 'Sign note', exact: true }),
    'Submit this HAP note?',
    'Continue',
  );
  await expect(page.getByText('Cosigned', { exact: true })).toBeVisible();
});
