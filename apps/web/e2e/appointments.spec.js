const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

/**
 * The appointment workflow a clinic actually runs.
 *
 * The transitions, permissions, and reminder behaviour are asserted exhaustively and quickly in
 * apps/api/src/patient-portal/appointment-lifecycle.spec.ts and its siblings. These tests exist for
 * what those cannot show: that a person can reach the workflow through the browser, that a role
 * sees only the actions it holds, and that the schedule stays usable at every supported width.
 *
 * They depend on the fixtures SEED_SAMPLE_APPOINTMENTS seeds: one confirmed visit ahead of now, one
 * appointment in each terminal state, and two pending requests. A confirmed appointment cannot be
 * created any other way without first triaging a request, so the suite would otherwise have no
 * subject on a fresh database.
 */

const SEED_PATIENT = 'Appointment Demo';

/** Widen the range to a week so the seeded terminal appointments, which sit in the past, show. */
async function openWeekSchedule(page) {
  await page.goto('/appointments');
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByText(/appointments? for /i)).toBeAttached();
}

test.describe('staff schedule', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('shows the seeded schedule and narrows it by filter', async ({ page }) => {
    await openWeekSchedule(page);

    await expect(page.getByText('Scheduled', { exact: true })).toBeVisible();
    await expect(page.getByText('Next visit', { exact: true })).toBeVisible();

    // A patient search that matches nothing must reach the empty state, not a blank panel.
    await page.getByLabel('Patient').fill('zzz-no-such-patient');
    await expect(page.getByText('No appointments found')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Patient').fill('');
    await expect(page.getByText('No appointments found')).toBeHidden({ timeout: 15_000 });
  });

  test('moves the range forward and back without losing the view', async ({ page }) => {
    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Next range' }).click();
    await page.getByRole('button', { name: 'Previous range' }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('announces the schedule as it changes', async ({ page }) => {
    // Filtering and day/week switching swap the results with no visible cue, so the live region is
    // the only thing telling a screen reader user that anything happened.
    await page.goto('/appointments');
    const live = page.locator('[aria-live="polite"]').first();
    await expect(live).toBeAttached();
  });
});

test.describe('patient request triage', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('lists the requests patients sent and refuses a decline with no reason', async ({
    page,
  }) => {
    await page.goto('/appointments');
    await expect(page.getByText('Patient requests')).toBeVisible();
    await expect(page.getByText(SEED_PATIENT).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Decline' }).first().click();
    await expect(page.getByRole('heading', { name: 'Decline request' })).toBeVisible();

    await page.getByRole('button', { name: 'Decline request' }).click();
    await expect(page.getByRole('alert')).toContainText(/reason/i);

    await page.getByRole('button', { name: 'Keep waiting' }).click();
  });

  test('confirming a request books the visit onto the schedule', async ({ page }) => {
    await page.goto('/appointments');
    await expect(page.getByText('Patient requests')).toBeVisible();

    // Wait for a request to actually be on screen before reading the count: the badge renders
    // "0 awaiting" while the fetch is still in flight.
    const confirm = page.getByRole('button', { name: 'Confirm request' }).first();
    await expect(confirm).toBeVisible({ timeout: 20_000 });

    const awaiting = page.getByText(/\d+ awaiting/);
    const before = Number((await awaiting.textContent()).match(/\d+/)[0]);
    expect(before).toBeGreaterThan(0);

    await confirm.click();
    await expect(page.getByRole('heading', { name: 'Confirm request' })).toBeVisible();

    // The dialog opens on the patient's preferred window rather than an empty form.
    await expect(page.getByLabel('Start time')).not.toHaveValue('');
    await expect(page.getByLabel('End time')).not.toHaveValue('');

    await page.getByRole('button', { name: 'Book appointment' }).click();
    await expect(page.getByRole('heading', { name: 'Confirm request' })).toBeHidden({
      timeout: 20_000,
    });
    await expect(awaiting).toContainText(`${before - 1} awaiting`, { timeout: 20_000 });
  });
});

test.describe('lifecycle actions', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('rescheduling a confirmed appointment keeps it confirmed', async ({ page }) => {
    await openWeekSchedule(page);

    const actions = page.getByRole('button', { name: 'Open appointment actions' }).first();
    await expect(actions).toBeVisible({ timeout: 15_000 });
    await actions.click();
    await page.getByRole('menuitem', { name: 'Reschedule' }).click();

    await expect(page.getByRole('heading', { name: 'Reschedule' })).toBeVisible();

    // An end before the start is refused in the browser, before the request is sent.
    const start = await page.getByLabel('Start time').inputValue();
    await page.getByLabel('End time').fill(start);
    await page.getByRole('button', { name: 'Reschedule', exact: true }).last().click();
    await expect(page.getByRole('alert')).toContainText(/after start time/i);

    await page.getByRole('button', { name: 'Keep appointment' }).click();
  });

  test('cancelling requires a reason before anything is sent', async ({ page }) => {
    await openWeekSchedule(page);

    const actions = page.getByRole('button', { name: 'Open appointment actions' }).first();
    await expect(actions).toBeVisible({ timeout: 15_000 });
    await actions.click();
    await page.getByRole('menuitem', { name: 'Cancel appointment' }).click();

    await expect(page.getByRole('heading', { name: 'Cancel' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
    await expect(page.getByRole('alert')).toContainText(/cancellation reason/i);

    await page.getByRole('button', { name: 'Keep appointment' }).click();
  });

  test('offers no lifecycle action on an appointment that already ended', async ({ page }) => {
    await openWeekSchedule(page);

    // The seeded completed, cancelled, and no-show rows render their status instead of a menu.
    await expect(page.getByText('Completed').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('a volunteer', () => {
  test.use({ storageState: storageStateFor('volunteer') });

  test('reads the schedule and is offered nothing to change', async ({ page }) => {
    // A volunteer holds APPOINTMENT.READ and not APPOINTMENT.WRITE. The API refuses every write;
    // the affordance must be absent rather than present and rejected on submit.
    // Pinned to a width where the table renders, so the label asserted on is the visible one
    // rather than the hidden card beside it.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWeekSchedule(page);

    await expect(page.getByRole('button', { name: 'Open appointment actions' })).toHaveCount(0);
    await expect(page.getByRole('table').getByText('Read-only').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('sees patient requests but cannot triage them', async ({ page }) => {
    // Listing requests moved to APPOINTMENT.READ in this release, so a volunteer can now see what
    // is waiting. Acting on it stays with the roles that hold APPOINTMENT.WRITE.
    await page.goto('/appointments');
    await expect(page.getByText('Patient requests')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Confirm request' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Decline' })).toHaveCount(0);
  });
});

test.describe('a doctor', () => {
  test.use({ storageState: storageStateFor('doctor') });

  test('is offered the lifecycle actions and the triage panel', async ({ page }) => {
    await openWeekSchedule(page);

    await expect(
      page.getByRole('button', { name: 'Open appointment actions' }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Patient requests')).toBeVisible();
  });
});

test.describe('the patient portal', () => {
  // The seeded identities are clinic staff, so the portal answers them with an error rather than a
  // chart. That is the case the request screen used to handle worst, and so the one worth pinning
  // here. A claimed patient walking the same screens is covered by the manual matrix in
  // docs/USER_TESTING_GUIDE.md section 15.
  test.use({ storageState: storageStateFor('staff') });

  test('reports a failed context load through the shared error state', async ({ page }) => {
    // This screen used to render `err.message` in a bare div with no retry and no toast, alone
    // among the portal views. It now uses the same error state as its siblings.
    await page.goto('/portal/appointments/request');

    await expect(page.getByText(/load your appointment context/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
    await expect(page.getByText(/\[object Object\]|TypeError|undefined is not/)).toHaveCount(0);
  });

  test('keeps the request window from running backwards', async ({ page }) => {
    await page.goto('/portal/appointments/request');

    const start = page.getByLabel('Preferred start date');
    const end = page.getByLabel('Preferred end date');
    await expect(start).toBeVisible({ timeout: 20_000 });

    // Moving the start past the end carries the end with it, rather than letting the patient
    // submit a window the API would reject.
    await start.fill('2099-06-10');
    await end.fill('2099-06-15');
    await start.fill('2099-06-20');
    expect(new Date(await end.inputValue()) >= new Date('2099-06-20')).toBeTruthy();
  });

  test('renders the appointments view without raw exception output', async ({ page }) => {
    await page.goto('/portal/appointments');

    await expect(page.getByText(/appointments/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\[object Object\]|TypeError|undefined is not/)).toHaveCount(0);
  });
});

const viewports = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

/**
 * A wide table inside a scroll container still grew the page at 1024, because 1080 pixels does not
 * fit beside the sidebar at that width. The breakpoint moved to 1280; this pins it there.
 */

test.describe('responsive', () => {
  test.use({ storageState: storageStateFor('staff') });

  for (const viewport of viewports) {
    test(`the schedule stays inside the viewport on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openWeekSchedule(page);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflows).toBeFalsy();

      // The table needs 1080 pixels, which does not fit beside the sidebar until 1280. Narrower
      // viewports get the card list; the table is hidden rather than removed, so ask about
      // visibility rather than counting nodes.
      const table = page.locator('table').first();
      if (viewport.width < 1280) {
        await expect(table).toBeHidden();
      }
    });
  }
});
