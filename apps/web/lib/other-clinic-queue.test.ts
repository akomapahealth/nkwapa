import type { OutboxRecord } from './db';
import { buildOutboxMutation, setOutboxClinicNames, setOutboxOwner } from './outbox';
import { groupOtherClinicQueues } from './other-clinic-queue';

function row(overrides: Partial<OutboxRecord>): OutboxRecord {
  return {
    id: Math.random().toString(36).slice(2),
    clinicId: 'clinic-active',
    entityType: 'patient',
    entityId: 'p-1',
    operation: 'UPSERT',
    payloadJson: '{}',
    idempotencyKey: 'k',
    createdAt: '2026-10-08T09:00:00Z',
    ownerUserId: 'me',
    ...overrides,
  } as OutboxRecord;
}

const params = {
  activeClinicId: 'clinic-active',
  currentUserId: 'me',
  accessibleClinics: [
    { clinicId: 'clinic-active', clinicName: 'Active Clinic' },
    { clinicId: 'clinic-kumasi', clinicName: 'Kumasi' },
  ],
};

describe('groupOtherClinicQueues (#163)', () => {
  it('leaves the active clinic out entirely', () => {
    expect(groupOtherClinicQueues([row({})], params)).toEqual([]);
  });

  it('groups by clinic, open clinics first, and names a lost one from what was recorded', () => {
    const groups = groupOtherClinicQueues(
      [
        row({ clinicId: 'clinic-tamale', clinicName: 'Tamale' }),
        row({ clinicId: 'clinic-kumasi' }),
        row({ clinicId: 'clinic-kumasi' }),
      ],
      params,
    );
    expect(groups.map((group) => [group.clinicName, group.access, group.own.length])).toEqual([
      ['Kumasi', 'available', 2],
      ['Tamale', 'lost', 1],
    ]);
  });

  it('has no name for a lost clinic whose changes predate recording it', () => {
    const [group] = groupOtherClinicQueues([row({ clinicId: 'clinic-old' })], params);
    expect(group).toMatchObject({ clinicName: null, access: 'lost' });
  });

  it("keeps another account's changes apart from this account's, and counts ownerless as own", () => {
    const [group] = groupOtherClinicQueues(
      [
        row({ clinicId: 'clinic-kumasi', ownerUserId: 'someone-else' }),
        row({ clinicId: 'clinic-kumasi', ownerUserId: undefined }),
        row({ clinicId: 'clinic-kumasi' }),
      ],
      params,
    );
    expect(group.own).toHaveLength(2);
    expect(group.others).toHaveLength(1);
  });
});

describe('recording the clinic name on a queued change (#163)', () => {
  afterEach(() => {
    setOutboxClinicNames([]);
    setOutboxOwner(null);
  });

  it('stamps the name of a clinic the account can open', () => {
    setOutboxClinicNames([{ clinicId: 'clinic-kumasi', clinicName: 'Kumasi' }]);
    const record = buildOutboxMutation({
      clinicId: 'clinic-kumasi',
      entityType: 'patient',
      entityId: 'p-1',
      operation: 'UPSERT',
      payloadJson: {},
    });
    expect(record.clinicName).toBe('Kumasi');
  });

  it('records no name it does not know', () => {
    const record = buildOutboxMutation({
      clinicId: 'clinic-unknown',
      entityType: 'patient',
      entityId: 'p-1',
      operation: 'UPSERT',
      payloadJson: {},
    });
    expect(record).not.toHaveProperty('clinicName');
  });
});
