import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientRepository } from '../patients/patient.repository';
import { EncounterRepository } from '../encounters/encounter.repository';
import { EncounterStatus } from '@prisma/client';
import { SYNC_MUTATION_RESULT_STATUS } from './dto/sync-push-response.dto';
import type { SyncMutationDto } from './dto/sync-mutation.dto';

const mockUser = {
  user: { id: 'user-1' },
  roles: [{ clinicId: 'clinic-1', role: 'VOLUNTEER' }],
};

describe('SyncService', () => {
  let service: SyncService;
  let patientRepo: jest.Mocked<PatientRepository>;
  let encounterRepo: jest.Mocked<EncounterRepository>;
  let prisma: jest.Mocked<PrismaService>;
  let auditService: jest.Mocked<AuditService>;

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
      ],
    }).compile();

    service = module.get(SyncService);
    patientRepo = module.get(PatientRepository);
    prisma = module.get(PrismaService);
    auditService = module.get(AuditService);
    encounterRepo = module.get(EncounterRepository);
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
});
