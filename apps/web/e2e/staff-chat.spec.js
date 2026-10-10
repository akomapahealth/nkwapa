const { randomUUID } = require('crypto');
const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });

/**
 * Staff-to-staff messaging, over the socket, which is the only way to send one.
 *
 * `ChatController` exposes no route for sending: `POST conversations`, `GET .../messages` and
 * `POST .../read` are REST, and `message:send` is a WebSocket event. That asymmetry is why issue
 * #118 looked like a UI bug -- the conversation list and the history loaded fine while nothing
 * could be sent, because the realtime path ran outside a tenant context and the FORCE-RLS'd chat
 * tables rejected every write.
 *
 * Nothing tested the socket, which is how it shipped. This asserts the message reaches the server
 * and comes back on a reload, rather than that it appeared optimistically in the sender's own
 * window -- the send path renders optimistically, so an assertion on the bubble alone would have
 * passed against the broken build.
 */
async function openChatWidget(page) {
  await page.goto('/today');
  const opener = page.getByRole('button', { name: 'Open chat' });
  await expect(opener).toBeVisible({ timeout: 30_000 });
  await opener.click();
}

test('a staff message survives the round trip to the server', async ({ page }) => {
  test.setTimeout(120_000);
  const body = `E2E chat ${randomUUID().slice(0, 8)}`;

  await openChatWidget(page);

  // Read the directory the picker is about to render, rather than guessing at a row index.
  const users = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/clinics\/[^/]+\/chat\/users$/.test(new URL(response.url()).pathname),
  );
  await page.getByRole('button', { name: 'New message' }).first().click();
  await expect(page.getByPlaceholder('Search staff...')).toBeVisible();

  const recipients = await (await users).json();
  expect(recipients.length, 'the clinic needs a second staff member to message').toBeGreaterThan(0);

  // Whoever the clinic offers first; the point is the transport, not the recipient.
  await page.getByRole('button', { name: new RegExp(recipients[0].displayName, 'i') }).click();

  const composer = page.getByPlaceholder('Type a message...');
  await expect(composer).toBeVisible();
  await composer.fill(body);
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(page.getByText(body)).toBeVisible();

  /*
    The reload is the assertion that matters.

    The composer renders optimistically, so the bubble appears whether or not the write landed.
    Only a message the server actually stored comes back after a fresh load.
  */
  await page.reload();
  await openChatWidget(page);
  await expect(page.getByText(body)).toBeVisible({ timeout: 30_000 });
});

/**
 * The staff picker is a directory, so it lists only people who can receive a message.
 *
 * It used to return every `UserClinicRole` in the clinic with no role filter, so a portal account
 * given a clinic role would have appeared here.
 */
test('the staff picker offers nobody without chat permission', async ({ page }) => {
  test.setTimeout(120_000);

  const users = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/clinics\/[^/]+\/chat\/users$/.test(new URL(response.url()).pathname),
  );

  await openChatWidget(page);
  await page.getByRole('button', { name: 'New message' }).first().click();

  const listed = await (await users).json();
  expect(Array.isArray(listed)).toBe(true);
  for (const entry of listed) {
    expect(entry.role).not.toBe('PATIENT');
  }
});

/*
  #30: chat between real people, live. Each identity is its own browser session, as on two
  clinic laptops: what one does has to reach the other without a reload.
*/
const { apiRequestAs } = require('../playwright/api-client');

async function whoami(role) {
  return (await apiRequestAs(role, 'get', '/auth/whoami')).json();
}

async function openAs(browser, role) {
  const context = await browser.newContext({ storageState: storageStateFor(role) });
  const page = await context.newPage();
  await openChatWidget(page);
  return { context, page };
}

test('two people chat live: presence, typing and the message, with no reload', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const [staffUser, doctorUser] = await Promise.all([whoami('staff'), whoami('doctor')]);
  const doctor = await openAs(browser, 'doctor');
  const staff = await openAs(browser, 'staff');

  await staff.page.getByRole('button', { name: 'New message' }).first().click();
  await staff.page.getByRole('button', { name: new RegExp(doctorUser.displayName, 'i') }).click();
  // The doctor's chat is open in another session, so the ring and the status say so.
  await expect(staff.page.getByTestId('chat-header-status')).toHaveText('Active now', {
    timeout: 20_000,
  });
  await expect(staff.page.getByTestId('presence-dot').first()).toHaveAttribute(
    'data-online',
    'true',
  );
  await staff.page
    .getByTestId('chat-panel')
    .screenshot({ path: testInfo.outputPath('chat-online.png') });

  // The conversation reaches the doctor's list without a reload, and so does the typing.
  const row = doctor.page
    .getByTestId('chat-conversation-row')
    .filter({ hasText: staffUser.displayName });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await staff.page.getByPlaceholder('Type a message...').pressSequentially('Are you');
  await expect(row).toContainText('is typing', { timeout: 10_000 });

  await row.click();
  const body = `Live ${randomUUID().slice(0, 8)}`;
  await staff.page.getByPlaceholder('Type a message...').fill(body);
  await staff.page.getByRole('button', { name: 'Send message' }).click();
  await expect(doctor.page.getByText(body)).toBeVisible({ timeout: 15_000 });
  // Read while open: going back shows no unread badge for it.
  await doctor.page.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(row).not.toContainText(/^\d+$/);

  // The doctor closes their session: the staff member sees when they were last here.
  await doctor.context.close();
  await expect(staff.page.getByTestId('chat-header-status')).toHaveText(/Last seen/, {
    timeout: 20_000,
  });
  await staff.context.close();
});

test('a group reaches every member live, and a message reaches them all', async ({ browser }) => {
  test.setTimeout(150_000);
  const [doctorUser, volunteerUser] = await Promise.all([whoami('doctor'), whoami('volunteer')]);
  const doctor = await openAs(browser, 'doctor');
  const volunteer = await openAs(browser, 'volunteer');
  const staff = await openAs(browser, 'staff');
  const groupName = `E2E team ${randomUUID().slice(0, 6)}`;

  await staff.page.getByRole('button', { name: 'New group' }).click();
  await staff.page.getByLabel('Group name (optional)').fill(groupName);
  await staff.page.getByRole('checkbox', { name: new RegExp(doctorUser.displayName, 'i') }).click();
  await staff.page
    .getByRole('checkbox', { name: new RegExp(volunteerUser.displayName, 'i') })
    .click();
  await staff.page.getByRole('button', { name: 'Create group with 2' }).click();
  await expect(staff.page.getByTestId('chat-header-status')).toContainText('3 members');

  for (const member of [doctor, volunteer]) {
    await expect(
      member.page.getByTestId('chat-conversation-row').filter({ hasText: groupName }),
    ).toBeVisible({ timeout: 20_000 });
  }

  await doctor.page.getByTestId('chat-conversation-row').filter({ hasText: groupName }).click();
  await volunteer.page.getByTestId('chat-conversation-row').filter({ hasText: groupName }).click();
  const body = `Group ${randomUUID().slice(0, 8)}`;
  await volunteer.page.getByPlaceholder('Type a message...').fill(body);
  await volunteer.page.getByRole('button', { name: 'Send message' }).click();
  await expect(doctor.page.getByText(body)).toBeVisible({ timeout: 15_000 });
  await expect(staff.page.getByText(body)).toBeVisible({ timeout: 15_000 });

  // The members panel names everyone, with who is here.
  await staff.page.getByRole('button', { name: 'Members' }).click();
  await expect(staff.page.getByTestId('chat-members')).toContainText(doctorUser.displayName);

  for (const session of [doctor, volunteer, staff]) await session.context.close();
});

test('a group is only for people who can chat at the clinic', async () => {
  const [staffUser, doctorUser, volunteerUser, patientUser] = await Promise.all(
    ['staff', 'doctor', 'volunteer', 'patient'].map(whoami),
  );
  const clinicId = staffUser.activeClinicId;
  const create = (participantUserIds) =>
    apiRequestAs('staff', 'post', `/clinics/${clinicId}/chat/conversations/group`, {
      clinicId,
      data: { participantUserIds },
    });

  const withPatient = await create([doctorUser.userId, patientUser.userId]);
  expect(withPatient.status()).toBe(403);
  expect(withPatient.json().code).toBe('CHAT_PARTICIPANT_NOT_ELIGIBLE');

  const tooSmall = await create([doctorUser.userId]);
  expect(tooSmall.status()).toBe(400);

  // A group the volunteer is not in cannot be read by them.
  const created = await create([doctorUser.userId, volunteerUser.userId]);
  expect(created.ok(), created.text()).toBeTruthy();
  const conversationId = created.json().id;
  await apiRequestAs(
    'volunteer',
    'post',
    `/clinics/${clinicId}/chat/conversations/${conversationId}/leave`,
    {
      clinicId,
    },
  );
  const read = await apiRequestAs(
    'volunteer',
    'get',
    `/clinics/${clinicId}/chat/conversations/${conversationId}/messages`,
    { clinicId },
  );
  expect(read.status()).toBe(404);
});
