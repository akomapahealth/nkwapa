import {
  OWNER,
  mockSyncFetch,
  pulled,
  pushBodies,
  queuedRow,
  reset,
  type FakeSyncDb,
} from './testing/fake-sync-db';

jest.mock('./db', () => ({
  db: jest.requireActual('./testing/fake-sync-db').createFakeSyncDb(),
}));

import { db as mockedDb } from './db';
import { syncNow } from './sync';

const db = mockedDb as unknown as FakeSyncDb;
const bundle = queuedRow();

beforeEach(async () => {
  reset(db);
  await db.outbox.put(bundle);
});

/**
 * A mutation the server refuses outright used to be invisible: it was neither applied nor treated
 * as a conflict, so it stayed queued and was re-pushed on every sync forever while the pending
 * counter never cleared and nothing told the user why.
 */
describe('sync push rejections', () => {
  const validationFailure = {
    id: bundle.id,
    status: 'ERROR',
    conflictType: 'VALIDATION_ERROR',
    retryable: false,
    conflictDetails: {
      code: 'VALIDATION_ERROR',
      fieldErrors: [
        {
          field: 'vitals.temperatureValue',
          message: 'Temperature value, unit, and source are required together',
        },
      ],
    },
  };

  it('keeps the refused row and records why, so the reason survives a refresh', async () => {
    mockSyncFetch([[validationFailure]]);

    const result = await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    expect(result.rejected).toEqual([
      expect.objectContaining({ id: bundle.id, conflictType: 'VALIDATION_ERROR' }),
    ]);
    expect(result.blockedCount).toBe(1);
    const stored = await db.outbox.get(bundle.id);
    expect(stored).toMatchObject({
      syncState: 'blocked',
      attempts: 1,
      lastFailure: {
        status: 'ERROR',
        conflictType: 'VALIDATION_ERROR',
        retryable: false,
        conflictDetails: validationFailure.conflictDetails,
      },
    });
    expect(stored?.lastFailure).toHaveProperty('at');
  });

  it('still pulls, so one refused change cannot cut the device off from inbound data', async () => {
    const fetchMock = mockSyncFetch([[validationFailure]]);

    const result = await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    expect(result.success).toBe(true);
    expect(pulled(fetchMock)).toBe(true);
    expect((await db.sync_state.get(bundle.clinicId))?.cursor).toBe('cursor-1');
  });

  it('does not re-send a blocked change until the clinician asks', async () => {
    mockSyncFetch([[validationFailure]]);
    await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    const second = mockSyncFetch();
    await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    expect(pushBodies(second)).toEqual([]);
    expect(await db.outbox.get(bundle.id)).toBeDefined();
  });

  it('still removes rows the server applied', async () => {
    mockSyncFetch([[{ id: bundle.id, status: 'APPLIED' }]]);

    const result = await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    expect(result.success).toBe(true);
    expect(await db.outbox.get(bundle.id)).toBeUndefined();
  });

  it('reports a conflict as a conflict, not as a rejection', async () => {
    mockSyncFetch([
      [{ id: bundle.id, status: 'CONFLICT', conflictType: 'CONFLICT_FINALIZED', retryable: false }],
    ]);

    const result = await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.rejected).toBeUndefined();
    expect((await db.outbox.get(bundle.id))?.syncState).toBe('blocked');
  });

  it('blocks even a conflict the server calls retryable, since only a person can pick a side', async () => {
    mockSyncFetch([
      [
        {
          id: bundle.id,
          status: 'CONFLICT',
          conflictType: 'STALE_MEDICAL_HISTORY_REVISION',
          retryable: true,
        },
      ],
    ]);

    await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    expect((await db.outbox.get(bundle.id))?.syncState).toBe('blocked');
  });
});

describe('a retryable failure does not stop the pass', () => {
  it('keeps the row queued for the next pass and still runs the pull', async () => {
    // A permission not yet granted, a referenced record not yet pulled, a transient failure. The
    // server says the same push could succeed later, so nothing here needs a clinician, and one
    // queued change must not cut the clinic off from inbound data.
    const fetchMock = mockSyncFetch([
      [{ id: bundle.id, status: 'ERROR', conflictType: 'FORBIDDEN', retryable: true }],
    ]);

    const result = await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    expect(result).toMatchObject({ success: true, retryingCount: 1, blockedCount: 0 });
    expect(result.rejected).toBeUndefined();
    expect((await db.outbox.get(bundle.id))?.syncState).toBe('retrying');
    expect(pulled(fetchMock)).toBe(true);

    const next = mockSyncFetch([[{ id: bundle.id, status: 'APPLIED' }]]);
    await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });
    expect(pushBodies(next)[0]?.map((row) => row.id)).toEqual([bundle.id]);
    expect(await db.outbox.get(bundle.id)).toBeUndefined();
  });

  it('treats an unlabelled failure as blocked rather than assuming it will pass', async () => {
    // An older server that does not send `retryable` must not have its silence read as optimism.
    mockSyncFetch([[{ id: bundle.id, status: 'ERROR', conflictType: 'APPLICATION_ERROR' }]]);

    const result = await syncNow({ clinicId: bundle.clinicId, currentUserId: OWNER });

    expect(result.rejected).toHaveLength(1);
    expect((await db.outbox.get(bundle.id))?.syncState).toBe('blocked');
  });
});
