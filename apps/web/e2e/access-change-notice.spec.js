const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const { apiRequestAs } = require('../playwright/api-client');

/*
  "Your access has changed" (#329).

  An administrator gives the seeded volunteer a second role and takes it away again. Each time the
  volunteer is told once, in the app, on their next page load: what changed, who did it and what
  they can do now. The volunteer ends as they started, so other specs are unaffected.
*/
test.describe.configure({ mode: 'serial' });
test.use({ storageState: storageStateFor('volunteer') });

let clinicId;
let volunteerId;

const roleRequest = (method, role = 'DOCTOR') =>
  apiRequestAs('staff', method, `/admin/users/${volunteerId}/roles`, {
    clinicId,
    ...(method === 'post' ? { data: { clinicId, role } } : { params: { clinicId, role } }),
  });

/** Put the volunteer back as seeded, whatever a test or a dead run left behind. */
async function restoreVolunteer() {
  await roleRequest('delete');
  // Granting a role already held changes nothing and announces nothing.
  await roleRequest('post', 'VOLUNTEER');
  await apiRequestAs('volunteer', 'post', '/me/notifications/read', { data: {} });
}

test.beforeAll(async () => {
  const whoami = (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json();
  volunteerId = whoami.userId;
  clinicId = whoami.activeClinicId;
  await restoreVolunteer();
});

test.afterAll(restoreVolunteer);

test('a granted role is announced once, with what it lets them do', async ({ page }) => {
  expect((await roleRequest('post')).status()).toBe(201);

  await page.goto('/dashboard');
  const notice = page.getByRole('dialog', { name: 'Your access has changed' });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice.getByText(/you now have the doctor role at/i)).toBeVisible();
  await expect(notice.getByText(/added by e2e staff/i)).toBeVisible();
  // A doctor reviews and co-signs; a volunteer alone does not.
  await expect(notice.getByText(/review visits and co-sign notes/i)).toBeVisible();
  await expect(
    notice.getByRole('button', { name: /this is a mistake, message them/i }),
  ).toBeVisible();

  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(notice).toHaveCount(0);

  // Told once: it does not come back, and it is kept in the bell's list as read.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(notice).toHaveCount(0);
  await page.goto('/account');
  await expect(page.getByText(/what you can do at/i)).toBeVisible();
});

test('a removed role is announced too, though they no longer hold it', async ({ page }) => {
  expect((await roleRequest('delete')).ok()).toBe(true);

  await page.goto('/dashboard');
  const notice = page.getByRole('dialog', { name: 'Your access has changed' });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice.getByText(/your doctor role at .* was removed/i)).toBeVisible();
  await expect(notice.getByText(/removed by e2e staff/i)).toBeVisible();
  await expect(notice.getByText(/review visits and co-sign notes/i)).toHaveCount(0);

  // Questioning it opens a chat with the administrator who made the change.
  await notice.getByRole('button', { name: /this is a mistake, message them/i }).click();
  await expect(notice).toHaveCount(0);
  const chat = page.getByTestId('chat-panel');
  await expect(chat).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(chat.getByText('E2E Staff').first()).toBeVisible();
});

test('losing the last role still tells them, and says they have no access left', async ({
  page,
}) => {
  expect((await roleRequest('delete', 'VOLUNTEER')).ok()).toBe(true);

  await page.goto('/dashboard');
  const notice = page.getByRole('dialog', { name: 'Your access has changed' });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice.getByText(/your volunteer role at .* was removed/i)).toBeVisible();
  await expect(notice.getByText(/removed by e2e staff/i)).toBeVisible();
  await expect(notice.getByText(/you no longer have access to any clinic/i)).toBeVisible();
  // With no role there is no chat to open, so the offer is not made.
  await expect(notice.getByRole('button', { name: /message them/i })).toHaveCount(0);
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(notice).toHaveCount(0);
});
