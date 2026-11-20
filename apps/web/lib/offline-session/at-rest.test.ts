import type { DBCore, DBCoreTable } from 'dexie';
import {
  AtRestKeyMissingError,
  atRestMiddleware,
  isSealedRow,
  sealExistingRows,
  setAtRestRequired,
} from './at-rest';
import { dropAllKeys, loadDeviceKeys } from './keys';

type Row = Record<string, unknown> & { id: string };

const INDEXES: Record<string, string[]> = {
  vitals: ['clinicId', 'encounterId', 'updatedAt'],
  portal_cache: ['userId', 'updatedAt'],
  sync_state: [],
};

/**
 * The real middleware over in-memory tables, so `raw` is exactly what IndexedDB would hold. The
 * cursor path and Dexie.waitFor inside a live transaction need a real browser; e2e covers those.
 */
function encryptedDb() {
  const raw = new Map<string, Map<string, Row>>();
  const rawTable = (name: string) => {
    if (!raw.has(name)) raw.set(name, new Map());
    return raw.get(name)!;
  };
  const index = (keyPath: string) => ({ keyPath, extractKey: (row: Row) => row[keyPath] });
  const down = {
    table: (name: string) =>
      ({
        name,
        schema: { name, primaryKey: index('id'), indexes: (INDEXES[name] ?? []).map(index) },
        mutate: async (req: { values: Row[] }) => {
          req.values.forEach((value) => rawTable(name).set(value.id, structuredClone(value)));
          return { numFailures: 0, failures: [], results: [] };
        },
        get: async (req: { key: string }) => structuredClone(rawTable(name).get(req.key)),
        getMany: async (req: { keys: string[] }) =>
          req.keys.map((key) => structuredClone(rawTable(name).get(key))),
        query: async () => ({
          result: [...rawTable(name).values()].map((row) => structuredClone(row)),
        }),
      }) as unknown as DBCoreTable,
  } as unknown as DBCore;
  const core = atRestMiddleware.create(down);
  const table = (name: string) => core.table!(name);
  const put = (name: string, row: Row) =>
    table(name).mutate({ type: 'put', values: [row] } as never);
  const read = async (name: string, id: string) =>
    (await table(name).get({ key: id } as never)) as Row | undefined;
  const all = async (name: string) =>
    (await table(name).query({ values: true } as never)).result as Row[];
  const store = {
    tables: [...Object.keys(INDEXES)].map((name) => ({
      name,
      toArray: () => all(name),
      bulkPut: async (rows: Row[]) => {
        await table(name).mutate({ type: 'put', values: rows } as never);
      },
    })),
    transaction: async (_mode: string, _table: unknown, work: () => Promise<void>) => work(),
  };
  return { raw: rawTable, put, read, all, store };
}

const key = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const reading = {
  id: 'vitals-1',
  clinicId: 'clinic-a',
  encounterId: 'encounter-1',
  updatedAt: '2026-11-17T09:00:00.000Z',
  systolic: 142,
  diastolic: 91,
  notes: 'Patient reports headaches',
};

describe('clinical data encrypted at rest (#207)', () => {
  afterEach(() => {
    dropAllKeys();
    setAtRestRequired(false);
  });

  it('stores only the key and indexed fields in the clear, and reads back the whole row', async () => {
    const db = encryptedDb();
    await loadDeviceKeys({ 'clinic:clinic-a': key() });

    await db.put('vitals', reading);

    const stored = db.raw('vitals').get('vitals-1')!;
    expect(Object.keys(stored).sort()).toEqual(
      ['$sealed', 'clinicId', 'encounterId', 'id', 'updatedAt'].sort(),
    );
    // A leaked value shows up as a JSON value or field name. A bare /142|91/ also matched digits
    // inside the base64 ciphertext by chance and failed now and then on correct encryption.
    expect(JSON.stringify(stored)).not.toMatch(/:(142|91)[,}]|systolic|diastolic|headaches/);
    expect(await db.read('vitals', 'vitals-1')).toEqual(reading);
    expect(await db.all('vitals')).toEqual([reading]);
  });

  it('reads a row as sealed once its key leaves memory, and never as plaintext', async () => {
    const db = encryptedDb();
    const clinicKey = key();
    await loadDeviceKeys({ 'clinic:clinic-a': clinicKey });
    await db.put('vitals', reading);

    dropAllKeys();
    const locked = await db.read('vitals', 'vitals-1');
    expect(isSealedRow(locked)).toBe(true);
    expect(locked).not.toHaveProperty('systolic');

    await loadDeviceKeys({ 'clinic:clinic-a': clinicKey });
    expect(await db.read('vitals', 'vitals-1')).toEqual(reading);
  });

  it('does not open a row under another clinic’s key, even when the row is moved there', async () => {
    const db = encryptedDb();
    await loadDeviceKeys({ 'clinic:clinic-a': key(), 'clinic:clinic-b': key() });
    await db.put('vitals', reading);

    const stored = db.raw('vitals').get('vitals-1')!;
    db.raw('vitals').set('vitals-1', { ...stored, clinicId: 'clinic-b' });
    expect(isSealedRow(await db.read('vitals', 'vitals-1'))).toBe(true);

    // Copied to another id in the same clinic: also refused.
    db.raw('vitals').set('vitals-2', { ...stored, id: 'vitals-2' });
    expect(isSealedRow(await db.read('vitals', 'vitals-2'))).toBe(true);
  });

  it('refuses a write without its key when encryption is required, instead of storing plaintext', async () => {
    const db = encryptedDb();
    setAtRestRequired(true);
    await expect(db.put('vitals', reading)).rejects.toBeInstanceOf(AtRestKeyMissingError);
    expect(db.raw('vitals').size).toBe(0);
  });

  it('writes as before with the feature off and no key', async () => {
    const db = encryptedDb();
    await db.put('vitals', reading);
    expect(db.raw('vitals').get('vitals-1')).toEqual(reading);
  });

  it('encrypts a patient’s portal copy under their own key, never a clinic’s', async () => {
    const db = encryptedDb();
    await loadDeviceKeys({ 'clinic:clinic-a': key() });
    setAtRestRequired(true);
    const copy = { id: 'k', userId: 'patient-1', clinicId: 'clinic-a', data: { bp: '142/91' } };
    await expect(db.put('portal_cache', copy)).rejects.toBeInstanceOf(AtRestKeyMissingError);

    await loadDeviceKeys({ 'user:patient-1': key() });
    await db.put('portal_cache', copy);
    expect(JSON.stringify(db.raw('portal_cache').get('k'))).not.toContain('142');
    expect(await db.read('portal_cache', 'k')).toEqual(copy);
  });

  it('leaves tables with nothing clinical alone', async () => {
    const db = encryptedDb();
    setAtRestRequired(true);
    await db.put('sync_state', { id: 'clinic-a', cursor: 'c1' });
    expect(db.raw('sync_state').get('clinic-a')).toEqual({ id: 'clinic-a', cursor: 'c1' });
  });

  it('encrypts rows already on the device once their key arrives, and leaves the rest', async () => {
    const db = encryptedDb();
    await db.put('vitals', reading);
    await db.put('vitals', { ...reading, id: 'vitals-b', clinicId: 'clinic-b' });

    await loadDeviceKeys({ 'clinic:clinic-a': key() });
    await sealExistingRows(db.store as never);

    expect(isSealedRow(db.raw('vitals').get('vitals-1'))).toBe(true);
    expect(db.raw('vitals').get('vitals-b')).toMatchObject({ systolic: 142 });
    expect(await db.read('vitals', 'vitals-1')).toEqual(reading);
  });

  it('ignores a malformed key from the server rather than loading it', async () => {
    await loadDeviceKeys({ 'clinic:clinic-a': btoa('short'), 'dek:user-1': key() });
    const db = encryptedDb();
    setAtRestRequired(true);
    await expect(db.put('vitals', reading)).rejects.toBeInstanceOf(AtRestKeyMissingError);
  });
});
