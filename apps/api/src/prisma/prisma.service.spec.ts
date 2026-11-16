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

  describe('afterCommit (#336)', () => {
    const context = { requestId: 'r', userId: 'u', clinicIds: [], isSystemAdmin: true } as never;

    beforeEach(() => {
      (prisma as unknown as { logger: { warn: jest.Mock } }).logger = { warn: jest.fn() };
    });

    it('runs queued work after the transaction, outside its context, once per key', async () => {
      const seen: unknown[] = [];
      const work = jest.fn(async () => {
        seen.push(prisma.getCurrentRlsContext());
      });
      await prisma.withRlsContext(context, async () => {
        await prisma.afterCommit(work, 'patient-1');
        await prisma.afterCommit(work, 'patient-1');
        expect(work).not.toHaveBeenCalled();
      });
      expect(work).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([null]);
    });

    it('drops queued work when the transaction fails', async () => {
      const work = jest.fn(async () => undefined);
      await expect(
        prisma.withRlsContext(context, async () => {
          await prisma.afterCommit(work);
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect(work).not.toHaveBeenCalled();
    });

    it('never fails the caller when the work fails', async () => {
      const result = await prisma.withRlsContext(context, async () => {
        await prisma.afterCommit(async () => {
          throw new Error('recompute broke');
        });
        return 'saved';
      });
      expect(result).toBe('saved');
    });

    it('runs at once when no transaction is open', async () => {
      const work = jest.fn(async () => undefined);
      await prisma.afterCommit(work);
      expect(work).toHaveBeenCalledTimes(1);
    });
  });
});
