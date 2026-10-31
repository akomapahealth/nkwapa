const { test, expect } = require('@playwright/test');

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');

/*
  #166: a director schedules research exports, approves the schedule, and runs it now. The run
  publishes to the local provider (playwright.config.js), under a run key, with its counts.

  The `staff` identity is a director: it holds RESEARCH.EXPORT.REQUEST and .APPROVE.
*/

const WIDTHS = [375, 768, 1440];

async function clinicIdFor(role) {
  const whoami = await apiRequestAs(role, 'get', '/auth/whoami');
  return whoami.json().activeClinicId;
}

async function ok(response) {
  expect(response.ok(), `${response.status()}: ${response.text()}`).toBeTruthy();
  return response.json();
}

/** Research on, two consented patients, and no live schedule left from an earlier run. */
async function prepareClinic(clinicId) {
  await ok(
    await apiRequestAs('staff', 'put', `/clinics/${clinicId}/research/settings`, {
      data: { researchEnabled: true, requiresDirectorApprovalEachExport: true },
    }),
  );

  const registry = await ok(await apiRequestAs('staff', 'get', `/clinics/${clinicId}/patients`));
  expect(registry.items.length, 'the e2e clinic needs two patients').toBeGreaterThanOrEqual(2);
  for (const patient of registry.items.slice(0, 2)) {
    await ok(
      await apiRequestAs('staff', 'post', `/clinics/${clinicId}/patients/${patient.id}/consents`, {
        data: {
          consentType: 'RESEARCH_DEIDENTIFIED',
          consentVersion: 'v1-en',
          consentTextSnapshot: 'E2E research consent',
        },
      }),
    );
  }

  const schedules = await ok(
    await apiRequestAs('staff', 'get', `/clinics/${clinicId}/research/schedules`),
  );
  for (const schedule of schedules.items.filter((item) => item.status !== 'REVOKED')) {
    await ok(
      await apiRequestAs(
        'staff',
        'post',
        `/clinics/${clinicId}/research/schedules/${schedule.id}/revoke`,
        { data: { reason: 'Cleared by the research schedules e2e spec' } },
      ),
    );
  }
}

test.describe('as a director', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('schedules, approves and runs a research export', async ({ page }) => {
    test.setTimeout(150_000);
    const clinicId = await clinicIdFor('staff');
    await prepareClinic(clinicId);

    await page.goto(`/clinics/${clinicId}/research/exports`);
    await expect(page.getByRole('heading', { name: /scheduled exports/i })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'New schedule' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Monthly, on the 1st at 03:00/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Create schedule' }).click();
    await expect(dialog).toBeHidden();

    const live = page
      .getByTestId('research-schedule')
      .filter({ hasNot: page.getByText('Revoked', { exact: true }) });
    await expect(live).toHaveCount(1);
    await expect(live.getByText('Waiting for approval')).toBeVisible();

    await live.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('button', { name: 'Approve schedule' }).click();
    await expect(live.getByText('Active', { exact: true })).toBeVisible();
    await expect(live.getByText('Next run')).toBeVisible();

    await live.getByRole('button', { name: 'Run now' }).click();
    await expect(live.getByText('Last run')).toBeVisible({ timeout: 20_000 });

    // The run lands in export activity under an ad-hoc run key, and completes on the worker.
    const runKey = live.getByRole('button', { name: /^Copy run key rx-[0-9a-f]{8}-a\d{8}-/ });
    const key = (await runKey.getAttribute('aria-label')).replace('Copy run key ', '');
    const run = page
      .getByTestId('research-run')
      .filter({ has: page.getByRole('button', { name: `Copy run key ${key}`, exact: true }) })
      .filter({ hasText: 'Download zip' });
    await expect(async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(run.first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    // The count line, not the changes sentence that repeats the number ("First run: ...").
    await expect(
      run.first().getByText(/^\d+ consented patients( · \d+ revoked since the last run)?$/),
    ).toBeVisible();
    await expect(
      run.first().getByText(/^First run: \d+ consented patients?\.$|since rx-/),
    ).toBeVisible();
    await expect(run.first().getByText(/research\/v\d+\/clinic=/)).toBeVisible();

    // The fullest the page gets: it must still fit a phone.
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `research exports scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});

test('a volunteer cannot read or change research schedules', async () => {
  const clinicId = await clinicIdFor('volunteer');
  const list = await apiRequestAs('volunteer', 'get', `/clinics/${clinicId}/research/schedules`);
  expect(list.status()).toBe(403);
  const create = await apiRequestAs(
    'volunteer',
    'post',
    `/clinics/${clinicId}/research/schedules`,
    {
      data: { cadence: 'MONTHLY', dayOfMonth: 1, localHour: 3, coverageStartDate: '2026-01-01' },
    },
  );
  expect(create.status()).toBe(403);
});
