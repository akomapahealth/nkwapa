import type { NkwapaDb, OutboxRecord } from './db';
import { emptyEyeForm, eyePayloadFromForm } from './eye-screening';
import { queueEyeScreening, queuedEyeScreening } from './eye-screening-offline';

/** Just enough of the outbox table for these helpers. */
function fakeDb() {
  let rows: OutboxRecord[] = [];
  const outbox = {
    where: () => ({
      equals: (clinicId: string) => ({
        filter: (keep: (row: OutboxRecord) => boolean) => ({
          sortBy: async () =>
            rows
              .filter((row) => row.clinicId === clinicId && keep(row))
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        }),
      }),
    }),
    add: async (row: OutboxRecord) => {
      rows.push(row);
    },
    bulkDelete: async (ids: string[]) => {
      rows = rows.filter((row) => !ids.includes(row.id));
    },
  };
  const instance = {
    outbox,
    transaction: async (_mode: string, _table: unknown, work: () => Promise<void>) => work(),
  } as unknown as NkwapaDb;
  return { instance, rows: () => rows };
}

const payload = (notes: string, version?: number) =>
  eyePayloadFromForm({ ...emptyEyeForm(), notes }, version);

describe('eye examination saved offline (#423)', () => {
  it('keeps one queued save per encounter, the latest, at the version it opened at', async () => {
    const db = fakeDb();
    await queueEyeScreening(db.instance, {
      clinicId: 'clinic-1',
      encounterId: 'enc-1',
      payload: payload('first', 3),
    });
    await queueEyeScreening(db.instance, {
      clinicId: 'clinic-1',
      encounterId: 'enc-1',
      payload: payload('second', 3),
    });

    expect(db.rows()).toHaveLength(1);
    const record = await queuedEyeScreening(db.instance, 'clinic-1', 'enc-1');
    expect(record).toMatchObject({ notes: 'second', version: 3, encounterId: 'enc-1' });
  });

  it('leaves a save the server already refused for the sync center', async () => {
    const db = fakeDb();
    await queueEyeScreening(db.instance, {
      clinicId: 'clinic-1',
      encounterId: 'enc-1',
      payload: payload('refused'),
    });
    db.rows()[0]!.syncState = 'blocked';
    await queueEyeScreening(db.instance, {
      clinicId: 'clinic-1',
      encounterId: 'enc-1',
      payload: payload('again'),
    });

    expect(db.rows()).toHaveLength(2);
    expect(await queuedEyeScreening(db.instance, 'clinic-1', 'enc-1')).toMatchObject({
      notes: 'again',
    });
    expect(await queuedEyeScreening(db.instance, 'clinic-1', 'enc-2')).toBeNull();
  });
});
