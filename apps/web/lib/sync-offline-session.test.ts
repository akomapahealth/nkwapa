import {
  OWNER,
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
import { buildOutboxMutation, setOutboxOfflineSession, setOutboxOwner } from './outbox';
import { syncNow } from './sync';

/**
 * Sync with offline session resume (#207): a sealed payload this tab cannot open is never sent as
 * ciphertext, a payload from before sealing still replays as it is, and a change recorded in an
 * offline session carries its stamp to the server.
 */

const db = mockedDb as unknown as FakeSyncDb;
const stamp = {
  grantId: '9c7d3f1e-2b4a-4c5d-8e6f-7a8b9c0d1e2f',
  deviceId: '0b1f5a3e-6a0e-4d4b-9c1d-2f5f4c0a7e11',
  unlockMethod: 'pin' as const,
};

beforeEach(() => reset(db));
afterEach(() => {
  setOutboxOwner(null);
  setOutboxOfflineSession(null);
});

it('holds a row it cannot decrypt and still sends a plaintext one from before encryption', async () => {
  await db.outbox.put(
    queuedRow({
      id: 'sealed',
      idempotencyKey: 'k-sealed',
      // What the at-rest layer returns for a row whose clinic key this tab does not hold.
      $sealed: { v: 1, s: 'clinic:clinic-1', iv: 'x', ct: 'y' },
    }),
  );
  await db.outbox.put(queuedRow({ id: 'legacy', idempotencyKey: 'k-legacy' }));
  const fetchMock = mockSyncFetch([[{ id: 'legacy', status: 'APPLIED' }]]);

  await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });

  const sent = pushBodies(fetchMock).flat();
  expect(sent.map((row) => row.id)).toEqual(['legacy']);
  expect(await db.outbox.get('sealed')).toBeDefined();
});

it('sends the offline session stamp with a change recorded in one', async () => {
  await db.outbox.put(queuedRow({ id: 'offline', offlineSession: { ...stamp, extra: 'x' } }));
  const fetchMock = mockSyncFetch([[{ id: 'offline', status: 'APPLIED' }]]);

  await syncNow({ clinicId: 'clinic-1', currentUserId: OWNER });

  expect(pushBodies(fetchMock).flat()[0]).toMatchObject({ offlineSession: stamp });
  expect(pushBodies(fetchMock).flat()[0]).not.toHaveProperty('offlineSession.extra');
});

it('stamps only changes queued by the offline session’s own account', () => {
  setOutboxOfflineSession({ userId: OWNER, stamp });
  const params = {
    clinicId: 'clinic-1',
    entityType: 'vitals',
    entityId: 'vitals-1',
    operation: 'UPSERT' as const,
    payloadJson: {},
  };

  setOutboxOwner({ userId: OWNER });
  expect(buildOutboxMutation(params).offlineSession).toEqual(stamp);

  setOutboxOwner({ userId: 'someone-else' });
  expect(buildOutboxMutation(params)).not.toHaveProperty('offlineSession');

  setOutboxOfflineSession(null);
  setOutboxOwner({ userId: OWNER });
  expect(buildOutboxMutation(params)).not.toHaveProperty('offlineSession');
});
