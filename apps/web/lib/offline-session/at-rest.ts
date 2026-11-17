import Dexie, { type DBCore, type DBCoreTable, type Middleware, type Transaction } from 'dexie';
import { deviceKeyFor, onKeyringChange, openText, sealText, type SealedBlob } from './keys';

/**
 * Clinical data encrypted at rest on the device (#207, R3 option C).
 *
 * Every row of every clinical table (patients, encounters, vitals, screenings, the outbox, the
 * caches...) is written to IndexedDB as its primary key and indexed fields in the clear, and
 * everything else as one AES-GCM ciphertext. Indexes hold ids, clinic ids and timestamps only; the
 * ones that held clinical values were dropped in Dexie v16. Readers never see the difference: this
 * DBCore layer decrypts on the way out and encrypts on the way in, inside the same transaction
 * (Dexie.waitFor keeps IndexedDB from committing while WebCrypto works), so a write is never on
 * disk in plaintext, not even for a moment.
 *
 * Keys come from the server, one per device and clinic (`clinic:<id>`) and one per device and
 * person (`user:<id>`, the patient portal copy), and live in this tab's memory only: fetched on
 * every online sign-in, or opened from an offline grant with the PIN or passkey. A row whose key
 * is not loaded reads as its clear fields plus `$sealed`, and is never sent by sync.
 *
 * With the offline session feature on, a write without its key throws: nothing clinical lands on
 * disk unencrypted. With it off, rows are written as given, as before #207.
 *
 * What this does not stop: while a session is unlocked, the app shows these values and anyone at
 * that screen with devtools can read them, from the page or from memory. It protects a locked or
 * signed-out device, a copied browser profile, and a device someone else picks up.
 *
 * Two rules for later code. A Dexie upgrade function sees encrypted rows as ciphertext, so a
 * migration can only touch clear fields. And `collection.filter(fn).modify()` / `.delete()` match
 * against ciphertext; use `toArray()` and `bulkPut()` / `bulkDelete()` instead.
 */

/** Tables with nothing clinical in them, which must stay readable before any key is loaded. */
const CLEAR_TABLES = new Set(['sync_state', 'device_settings', 'offline_identity']);

export class AtRestKeyMissingError extends Error {
  constructor(readonly table: string) {
    super('This device cannot save clinical data until you sign in again.');
    this.name = 'AtRestKeyMissingError';
  }
}

let required = false;

/** Whether a write without its key must fail rather than land in plaintext. */
export function setAtRestRequired(value: boolean): void {
  required = value;
}

type Row = Record<string, unknown> & { $sealed?: SealedBlob & { v: number; s: string } };

const isRow = (value: unknown): value is Row => !!value && typeof value === 'object';

export function isSealedRow(value: unknown): boolean {
  return isRow(value) && '$sealed' in value;
}

/** Whose key a row is encrypted under. */
export function scopeOf(table: string, row: Row): string | null {
  if (table === 'portal_cache') return typeof row.userId === 'string' ? `user:${row.userId}` : null;
  const clinicId = row.clinicId ?? row.primaryClinicId;
  return typeof clinicId === 'string' && clinicId ? `clinic:${clinicId}` : null;
}

function clearFieldsOf(table: DBCoreTable): string[] {
  const { primaryKey, indexes } = table.schema;
  return [primaryKey, ...indexes]
    .flatMap((index) => (index.keyPath === null ? [] : [index.keyPath]))
    .flat()
    .filter((field, at, all) => all.indexOf(field) === at);
}

const aadFor = (table: string, key: unknown, scope: string) =>
  `nkwapa-at-rest/v1|${table}|${JSON.stringify(key)}|${scope}`;

async function conceal(table: DBCoreTable, clear: string[], row: unknown): Promise<unknown> {
  if (!isRow(row) || isSealedRow(row)) return row;
  const scope = scopeOf(table.name, row);
  const key = scope ? deviceKeyFor(scope) : undefined;
  if (!scope || !key) {
    if (required) throw new AtRestKeyMissingError(table.name);
    return row;
  }
  const kept: Row = {};
  const hidden: Row = {};
  for (const [field, value] of Object.entries(row)) {
    (clear.includes(field) ? kept : hidden)[field] = value;
  }
  const primaryKey = table.schema.primaryKey.extractKey?.(row);
  const blob = await sealText(key, JSON.stringify(hidden), aadFor(table.name, primaryKey, scope));
  return { ...kept, $sealed: { v: 1, s: scope, ...blob } };
}

async function reveal(table: DBCoreTable, row: unknown): Promise<unknown> {
  if (!isRow(row) || !row.$sealed) return row;
  const { $sealed, ...kept } = row;
  // The scope is checked against the row's clear fields, so a row moved to another clinic or
  // person does not open under that clinic's or person's key.
  const scope = scopeOf(table.name, kept);
  const key = scope === $sealed.s ? deviceKeyFor(scope) : undefined;
  if (!key) return row;
  try {
    const primaryKey = table.schema.primaryKey.extractKey?.(kept);
    const hidden = JSON.parse(
      await openText(key, $sealed, aadFor(table.name, primaryKey, $sealed.s)),
    );
    return { ...hidden, ...kept };
  } catch {
    // Another key's, or tampered with: it stays sealed, readable by no one here.
    return row;
  }
}

/** Await WebCrypto without letting the transaction it runs in commit underneath it. */
function inTransaction<T>(trans: Transaction | null, promise: Promise<T>): Promise<T> {
  // Transaction#waitFor is what Dexie.waitFor calls; Dexie's typings just do not list it.
  const waitable = trans as unknown as { waitFor?: (pending: Promise<T>) => Promise<T> } | null;
  return waitable?.waitFor ? waitable.waitFor(promise) : Dexie.waitFor(promise);
}

export const atRestMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'AtRestEncryption',
  create(down) {
    return {
      ...down,
      table(name) {
        const table = down.table(name);
        if (CLEAR_TABLES.has(name)) return table;
        const clear = clearFieldsOf(table);
        const revealAll = (rows: unknown[]) =>
          rows.some(isSealedRow)
            ? Dexie.waitFor(Promise.all(rows.map((row) => reveal(table, row))))
            : Promise.resolve(rows);
        return {
          ...table,
          mutate(req) {
            if (req.type !== 'add' && req.type !== 'put') return table.mutate(req);
            return Dexie.waitFor(
              Promise.all(req.values.map((row) => conceal(table, clear, row))),
            ).then((values) => table.mutate({ ...req, values }));
          },
          get: (req) => table.get(req).then((row) => revealAll([row]).then(([value]) => value)),
          getMany: (req) => table.getMany(req).then(revealAll),
          query: (req) =>
            table
              .query(req)
              .then((res) =>
                req.values ? revealAll(res.result).then((result) => ({ ...res, result })) : res,
              ),
          openCursor: (req) =>
            table.openCursor(req).then((cursor) => {
              if (!cursor) return cursor;
              // IndexedDB calls the cursor back outside Dexie's zone: hold on to the transaction.
              const trans = Dexie.currentTransaction;
              let value: unknown;
              return Object.create(cursor, {
                value: { get: () => value },
                start: {
                  value: (onNext: () => void) =>
                    cursor.start(() => {
                      inTransaction(trans, reveal(table, cursor.value)).then(
                        (revealed) => {
                          value = revealed;
                          onNext();
                        },
                        (error) => cursor.fail(error),
                      );
                    }),
                },
              });
            }),
        };
      },
    };
  },
};

interface SealableStore {
  tables: Dexie.Table[];
  transaction: Dexie['transaction'];
}

/**
 * Encrypt the rows already on the device in plaintext (from before #207, or written with the
 * feature off) for every key now loaded. Each table is read and rewritten in one transaction, so
 * a write landing meanwhile is never overwritten with an older copy. Safe to run repeatedly.
 */
export async function sealExistingRows(store: SealableStore): Promise<void> {
  for (const table of store.tables) {
    if (CLEAR_TABLES.has(table.name)) continue;
    await store.transaction('rw', table, async () => {
      const rows = (await table.toArray()) as Row[];
      const plain = rows.filter((row) => {
        if (isSealedRow(row)) return false;
        const scope = scopeOf(table.name, row);
        return !!scope && !!deviceKeyFor(scope);
      });
      if (plain.length) await table.bulkPut(plain);
    });
  }
}

let running: Promise<void> | null = null;
let again = false;

/** Run a pass now, or once more after the one in flight. Never throws. */
export function requestSealExisting(store: SealableStore): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try {
        await sealExistingRows(store);
      } catch {
        // The next key load tries again; a failed pass leaves every row as it was.
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Encrypt what is already on the device whenever a device key arrives. */
export function startAtRestSealing(store: SealableStore): () => void {
  return onKeyringChange((scope, loaded) => {
    if (loaded && !scope.startsWith('dek:')) void requestSealExisting(store);
  });
}
