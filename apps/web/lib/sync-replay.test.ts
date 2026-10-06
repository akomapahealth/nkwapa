import {
  mockSyncFetch,
  mockSyncNetwork,
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
import { retryOutboxMutation } from './outbox';
import { SYNC_PUSH_BATCH_SIZE, SYNC_REQUEST_TIMEOUT_MS, syncNow } from './sync';
import type { NkwapaDb } from './db';

/**
 * The replay cases in the offline and job execution matrix
 * (`docs/security/offline-job-execution-matrix.md`): a connection that fails partway, the same
 * change answered twice, a change waiting on the clinician, and a device whose active clinic is
 * not the one a change was queued under. Each one is a way a clinician's entry could be lost,
 * sent twice, or sent to the wrong place.
 */

const db = mockedDb as unknown as FakeSyncDb;
const CLINIC_A = 'clinic-a';
const CLINIC_B = 'clinic-b';
const change = queuedRow({ id: 'change-a', clinicId: CLINIC_A, idempotencyKey: 'key-a' });

function sentIds(fetchMock: jest.Mock): string[] {
  return pushBodies(fetchMock).flatMap((batch) => batch.map((row) => row.id));
}

beforeEach(() => {
  reset(db);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('weak network', () => {
  it('drains a change on the pass after a server failure, without counting the failure against it', async () => {
    await db.outbox.put(change);
    mockSyncNetwork({ push: [{ status: 503, body: 'upstream unavailable' }] });

    const failed = await syncNow({ clinicId: CLINIC_A });

    expect(failed).toMatchObject({ success: false });
    expect(failed.error).toMatch(/saved on this device/);
    // A failed request confirmed nothing, so the row is exactly as it was queued.
    expect(await db.outbox.get(change.id)).toEqual(change);

    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);
    const recovered = await syncNow({ clinicId: CLINIC_A });

    expect(recovered).toMatchObject({ success: true, blockedCount: 0, retryingCount: 0 });
    expect(sentIds(fetchMock)).toEqual([change.id]);
    expect(await db.outbox.get(change.id)).toBeUndefined();
  });

  it('abandons a stalled request so the next pass is not stuck behind it', async () => {
    jest.useFakeTimers();
    await db.outbox.put(change);
    mockSyncNetwork({ push: ['stall'] });

    const stalled = syncNow({ clinicId: CLINIC_A });
    await jest.advanceTimersByTimeAsync(SYNC_REQUEST_TIMEOUT_MS);
    const result = await stalled;

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/Could not reach the server/);
    expect(await db.outbox.get(change.id)).toEqual(change);

    // The clinic is free again: a new pass sends instead of joining the abandoned one.
    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);
    await expect(syncNow({ clinicId: CLINIC_A })).resolves.toMatchObject({ success: true });
    expect(sentIds(fetchMock)).toEqual([change.id]);
  });

  it('keeps a batch the server applied when a later batch fails, and skips the pull', async () => {
    const rows = Array.from({ length: SYNC_PUSH_BATCH_SIZE + 1 }, (_, index) =>
      queuedRow({
        id: `change-${String(index).padStart(3, '0')}`,
        clinicId: CLINIC_A,
        idempotencyKey: `key-${index}`,
        createdAt: new Date(Date.UTC(2026, 7, 20, 12, 0, index)).toISOString(),
      }),
    );
    await db.outbox.bulkPut(rows);
    const firstBatch = rows.slice(0, SYNC_PUSH_BATCH_SIZE);
    const fetchMock = mockSyncNetwork({
      push: [firstBatch.map((row) => ({ id: row.id, status: 'APPLIED' })), 'unreachable'],
    });

    const result = await syncNow({ clinicId: CLINIC_A });

    expect(result).toMatchObject({ success: false });
    expect(db.outbox.rows.size).toBe(1);
    expect(await db.outbox.get(rows[SYNC_PUSH_BATCH_SIZE].id)).toBeDefined();
    // Pulling over a half-sent queue would advance the cursor past changes not yet confirmed.
    expect(pulled(fetchMock)).toBe(false);
    expect(await db.sync_state.get(CLINIC_A)).toBeUndefined();
  });
});

describe('duplicate replay', () => {
  it('sends a change once, however many times sync is asked for while it is in flight', async () => {
    await db.outbox.put(change);
    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);

    await Promise.all([
      syncNow({ clinicId: CLINIC_A }),
      syncNow({ clinicId: CLINIC_A }),
      syncNow({ clinicId: CLINIC_A }),
    ]);

    expect(sentIds(fetchMock)).toEqual([change.id]);
    expect(db.outbox.rows.size).toBe(0);
  });

  it('ignores answers for changes this device no longer holds, and keeps any it was not answered for', async () => {
    const unanswered = queuedRow({ id: 'change-unanswered', clinicId: CLINIC_A });
    await db.outbox.bulkPut([change, unanswered]);
    mockSyncFetch([
      [
        { id: change.id, status: 'APPLIED' },
        // The same answer twice, as a retried request that landed both times would produce.
        { id: change.id, status: 'APPLIED' },
        { id: 'change-from-another-device', status: 'APPLIED' },
      ],
    ]);

    const result = await syncNow({ clinicId: CLINIC_A });

    expect(result.success).toBe(true);
    expect(await db.outbox.get(change.id)).toBeUndefined();
    expect(await db.outbox.get(unanswered.id)).toEqual(unanswered);
  });
});

describe('changes the server refused', () => {
  it('re-sends a change waiting to retry, but not one waiting on the clinician', async () => {
    const retrying = queuedRow({
      id: 'change-retrying',
      clinicId: CLINIC_A,
      syncState: 'retrying',
    });
    const blocked = queuedRow({ id: 'change-blocked', clinicId: CLINIC_A, syncState: 'blocked' });
    await db.outbox.bulkPut([retrying, blocked]);
    const fetchMock = mockSyncFetch([[{ id: retrying.id, status: 'APPLIED' }]]);

    const result = await syncNow({ clinicId: CLINIC_A });

    expect(sentIds(fetchMock)).toEqual([retrying.id]);
    expect(result).toMatchObject({ blockedCount: 1, retryingCount: 0 });
  });

  it('clears a conflict once the clinician retries it and the server applies it', async () => {
    await db.outbox.put(change);
    const conflict = {
      id: change.id,
      status: 'CONFLICT',
      conflictType: 'CONFLICT_FINALIZED',
      retryable: false,
    };
    mockSyncFetch([[conflict]]);
    await syncNow({ clinicId: CLINIC_A });
    // A second pass does not spend another attempt on a change the clinician has not looked at.
    await syncNow({ clinicId: CLINIC_A });
    expect(await db.outbox.get(change.id)).toMatchObject({ syncState: 'blocked', attempts: 1 });

    await retryOutboxMutation(db as unknown as NkwapaDb, change.id);
    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);
    const result = await syncNow({ clinicId: CLINIC_A });

    expect(sentIds(fetchMock)).toEqual([change.id]);
    expect(result).toMatchObject({ blockedCount: 0, retryingCount: 0 });
    expect(await db.outbox.get(change.id)).toBeUndefined();
  });
});

describe('stale active clinic', () => {
  const atB = queuedRow({ id: 'change-b', clinicId: CLINIC_B, idempotencyKey: 'key-b' });

  it("never sends another clinic's changes while a different clinic is active", async () => {
    await db.outbox.bulkPut([change, atB]);
    const fetchMock = mockSyncFetch([[{ id: atB.id, status: 'APPLIED' }]]);

    const result = await syncNow({ clinicId: CLINIC_B });

    expect(sentIds(fetchMock)).toEqual([atB.id]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`clinicId=${CLINIC_B}`);
    // Clinic A's change is neither sent, counted against B, nor touched.
    expect(result).toMatchObject({ blockedCount: 0, retryingCount: 0 });
    expect(await db.outbox.get(change.id)).toEqual(change);
  });

  it("drains a clinic's changes once that clinic is active again", async () => {
    await db.outbox.bulkPut([change, atB]);
    mockSyncFetch([[{ id: atB.id, status: 'APPLIED' }]]);
    await syncNow({ clinicId: CLINIC_B });

    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);
    await syncNow({ clinicId: CLINIC_A });

    expect(sentIds(fetchMock)).toEqual([change.id]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`clinicId=${CLINIC_A}`);
    expect(db.outbox.rows.size).toBe(0);
  });

  it('keeps every change when the server refuses the clinic itself', async () => {
    await db.outbox.put(change);
    mockSyncNetwork({ push: [{ status: 403, body: '{"code":"FORBIDDEN"}' }] });

    const result = await syncNow({ clinicId: CLINIC_A });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/cannot sync at this clinic/);
    expect(await db.outbox.get(change.id)).toEqual(change);
  });
});
