import { ResearchExportProcessor } from './research-export.processor';

describe('ResearchExportProcessor tenant context', () => {
  const researchExportService = {
    processQueuedExport: jest.fn(),
    findExportClinicId: jest.fn(),
  };
  const prisma = {
    withClinicContext: jest.fn(async (_clinicId, _context, callback) => callback()),
    withSystemContext: jest.fn(async (_context, callback) => callback()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes new export jobs inside the queued clinic context', async () => {
    const processor = new ResearchExportProcessor(researchExportService as never, prisma as never);

    await processor.process({
      id: 'job-1',
      data: { exportId: 'export-1', clinicId: 'clinic-1' },
    } as never);

    expect(prisma.withSystemContext).not.toHaveBeenCalled();
    expect(prisma.withClinicContext).toHaveBeenCalledWith(
      'clinic-1',
      { requestId: 'job-1', userId: null },
      expect.any(Function),
    );
    expect(researchExportService.processQueuedExport).toHaveBeenCalledWith('export-1');
  });

  it('uses system context only to resolve legacy jobs missing clinicId', async () => {
    researchExportService.findExportClinicId.mockResolvedValue('clinic-1');
    const processor = new ResearchExportProcessor(researchExportService as never, prisma as never);

    await processor.process({ id: 'job-1', data: { exportId: 'export-1' } } as never);

    expect(prisma.withSystemContext).toHaveBeenCalledWith(
      {
        requestId: 'job-1',
        systemReason: 'Resolve tenant for a legacy research export payload',
      },
      expect.any(Function),
    );
    expect(researchExportService.findExportClinicId).toHaveBeenCalledWith('export-1');
    expect(prisma.withClinicContext).toHaveBeenCalledWith(
      'clinic-1',
      { requestId: 'job-1', userId: null },
      expect.any(Function),
    );
  });
});
