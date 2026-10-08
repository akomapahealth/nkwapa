const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const { apiRequestAs } = require('../playwright/api-client');
const { queueOfflineChange, readOutboxRows, userIdFor } = require('../playwright/outbox');
const { storageStateFor } = require('../playwright/roles');

/*
  CLN-06, issue #163: a change saved for a clinic other than the active one is never invisible.

  The outbox, the pill and the sync center used to be scoped to the active clinic, and a clinic is
  only pushed while it is active. An account that lost its seat at a clinic was never offered it
  again, so whatever it had queued there sat on the device where nobody could see it.

  The e2e staff identity is a system administrator, so every seeded clinic is open to it: one of
  those stands in for a clinic it can switch to. A clinic id that exists nowhere stands in for one
  it has lost.
*/
test.use({ storageState: storageStateFor('staff') });

const LOST_CLINIC = { clinicId: randomUUID(), clinicName: 'Closed Outreach Clinic' };

function queuedRow(clinic, overrides = {}) {
  return {
    id: randomUUID(),
    clinicId: clinic.clinicId,
    clinicName: clinic.clinicName,
    entityType: 'patient_check_in',
    entityId: randomUUID(),
    operation: 'UPSERT',
    payloadJson: JSON.stringify({
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      patientId: randomUUID(),
    }),
    idempotencyKey: randomUUID(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function recordPushes(page) {
  const pushes = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/sync/push') {
      pushes.push({ clinicId: url.searchParams.get('clinicId'), body: request.postData() ?? '' });
    }
  });
  return pushes;
}

async function openDashboardAndPull(page) {
  const pull = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/sync/pull' && response.ok(),
  );
  await page.goto('/dashboard');
  await pull;
}

async function otherClinic() {
  const whoami = (await apiRequestAs('staff', 'get', '/auth/whoami')).json();
  const other = (whoami.availableClinics ?? []).find(
    (clinic) => clinic.clinicId !== whoami.activeClinicId,
  );
  if (!other) throw new Error('The staff identity needs a second clinic it can open');
  return other;
}

test('a change saved for another open clinic is listed, not pushed, and sent there on switching', async ({
  page,
}) => {
  const clinic = await otherClinic();
  // Settled first: writing to IndexedDB while the app is still starting races its own open.
  await openDashboardAndPull(page);
  const queued = await queueOfflineChange(page, queuedRow(clinic));

  const pushes = recordPushes(page);
  await openDashboardAndPull(page);
  // The active clinic syncs; the other clinic's change goes nowhere.
  expect(pushes.map((push) => push.body).join('\n')).not.toContain(queued.id);
  await expect(page.getByTestId('sync-other-clinics-marker')).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveAttribute(
    'aria-label',
    /1 saved for other clinics/,
  );

  await page.getByTestId('sync-status').click();
  const section = page.getByTestId('sync-other-clinics');
  await expect(section.getByRole('heading', { name: clinic.clinicName })).toBeVisible();
  await expect(section).toContainText('1 change waiting. Switch to this clinic to send them.');

  // Switching makes it the active clinic, and its change goes to it and to no other.
  const pushedThere = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/sync/push' &&
      new URL(request.url()).searchParams.get('clinicId') === clinic.clinicId,
  );
  await section.getByRole('button', { name: `Switch to ${clinic.clinicName}` }).click();
  expect((await pushedThere).postData()).toContain(queued.id);
  for (const push of pushes.filter((entry) => entry.body.includes(queued.id))) {
    expect(push.clinicId).toBe(clinic.clinicId);
  }
});

test('a lost clinic offers only a confirmed discard of this account’s own changes', async ({
  page,
}) => {
  await openDashboardAndPull(page);
  const mine = await queueOfflineChange(page, queuedRow(LOST_CLINIC));
  const doctorId = await userIdFor('doctor');
  const theirs = await queueOfflineChange(
    page,
    queuedRow(LOST_CLINIC, { ownerUserId: doctorId, ownerName: 'E2E Doctor' }),
  );

  const pushes = recordPushes(page);
  await openDashboardAndPull(page);
  expect(pushes.map((push) => push.body).join('\n')).not.toContain(mine.id);

  await page.getByTestId('sync-status').click();
  const card = page
    .getByTestId('sync-other-clinics')
    .locator('article', { hasText: LOST_CLINIC.clinicName });
  await expect(card).toContainText(
    `You no longer have access to ${LOST_CLINIC.clinicName}. This change cannot be sent from this account.`,
  );
  await expect(card).toContainText('1 change saved by another account.');
  await expect(card.getByRole('button', { name: /Switch to/ })).toHaveCount(0);

  // Asks first; keeping them changes nothing.
  await card.getByRole('button', { name: 'Discard 1 change' }).click();
  await page.getByRole('button', { name: 'Keep them' }).click();
  expect(await readOutboxRows(page, LOST_CLINIC.clinicId)).toHaveLength(2);

  await card.getByRole('button', { name: 'Discard 1 change' }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect
    .poll(async () => (await readOutboxRows(page, LOST_CLINIC.clinicId)).map((row) => row.id))
    .toEqual([theirs.id]);
  await expect(card).not.toContainText('cannot be sent from this account');
  await expect(card).toContainText('1 change saved by another account.');
});

for (const theme of ['light', 'dark']) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`the other-clinics section is accessible and holds its layout (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (value) => window.localStorage.setItem('nkwapa-theme', value),
        theme,
      );
      await openDashboardAndPull(page);
      await queueOfflineChange(page, queuedRow(LOST_CLINIC));
      await openDashboardAndPull(page);

      await page.getByTestId('sync-status').click();
      const section = page.getByTestId('sync-other-clinics');
      await expect(section).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const results = await new AxeBuilder({ page })
        .include('[data-testid="sync-other-clinics"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);

      // Keyboard: the discard control is reachable and opens its confirmation.
      const discard = section.getByRole('button', { name: /^Discard / });
      await discard.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Keep them' })).toBeVisible();
    });
  }
}
