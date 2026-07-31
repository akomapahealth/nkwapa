import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrescriptionService } from './prescription.service';
import { PrescriptionRepository } from './prescription.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MedicalHistoryService } from '../medical-history/medical-history.service';

const mockPrescription = {
  id: 'rx-1',
  encounterId: 'enc-1',
  clinicId: 'clinic-1',
  drugId: 'drug-1',
  dosage: '10mg',
  frequency: 'twice daily',
  duration: '30 days',
  quantity: 60,
  instructions: 'Take with food',
  prescribedByUserId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PrescriptionService', () => {
  const originalMedicalHistoryFlag = process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
  let service: PrescriptionService;
  let mockRepoCreate: jest.Mock;
  let mockRepoFindById: jest.Mock;
  let mockRepoUpdate: jest.Mock;
  let mockRepoDelete: jest.Mock;
  let mockAuditLogWrite: jest.Mock;
  let mockEncounterFind: jest.Mock;
  let mockDrugFind: jest.Mock;
  let mockAllergySummary: jest.Mock;

  beforeEach(async () => {
    mockRepoCreate = jest.fn().mockResolvedValue(mockPrescription);
    mockRepoFindById = jest.fn().mockResolvedValue(mockPrescription);
    mockRepoUpdate = jest.fn().mockResolvedValue({ ...mockPrescription, dosage: '20mg' });
    mockRepoDelete = jest.fn().mockResolvedValue(undefined);
    mockAuditLogWrite = jest.fn().mockResolvedValue(undefined);
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'false';
    mockEncounterFind = jest.fn().mockResolvedValue({
      status: 'DRAFT',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
    });
    mockDrugFind = jest.fn().mockResolvedValue({ id: 'drug-1', clinicId: 'clinic-1' });
    mockAllergySummary = jest
      .fn()
      .mockResolvedValue({ state: 'NO_KNOWN_ALLERGIES', activeAllergies: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionService,
        {
          provide: PrescriptionRepository,
          useValue: {
            create: mockRepoCreate,
            findById: mockRepoFindById,
            update: mockRepoUpdate,
            delete: mockRepoDelete,
            listByEncounter: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            encounter: { findUnique: mockEncounterFind },
            drug: { findUnique: mockDrugFind },
          },
        },
        {
          provide: AuditService,
          useValue: { logWrite: mockAuditLogWrite },
        },
        {
          provide: MedicalHistoryService,
          useValue: { getAllergySummary: mockAllergySummary },
        },
      ],
    }).compile();

    service = module.get(PrescriptionService);
  });

  afterAll(() => {
    if (originalMedicalHistoryFlag === undefined) {
      delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
    } else {
      process.env.FEATURE_MEDICAL_HISTORY_ENABLED = originalMedicalHistoryFlag;
    }
  });

  it('creates prescription and logs audit', async () => {
    const result = await service.create(
      'clinic-1',
      'enc-1',
      {
        drugId: 'drug-1',
        dosage: '10mg',
        frequency: 'twice daily',
      },
      {
        clinicId: 'clinic-1',
        actorUserId: 'user-1',
        requestId: 'req-1',
      },
    );

    expect(result).toEqual(mockPrescription);
    expect(mockAuditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRESCRIPTION.CREATE' }),
    );
  });

  it('rejects creation on finalized encounter', async () => {
    mockEncounterFind.mockResolvedValue({
      status: 'FINALIZED',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
    });

    await expect(
      service.create(
        'clinic-1',
        'enc-1',
        {
          drugId: 'drug-1',
          dosage: '10mg',
          frequency: 'daily',
        },
        { clinicId: 'clinic-1', actorUserId: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires allergy review acknowledgement when active allergies exist', async () => {
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'true';
    mockAllergySummary.mockResolvedValue({
      state: 'ACTIVE_ALLERGIES',
      activeAllergies: [{ substance: 'Penicillin' }],
    });

    await expect(
      service.create(
        'clinic-1',
        'enc-1',
        {
          drugId: 'drug-1',
          dosage: '10mg',
          frequency: 'daily',
        },
        { clinicId: 'clinic-1', actorUserId: 'user-1' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALLERGY_REVIEW_REQUIRED' }),
    });
  });

  it('updates prescription and logs audit', async () => {
    const result = await service.update(
      'rx-1',
      { dosage: '20mg' },
      {
        clinicId: 'clinic-1',
        actorUserId: 'user-1',
      },
    );

    expect(result.dosage).toBe('20mg');
    expect(mockAuditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRESCRIPTION.UPDATE' }),
    );
  });

  it('deletes prescription and logs audit', async () => {
    await service.remove('rx-1', {
      clinicId: 'clinic-1',
      actorUserId: 'user-1',
    });

    expect(mockRepoDelete).toHaveBeenCalledWith('rx-1');
    expect(mockAuditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRESCRIPTION.DELETE' }),
    );
  });

  it('throws NotFoundException for non-existent prescription', async () => {
    mockRepoFindById.mockResolvedValue(null);

    await expect(
      service.update('nonexistent', { dosage: '5mg' }, { clinicId: 'c', actorUserId: 'u' }),
    ).rejects.toThrow(NotFoundException);
  });
});
