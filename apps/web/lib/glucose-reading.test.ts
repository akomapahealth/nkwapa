const mockPut = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();
const mockEnqueue = jest.fn().mockResolvedValue({});

jest.mock('./db', () => ({
  db: {
    diabetes_screenings: {
      put: mockPut,
      get: mockGet,
      where: () => ({
        equals: () => ({ toArray: () => Promise.resolve(mockExisting) }),
      }),
      bulkDelete: jest.fn(),
    },
    outbox: {},
    transaction: jest.fn(async (...args: unknown[]) => {
      await (args.at(-1) as () => Promise<void>)();
    }),
  },
}));

jest.mock('./outbox', () => ({
  enqueueOutboxMutation: mockEnqueue,
  SYNC_OPERATION: { UPSERT: 'UPSERT' },
}));

let mockExisting: Array<Record<string, unknown>> = [];

import { saveGlucoseReadingOffline } from './glucose-reading';

describe('saveGlucoseReadingOffline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExisting = [];
  });

  it('queues only the reading and keeps the local interview answers', async () => {
    const existing = {
      id: 'screening-1',
      encounterId: 'encounter-1',
      clinicId: 'clinic-1',
      diabetesStatus: 'KNOWN',
      updatedAt: '2026-10-07T08:00:00.000Z',
    };
    mockExisting = [existing];
    mockGet.mockResolvedValue(existing);

    const record = await saveGlucoseReadingOffline({
      clinicId: 'clinic-1',
      encounterId: 'encounter-1',
      reading: { glucoseMgDl: 210, glucoseType: 'RANDOM', collectedAt: '2026-10-07T09:00:00.000Z' },
    });

    expect(record).toMatchObject({
      id: 'screening-1',
      diabetesStatus: 'KNOWN',
      glucoseMgDl: 210,
      derivedSuspicion: 'SUSPECTED',
    });
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'diabetes_glucose_reading',
        entityId: 'screening-1',
        payloadJson: {
          encounterId: 'encounter-1',
          clinicId: 'clinic-1',
          glucoseMgDl: 210,
          glucoseType: 'RANDOM',
          collectedAt: '2026-10-07T09:00:00.000Z',
        },
      }),
    );
  });

  it('creates a new row id when the encounter has no screening yet', async () => {
    mockGet.mockResolvedValue(undefined);
    const record = await saveGlucoseReadingOffline({
      clinicId: 'clinic-1',
      encounterId: 'encounter-1',
      reading: { glucoseMgDl: 95, glucoseType: 'FASTING', collectedAt: '2026-10-07T09:00:00.000Z' },
    });
    expect(record.id).toEqual(expect.any(String));
    expect(mockPut).toHaveBeenCalledWith(expect.objectContaining({ glucoseMgDl: 95 }));
  });
});
