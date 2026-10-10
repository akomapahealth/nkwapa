import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CounsellingService } from './counselling.service';

const base = {
  topics: ['BLOOD_PRESSURE'],
  adviceGiven: 'Reduce salt; recheck BP in two weeks.',
  followUpRecommended: true,
  followUpWindow: 'WITHIN_1_MONTH',
  referralRecommended: false,
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'counselling-1',
    clinicId: 'clinic-1',
    encounterId: 'enc-1',
    topics: ['BLOOD_PRESSURE'],
    topicOther: null,
    adviceGiven: 'Reduce salt',
    followUpRecommended: true,
    followUpWindow: 'WITHIN_1_MONTH',
    followUpOther: null,
    referralRecommended: false,
    referralTo: null,
    referralReason: null,
    referralUrgency: null,
    authorUserId: 'vol-1',
    author: { id: 'vol-1', displayName: 'Volunteer One' },
    version: 1,
    lockedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(existing: Record<string, unknown> | null = null, status = 'DRAFT') {
  const tx = {
    encounter: {
      findUnique: jest.fn().mockResolvedValue({ id: 'enc-1', clinicId: 'clinic-1', status }),
    },
    counsellingRecord: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(record(data))),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve(record({ ...data, version: (existing?.version as number) + 1 })),
        ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
  return { service: new CounsellingService(prisma as never, audit as never), tx, audit };
}

describe('CounsellingService', () => {
  it('creates the record and audits the version without the content', async () => {
    const { service, tx, audit } = setup();
    await service.upsert('clinic-1', 'enc-1', 'vol-1', base as never, 'req-1');

    expect(tx.counsellingRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorUserId: 'vol-1', clinicId: 'clinic-1' }),
      }),
    );
    const [event, client] = audit.logWrite.mock.calls[0];
    expect(client).toBe(tx);
    expect(event).toMatchObject({ action: 'COUNSELLING.CREATE' });
    expect(event.afterJson).not.toContain('salt');
  });

  it('updates only from the version the editor started from', async () => {
    const { service } = setup(record({ version: 2 }));
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-2', { ...base, expectedVersion: 1 } as never),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT', currentVersion: 2 } });
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-2', { ...base, expectedVersion: 2 } as never),
    ).resolves.toMatchObject({ record: { version: 3 } });
  });

  it('refuses changes once the session is complete', async () => {
    const { service } = setup(record({ lockedAt: new Date() }));
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-1', { ...base, expectedVersion: 1 } as never),
    ).rejects.toMatchObject({ response: { code: 'COUNSELLING_LOCKED' } });
  });

  it('refuses a finalized encounter and one from another clinic', async () => {
    await expect(
      setup(null, 'FINALIZED').service.upsert('clinic-1', 'enc-1', 'vol-1', base as never),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setup().service.upsert('clinic-2', 'enc-1', 'vol-1', base as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['Other without a description', { topics: ['OTHER'] }],
    ['a follow-up with no window', { followUpWindow: 'NOT_ASSESSED' }],
    ['a window with no follow-up', { followUpRecommended: false }],
    ['a referral with no destination', { referralRecommended: true }],
    ['referral detail with no referral', { referralTo: 'Cape Coast Teaching Hospital' }],
  ])('rejects %s', async (_label, overrides) => {
    const { service } = setup();
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-1', { ...base, ...overrides } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a referral with its destination and urgency', async () => {
    const { service, tx } = setup();
    await service.upsert('clinic-1', 'enc-1', 'vol-1', {
      ...base,
      referralRecommended: true,
      referralTo: 'Cape Coast Teaching Hospital',
      referralReason: 'BP 180/110 on two readings',
      referralUrgency: 'URGENT',
    } as never);
    expect(tx.counsellingRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referralUrgency: 'URGENT' }),
      }),
    );
  });
});
