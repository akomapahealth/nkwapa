import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientRepository } from '../patients/patient.repository';
import { EncounterRepository } from '../encounters/encounter.repository';
import { EncounterStatus } from '@prisma/client';
import { SYNC_MUTATION_RESULT_STATUS } from './dto/sync-push-response.dto';
import type { SyncMutationDto } from './dto/sync-mutation.dto';
import { MedicalHistoryService } from '../medical-history/medical-history.service';
import { ConflictException } from '@nestjs/common';
import { ClinicalMeasurementsService } from './clinical-measurements.service';

const mockUser = {
  user: { id: 'user-1' },
  roles: [{ clinicId: 'clinic-1', role: 'VOLUNTEER' }],
};

describe('SyncService', () => {
  let service: SyncService;
  let patientRepo: jest.Mocked<PatientRepository>;
  let encounterRepo: jest.Mocked<EncounterRepository>;
  let prisma: jest.Mocked<PrismaService>;
  let medicalHistoryService: jest.Mocked<MedicalHistoryService>;
  let clinicalMeasurementsService: jest.Mocked<ClinicalMeasurementsService>;
  beforeEach(async () => {
    const mockPrisma = {
      syncMutation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      patient: {
        upsert: jest.fn().mockResolvedValue({
          id: 'patient-1',
          patientCode: 'NKP-2025-000001',
          primaryClinicId: 'clinic-1',
        }),
      },
      encounter: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'enc-1', status: 'DRAFT' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { logWrite: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: PatientRepository,
          useValue: {
            findByNationalIdHash: jest.fn().mockResolvedValue(null),
            findById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: EncounterRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: MedicalHistoryService,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
            revise: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: ClinicalMeasurementsService,
          useValue: { applyBundle: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(SyncService);
    patientRepo = module.get(PatientRepository);
    prisma = module.get(PrismaService);
    encounterRepo = module.get(EncounterRepository);
    medicalHistoryService = module.get(MedicalHistoryService);
    clinicalMeasurementsService = module.get(ClinicalMeasurementsService);
  });

  it('replays an applied vitals bundle idempotently without writing again', async () => {
    (prisma.syncMutation.findUnique as jest.Mock).mockResolvedValue({
      status: 'APPLIED',
      conflictType: null,
      conflictDetailsJson: null,
    });
    const result = await service.applyMutations('clinic-1', mockUser as never, [
      {
        id: 'mut-vitals-1',
        entityType: 'encounter_vitals_bundle',
        entityId: 'vitals-1',
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        payloadJson: {},
        idempotencyKey: 'vitals-idem-1',
      },
    ]);

    expect(result).toEqual([{ id: 'mut-vitals-1', status: 'APPLIED' }]);
    expect(clinicalMeasurementsService.applyBundle).not.toHaveBeenCalled();
  });

  describe('patient UPSERT - DUPLICATE_NATIONAL_ID', () => {
    it('returns CONFLICT with DUPLICATE_NATIONAL_ID when nationalIdHash matches existing patient with different id', async () => {
      (patientRepo.findByNationalIdHash as jest.Mock).mockResolvedValue({
        id: 'existing-patient-id',
        patientCode: 'NKP-2025-000099',
      });
      (patientRepo.findById as jest.Mock).mockResolvedValue(null);

      const mutations: SyncMutationDto[] = [
        {
          id: 'mut-1',
          entityType: 'patient',
          entityId: 'new-patient-id',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          payloadJson: {
            nationalId: '1234567890',
            primaryClinicId: 'clinic-1',
            firstName: 'John',
            lastName: 'Doe',
          },
          idempotencyKey: 'idem-1',
        },
      ];

      const results = await service.applyMutations('clinic-1', mockUser as never, mutations);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.CONFLICT);
      expect(results[0].conflictType).toBe('DUPLICATE_NATIONAL_ID');
      expect(results[0].conflictDetails).toEqual({
        existingPatientId: 'existing-patient-id',
        patientCode: 'NKP-2025-000099',
      });
      expect(prisma.patient.upsert).not.toHaveBeenCalled();
    });
  });

  describe('encounter UPSERT - CONFLICT_FINALIZED', () => {
    it('returns CONFLICT with CONFLICT_FINALIZED when encounter is FINALIZED', async () => {
      (encounterRepo.findById as jest.Mock).mockResolvedValue({
        id: 'enc-1',
        status: EncounterStatus.FINALIZED,
      });

      const mutations: SyncMutationDto[] = [
        {
          id: 'mut-1',
          entityType: 'encounter',
          entityId: 'enc-1',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          payloadJson: {
            clinicId: 'clinic-1',
            patientId: 'patient-1',
            createdByUserId: 'user-1',
            status: 'DRAFT',
          },
          idempotencyKey: 'idem-1',
        },
      ];

      const results = await service.applyMutations('clinic-1', mockUser as never, mutations);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.CONFLICT);
      expect(results[0].conflictType).toBe('CONFLICT_FINALIZED');
      expect(results[0].conflictDetails).toMatchObject({
        message: 'Cannot edit finalized encounter',
        existingStatus: 'FINALIZED',
      });
      expect(prisma.encounter.upsert).not.toHaveBeenCalled();
    });
  });

  describe('medical history revision replay', () => {
    const originalFlag = process.env.FEATURE_MEDICAL_HISTORY_ENABLED;

    beforeEach(() => {
      process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'true';
    });

    afterEach(() => {
      if (originalFlag === undefined) delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
      else process.env.FEATURE_MEDICAL_HISTORY_ENABLED = originalFlag;
    });

    it('applies an idempotent offline create with client-generated IDs', async () => {
      const mutation: SyncMutationDto = {
        id: 'mut-history-1',
        entityType: 'medical_history_revision',
        entityId: 'record-1',
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey: 'history-idem-1',
        payloadJson: {
          patientId: 'patient-1',
          revisionId: 'revision-1',
          category: 'CONDITION',
          status: 'ACTIVE',
          details: { conditionName: 'Hypertension' },
        },
      };

      const result = await service.applyMutations('clinic-1', mockUser as never, [mutation]);

      expect(result[0]?.status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);
      expect(medicalHistoryService.create).toHaveBeenCalledWith(
        'clinic-1',
        'patient-1',
        'user-1',
        expect.objectContaining({ recordId: 'record-1', revisionId: 'revision-1' }),
        'history-idem-1',
      );
    });

    it('returns a structured conflict for a stale offline revision', async () => {
      medicalHistoryService.revise.mockRejectedValue(
        new ConflictException({
          code: 'STALE_MEDICAL_HISTORY_REVISION',
          message: 'Record changed.',
          latestRevision: { id: 'revision-latest' },
        }),
      );
      const mutation: SyncMutationDto = {
        id: 'mut-history-2',
        entityType: 'medical_history_revision',
        entityId: 'record-1',
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey: 'history-idem-2',
        payloadJson: {
          patientId: 'patient-1',
          revisionId: 'revision-2',
          expectedCurrentRevisionId: 'revision-old',
          status: 'RESOLVED',
          resolvedDate: '2026-07-30',
          details: { conditionName: 'Hypertension' },
        },
      };

      const result = await service.applyMutations('clinic-1', mockUser as never, [mutation]);

      expect(result[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'STALE_MEDICAL_HISTORY_REVISION',
      });
      expect(prisma.syncMutation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'CONFLICT',
          conflictType: 'STALE_MEDICAL_HISTORY_REVISION',
        }),
      });
    });
  });
});
