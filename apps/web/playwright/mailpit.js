/**
 * Mailpit helpers.
 *
 * Two suites assert on real mail — Keycloak's password reset and the app's own portal invite —
 * and they poll the same inbox in the same way. Kept here rather than copied so a change to the
 * Mailpit API is a single edit.
 *
 * One inbox, shared by every worker. Playwright runs these files on two workers, so anything that
 * touches the whole inbox is acting on state another spec is in the middle of using.
 */
const mailpitBaseUrl = process.env.MAILPIT_BASE_URL || 'http://localhost:8025';

async function mailpitFetch(path, options) {
  const response = await fetch(`${mailpitBaseUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`Mailpit request failed (${response.status} ${response.statusText})`);
  }
  return response;
}

/**
 * Remove the messages a spec is about to assert on, and only those.
 *
 * This used to delete the entire inbox. Mailpit is shared global state and Playwright runs spec
 * files on two workers, so a blanket clear could land between another spec's send and its poll,
 * taking the message it was waiting for. That spec then failed on a timeout naming an email
 * address, thirty seconds from anything that could explain it, and passed on the retry -- so it
 * read as an infrastructure hiccup rather than a race, and surfaced only when a change to the
 * file set happened to pair the two suites on different workers.
 *
 * Scoping by recipient removes the interaction: each suite owns its own address. Deliberately
 * `DELETE /api/v1/search` rather than collecting ids and calling `DELETE /api/v1/messages` --
 * that endpoint treats an empty id list as "delete everything", so a scoped clear that matched
 * nothing would silently become the blanket clear this is replacing.
 */
async function clearMailpitInbox(recipient) {
  if (!recipient) {
    throw new Error(
      'clearMailpitInbox requires a recipient: clearing the whole inbox races other specs.',
    );
  }

  await mailpitFetch(`/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`, {
    method: 'DELETE',
  });
}

/**
 * Wait for a message addressed to `recipient` and return it in full.
 *
 * Polls rather than waiting once: delivery goes through a background queue, so the
 * message is not present the moment the API responds.
 */
async function findMessageTo(recipient, { timeout = 30_000, subjectMatch } = {}) {
  const deadline = Date.now() + timeout;
  const wanted = recipient.toLowerCase();

  while (Date.now() < deadline) {
    const response = await mailpitFetch('/api/v1/messages');
    const payload = await response.json();
    const message = (payload.messages || []).find((candidate) => {
      const addressed = candidate.To?.some(
        (entry) => typeof entry.Address === 'string' && entry.Address.toLowerCase() === wanted,
      );
      if (!addressed) return false;
      return subjectMatch ? subjectMatch.test(candidate.Subject || '') : true;
    });

    if (message) {
      const detail = await mailpitFetch(`/api/v1/message/${message.ID}`);
      return detail.json();
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for an email to ${recipient}`);
}

/** Subject, text and HTML as one searchable string. */
function messageContent(message) {
  return `${message.Subject || ''}\n${message.Text || ''}\n${message.HTML || ''}`;
}

module.exports = {
  mailpitBaseUrl,
  mailpitFetch,
  clearMailpitInbox,
  findMessageTo,
  messageContent,
};
