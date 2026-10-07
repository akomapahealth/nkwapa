import {
  EMPTY_PULL,
  OWNER,
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

    const failed = await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

    expect(failed).toMatchObject({ success: false });
    expect(failed.error).toMatch(/saved on this device/);
    // A failed request confirmed nothing, so the row is exactly as it was queued.
    expect(await db.outbox.get(change.id)).toEqual(change);

    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);
    const recovered = await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

    expect(recovered).toMatchObject({ success: true, blockedCount: 0, retryingCount: 0 });
    expect(sentIds(fetchMock)).toEqual([change.id]);
    expect(await db.outbox.get(change.id)).toBeUndefined();
  });

  it('abandons a stalled request so the next pass is not stuck behind it', async () => {
    jest.useFakeTimers();
    await db.outbox.put(change);
    mockSyncNetwork({ push: ['stall'] });

    const stalled = syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });
    await jest.advanceTimersByTimeAsync(SYNC_REQUEST_TIMEOUT_MS);
    const result = await stalled;

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/Could not reach the server/);
    expect(await db.outbox.get(change.id)).toEqual(change);

    // The clinic is free again: a new pass sends instead of joining the abandoned one.
    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);
    await expect(syncNow({ clinicId: CLINIC_A, currentUserId: OWNER })).resolves.toMatchObject({
      success: true,
    });
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

    const result = await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

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
      syncNow({ clinicId: CLINIC_A, currentUserId: OWNER }),
      syncNow({ clinicId: CLINIC_A, currentUserId: OWNER }),
      syncNow({ clinicId: CLINIC_A, currentUserId: OWNER }),
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

    const result = await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

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

    const result = await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

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
    await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });
    // A second pass does not spend another attempt on a change the clinician has not looked at.
    await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });
    expect(await db.outbox.get(change.id)).toMatchObject({ syncState: 'blocked', attempts: 1 });

    await retryOutboxMutation(db as unknown as NkwapaDb, change.id);
    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);
    const result = await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

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

    const result = await syncNow({ clinicId: CLINIC_B, currentUserId: OWNER });

    expect(sentIds(fetchMock)).toEqual([atB.id]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`clinicId=${CLINIC_B}`);
    // Clinic A's change is neither sent, counted against B, nor touched.
    expect(result).toMatchObject({ blockedCount: 0, retryingCount: 0 });
    expect(await db.outbox.get(change.id)).toEqual(change);
  });

  it("drains a clinic's changes once that clinic is active again", async () => {
    await db.outbox.bulkPut([change, atB]);
    mockSyncFetch([[{ id: atB.id, status: 'APPLIED' }]]);
    await syncNow({ clinicId: CLINIC_B, currentUserId: OWNER });

    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);
    await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

    expect(sentIds(fetchMock)).toEqual([change.id]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`clinicId=${CLINIC_A}`);
    expect(db.outbox.rows.size).toBe(0);
  });

  it('keeps every change when the server refuses the clinic itself', async () => {
    await db.outbox.put(change);
    mockSyncNetwork({ push: [{ status: 403, body: '{"code":"FORBIDDEN"}' }] });

    const result = await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/cannot sync at this clinic/);
    expect(await db.outbox.get(change.id)).toEqual(change);
  });
});

/*
  CLN-05 (#162). On a shared clinic laptop, one account signs out with work still queued and
  another signs in. Each change is sent only by the account that queued it: anything else would
  write the next person's name into the audit trail for an entry they never made.
*/
describe('account change on a shared device', () => {
  const ACCOUNT_B = 'user-2';
  const byB = queuedRow({
    id: 'change-by-b',
    clinicId: CLINIC_A,
    idempotencyKey: 'key-by-b',
    ownerUserId: ACCOUNT_B,
  });
  const unowned = queuedRow({
    id: 'change-unowned',
    clinicId: CLINIC_A,
    idempotencyKey: 'key-old',
    ownerUserId: undefined,
  });

  it("never sends another account's change, and holds it untouched", async () => {
    await db.outbox.bulkPut([change, byB]);
    const fetchMock = mockSyncFetch([[{ id: change.id, status: 'APPLIED' }]]);

    const result = await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

    expect(sentIds(fetchMock)).toEqual([change.id]);
    expect(await db.outbox.get(byB.id)).toEqual(byB);
    expect(result).toMatchObject({ blockedCount: 0, retryingCount: 0, heldCount: 1 });
  });

  it('drains the held change once its own account signs back in', async () => {
    await db.outbox.put(byB);
    mockSyncFetch([]);
    await syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });

    const fetchMock = mockSyncFetch([[{ id: byB.id, status: 'APPLIED' }]]);
    const result = await syncNow({ clinicId: CLINIC_A, currentUserId: ACCOUNT_B });

    expect(sentIds(fetchMock)).toEqual([byB.id]);
    expect(db.outbox.rows.size).toBe(0);
    expect(result.heldCount).toBe(0);
  });

  it('holds a change queued before owners were recorded, for every account', async () => {
    await db.outbox.put(unowned);
    const fetchMock = mockSyncFetch([]);

    for (const account of [OWNER, ACCOUNT_B]) {
      const result = await syncNow({ clinicId: CLINIC_A, currentUserId: account });
      expect(result.heldCount).toBe(1);
    }
    expect(sentIds(fetchMock)).toEqual([]);
    expect(await db.outbox.get(unowned.id)).toEqual(unowned);
  });

  it('sends nothing while no account is known, but still pulls', async () => {
    await db.outbox.put(change);
    const fetchMock = mockSyncFetch([]);

    const result = await syncNow({ clinicId: CLINIC_A, currentUserId: null });

    expect(sentIds(fetchMock)).toEqual([]);
    expect(pulled(fetchMock)).toBe(true);
    expect(result).toMatchObject({ success: true, heldCount: 1 });
  });
});

describe('account resolving mid-pass', () => {
  it('reruns a pass that began before the account was known as that account', async () => {
    await db.outbox.put(change);
    let releasePull: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (releasePull = resolve));
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/sync/push')) {
        const body = JSON.parse(String(init?.body)) as Array<{ id: string }>;
        return {
          ok: true,
          json: async () => ({ results: body.map((row) => ({ id: row.id, status: 'APPLIED' })) }),
        };
      }
      await gate;
      return { ok: true, json: async () => EMPTY_PULL };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    // The clinic is known before the account: the first pass sends nothing.
    const first = syncNow({ clinicId: CLINIC_A, currentUserId: null });
    // The account resolves while that pass is still pulling.
    const second = syncNow({ clinicId: CLINIC_A, currentUserId: OWNER });
    releasePull?.();
    await Promise.all([first, second]);

    expect(sentIds(fetchMock)).toEqual([change.id]);
    expect(db.outbox.rows.size).toBe(0);
  });
});
