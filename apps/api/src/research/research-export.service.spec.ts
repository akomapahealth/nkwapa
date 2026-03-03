import { Test, TestingModule } from '@nestjs/testing';
import { ResearchExportService } from './research-export.service';
import { ResearchExportRepository } from './research-export.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DeIdentificationService } from './de-identification.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ResearchExportService', () => {
  let service: ResearchExportService;
  let repo: jest.Mocked<ResearchExportRepository>;
  let prisma: { clinicResearchSettings: { findUnique: jest.Mock } };
  let auditService: { logWrite: jest.Mock };
  let deIdService: { generateDataset: jest.Mock };

  const clinicId = 'clinic-1';
  const userId = 'user-1';

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      listByClinic: jest.fn(),
    } as unknown as jest.Mocked<ResearchExportRepository>;

    prisma = {
      clinicResearchSettings: { findUnique: jest.fn() },
    };
    auditService = { logWrite: jest.fn() };
    deIdService = { generateDataset: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchExportService,
        { provide: ResearchExportRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: DeIdentificationService, useValue: deIdService },
      ],
    }).compile();

    service = module.get(ResearchExportService);
  });

  describe('requestExport', () => {
    it('throws if research not enabled', async () => {
      prisma.clinicResearchSettings.findUnique.mockResolvedValue(null);
      await expect(
        service.requestExport(clinicId, userId, 'csv'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates PENDING export when approval required', async () => {
      prisma.clinicResearchSettings.findUnique.mockResolvedValue({
        clinicId,
        researchEnabled: true,
        requiresDirectorApprovalEachExport: true,
      });
      const created = { id: 'exp-1', clinicId, status: 'PENDING' };
      repo.create.mockResolvedValue(created as never);

      const result = await service.requestExport(clinicId, userId, 'csv', {
        clinicId,
        actorUserId: userId,
      });

      expect(result).toEqual(created);
      expect(repo.create).toHaveBeenCalled();
      const createArg = repo.create.mock.calls[0]![0];
      expect(createArg.status).toBe('PENDING');
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESEARCH_EXPORT.REQUEST' }),
      );
    });

    it('auto-approves when director approval not required', async () => {
      prisma.clinicResearchSettings.findUnique.mockResolvedValue({
        clinicId,
        researchEnabled: true,
        requiresDirectorApprovalEachExport: false,
      });
      const created = { id: 'exp-2', clinicId, status: 'APPROVED' };
      repo.create.mockResolvedValue(created as never);

      await service.requestExport(clinicId, userId, 'json');

      const createArg = repo.create.mock.calls[0]![0];
      expect(createArg.status).toBe('APPROVED');
      expect(createArg.fileFormat).toBe('json');
    });
  });

  describe('approveExport', () => {
    it('approves a PENDING export', async () => {
      const existing = { id: 'exp-1', clinicId, status: 'PENDING' };
      repo.findById.mockResolvedValue(existing as never);
      const updated = { ...existing, status: 'APPROVED' };
      repo.update.mockResolvedValue(updated as never);

      const result = await service.approveExport('exp-1', userId, {
        clinicId,
        actorUserId: userId,
      });

      expect(result.status).toBe('APPROVED');
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESEARCH_EXPORT.APPROVE' }),
      );
    });

    it('rejects approval if not PENDING', async () => {
      repo.findById.mockResolvedValue({ id: 'exp-1', status: 'COMPLETED' } as never);
      await expect(
        service.approveExport('exp-1', userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectExport', () => {
    it('rejects a PENDING export with reason', async () => {
      const existing = { id: 'exp-1', clinicId, status: 'PENDING' };
      repo.findById.mockResolvedValue(existing as never);
      const updated = { ...existing, status: 'REJECTED', rejectionReason: 'Not ready' };
      repo.update.mockResolvedValue(updated as never);

      const result = await service.rejectExport('exp-1', userId, 'Not ready', {
        clinicId,
        actorUserId: userId,
      });

      expect(result.status).toBe('REJECTED');
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESEARCH_EXPORT.REJECT' }),
      );
    });
  });

  describe('executeExport', () => {
    it('executes an APPROVED export', async () => {
      const existing = { id: 'exp-1', clinicId, status: 'APPROVED', fileFormat: 'csv' };
      repo.findById.mockResolvedValue(existing as never);
      deIdService.generateDataset.mockResolvedValue({
        filePath: '/data/exports/exp-1.csv',
        recordCount: 42,
      });
      const updated = { ...existing, status: 'COMPLETED', recordCount: 42 };
      repo.update.mockResolvedValue(updated as never);

      const result = await service.executeExport('exp-1', userId, {
        clinicId,
        actorUserId: userId,
      });

      expect(result.status).toBe('COMPLETED');
      expect(deIdService.generateDataset).toHaveBeenCalledWith(clinicId, 'exp-1', 'csv');
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESEARCH_EXPORT.EXECUTE' }),
      );
    });

    it('throws if export not APPROVED', async () => {
      repo.findById.mockResolvedValue({ id: 'exp-1', status: 'PENDING' } as never);
      await expect(
        service.executeExport('exp-1', userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if export not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.executeExport('nonexistent', userId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
