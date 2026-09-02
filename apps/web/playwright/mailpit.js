/**
 * Mailpit helpers.
 *
 * Two suites now assert on real mail — Keycloak's password reset and the app's own
 * portal invite — and they poll the same inbox in the same way. Kept here rather than
 * copied so a change to the Mailpit API is a single edit.
 */
const mailpitBaseUrl = process.env.MAILPIT_BASE_URL || 'http://localhost:8025';

async function mailpitFetch(path, options) {
  const response = await fetch(`${mailpitBaseUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`Mailpit request failed (${response.status} ${response.statusText})`);
  }
  return response;
}

async function clearMailpitInbox() {
  await mailpitFetch('/api/v1/messages', { method: 'DELETE' });
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
