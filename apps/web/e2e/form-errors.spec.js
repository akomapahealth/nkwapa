const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

// R7.3: a failed submit moves focus to the field the message is about and announces the message
// (WCAG 3.3.1, 3.3.3). Validation rules and messages are unchanged; only where focus lands.

test.describe('staff', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('registration: an empty submit focuses the first required field and lists the errors', async ({
    page,
  }) => {
    await page.goto('/patients/new');
    await page.getByRole('button', { name: 'Create patient', exact: true }).click();
    await expect(page.getByLabel('First name', { exact: true })).toBeFocused();
    const summary = page.getByRole('alert', { name: 'Unable to save' });
    await expect(summary).toBeVisible();
    await expect(summary.getByRole('link', { name: /^First name/ })).toBeVisible();
    await expect(page.getByLabel('First name', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test("date field: the calendar button draws the house ring, not the browser's", async ({
    page,
  }) => {
    await page.goto('/patients/new');
    const dob = page.getByLabel('Date of birth', { exact: true });
    await dob.focus();
    // Three segments, then Chromium's calendar button.
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
    const state = await dob.evaluate((el) => ({
      focus: el.matches(':focus'),
      within: el.matches(':focus-within'),
      fieldRing: getComputedStyle(el).boxShadow,
      button: getComputedStyle(el, '::-webkit-calendar-picker-indicator').boxShadow,
      outline: getComputedStyle(el, '::-webkit-calendar-picker-indicator').outlineStyle,
    }));
    test.skip(state.focus || !state.within, 'this Chromium has no calendar-button tab stop');
    expect(state.fieldRing).not.toBe('none');
    expect(state.button).not.toBe('none');
    expect(state.outline).toBe('none');
  });
});

test.describe('patient', () => {
  test.use({ storageState: storageStateFor('patient') });

  test('self-report: an out-of-range glucose focuses the field and names the problem', async ({
    page,
  }) => {
    await page.goto('/portal/self-reports/new');
    await page.getByRole('button', { name: /^Glucose/ }).click();
    const field = page.getByRole('spinbutton', { name: /^Glucose/ });
    await field.fill('900');
    await page.getByRole('button', { name: 'Save glucose reading', exact: true }).click();
    const alert = page.locator('#measurement-error');
    await expect(alert).toContainText('Enter a whole number from 0 to 600 mg/dL.');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAttribute('aria-describedby', 'measurement-error');
  });
});
