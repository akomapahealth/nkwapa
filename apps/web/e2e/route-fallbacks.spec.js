const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * The three routes #22 left hand-rolling their own loading, empty and error states.
 *
 * Each test here covers a defect that was live, not a missing skeleton. They are written as
 * "what must never happen again" rather than "the new component renders", because the component
 * rendering is not the point -- what the page claims while it does not yet know is.
 */

const BOOTSTRAP_STORAGE_KEY = 'nkwapa:activeClinicId';

/** The active clinic the shell settled on, which is the one these routes read. */
async function activeClinicId(page) {
  await page.goto('/dashboard');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
  const clinicId = await page.evaluate((key) => localStorage.getItem(key), BOOTSTRAP_STORAGE_KEY);
  expect(clinicId, 'the dashboard did not settle on an active clinic').toBeTruthy();
  return clinicId;
}

test('a failed settings read never offers an editable form', async ({ page }) => {
  /*
    The defect this pins: the read failed, `settings` stayed null, `loading` went false, and the
    page rendered the form anyway -- seeded from the literals researchEnabled:false and
    requiresDirectorApproval:true, with Save enabled. A director could switch research off on a
    clinic that had it on, having never once seen the real value.
  */
  await page.route('**/research/settings', async (route) => {
    if (route.request().resourceType() === 'document' || route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Injected failure' }),
    });
  });

  await page.goto('/settings/clinic');

  await expect(page.getByText("We couldn't load this clinic's settings")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();

  // The actual regression: nothing writable may be on screen.
  await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /research enabled for clinic/i })).toHaveCount(0);
});

test('clinic settings only offers to save once something has changed', async ({ page }) => {
  await page.goto('/settings/clinic');

  const save = page.getByRole('button', { name: 'Save settings' });
  await expect(save).toBeVisible({ timeout: 30_000 });
  await expect(save).toBeDisabled();
  await expect(page.getByText('You have unsaved changes.')).toHaveCount(0);

  await page.getByRole('checkbox', { name: /research enabled for clinic/i }).click();

  await expect(save).toBeEnabled();
  await expect(page.getByText('You have unsaved changes.')).toBeVisible();

  // Never saved, so nothing here mutates the clinic for the specs that run after this one.
});

test('a failed export queue read offers a retry and leaves the request form usable', async ({
  page,
}) => {
  const clinicId = await activeClinicId(page);

  await page.route('**/research/exports', async (route) => {
    /*
      Let the page document through.

      The route's own URL ends `/research/exports`, so this glob matches the navigation as well as
      the API call, and fulfilling it served the injected JSON *as the page*. That is what made
      this test fail in a full run and pass on its own -- whether the browser reused a cached
      document decided whether the interception ever saw it.
    */
    if (route.request().resourceType() === 'document' || route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Injected failure' }),
    });
  });

  await page.goto(`/clinics/${clinicId}/research/exports`);

  await expect(page.getByText("We couldn't load the export queue")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();

  /*
    The read failing must not take the rest of the page with it. Requesting an export is a
    different operation against a different endpoint, and it still works.
  */
  await expect(page.getByRole('heading', { name: /request export pack/i })).toBeVisible();
  await expect(page.getByLabel('From date')).toBeEditable();
});

test('claim-record never reports a missing invitation while identity is still loading', async ({
  page,
}) => {
  /*
    The defect this pins: `isLoading` was never read, so during bootstrap `pendingInvites` was []
    and the page told the user "No pending patient invitation was found for this account" -- the
    one sentence guaranteed to make a patient stop and phone the clinic, shown to patients who
    did in fact have an invitation waiting.
  */
  await page.route('**/auth/whoami', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });

  await page.goto('/claim-record');

  /*
    Assert the loading state first: it is what proves the assertion below ran inside the window
    where identity was genuinely still unknown, rather than after the answer had arrived.
  */
  await expect(page.getByText('Looking for your clinic invitation')).toBeVisible();

  // Matches the old copy ("No pending patient invitation was found for this account") as well as
  // the new, so the test measures the behaviour and not this implementation's wording.
  await expect(page.getByText(/no pending/i)).toHaveCount(0);
});

test('an error state on screen passes contrast in light mode', async ({ page }) => {
  /*
    Nothing in this suite used to run axe over a page that was actually reporting an error, which
    is why `text-destructive` on a destructive tint sat below AA in light mode for as long as the
    token contract existed -- 3.99:1 on a /10 tint, on nine surfaces including the allergy banner
    a clinician reads before prescribing. The dark half was found by accident. This is the light
    half's guard, on the cheapest page to drive into an error state deliberately.
  */
  const clinicId = await activeClinicId(page);
  await page.goto(`/clinics/${clinicId}/research/exports`);
  await expect(page.getByRole('heading', { name: /request export pack/i })).toBeVisible({
    timeout: 30_000,
  });

  // End before start: renders the tinted, role="alert" range error without touching the network.
  await page.getByLabel('From date').fill('2026-08-20');
  await page.getByLabel('To date').fill('2026-08-10');
  const rangeError = page.getByRole('alert').filter({ hasText: /end date must be on or after/i });
  await expect(rangeError).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (violation) => `${violation.id} (${violation.nodes.length}) — ${violation.help}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
});
