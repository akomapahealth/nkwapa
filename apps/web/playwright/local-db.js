/**
 * The rows of one local table as the app reads them (#207).
 *
 * Clinical rows are encrypted at rest, so reading IndexedDB directly sees ciphertext. E2E builds
 * (NEXT_PUBLIC_E2E_DB_HANDLE=true) expose the app's own Dexie instance, which decrypts with the
 * keys the signed-in session holds. To prove something is NOT stored readable, read IndexedDB
 * directly instead, as clinician-plan.spec.js does.
 */
async function readLocalTable(page, table) {
  await page.waitForFunction(() => Boolean(window.__nkwapaDb), null, { timeout: 30_000 });
  return page.evaluate((name) => window.__nkwapaDb.table(name).toArray(), table);
}

module.exports = { readLocalTable };
