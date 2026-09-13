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
