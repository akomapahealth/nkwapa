/**
 * Wait until the offline queue has drained.
 *
 * Waiting for a `/sync/push` response is not the same as waiting for a particular change to reach
 * the server. `syncNow` coalesces concurrent callers and reruns, so the response a test catches may
 * belong to an earlier pass that predates the change it just made. That race is what made the
 * offline round-trip specs intermittent.
 *
 * Reading the queue directly answers the question the tests actually mean: is this change still
 * waiting to be sent?
 */
async function readOutboxRows(page, clinicId) {
  return page.evaluate(
    ({ clinic }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('NkwapaDb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('outbox')) {
            db.close();
            resolve([]);
            return;
          }
          const store = db.transaction('outbox', 'readonly').objectStore('outbox');
          const all = store.getAll();
          all.onerror = () => {
            db.close();
            reject(all.error);
          };
          all.onsuccess = () => {
            db.close();
            resolve(all.result.filter((row) => !clinic || row.clinicId === clinic));
          };
        };
      }),
    { clinic: clinicId ?? null },
  );
}

/** What is queued, by identity only. `clinicId` narrows it to one clinic. */
async function readOutbox(page, clinicId) {
  return (await readOutboxRows(page, clinicId)).map((row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
  }));
}

async function outboxCount(page, clinicId) {
  return (await readOutboxRows(page, clinicId)).length;
}

const { apiRequestAs } = require('./api-client');

const userIds = new Map();

/** The id the API knows an e2e identity by, for stamping it as a queued change's owner. */
async function userIdFor(role) {
  if (!userIds.has(role)) {
    const res = await apiRequestAs(role, 'get', '/auth/whoami');
    if (!res.ok()) throw new Error(`whoami failed for ${role}: ${res.status()}`);
    userIds.set(role, res.json().userId);
  }
  return userIds.get(role);
}

/**
 * Write straight into the device outbox, as an older client or a long offline session would.
 *
 * Only the account that queued a change sends it (#162), so a row is stamped as the signed-in
 * identity's (`owner`, default `staff`) unless it names an owner itself. `owner: null` writes a row
 * with no owner, as a device would hold from before owners were recorded. Returns the stored row.
 */
async function queueOfflineChange(page, row, { owner = 'staff' } = {}) {
  const record =
    'ownerUserId' in row || owner === null ? row : { ...row, ownerUserId: await userIdFor(owner) };
  // A visible dashboard and an active service worker do not mean Dexie has finished opening its
  // schema. Opening NkwapaDb ourselves first would create an empty v1 database with no outbox.
  await page.waitForFunction(
    async () =>
      (await indexedDB.databases()).some(
        (entry) => entry.name === 'NkwapaDb' && (entry.version ?? 0) >= 14,
      ),
    null,
    { timeout: 30_000 },
  );
  // A long Playwright run can make Chromium collect the promise returned by an async
  // page.evaluate before an IndexedDB callback fires. Start the write synchronously, retain
  // its requests on the page until settled, and poll from Node for the transaction result.
  await page.evaluate((row) => {
    const state = { status: 'pending', error: null, request: null, db: null, transaction: null };
    window.__nkwapaE2EOutboxWrite = state;
    const fail = (error) => {
      state.error = error?.message || String(error);
      state.status = 'error';
      state.db?.close();
    };
    const request = indexedDB.open('NkwapaDb');
    state.request = request;
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      try {
        const db = request.result;
        state.db = db;
        const transaction = db.transaction('outbox', 'readwrite');
        state.transaction = transaction;
        transaction.oncomplete = () => {
          db.close();
          state.status = 'done';
        };
        transaction.onerror = () => fail(transaction.error);
        transaction.onabort = () => fail(transaction.error);
        transaction.objectStore('outbox').put(row);
      } catch (error) {
        fail(error);
      }
    };
  }, record);
  await page.waitForFunction(() => window.__nkwapaE2EOutboxWrite?.status !== 'pending', null, {
    timeout: 15_000,
  });
  const outcome = await page.evaluate(() => {
    const { status, error } = window.__nkwapaE2EOutboxWrite;
    delete window.__nkwapaE2EOutboxWrite;
    return { status, error };
  });
  if (outcome.status !== 'done')
    throw new Error(`Failed to queue offline change: ${outcome.error}`);
  return record;
}

/** The next `/sync/push` response. Pair with `waitForOutboxDrain` when the change itself matters. */
function waitForPush(page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/sync/push',
  );
}

/**
 * Wait until nothing of `entityType` is queued any more.
 *
 * Scoped to one entity type on purpose: some specs deliberately leave a permanently rejected row
 * in the queue, and waiting for a completely empty outbox would never succeed alongside them.
 */
async function waitForOutboxDrain(page, expect, { entityType, clinicId, timeout = 60_000 } = {}) {
  await expect
    .poll(
      async () => {
        const rows = await readOutbox(page, clinicId);
        return entityType
          ? rows.filter((row) => row.entityType === entityType).length
          : rows.length;
      },
      { timeout, message: `queued ${entityType ?? 'change'} never synced` },
    )
    .toBe(0);
}

module.exports = {
  userIdFor,
  outboxCount,
  queueOfflineChange,
  readOutbox,
  readOutboxRows,
  waitForOutboxDrain,
  waitForPush,
};
