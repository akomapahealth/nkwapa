import { ApiError } from './api';
import type { ContactDetail, WorklistFilters } from './follow-up-contacts';
import {
  packetPage,
  pendingFollowUpAttempts,
  submitFollowUpAttempt,
  type FollowUpPacket,
} from './follow-up-offline';
import type { OutboxRecord } from './db';

const item = (over: Partial<ContactDetail> & { id: string }): ContactDetail => ({
  mode: 'PHONE',
  purpose: 'ROUTINE',
  status: 'DUE',
  dueOn: '2026-11-18',
  daysOverdue: 0,
  completedAt: null,
  owner: null,
  attemptCount: 0,
  lastAttempt: null,
  patient: { id: 'p', patientCode: 'NK-1', name: 'Ama Mensah', phoneE164: null, tier: 'HIGH' },
  suggestedNextOn: null,
  asksDiabetes: false,
  location: null,
  ...over,
});
const ANY: WorklistFilters = { q: '', mode: '', tier: '', owner: '' };
const packet: FollowUpPacket = {
  today: '2026-11-18',
  truncated: false,
  items: [
    item({ id: 'late', dueOn: '2026-11-10', status: 'MISSED' }),
    item({ id: 'today' }),
    item({ id: 'later', dueOn: '2026-11-21', owner: { id: 'u1', displayName: 'Abena' } }),
  ],
};

describe('packetPage (#338)', () => {
  it('splits the copy into the due tabs, counting lateness from today', () => {
    const ids = (tab: 'today' | 'overdue' | 'week', today = '2026-11-18') =>
      packetPage(packet, tab, ANY, today, null).items.map((i) => [i.id, i.daysOverdue]);
    expect(ids('today')).toEqual([['today', 0]]);
    expect(ids('overdue')).toEqual([['late', 8]]);
    expect(ids('week')).toEqual([['later', 0]]);
    // A day later the copy still works: today's contact is now a day late.
    expect(ids('overdue', '2026-11-19')).toEqual([
      ['late', 9],
      ['today', 1],
    ]);
  });

  it('filters by owner and search', () => {
    expect(
      packetPage(packet, 'week', { ...ANY, owner: 'me' }, '2026-11-18', 'u1').items,
    ).toHaveLength(1);
    expect(
      packetPage(packet, 'week', { ...ANY, owner: 'none' }, '2026-11-18', 'u1').items,
    ).toHaveLength(0);
    expect(
      packetPage(packet, 'today', { ...ANY, q: 'nk-1' }, '2026-11-18', null).items,
    ).toHaveLength(1);
    expect(
      packetPage(packet, 'today', { ...ANY, q: 'kofi' }, '2026-11-18', null).items,
    ).toHaveLength(0);
  });
});

describe('submitFollowUpAttempt (#338)', () => {
  const contact = { id: 'c1', patient: packet.items[0].patient };
  const attempt = {
    mode: 'PHONE' as const,
    outcome: 'ATTEMPTED' as const,
    notReachedReason: 'NO_ANSWER' as const,
  };
  const deps = (over: object) => ({
    getToken: async () => 'token',
    isOnline: true,
    actor: { userId: 'u1' },
    enqueue: jest.fn(async () => undefined),
    ...over,
  });

  it('queues under the same id when offline, without trying the network', async () => {
    const send = jest.fn();
    const d = deps({ isOnline: false, send });
    await expect(
      submitFollowUpAttempt({ clinicId: 'k1', contact, attemptId: 'a1', attempt }, d),
    ).resolves.toEqual({ outcome: 'queued' });
    expect(send).not.toHaveBeenCalled();
    expect(d.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'follow_up_attempt',
        entityId: 'a1',
        idempotencyKey: 'follow-up-attempt-a1',
        payloadJson: expect.objectContaining({
          schemaVersion: 1,
          contactId: 'c1',
          outcome: 'ATTEMPTED',
        }),
      }),
    );
  });

  it('queues a request that never got an answer, but not one the server refused', async () => {
    const unanswered = deps({
      send: jest.fn(async () => {
        throw new ApiError('offline', { code: 'NETWORK_ERROR' });
      }),
    });
    await expect(
      submitFollowUpAttempt({ clinicId: 'k1', contact, attemptId: 'a1', attempt }, unanswered),
    ).resolves.toEqual({ outcome: 'queued' });
    const refused = deps({
      send: jest.fn(
        async () => new Response(JSON.stringify({ message: 'closed' }), { status: 409 }),
      ),
    });
    const result = await submitFollowUpAttempt(
      { clinicId: 'k1', contact, attemptId: 'a2', attempt },
      refused,
    );
    expect(result.outcome).toBe('refused');
    expect(refused.enqueue).not.toHaveBeenCalled();
  });
});

describe('pendingFollowUpAttempts (#338)', () => {
  it('reads queued calls back by contact, and whether they reached the patient', () => {
    const row = (entityId: string, outcome: string) =>
      ({
        id: entityId,
        clinicId: 'k1',
        entityType: 'follow_up_attempt',
        entityId,
        operation: 'UPSERT',
        payloadJson: JSON.stringify({ schemaVersion: 1, contactId: 'c1', outcome }),
        idempotencyKey: `follow-up-attempt-${entityId}`,
        createdAt: '2026-11-18T09:00:00Z',
      }) as OutboxRecord;
    expect(
      pendingFollowUpAttempts([row('a1', 'ATTEMPTED'), row('a2', 'REACHED')]).map((p) => [
        p.attemptId,
        p.contactId,
        p.reached,
      ]),
    ).toEqual([
      ['a1', 'c1', false],
      ['a2', 'c1', true],
    ]);
  });
});
