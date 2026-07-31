import { Logger } from '@nestjs/common';
import { JobTenantContextRunner, UnresolvedJobTenantError } from './job-tenant-context.runner';

describe('JobTenantContextRunner', () => {
  const transactionClient = { marker: 'transaction-client' };
  const prisma = {
    withClinicContext: jest.fn(async (_clinicId, _context, callback) =>
      callback(transactionClient),
    ),
    withSystemContext: jest.fn(async (_context, callback) => callback(transactionClient)),
  };
  let runner: JobTenantContextRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    runner = new JobTenantContextRunner(prisma as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs work with the explicit clinic and user context', async () => {
    const callback = jest.fn().mockResolvedValue('done');

    const result = await runner.runClinicJob(
      {
        queueName: 'research-exports',
        jobId: 'job-1',
        resourceId: 'export-1',
        tenant: { clinicId: ' clinic-1 ', userId: ' user-1 ' },
        legacy: {
          resolveTenant: jest.fn(),
          systemReason: 'Resolve a legacy export tenant',
        },
        unresolvedTenant: 'fail',
      },
      callback,
    );

    expect(result).toBe('done');
    expect(prisma.withSystemContext).not.toHaveBeenCalled();
    expect(prisma.withClinicContext).toHaveBeenCalledWith(
      'clinic-1',
      { requestId: 'job-1', userId: 'user-1' },
      callback,
    );
    expect(callback).toHaveBeenCalledWith(transactionClient);
  });

  it('resolves legacy tenant metadata under an explicit system reason', async () => {
    const resolveTenant = jest.fn().mockResolvedValue({ clinicId: 'clinic-legacy', userId: null });

    await runner.runClinicJob(
      {
        queueName: 'reminders',
        jobId: 42,
        resourceId: 'reminder-1',
        legacy: {
          resolveTenant,
          systemReason: 'Resolve tenant for a legacy reminder payload',
        },
        unresolvedTenant: 'discard',
      },
      jest.fn().mockResolvedValue(undefined),
    );

    expect(prisma.withSystemContext).toHaveBeenCalledWith(
      {
        requestId: '42',
        userId: null,
        systemReason: 'Resolve tenant for a legacy reminder payload',
      },
      expect.any(Function),
    );
    expect(resolveTenant).toHaveBeenCalledTimes(1);
    expect(prisma.withClinicContext).toHaveBeenCalledWith(
      'clinic-legacy',
      { requestId: '42', userId: null },
      expect.any(Function),
    );
  });

  it('safely discards unresolved work without invoking the callback', async () => {
    const callback = jest.fn();

    const result = await runner.runClinicJob(
      {
        queueName: 'reminders',
        resourceId: 'deleted-reminder',
        legacy: {
          resolveTenant: jest.fn().mockResolvedValue(null),
          systemReason: 'Resolve tenant for a legacy reminder payload',
        },
        unresolvedTenant: 'discard',
      },
      callback,
    );

    expect(result).toBeUndefined();
    expect(prisma.withClinicContext).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('fails unresolved work without invoking it when fail policy is selected', async () => {
    const callback = jest.fn();

    await expect(
      runner.runClinicJob(
        {
          queueName: 'research-exports',
          resourceId: 'missing-export',
          legacy: {
            resolveTenant: jest.fn().mockResolvedValue(null),
            systemReason: 'Resolve tenant for a legacy research export payload',
          },
          unresolvedTenant: 'fail',
        },
        callback,
      ),
    ).rejects.toBeInstanceOf(UnresolvedJobTenantError);

    expect(prisma.withClinicContext).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('requires Prisma to validate every system-context reason', async () => {
    await runner.runSystemJob(
      {
        queueName: 'maintenance',
        resourceId: 'cleanup',
        systemReason: '',
      },
      jest.fn().mockResolvedValue(undefined),
    );

    expect(prisma.withSystemContext).toHaveBeenCalledWith(
      {
        requestId: 'cleanup',
        userId: null,
        systemReason: '',
      },
      expect.any(Function),
    );
  });

  it('propagates callback failures without retrying outside tenant context', async () => {
    const error = new Error('job failed');
    prisma.withClinicContext.mockRejectedValueOnce(error);

    await expect(
      runner.runClinicJob(
        {
          queueName: 'reminders',
          resourceId: 'reminder-1',
          tenant: { clinicId: 'clinic-1', userId: null },
          legacy: {
            resolveTenant: jest.fn(),
            systemReason: 'Resolve tenant for a legacy reminder payload',
          },
          unresolvedTenant: 'discard',
        },
        jest.fn(),
      ),
    ).rejects.toBe(error);

    expect(prisma.withSystemContext).not.toHaveBeenCalled();
    expect(prisma.withClinicContext).toHaveBeenCalledTimes(1);
  });
});
