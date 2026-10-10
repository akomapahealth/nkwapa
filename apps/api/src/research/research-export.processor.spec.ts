import { ResearchExportProcessor } from './research-export.processor';

describe('ResearchExportProcessor tenant context', () => {
  // The GitHub push has to run between transactions, so the job is run as steps (#164).
  const step = jest.fn();
  const researchExportService = {
    processQueuedExport: jest.fn(),
    findExportJobTenant: jest.fn(),
  };
  const tenantContext = {
    runClinicJobSteps: jest.fn(async (_context, callback) => callback(step)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('propagates the queued clinic and actor context', async () => {
    const processor = new ResearchExportProcessor(
      researchExportService as never,
      tenantContext as never,
    );

    await processor.process({
      id: 'job-1',
      data: {
        exportId: 'export-1',
        clinicId: 'clinic-1',
        userId: 'director-1',
      },
    } as never);

    expect(tenantContext.runClinicJobSteps).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'research-exports',
        jobId: 'job-1',
        resourceId: 'export-1',
        tenant: { clinicId: 'clinic-1', userId: 'director-1' },
        unresolvedTenant: 'fail',
      }),
      expect.any(Function),
    );
    expect(researchExportService.findExportJobTenant).not.toHaveBeenCalled();
    // A job queued before retries were configured reads as one, final attempt.
    expect(researchExportService.processQueuedExport).toHaveBeenCalledWith(
      'export-1',
      {
        attemptsMade: 0,
        maxAttempts: 1,
      },
      step,
    );
  });

  it("hands the service the job's place in its retry budget", async () => {
    const processor = new ResearchExportProcessor(
      researchExportService as never,
      tenantContext as never,
    );

    await processor.process({
      id: 'job-1',
      attemptsMade: 2,
      opts: { attempts: 3 },
      data: { exportId: 'export-1', clinicId: 'clinic-1', userId: 'director-1' },
    } as never);

    expect(researchExportService.processQueuedExport).toHaveBeenCalledWith(
      'export-1',
      {
        attemptsMade: 2,
        maxAttempts: 3,
      },
      step,
    );
  });

  it('declares failure and resolves the full legacy export tenant context', async () => {
    researchExportService.findExportJobTenant.mockResolvedValue({
      clinicId: 'clinic-legacy',
      userId: 'requester-1',
    });
    const processor = new ResearchExportProcessor(
      researchExportService as never,
      tenantContext as never,
    );

    await processor.process({
      id: 'job-legacy',
      data: { exportId: 'export-legacy' },
    } as never);

    const context = tenantContext.runClinicJobSteps.mock.calls[0][0];
    expect(context).toMatchObject({
      tenant: null,
      unresolvedTenant: 'fail',
      legacy: {
        systemReason: 'Resolve tenant for a legacy research export payload',
      },
    });
    await expect(context.legacy.resolveTenant()).resolves.toEqual({
      clinicId: 'clinic-legacy',
      userId: 'requester-1',
    });
  });

  it('does not replace a supplied tenant with a database lookup', async () => {
    const processor = new ResearchExportProcessor(
      researchExportService as never,
      tenantContext as never,
    );

    await processor.process({
      id: 'job-1',
      data: {
        exportId: 'export-1',
        clinicId: 'different-clinic',
        userId: 'director-1',
      },
    } as never);

    expect(tenantContext.runClinicJobSteps.mock.calls[0][0].tenant).toEqual({
      clinicId: 'different-clinic',
      userId: 'director-1',
    });
    expect(researchExportService.findExportJobTenant).not.toHaveBeenCalled();
  });
});
