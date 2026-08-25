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
async function readOutbox(page, clinicId) {
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
            resolve(
              all.result
                .filter((row) => !clinic || row.clinicId === clinic)
                .map((row) => ({ id: row.id, entityType: row.entityType, entityId: row.entityId })),
            );
          };
        };
      }),
    { clinic: clinicId ?? null },
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

module.exports = { readOutbox, waitForOutboxDrain };
