const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('claimant') });

/**
 * Claiming a patient record, as the patient.
 *
 * The one identity workflow nobody walks a patient through: no staff member beside them, no clinic
 * able to see what they saw. It also hands over a whole medical record, so every check here is
 * either "the right person gets in" or "the wrong person is turned away with something they can
 * act on".
 *
 * This needed an identity the suite did not have. `patient` is seeded already linked to a record,
 * and `SyncWithAuth` redirects any account holding a record away from /claim-record -- so the page
 * could not be reached at all. `claimant` is that same patient one step earlier: invited, no link,
 * no roles. `SEED_SAMPLE_IDENTITY` stages it and puts it back to unclaimed on every seed, because
 * a successful claim is not reversible from the product.
 *
 * Order matters in this file. The refusals run first and change nothing; the successful claim runs
 * last because it consumes the invitation and links the account for good.
 */

const CLAIMABLE_DOB = '1993-08-19';

const patientCodeField = (page) => page.getByRole('textbox', { name: 'Patient code', exact: true });
const dobField = (page) => page.getByLabel('Date of birth');

/** The claim form, with the patient code the invitation is for. */
async function openClaimForm(page) {
  await page.goto('/claim-record');
  await expect(
    page.getByRole('heading', { name: /claim your existing patient record/i }),
  ).toBeVisible({
    timeout: 30_000,
  });

  // Role-scoped, not getByLabel: the invitation radio's accessible name contains "Patient code
  // on file: NKP-...", so a substring match on the label resolves to two elements.
  const code = patientCodeField(page);
  await expect(code).toBeVisible({ timeout: 30_000 });
  // The invitation names the record, and the form offers its code as the placeholder. Reading it
  // rather than hard-coding one keeps the spec working against any seeded database.
  const patientCode = await code.getAttribute('placeholder');
  expect(patientCode).toMatch(/^NKP-\d{4}-\d{6}$/);

  return { patientCode };
}

async function submitClaim(page, { patientCode, dob }) {
  await patientCodeField(page).fill(patientCode);
  await dobField(page).fill(dob);
  await page.getByRole('button', { name: /claim patient record/i }).click();
}

test.describe('a patient holding an invitation', () => {
  test('is routed to the claim page and told which record it is for', async ({ page }) => {
    /*
      Not a redirect the spec asks for: an account with no roles and a live invitation is *held*
      on this route by SyncWithAuth. Landing anywhere else means claim onboarding stopped being
      computed, which strands every newly invited patient on a screen they have no access to.
    */
    await page.goto('/dashboard');
    await page.waitForURL(/\/claim-record/, { timeout: 30_000 });

    await expect(
      page.getByRole('heading', { name: /claim your existing patient record/i }),
    ).toBeVisible();
    await expect(page.getByText(/verify your record/i)).toBeVisible();
  });

  test('is refused a patient code belonging to another record, and told what to check', async ({
    page,
  }) => {
    await openClaimForm(page);
    await submitClaim(page, { patientCode: 'NKP-2026-999999', dob: CLAIMABLE_DOB });

    await expect(page.getByText(/patient code does not match/i)).toBeVisible({ timeout: 30_000 });
    // The recovery, on its own line. A refusal a patient cannot act on ends with them phoning a
    // clinic that cannot see what they saw.
    await expect(page.getByText(/check the code on your patient card/i)).toBeVisible();
    // Still on the form, still unclaimed.
    await expect(page.getByRole('button', { name: /claim patient record/i })).toBeVisible();
  });

  test('is refused a date of birth that does not match, separately from the code', async ({
    page,
  }) => {
    const { patientCode } = await openClaimForm(page);
    await submitClaim(page, { patientCode, dob: '1980-01-01' });

    await expect(page.getByText(/date of birth does not match/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/as the clinic recorded it/i)).toBeVisible();
    /*
      The two refusals are distinct on purpose. A single "those details are wrong" would be kinder
      to write and worse to act on, and telling the patient which half to re-check is the whole
      difference between fixing it themselves and calling the clinic.
    */
    await expect(page.getByText(/patient code does not match/i)).toHaveCount(0);
  });

  test('reads without accessibility violations', async ({ page }) => {
    await openClaimForm(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('is operable by keyboard, and offers a way past the header', async ({ page }) => {
    await openClaimForm(page);

    // The skip link is the first thing in the tab order and hidden until focused. This route
    // renders outside both app shells, so it had neither a skip link nor a main landmark.
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /skip to main content/i });
    await expect(skip).toBeFocused();
    await expect(page.locator('#main-content')).toBeVisible();

    await patientCodeField(page).focus();
    await page.keyboard.type('NKP-2026-999999');
    await page.keyboard.press('Tab');
    await expect(dobField(page)).toBeFocused();
  });

  test('reads at every supported width', async ({ page }) => {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await openClaimForm(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });

  /*
    Last, and only once.

    A successful claim links the account, stamps portalUserId, grants a PATIENT role and settles
    the invitation, none of which the product can undo. Every test above runs against an unclaimed
    account, so this one goes at the end; `SEED_SAMPLE_IDENTITY` puts it all back on the next seed.
  */
  test('claims the record and lands in the portal', async ({ page }) => {
    const { patientCode } = await openClaimForm(page);
    await submitClaim(page, { patientCode, dob: CLAIMABLE_DOB });

    await page.waitForURL(/\/portal/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /your care snapshot/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    // And the claim route stops being this account's home, because it now holds a record.
    await page.goto('/claim-record');
    await page.waitForURL((url) => !url.pathname.startsWith('/claim-record'), { timeout: 30_000 });
  });
});
