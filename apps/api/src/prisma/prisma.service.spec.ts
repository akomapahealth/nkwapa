import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';
import {
  InvalidSystemContextError,
  PrismaContextConflictError,
  PrismaService,
  UnknownClinicContextError,
} from './prisma.service';

type TransactionHarness = {
  $executeRaw: jest.Mock;
  clinic: {
    findUnique: jest.Mock;
  };
};

type TestablePrismaService = {
  rlsStorage: AsyncLocalStorage<{
    client: Prisma.TransactionClient;
    rls: Record<string, unknown>;
  }>;
  transactionWithContext<T>(callback: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

describe('PrismaService tenant context', () => {
  let prisma: PrismaService;
  let tx: TransactionHarness;

  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clinic: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'organization-1',
          zoneCode: 'zone-1',
        }),
      },
    };
    prisma = Object.create(PrismaService.prototype) as PrismaService;
    const testable = prisma as unknown as TestablePrismaService;
    testable.rlsStorage = new AsyncLocalStorage();
    testable.transactionWithContext = jest.fn(async (callback) => callback(tx as never));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records a normalized system context and clears it after work completes', async () => {
    await prisma.withSystemContext(
      {
        requestId: 'job-1',
        userId: null,
        systemReason: 'Resolve a legacy job tenant',
      },
      async () => {
        expect(prisma.getCurrentRlsContext()).toEqual({
          requestId: 'job-1',
          userId: null,
          organizationId: null,
          clinicIds: [],
          activeClinicId: null,
          zoneCode: null,
          isSystemAdmin: true,
          systemReason: 'Resolve a legacy job tenant',
        });
      },
    );

    expect(prisma.getCurrentRlsContext()).toBeNull();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty system reason before opening a transaction', async () => {
    await expect(
      prisma.withSystemContext({ systemReason: '   ' }, async () => undefined),
    ).rejects.toBeInstanceOf(InvalidSystemContextError);

    expect(
      (prisma as unknown as TestablePrismaService).transactionWithContext,
    ).not.toHaveBeenCalled();
  });

  it('applies clinic scope before resolving and enriching clinic metadata', async () => {
    await prisma.withClinicContext(
      'clinic-1',
      { requestId: 'job-1', userId: 'user-1' },
      async () => {
        expect(prisma.getCurrentRlsContext()).toEqual({
          requestId: 'job-1',
          userId: 'user-1',
          organizationId: 'organization-1',
          clinicIds: ['clinic-1'],
          activeClinicId: 'clinic-1',
          zoneCode: 'zone-1',
          isSystemAdmin: false,
          systemReason: null,
        });
      },
    );

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.clinic.findUnique).toHaveBeenCalledWith({
      where: { id: 'clinic-1' },
      select: { organizationId: true, zoneCode: true },
    });
    expect(prisma.getCurrentRlsContext()).toBeNull();
  });

  it('fails clearly when clinic metadata cannot be resolved', async () => {
    tx.clinic.findUnique.mockResolvedValue(null);

    await expect(
      prisma.withClinicContext('missing-clinic', {}, async () => undefined),
    ).rejects.toBeInstanceOf(UnknownClinicContextError);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.getCurrentRlsContext()).toBeNull();
  });

  it('deduplicates clinic IDs in generic RLS context', async () => {
    await prisma.withRlsContext(
      {
        clinicIds: ['clinic-2', 'clinic-1', 'clinic-2'],
        activeClinicId: 'clinic-1',
      },
      async () => {
        expect(prisma.getCurrentRlsContext()?.clinicIds).toEqual(['clinic-1', 'clinic-2']);
      },
    );
  });

  it('rejects incompatible nested contexts instead of retaining broader access', async () => {
    await prisma.withSystemContext({ systemReason: 'System maintenance' }, async () => {
      await expect(
        prisma.withClinicContext('clinic-1', {}, async () => undefined),
      ).rejects.toBeInstanceOf(PrismaContextConflictError);
    });
  });

  it('clears context when tenant work throws', async () => {
    const error = new Error('tenant work failed');

    await expect(
      prisma.withRlsContext({ clinicIds: ['clinic-1'] }, async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(prisma.getCurrentRlsContext()).toBeNull();
  });
});
