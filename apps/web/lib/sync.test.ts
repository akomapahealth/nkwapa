import {
  OWNER,
  EMPTY_PULL,
  mockSyncFetch,
  pushBodies,
  queuedRow,
  reset,
  type FakeSyncDb,
} from './testing/fake-sync-db';

jest.mock('./db', () => ({
  db: jest.requireActual('./testing/fake-sync-db').createFakeSyncDb(),
}));

import { db as mockedDb } from './db';
import { enqueueOutboxMutation, onOutboxChange } from './outbox';
import {
  isFullySynced,
  onSyncPassComplete,
  onSyncStatusChange,
  SYNC_PUSH_BATCH_SIZE,
  syncNow,
  syncQueuedChange,
} from './sync';

const db = mockedDb as unknown as FakeSyncDb;
const mutation = queuedRow({ entityType: 'diabetes_screening', entityId: 'screening-1' });

beforeEach(() => reset(db));

describe('sync coordinator', () => {
  it('runs a follow-up pass when a mutation is queued during an active sync', async () => {
    let resolveFirstPull!: (value: unknown) => void;
    const firstPull = new Promise((resolve) => {
      resolveFirstPull = resolve;
    });
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(firstPull)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: mutation.id, status: 'APPLIED' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...EMPTY_PULL, cursor: 'cursor-2' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = syncNow({ clinicId: mutation.clinicId, currentUserId: OWNER });
    const concurrent = syncNow({ clinicId: mutation.clinicId, currentUserId: OWNER });
    expect(concurrent).toBe(first);

    await db.outbox.put(mutation);
    resolveFirstPull({ ok: true, json: async () => EMPTY_PULL });

    await expect(first).resolves.toMatchObject({ success: true, blockedCount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/sync/push');
  });
});

describe('a change queued with nobody asking for a sync', () => {
  /*
    A form queued a prescription while the reconnect pass was already running. The pass had read
    the outbox before the row landed, finished cleanly, and nothing synced again: the change sat
    unsent until something unrelated triggered a pass. No one calls syncNow here on purpose.
  */
  it('is sent by the pass that was running when it was queued', async () => {
    let resolveFirstPull!: (value: unknown) => void;
    const firstPull = new Promise((resolve) => {
      resolveFirstPull = resolve;
    });
    const pushed: string[] = [];
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/sync/push')) {
        const batch = JSON.parse(String(init?.body)) as { id: string }[];
        pushed.push(...batch.map((row) => row.id));
        return {
          ok: true,
          json: async () => ({
            results: batch.map((row) => ({ id: row.id, status: 'APPLIED' })),
          }),
        };
      }
      if (fetchMock.mock.calls.length === 1) return firstPull;
      return { ok: true, json: async () => ({ ...EMPTY_PULL, cursor: 'cursor-2' }) };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const pass = syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });
    // Queue only once the pass is pulling: its push has already read an empty outbox.
    while (fetchMock.mock.calls.length === 0) await new Promise((r) => setTimeout(r, 0));
    const queued = await enqueueOutboxMutation(db as never, {
      clinicId: 'clinic-1',
      entityType: 'prescription',
      entityId: 'rx-1',
      operation: 'UPSERT',
      payloadJson: { encounterId: 'encounter-1' },
      owner: { userId: OWNER },
    });
    resolveFirstPull({ ok: true, json: async () => EMPTY_PULL });

    await expect(pass).resolves.toMatchObject({ success: true });
    expect(pushed).toEqual([queued.id]);
    expect(await db.outbox.toArray()).toEqual([]);
  });

  it('tells listeners which clinic it was queued at', async () => {
    const heard: string[] = [];
    const unsubscribe = onOutboxChange((clinicId) => heard.push(clinicId));
    await enqueueOutboxMutation(db as never, {
      clinicId: 'clinic-2',
      entityType: 'prescription',
      entityId: 'rx-2',
      operation: 'UPSERT',
      payloadJson: {},
      owner: { userId: OWNER },
    });
    unsubscribe();
    expect(heard).toEqual(['clinic-2']);
  });

  it('does not start a second pass beside one already running', async () => {
    const fetchMock = mockSyncFetch([]);
    const running = syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });
    syncQueuedChange({ clinicId: 'clinic-1', currentUserId: OWNER });
    await running;
    // One pass, one pull: the queued-change request neither joined nor started another.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('push batching', () => {
  it('sends a long offline queue in batches the server accepts', async () => {
    // The whole outbox used to go in one request. Past the server's limit it was refused with a
    // 413 on every pass, so a device that had been offline long enough could never drain.
    const total = SYNC_PUSH_BATCH_SIZE * 2 + 5;
    const rows = Array.from({ length: total }, (_, index) =>
      queuedRow({
        id: `m-${String(index).padStart(4, '0')}`,
        idempotencyKey: `k-${index}`,
        createdAt: new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString(),
      }),
    );
    await db.outbox.bulkPut(rows);
    const applied = (batch: typeof rows) => batch.map((row) => ({ id: row.id, status: 'APPLIED' }));
    const fetchMock = mockSyncFetch([
      applied(rows.slice(0, SYNC_PUSH_BATCH_SIZE)),
      applied(rows.slice(SYNC_PUSH_BATCH_SIZE, SYNC_PUSH_BATCH_SIZE * 2)),
      applied(rows.slice(SYNC_PUSH_BATCH_SIZE * 2)),
    ]);

    const result = await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });

    expect(pushBodies(fetchMock).map((batch) => batch.length)).toEqual([
      SYNC_PUSH_BATCH_SIZE,
      SYNC_PUSH_BATCH_SIZE,
      5,
    ]);
    expect(pushBodies(fetchMock).flat()[0]?.id).toBe('m-0000');
    expect(isFullySynced(result)).toBe(true);
    expect(await db.outbox.toArray()).toEqual([]);
  });
});

describe('merged charts', () => {
  it('drops the local copy of a chart a merge retired', async () => {
    await db.patients.bulkPut([{ id: 'retired-1' }, { id: 'canonical-1' }]);
    mockSyncFetch([], {
      ...EMPTY_PULL,
      mergedPatients: [{ id: 'retired-1', mergedIntoPatientId: 'canonical-1' }],
    });

    await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });

    expect(await db.patients.get('retired-1')).toBeUndefined();
    expect(await db.patients.get('canonical-1')).toBeDefined();
  });
});

describe('status reporting', () => {
  it('says the pass finished but a change needs attention', async () => {
    await db.outbox.put(mutation);
    mockSyncFetch([
      [{ id: mutation.id, status: 'CONFLICT', conflictType: 'PATIENT_MERGED', retryable: false }],
    ]);
    const statuses: string[] = [];
    const unsubscribe = onSyncStatusChange((status) => statuses.push(status));

    const result = await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });
    unsubscribe();

    expect(statuses).toEqual(['syncing', 'attention']);
    expect(isFullySynced(result)).toBe(false);
  });

  it('tells pass listeners which changes this call newly blocked', async () => {
    await db.outbox.put(mutation);
    mockSyncFetch([
      [{ id: mutation.id, status: 'CONFLICT', conflictType: 'PATIENT_MERGED', retryable: false }],
    ]);
    const passes: Array<[string, number]> = [];
    const unsubscribe = onSyncPassComplete((clinicId, result) =>
      passes.push([clinicId, result.conflicts?.length ?? 0]),
    );

    await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });
    // The blocked row is not re-sent, so a second pass reports nothing new.
    mockSyncFetch();
    await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });
    unsubscribe();

    expect(passes).toEqual([
      ['clinic-1', 1],
      ['clinic-1', 0],
    ]);
  });

  it('turns a failed request into plain language and keeps the raw text for support', async () => {
    await db.outbox.put(mutation);
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => '{"code":"RATE_LIMITED","message":"Too many requests"}',
    })) as unknown as typeof fetch;
    const events: Array<[string, string | undefined, string | undefined]> = [];
    const unsubscribe = onSyncStatusChange((status, message, detail) =>
      events.push([status, message, detail]),
    );

    const result = await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });
    unsubscribe();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/paused for a minute/);
    expect(result.error).not.toContain('{');
    expect(events.at(-1)).toEqual([
      'error',
      expect.stringMatching(/saved on this device/),
      expect.stringContaining('RATE_LIMITED'),
    ]);
    // Nothing was confirmed, so the queued change is untouched.
    expect((await db.outbox.get(mutation.id))?.syncState).toBeUndefined();
  });

  it('reports an unreachable server without claiming anything was lost', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const result = await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/Could not reach the server/);
  });
});
