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
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ClinicalMeasurementsService } from './clinical-measurements.service';
import { MedicationReconciliationService } from '../medication-reconciliation/medication-reconciliation.service';
import { DiabetesScreeningService } from '../diabetes-screening/diabetes-screening.service';

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
  let medicationReconciliationService: jest.Mocked<MedicationReconciliationService>;
  let diabetesScreeningService: jest.Mocked<DiabetesScreeningService>;
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
      vitals: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'vitals-1',
          clinicId: 'clinic-1',
          encounter: { status: EncounterStatus.DRAFT },
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      diabetesScreening: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'diabetes-1',
          clinicId: 'clinic-1',
          encounter: { status: EncounterStatus.DRAFT },
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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
        {
          provide: MedicationReconciliationService,
          useValue: {
            createMedication: jest.fn().mockResolvedValue({}),
            reviseMedication: jest.fn().mockResolvedValue({}),
            reconcile: jest.fn().mockResolvedValue({}),
            createPharmacy: jest.fn().mockResolvedValue({}),
            revisePharmacy: jest.fn().mockResolvedValue({}),
            setPreferredPharmacy: jest.fn().mockResolvedValue({}),
            endPreferredPharmacy: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: DiabetesScreeningService,
          useValue: {
            validateSyncPayload: jest.fn().mockResolvedValue({
              dto: {
                glucoseMgDl: 126,
                glucoseType: 'FASTING',
                hba1cPercent: 6.4,
                symptoms: ['POLYURIA'],
                notes: null,
                collectedAt: '2026-08-12T12:00:00.000Z',
              },
              compatibility: {},
            }),
            upsert: jest.fn().mockResolvedValue({ id: 'diabetes-1' }),
          },
        },
      ],
    }).compile();

    service = module.get(SyncService);
    patientRepo = module.get(PatientRepository);
    prisma = module.get(PrismaService);
    encounterRepo = module.get(EncounterRepository);
    medicalHistoryService = module.get(MedicalHistoryService);
    clinicalMeasurementsService = module.get(ClinicalMeasurementsService);
    medicationReconciliationService = module.get(MedicationReconciliationService);
    diabetesScreeningService = module.get(DiabetesScreeningService);
  });

  describe('offline writes stay inside the request clinic', () => {
    const pushEncounter = (payload: Record<string, unknown>) =>
      service.applyMutations('clinic-1', mockUser as never, [
        {
          id: 'mut-enc-scope',
          entityType: 'encounter',
          entityId: '22222222-2222-4222-8222-222222222222',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          idempotencyKey: `idem-enc-${JSON.stringify(payload)}`,
          payloadJson: payload,
        } as SyncMutationDto,
      ]);

    beforeEach(() => {
      (prisma.patient.findFirst as jest.Mock) = jest.fn().mockResolvedValue({ id: 'patient-1' });
    });

    it('refuses an encounter payload that names another clinic', async () => {
      const results = await pushEncounter({ clinicId: 'clinic-2', patientId: 'patient-1' });

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
      expect(prisma.encounter.upsert).not.toHaveBeenCalled();
    });

    it('refuses a patient payload that names another primary clinic', async () => {
      process.env.NATIONAL_ID_ENCRYPTION_KEY = 'a'.repeat(64);
      const results = await service.applyMutations('clinic-1', mockUser as never, [
        {
          id: 'mut-pat-scope',
          entityType: 'patient',
          entityId: '33333333-3333-4333-8333-333333333333',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          idempotencyKey: 'idem-pat-scope',
          payloadJson: {
            patientCode: 'NKP-2025-000777',
            nationalId: '5555555555',
            primaryClinicId: 'clinic-2',
            firstName: 'Cross',
            lastName: 'Tenant',
          },
        } as SyncMutationDto,
      ]);

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
      expect(prisma.patient.upsert).not.toHaveBeenCalled();
    });

    it('refuses an encounter whose patient belongs to another clinic', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(null);

      const results = await pushEncounter({ patientId: 'patient-elsewhere' });

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
      expect(prisma.encounter.upsert).not.toHaveBeenCalled();
    });

    it('refuses to finalize an encounter through offline replay', async () => {
      // Finalization locks vitals, screenings, and clinical notes. It has its own route and its
      // own permission, and must not be reachable by replaying a queued payload.
      const results = await pushEncounter({ patientId: 'patient-1', status: 'FINALIZED' });

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.CONFLICT);
      expect(results[0].conflictType).toBe('UNSUPPORTED_STATUS_TRANSITION');
      expect(prisma.encounter.upsert).not.toHaveBeenCalled();
    });

    it('refuses to submit an encounter for review through offline replay', async () => {
      const results = await pushEncounter({ patientId: 'patient-1', status: 'IN_REVIEW' });

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.CONFLICT);
      expect(prisma.encounter.upsert).not.toHaveBeenCalled();
    });

    it('still applies a queued draft encounter', async () => {
      const results = await pushEncounter({ patientId: 'patient-1', status: 'DRAFT' });

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);
      expect(prisma.encounter.upsert).toHaveBeenCalledTimes(1);
      const args = (prisma.encounter.upsert as jest.Mock).mock.calls[0][0];
      expect(args.create.clinic).toEqual({ connect: { id: 'clinic-1' } });
      expect(args.create.status).toBe('DRAFT');
    });
  });

  describe('offline authorization', () => {
    const push = (
      roles: Array<{ clinicId: string | null; role: string }>,
      entityType: string,
      payload: Record<string, unknown> = {},
      operation: 'UPSERT' | 'DELETE' = 'UPSERT',
    ) =>
      service.applyMutations('clinic-1', { user: { id: 'actor-1' }, roles } as never, [
        {
          id: 'mut-authz',
          entityType,
          entityId: '11111111-1111-4111-8111-111111111111',
          operation,
          clinicId: 'clinic-1',
          idempotencyKey: `key-${entityType}-${operation}`,
          payloadJson: payload,
        } as SyncMutationDto,
      ]);

    it.each([
      ['DIRECTOR', 'care_plan'],
      ['DIRECTOR', 'prescription'],
      ['DIRECTOR', 'patient_consent'],
      ['MANAGER', 'prescription'],
      ['VOLUNTEER', 'prescription'],
      ['VOLUNTEER', 'care_plan'],
      ['DOCTOR', 'patient_consent'],
    ])('refuses a %s the %s write that REST already forbids', async (role, entityType) => {
      const results = await push([{ clinicId: 'clinic-1', role }], entityType, {
        encounterId: 'encounter-1',
      });

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
      expect(results[0].conflictType).toBe('APPLICATION_REJECTED');
      // Denied before dispatch, so no handler ran and no record was written.
      expect(prisma.patient.upsert).not.toHaveBeenCalled();
      expect(prisma.encounter.upsert).not.toHaveBeenCalled();
      // The refusal is still recorded, so an operator can see what a client tried to replay.
      expect(prisma.syncMutation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ERROR', conflictType: 'APPLICATION_REJECTED' }),
        }),
      );
    });

    it('does not let a volunteer seat at another clinic authorize a screening write here', async () => {
      // Manager at clinic-1, volunteer at clinic-2. The manager seat admits the request; only the
      // roles held at clinic-1 may decide what it is allowed to write.
      const results = await push(
        [
          { clinicId: 'clinic-1', role: 'MANAGER' },
          { clinicId: 'clinic-2', role: 'VOLUNTEER' },
        ],
        'diabetes_screening',
        { encounterId: 'encounter-1' },
      );

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
      expect(diabetesScreeningService.upsert).not.toHaveBeenCalled();
    });

    it('lets a volunteer register a patient but not edit an existing chart', async () => {
      process.env.NATIONAL_ID_ENCRYPTION_KEY = 'a'.repeat(64);
      (patientRepo.findById as jest.Mock).mockResolvedValue(null);
      const created = await push([{ clinicId: 'clinic-1', role: 'VOLUNTEER' }], 'patient', {
        patientCode: 'NKP-2025-000999',
        nationalId: '9876543210',
        primaryClinicId: 'clinic-1',
        firstName: 'New',
        lastName: 'Patient',
      });
      expect(created[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);

      (patientRepo.findById as jest.Mock).mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        patientCode: 'NKP-1',
      });
      const edited = await service.applyMutations(
        'clinic-1',
        { user: { id: 'actor-1' }, roles: [{ clinicId: 'clinic-1', role: 'VOLUNTEER' }] } as never,
        [
          {
            id: 'mut-edit',
            entityType: 'patient',
            entityId: '11111111-1111-4111-8111-111111111111',
            operation: 'UPSERT',
            clinicId: 'clinic-1',
            idempotencyKey: 'key-patient-edit',
            payloadJson: { firstName: 'Edited' },
          } as SyncMutationDto,
        ],
      );
      expect(edited[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
    });

    it('rejects an entity type that has no declared permission', async () => {
      const results = await push([{ clinicId: 'clinic-1', role: 'DOCTOR' }], 'clinical_note');
      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
    });
  });

  it('routes structured diabetes replay through the shared validated service', async () => {
    const mutation: SyncMutationDto = {
      id: 'mut-diabetes-1',
      entityType: 'diabetes_screening',
      entityId: 'diabetes-1',
      operation: 'UPSERT',
      clinicId: 'clinic-1',
      idempotencyKey: 'diabetes-idem-1',
      createdAt: '2026-08-12T12:00:00.000Z',
      payloadJson: {
        encounterId: 'enc-1',
        glucoseMgDl: 126,
        glucoseType: 'FASTING',
        hba1cPercent: 6.4,
        symptoms: ['POLYURIA'],
        notes: null,
        collectedAt: '2026-08-12T12:00:00.000Z',
      },
    };

    const results = await service.applyMutations('clinic-1', mockUser as never, [mutation]);

    expect(results).toEqual([{ id: 'mut-diabetes-1', status: 'APPLIED' }]);
    expect(diabetesScreeningService.validateSyncPayload).toHaveBeenCalledWith(
      mutation.payloadJson,
      mutation.createdAt,
    );
    expect(diabetesScreeningService.upsert).toHaveBeenCalledWith(
      'clinic-1',
      'enc-1',
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ symptoms: ['POLYURIA'] }),
      expect.objectContaining({
        syncMutation: expect.objectContaining({ idempotencyKey: 'diabetes-idem-1' }),
      }),
      'diabetes-1',
      {},
    );
  });

  it('rejects diabetes replay for a read-only director', async () => {
    diabetesScreeningService.upsert.mockRejectedValue(
      new ForbiddenException('SCREENING.WRITE is required'),
    );
    const results = await service.applyMutations(
      'clinic-1',
      {
        user: { id: 'director-1' },
        roles: [{ clinicId: 'clinic-1', role: 'DIRECTOR' }],
      } as never,
      [
        {
          id: 'mut-diabetes-2',
          entityType: 'diabetes_screening',
          entityId: 'diabetes-1',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          idempotencyKey: 'diabetes-idem-2',
          payloadJson: { encounterId: 'enc-1' },
        },
      ],
    );

    expect(results[0]).toMatchObject({ status: 'ERROR', conflictType: 'APPLICATION_REJECTED' });
  });

  it('rejects deleting diabetes screening from a finalized encounter', async () => {
    (prisma.diabetesScreening.findFirst as jest.Mock).mockResolvedValue({
      encounter: { status: EncounterStatus.FINALIZED },
    });
    const results = await service.applyMutations('clinic-1', mockUser as never, [
      {
        id: 'mut-delete-diabetes',
        entityType: 'diabetes_screening',
        entityId: 'diabetes-1',
        operation: 'DELETE',
        clinicId: 'clinic-1',
        idempotencyKey: 'delete-diabetes-1',
      },
    ]);

    expect(results[0]).toMatchObject({
      status: 'CONFLICT',
      conflictType: 'CONFLICT_FINALIZED',
    });
    expect(prisma.diabetesScreening.deleteMany).not.toHaveBeenCalled();
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

  it('rejects a vitals delete without screening write permission', async () => {
    const results = await service.applyMutations(
      'clinic-1',
      {
        user: { id: 'director-1' },
        roles: [{ clinicId: 'clinic-1', role: 'DIRECTOR' }],
      } as never,
      [
        {
          id: 'mut-delete-vitals',
          entityType: 'vitals',
          entityId: 'vitals-1',
          operation: 'DELETE',
          clinicId: 'clinic-1',
          idempotencyKey: 'delete-vitals-1',
        },
      ],
    );

    expect(results[0]).toMatchObject({
      status: SYNC_MUTATION_RESULT_STATUS.ERROR,
      conflictType: 'APPLICATION_REJECTED',
    });
    expect(prisma.vitals.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects deleting vitals from a finalized encounter', async () => {
    (prisma.vitals.findFirst as jest.Mock).mockResolvedValue({
      id: 'vitals-1',
      clinicId: 'clinic-1',
      encounter: { status: EncounterStatus.FINALIZED },
    });

    const results = await service.applyMutations('clinic-1', mockUser as never, [
      {
        id: 'mut-delete-finalized-vitals',
        entityType: 'vitals',
        entityId: 'vitals-1',
        operation: 'DELETE',
        clinicId: 'clinic-1',
        idempotencyKey: 'delete-finalized-vitals-1',
      },
    ]);

    expect(results[0]).toMatchObject({
      status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
      conflictType: 'CONFLICT_FINALIZED',
    });
    expect(prisma.vitals.deleteMany).not.toHaveBeenCalled();
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

  describe('patient UPSERT - residential location', () => {
    beforeAll(() => {
      process.env.NATIONAL_ID_ENCRYPTION_KEY = 'a'.repeat(64);
    });

    it('resolves and persists a recorded location on upsert', async () => {
      const mutations: SyncMutationDto[] = [
        {
          id: 'mut-loc-1',
          entityType: 'patient',
          entityId: 'patient-loc-1',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          payloadJson: {
            patientCode: 'NKP-2025-000123',
            nationalId: '1234567890',
            primaryClinicId: 'clinic-1',
            firstName: 'Ama',
            lastName: 'Mensah',
            residentialRegion: 'GREATER_ACCRA',
            residentialDistrict: 'accra metropolitan',
            residentialCommunity: 'Osu',
          },
          idempotencyKey: 'idem-loc-1',
        },
      ];

      await service.applyMutations('clinic-1', mockUser as never, mutations);

      expect(prisma.patient.upsert).toHaveBeenCalledTimes(1);
      const args = (prisma.patient.upsert as jest.Mock).mock.calls[0][0];
      expect(args.create).toEqual(
        expect.objectContaining({
          residentialLocationStatus: 'RECORDED',
          residentialRegion: 'GREATER_ACCRA',
          residentialDistrict: 'Accra Metropolitan',
          residentialCommunity: 'Osu',
        }),
      );
      expect(args.update).toEqual(
        expect.objectContaining({
          residentialLocationStatus: 'RECORDED',
          residentialRegion: 'GREATER_ACCRA',
        }),
      );
    });

    it('defaults to NOT_RECORDED when a synced patient carries no location', async () => {
      const mutations: SyncMutationDto[] = [
        {
          id: 'mut-loc-2',
          entityType: 'patient',
          entityId: 'patient-loc-2',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          payloadJson: {
            patientCode: 'NKP-2025-000124',
            nationalId: '1234567891',
            primaryClinicId: 'clinic-1',
            firstName: 'Kofi',
            lastName: 'Owusu',
          },
          idempotencyKey: 'idem-loc-2',
        },
      ];

      await service.applyMutations('clinic-1', mockUser as never, mutations);

      const args = (prisma.patient.upsert as jest.Mock).mock.calls[0][0];
      expect(args.create.residentialLocationStatus).toBe('NOT_RECORDED');
      expect(args.create.residentialRegion).toBeNull();
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

  describe('medication reconciliation replay', () => {
    const originalFlag = process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;

    beforeEach(() => {
      process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = 'true';
    });

    afterEach(() => {
      if (originalFlag === undefined) delete process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;
      else process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = originalFlag;
    });

    it('replays a client-identified external medication through the dedicated service', async () => {
      const mutation: SyncMutationDto = {
        id: 'mut-medication-1',
        entityType: 'patient_medication_revision',
        entityId: 'medication-record-1',
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey: 'medication-idem-1',
        payloadJson: {
          patientId: 'patient-1',
          revisionId: 'medication-revision-1',
          medicationName: 'External medicine',
          status: 'CURRENT',
          sourceType: 'PATIENT_REPORTED',
        },
      };

      const results = await service.applyMutations('clinic-1', mockUser as never, [mutation]);

      expect(results).toEqual([{ id: mutation.id, status: 'APPLIED' }]);
      expect(medicationReconciliationService.createMedication).toHaveBeenCalledWith(
        'clinic-1',
        'patient-1',
        'user-1',
        expect.objectContaining({
          recordId: mutation.entityId,
          medicationName: 'External medicine',
        }),
        { requestId: mutation.idempotencyKey },
      );
    });

    it('rejects reconciliation replay for a read-only director', async () => {
      const results = await service.applyMutations(
        'clinic-1',
        {
          user: { id: 'director-1' },
          roles: [{ clinicId: 'clinic-1', role: 'DIRECTOR' }],
        } as never,
        [
          {
            id: 'mut-medication-2',
            entityType: 'medication_reconciliation',
            entityId: 'event-1',
            operation: 'UPSERT',
            clinicId: 'clinic-1',
            idempotencyKey: 'medication-idem-2',
            payloadJson: {
              patientId: 'patient-1',
              outcome: 'NO_KNOWN_CURRENT_MEDICATIONS',
              items: [],
            },
          },
        ],
      );

      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.ERROR,
        conflictType: 'APPLICATION_REJECTED',
      });
      expect(medicationReconciliationService.reconcile).not.toHaveBeenCalled();
    });

    it('keeps a stale medication revision as a structured replay conflict', async () => {
      medicationReconciliationService.reviseMedication.mockRejectedValue(
        new ConflictException({
          code: 'MEDICATION_REVISION_CONFLICT',
          latest: { currentRevisionId: 'revision-4' },
        }),
      );
      const results = await service.applyMutations('clinic-1', mockUser as never, [
        {
          id: 'mut-medication-3',
          entityType: 'patient_medication_revision',
          entityId: 'medication-record-1',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          idempotencyKey: 'medication-idem-3',
          payloadJson: {
            patientId: 'patient-1',
            revisionId: 'revision-5',
            expectedCurrentRevisionId: 'revision-3',
            medicationName: 'External medicine',
            status: 'CURRENT',
            sourceType: 'PATIENT_REPORTED',
          },
        },
      ]);

      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'MEDICATION_REVISION_CONFLICT',
      });
      expect(prisma.syncMutation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'CONFLICT',
          conflictType: 'MEDICATION_REVISION_CONFLICT',
        }),
      });
    });

    it('does not reapply an already-applied medication mutation', async () => {
      (prisma.syncMutation.findUnique as jest.Mock).mockResolvedValue({
        status: 'APPLIED',
        conflictType: null,
        conflictDetailsJson: null,
      });
      const results = await service.applyMutations('clinic-1', mockUser as never, [
        {
          id: 'mut-medication-4',
          entityType: 'patient_medication_revision',
          entityId: 'medication-record-1',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          idempotencyKey: 'medication-idem-4',
          payloadJson: {},
        },
      ]);

      expect(results).toEqual([{ id: 'mut-medication-4', status: 'APPLIED' }]);
      expect(medicationReconciliationService.createMedication).not.toHaveBeenCalled();
      expect(medicationReconciliationService.reviseMedication).not.toHaveBeenCalled();
    });
  });
});
