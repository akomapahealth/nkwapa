import { ResearchExportProcessor } from './research-export.processor';

describe('ResearchExportProcessor tenant context', () => {
  const researchExportService = {
    processQueuedExport: jest.fn(),
    findExportJobTenant: jest.fn(),
  };
  const tenantContext = {
    runClinicJob: jest.fn(async (_context, callback) => callback()),
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

    expect(tenantContext.runClinicJob).toHaveBeenCalledWith(
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
    expect(researchExportService.processQueuedExport).toHaveBeenCalledWith('export-1');
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

    const context = tenantContext.runClinicJob.mock.calls[0][0];
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

    expect(tenantContext.runClinicJob.mock.calls[0][0].tenant).toEqual({
      clinicId: 'different-clinic',
      userId: 'director-1',
    });
    expect(researchExportService.findExportJobTenant).not.toHaveBeenCalled();
  });
});
