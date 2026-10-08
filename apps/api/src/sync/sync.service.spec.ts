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
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClinicalMeasurementsService } from './clinical-measurements.service';
import { MedicationReconciliationService } from '../medication-reconciliation/medication-reconciliation.service';
import { DiabetesScreeningService } from '../diabetes-screening/diabetes-screening.service';
import { HypertensionAssessmentService } from '../hypertension-assessment/hypertension-assessment.service';
import { MedicationAdherenceService } from '../medication-adherence/medication-adherence.service';
import { PrescriptionService } from '../prescriptions/prescription.service';
import { OpsService } from '../ops/ops.service';
import { createSyncMutationStore } from '../testing/sync-mutation-store';
import { ClinicianPlanSealService } from './clinician-plan-seal.service';
import { sealClinicianPlan } from '@nkwapa/db';

const mockUser = {
  user: { id: 'user-1' },
  roles: [{ clinicId: 'clinic-1', role: 'VOLUNTEER' }],
};

describe('SyncService', () => {
  let service: SyncService;
  let moduleRef: TestingModule;
  let patientRepo: jest.Mocked<PatientRepository>;
  let encounterRepo: jest.Mocked<EncounterRepository>;
  let prisma: jest.Mocked<PrismaService>;
  let medicalHistoryService: jest.Mocked<MedicalHistoryService>;
  let clinicalMeasurementsService: jest.Mocked<ClinicalMeasurementsService>;
  let medicationReconciliationService: jest.Mocked<MedicationReconciliationService>;
  let diabetesScreeningService: jest.Mocked<DiabetesScreeningService>;
  let hypertensionAssessmentService: jest.Mocked<HypertensionAssessmentService>;
  let medicationAdherenceService: jest.Mocked<MedicationAdherenceService>;
  let prescriptionService: jest.Mocked<PrescriptionService>;
  let opsService: jest.Mocked<OpsService>;
  beforeEach(async () => {
    const mockPrisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      syncMutation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      patient: {
        findFirst: jest.fn().mockResolvedValue(null),
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
            upsertClinicianPlan: jest.fn().mockResolvedValue({ id: 'diabetes-1' }),
          },
        },
        {
          provide: HypertensionAssessmentService,
          useValue: {
            validateSyncPayload: jest.fn().mockResolvedValue({
              dto: {
                hypertensionStatus: 'KNOWN_HYPERTENSION',
                currentSymptoms: [],
                classificationOverridden: false,
                collectedAt: '2026-09-13T12:00:00.000Z',
              },
            }),
            upsert: jest.fn().mockResolvedValue({ id: 'hypertension-1' }),
            upsertClinicianPlan: jest.fn().mockResolvedValue({ id: 'hypertension-1' }),
          },
        },
        // The real one: replay tests seal with the browser's own function and must open here.
        ClinicianPlanSealService,
        {
          provide: MedicationAdherenceService,
          useValue: {
            validateSyncPayload: jest.fn().mockResolvedValue({
              dto: { context: 'HYPERTENSION', entries: [] },
            }),
            replaceForEncounter: jest.fn().mockResolvedValue({ items: [] }),
          },
        },
        {
          provide: PrescriptionService,
          useValue: {
            validateSyncPayload: jest.fn().mockResolvedValue({
              dto: { drugId: 'drug-1', dosage: '10 mg', frequency: 'Once daily' },
            }),
            upsertFromSync: jest.fn().mockResolvedValue({ id: 'prescription-1' }),
          },
        },
        {
          provide: OpsService,
          useValue: {
            checkIn: jest.fn().mockResolvedValue({ id: 'shift-1' }),
            checkOut: jest.fn().mockResolvedValue({ id: 'shift-1' }),
            createCheckIn: jest.fn().mockResolvedValue({ id: 'checkin-1' }),
          },
        },
      ],
    }).compile();

    moduleRef = module;
    service = module.get(SyncService);
    patientRepo = module.get(PatientRepository);
    prisma = module.get(PrismaService);
    encounterRepo = module.get(EncounterRepository);
    medicalHistoryService = module.get(MedicalHistoryService);
    clinicalMeasurementsService = module.get(ClinicalMeasurementsService);
    medicationReconciliationService = module.get(MedicationReconciliationService);
    diabetesScreeningService = module.get(DiabetesScreeningService);
    hypertensionAssessmentService = module.get(HypertensionAssessmentService);
    medicationAdherenceService = module.get(MedicationAdherenceService);
    prescriptionService = module.get(PrescriptionService);
    opsService = module.get(OpsService);
  });

  describe('clinic operations replay', () => {
    const SHIFT_ID = '0b9a4a8e-4c1f-4c38-9b2d-6f1f8f0a1c01';
    const CHECKIN_ID = '0b9a4a8e-4c1f-4c38-9b2d-6f1f8f0a1c02';
    const PATIENT_ID = '0b9a4a8e-4c1f-4c38-9b2d-6f1f8f0a1c03';
    const occurredAt = '2026-03-21T08:15:00.000Z';
    const opsMutation = (
      entityType: string,
      entityId: string,
      payloadJson: Record<string, unknown>,
      idempotencyKey = `ops:${entityType}:${entityId}`,
    ): SyncMutationDto =>
      ({
        id: `mut-${entityType}`,
        entityType,
        entityId,
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        payloadJson: { schemaVersion: 1, occurredAt, ...payloadJson },
        idempotencyKey,
      }) as SyncMutationDto;
    const push = (mutation: SyncMutationDto, user: unknown = mockUser) =>
      service.applyMutations('clinic-1', user as never, [mutation]);

    it('replays a shift check-in under its client id at the device time', async () => {
      const [result] = await push(
        opsMutation('shift_check_in', SHIFT_ID, { roleAtShift: 'VOLUNTEER' }),
      );

      expect(result).toMatchObject({ status: 'APPLIED' });
      expect(opsService.checkIn).toHaveBeenCalledWith(
        'clinic-1',
        'user-1',
        { id: SHIFT_ID, roleAtShift: 'VOLUNTEER', notes: undefined },
        expect.objectContaining({
          requestId: `ops:shift_check_in:${SHIFT_ID}`,
          replay: expect.objectContaining({
            occurredAt: new Date(occurredAt),
            syncMutation: {
              entityType: 'shift_check_in',
              entityId: SHIFT_ID,
              idempotencyKey: `ops:shift_check_in:${SHIFT_ID}`,
            },
          }),
        }),
      );
      // The ops service commits the idempotency record with the write; sync must not add another.
      expect(prisma.syncMutation.create).not.toHaveBeenCalled();
    });

    it('replays a shift check-out against the shift the entity id names', async () => {
      const [result] = await push(opsMutation('shift_check_out', SHIFT_ID, {}));

      expect(result.status).toBe('APPLIED');
      expect(opsService.checkOut).toHaveBeenCalledWith(
        'clinic-1',
        SHIFT_ID,
        'user-1',
        expect.objectContaining({ replay: expect.any(Object) }),
      );
    });

    it('replays a patient check-in under its client id', async () => {
      const [result] = await push(
        opsMutation('patient_check_in', CHECKIN_ID, { patientId: PATIENT_ID }),
      );

      expect(result.status).toBe('APPLIED');
      expect(opsService.createCheckIn).toHaveBeenCalledWith(
        'clinic-1',
        'user-1',
        expect.objectContaining({ id: CHECKIN_ID, patientId: PATIENT_ID }),
        expect.objectContaining({ replay: expect.any(Object) }),
      );
    });

    it('answers a duplicate replay from the idempotency record without a second write', async () => {
      (prisma.syncMutation.findUnique as jest.Mock).mockResolvedValueOnce({
        status: 'APPLIED',
        conflictType: null,
        conflictDetailsJson: null,
      });

      const [result] = await push(
        opsMutation('patient_check_in', CHECKIN_ID, { patientId: PATIENT_ID }),
      );

      expect(result.status).toBe('APPLIED');
      expect(opsService.createCheckIn).not.toHaveBeenCalled();
    });

    it('blocks a check-in that collides with another active shift and names it', async () => {
      opsService.checkIn.mockRejectedValueOnce(
        new ConflictException({
          code: 'SHIFT_ALREADY_ACTIVE',
          message: 'User already has an active shift in this clinic',
          existingShiftId: 'shift-other',
          existingShift: { notes: 'not for the client' },
        }),
      );

      const [result] = await push(
        opsMutation('shift_check_in', SHIFT_ID, { roleAtShift: 'VOLUNTEER' }),
      );

      expect(result).toMatchObject({
        status: 'CONFLICT',
        conflictType: 'SHIFT_ALREADY_ACTIVE',
        retryable: false,
        conflictDetails: expect.objectContaining({ existingShiftId: 'shift-other' }),
      });
      expect(result.conflictDetails).not.toHaveProperty('existingShift');
      // Not cached: once the other shift is closed, a retry by the clinician should run again.
      expect(prisma.syncMutation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'CONFLICT', conflictType: 'SHIFT_ALREADY_ACTIVE' }),
      });
    });

    it('blocks a second open check-in for the same patient and links the existing one', async () => {
      opsService.createCheckIn.mockRejectedValueOnce(
        new ConflictException({
          code: 'PATIENT_ALREADY_CHECKED_IN',
          message: 'This patient is already checked in today.',
          existingCheckInId: 'checkin-open',
        }),
      );

      const [result] = await push(
        opsMutation('patient_check_in', CHECKIN_ID, { patientId: PATIENT_ID }),
      );

      expect(result).toMatchObject({
        status: 'CONFLICT',
        conflictType: 'PATIENT_ALREADY_CHECKED_IN',
        retryable: false,
        conflictDetails: expect.objectContaining({ existingCheckInId: 'checkin-open' }),
      });
    });

    it('reports an expired replay as a refusal that will not clear by itself', async () => {
      opsService.checkIn.mockRejectedValueOnce(
        new BadRequestException({
          code: 'OPS_REPLAY_EXPIRED',
          message: 'This action was recorded on an earlier clinic day.',
        }),
      );

      const [result] = await push(
        opsMutation('shift_check_in', SHIFT_ID, { roleAtShift: 'VOLUNTEER' }),
      );

      expect(result).toMatchObject({
        status: 'ERROR',
        conflictType: 'OPS_REPLAY_EXPIRED',
        retryable: false,
      });
    });

    it('keeps a check-out that arrived before its check-in retryable', async () => {
      opsService.checkOut.mockRejectedValueOnce(
        new NotFoundException({ code: 'SHIFT_NOT_FOUND', message: 'Shift not found' }),
      );

      const [result] = await push(opsMutation('shift_check_out', SHIFT_ID, {}));

      expect(result).toMatchObject({ conflictType: 'SHIFT_NOT_FOUND', retryable: true });
    });

    it.each([
      ['an unknown key', { roleAtShift: 'VOLUNTEER', shiftId: 'someone-elses' }],
      ['a missing time', { roleAtShift: 'VOLUNTEER', occurredAt: undefined }],
      ['a role that does not exist', { roleAtShift: 'SYSTEM_ADMIN' }],
      ['a future schema', { roleAtShift: 'VOLUNTEER', schemaVersion: 2 }],
    ])('refuses a payload with %s before reaching the ops service', async (_label, payload) => {
      const [result] = await push(opsMutation('shift_check_in', SHIFT_ID, payload));

      expect(result).toMatchObject({ conflictType: 'VALIDATION_ERROR', retryable: false });
      expect(opsService.checkIn).not.toHaveBeenCalled();
    });

    it.each([
      ['shift_check_in', { roleAtShift: 'DOCTOR' }],
      ['shift_check_out', {}],
    ])('refuses %s from a director, as the REST route does', async (entityType, payload) => {
      const director = {
        user: { id: 'user-1' },
        roles: [{ clinicId: 'clinic-1', role: 'DIRECTOR' }],
      };

      const [result] = await push(opsMutation(entityType, SHIFT_ID, payload), director);

      expect(result).toMatchObject({ conflictType: 'FORBIDDEN' });
      expect(opsService.checkIn).not.toHaveBeenCalled();
      expect(opsService.checkOut).not.toHaveBeenCalled();
    });

    it('lets a director replay a patient check-in, as the REST route does', async () => {
      const director = {
        user: { id: 'user-1' },
        roles: [{ clinicId: 'clinic-1', role: 'DIRECTOR' }],
      };

      const [result] = await push(
        opsMutation('patient_check_in', CHECKIN_ID, { patientId: PATIENT_ID }),
        director,
      );

      expect(result.status).toBe('APPLIED');
    });

    it('refuses a patient check-in queued against a merged chart', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValueOnce({
        id: PATIENT_ID,
        mergedIntoPatientId: 'patient-canonical',
      });
      (prisma.patient.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'patient-canonical',
        patientCode: 'NKP-1',
      });

      const [result] = await push(
        opsMutation('patient_check_in', CHECKIN_ID, { patientId: PATIENT_ID }),
      );

      expect(result).toMatchObject({ status: 'CONFLICT', conflictType: 'PATIENT_MERGED' });
      expect(opsService.createCheckIn).not.toHaveBeenCalled();
    });
  });

  describe('replay recovery', () => {
    const vitalsMutation = (idempotencyKey: string): SyncMutationDto =>
      ({
        id: 'mut-replay',
        entityType: 'diabetes_screening',
        entityId: '44444444-4444-4444-8444-444444444444',
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey,
        payloadJson: { encounterId: 'enc-1' },
      }) as SyncMutationDto;

    beforeEach(() => {
      (encounterRepo.findById as jest.Mock).mockResolvedValue({
        id: 'enc-1',
        clinicId: 'clinic-1',
        status: EncounterStatus.DRAFT,
      });
    });

    it('does not re-apply a mutation that already succeeded', async () => {
      (prisma.syncMutation.findUnique as jest.Mock).mockResolvedValue({
        status: 'APPLIED',
        conflictType: null,
        conflictDetailsJson: null,
      });

      const results = await service.applyMutations('clinic-1', mockUser as never, [
        vitalsMutation('idem-applied'),
      ]);

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);
      expect(diabetesScreeningService.upsert).not.toHaveBeenCalled();
      expect(prisma.syncMutation.delete).not.toHaveBeenCalled();
    });

    it('does not re-attempt a conflict that server state cannot resolve', async () => {
      (prisma.syncMutation.findUnique as jest.Mock).mockResolvedValue({
        status: 'CONFLICT',
        conflictType: 'CONFLICT_FINALIZED',
        conflictDetailsJson: JSON.stringify({ message: 'locked' }),
      });

      const results = await service.applyMutations('clinic-1', mockUser as never, [
        vitalsMutation('idem-finalized'),
      ]);

      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'CONFLICT_FINALIZED',
        retryable: false,
      });
      expect(diabetesScreeningService.upsert).not.toHaveBeenCalled();
    });

    it('re-attempts a mutation whose earlier failure could since have been fixed', async () => {
      // The poisoned outbox: the server cached the failure against the idempotency key, so a
      // client that kept its queued row could never drain it even once the cause was resolved.
      (prisma.syncMutation.findUnique as jest.Mock).mockResolvedValue({
        status: 'ERROR',
        conflictType: 'FORBIDDEN',
        conflictDetailsJson: JSON.stringify({ message: 'permission required' }),
      });

      const results = await service.applyMutations('clinic-1', mockUser as never, [
        vitalsMutation('idem-was-forbidden'),
      ]);

      expect(prisma.syncMutation.delete).toHaveBeenCalledWith({
        where: {
          clinicId_idempotencyKey: { clinicId: 'clinic-1', idempotencyKey: 'idem-was-forbidden' },
        },
      });
      expect(diabetesScreeningService.upsert).toHaveBeenCalledTimes(1);
      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);
    });
  });

  describe('idempotent replay against the recorded outcome', () => {
    const ENCOUNTER_ID = '55555555-5555-4555-8555-555555555555';
    let store: ReturnType<typeof createSyncMutationStore>;

    const encounterChange = (
      overrides: Partial<SyncMutationDto> = {},
      payload: Record<string, unknown> = {},
    ): SyncMutationDto =>
      ({
        id: 'mut-encounter',
        entityType: 'encounter',
        entityId: ENCOUNTER_ID,
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey: 'idem-encounter',
        payloadJson: { patientId: 'patient-1', status: 'DRAFT', ...payload },
        ...overrides,
      }) as SyncMutationDto;

    const pushAt = (
      clinicId: string,
      mutations: SyncMutationDto[],
      roles: Array<{ clinicId: string; role: string }> = mockUser.roles,
    ) => service.applyMutations(clinicId, { user: { id: 'user-1' }, roles } as never, mutations);

    beforeEach(() => {
      store = createSyncMutationStore();
      Object.assign(prisma.syncMutation, store.syncMutation);
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue({ id: 'patient-1' });
    });

    it("answers a second push of the same change with the first push's outcome, without writing again", async () => {
      const [first] = await pushAt('clinic-1', [encounterChange()]);
      const [second] = await pushAt('clinic-1', [encounterChange()]);

      expect(first.status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);
      expect(second).toEqual(first);
      expect(prisma.encounter.upsert).toHaveBeenCalledTimes(1);
      expect(store.records.size).toBe(1);
    });

    it('replays a deterministic conflict with the details it was first refused with', async () => {
      (encounterRepo.findById as jest.Mock).mockResolvedValue({
        id: ENCOUNTER_ID,
        status: EncounterStatus.FINALIZED,
      });
      const [first] = await pushAt('clinic-1', [encounterChange()]);

      // Whatever the server holds now, a refusal a replay cannot change is answered from the record.
      (encounterRepo.findById as jest.Mock).mockResolvedValue(null);
      const [second] = await pushAt('clinic-1', [encounterChange()]);

      expect(first).toMatchObject({ status: 'CONFLICT', conflictType: 'CONFLICT_FINALIZED' });
      expect(second).toEqual({ ...first, retryable: false });
      expect(second.conflictDetails).toEqual(first.conflictDetails);
      expect(prisma.encounter.upsert).not.toHaveBeenCalled();
    });

    it('applies a change once when it appears twice in one push', async () => {
      const results = await pushAt('clinic-1', [
        encounterChange({ id: 'mut-first' }),
        encounterChange({ id: 'mut-again' }),
      ]);

      expect(results.map((result) => [result.id, result.status])).toEqual([
        ['mut-first', 'APPLIED'],
        ['mut-again', 'APPLIED'],
      ]);
      expect(prisma.encounter.upsert).toHaveBeenCalledTimes(1);
    });

    it('holds the idempotency key for the rest of the request before reading its record', async () => {
      await pushAt('clinic-1', [encounterChange()]);

      const lock = prisma.$executeRaw as unknown as jest.Mock;
      expect(lock).toHaveBeenCalledTimes(1);
      const [sql, key] = lock.mock.calls[0] as [TemplateStringsArray, string];
      expect(sql.join('?')).toContain('pg_advisory_xact_lock');
      expect(key).toBe('sync-mutation:clinic-1:idem-encounter');
      // The lock must come first, or a concurrent push could read "no record" before this one
      // writes it.
      expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
        store.syncMutation.findUnique.mock.invocationCallOrder[0],
      );
    });

    it('keeps the same idempotency key at two clinics as two changes', async () => {
      const bothClinics = [
        { clinicId: 'clinic-1', role: 'VOLUNTEER' },
        { clinicId: 'clinic-2', role: 'VOLUNTEER' },
      ];
      await pushAt('clinic-1', [encounterChange()], bothClinics);
      const [atB] = await pushAt(
        'clinic-2',
        [encounterChange({ clinicId: 'clinic-2' })],
        bothClinics,
      );

      expect(atB.status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);
      expect(prisma.encounter.upsert).toHaveBeenCalledTimes(2);
      expect([...store.records.keys()].sort()).toEqual([
        'clinic-1|idem-encounter',
        'clinic-2|idem-encounter',
      ]);
    });

    it('refuses a change queued under another clinic without recording it, and applies the rest', async () => {
      const results = await pushAt('clinic-1', [
        encounterChange({ id: 'mut-stale', clinicId: 'clinic-2', idempotencyKey: 'idem-stale' }),
        encounterChange({ id: 'mut-here' }),
      ]);

      expect(results[0]).toMatchObject({
        id: 'mut-stale',
        status: SYNC_MUTATION_RESULT_STATUS.ERROR,
        conflictType: 'CLINIC_MISMATCH',
      });
      expect(results[1]).toMatchObject({ id: 'mut-here', status: 'APPLIED' });
      // Nothing is written under this clinic for a change that belongs to another, so it stays
      // free to apply when the device sends it to the right one.
      expect(store.records.has('clinic-1|idem-stale')).toBe(false);
      expect(prisma.encounter.upsert).toHaveBeenCalledTimes(1);
    });

    it('lets a change refused for a lost role through once the role is restored', async () => {
      const [refused] = await pushAt(
        'clinic-1',
        [encounterChange()],
        [{ clinicId: 'clinic-1', role: 'DIRECTOR' }],
      );
      const [restored] = await pushAt('clinic-1', [encounterChange()]);

      expect(refused).toMatchObject({
        status: 'ERROR',
        conflictType: 'FORBIDDEN',
        retryable: true,
      });
      expect(restored.status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);
      expect(store.records.get('clinic-1|idem-encounter')?.status).toBe('APPLIED');
    });
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

    it('refuses an encounter queued against a chart that has since been merged', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        mergedIntoPatientId: 'canonical-1',
      });
      (patientRepo.findById as jest.Mock).mockResolvedValue({
        id: 'canonical-1',
        patientCode: 'NKP-2025-000011',
      });

      const results = await pushEncounter({ patientId: 'patient-1' });

      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'PATIENT_MERGED',
        retryable: false,
        conflictDetails: { canonicalPatientId: 'canonical-1', patientCode: 'NKP-2025-000011' },
      });
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
      // A permission denial is labelled distinctly and stays retryable, because granting the
      // role later is exactly the thing that should let the queued change through.
      expect(results[0].conflictType).toBe('FORBIDDEN');
      expect(results[0].retryable).toBe(true);
      // Denied before dispatch, so no handler ran and no record was written.
      expect(prisma.patient.upsert).not.toHaveBeenCalled();
      expect(prisma.encounter.upsert).not.toHaveBeenCalled();
      // The refusal is still recorded, so an operator can see what a client tried to replay.
      expect(prisma.syncMutation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ERROR', conflictType: 'FORBIDDEN' }),
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

  /*
    The hypertension replay path is the point of the new module.

    It used to be an inline upsert in this file that cast `payload.classification` straight to the
    enum and coalesced everything else with `?? existing?.x ?? default`, so an offline device could
    write a value the REST route would have rejected. These two assert that the offline path now
    goes through the same validated service, and that a device cannot assert the escalation the
    server is supposed to derive.
  */
  it('routes hypertension replay through the shared validated service', async () => {
    const mutation: SyncMutationDto = {
      id: 'mut-htn-1',
      entityType: 'hypertension_assessment',
      entityId: 'htn-1',
      operation: 'UPSERT',
      clinicId: 'clinic-1',
      idempotencyKey: 'htn-idem-1',
      createdAt: '2026-09-13T12:00:00.000Z',
      payloadJson: {
        encounterId: 'enc-1',
        hypertensionStatus: 'KNOWN_HYPERTENSION',
        currentSymptoms: ['CHEST_PAIN'],
        classificationOverridden: false,
      },
    };

    const results = await service.applyMutations('clinic-1', mockUser as never, [mutation]);

    expect(results).toEqual([{ id: 'mut-htn-1', status: 'APPLIED' }]);
    expect(hypertensionAssessmentService.validateSyncPayload).toHaveBeenCalledWith(
      mutation.payloadJson,
      mutation.createdAt,
    );
    expect(hypertensionAssessmentService.upsert).toHaveBeenCalledWith(
      'clinic-1',
      'enc-1',
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ hypertensionStatus: 'KNOWN_HYPERTENSION' }),
      expect.objectContaining({
        syncMutation: expect.objectContaining({ idempotencyKey: 'htn-idem-1' }),
      }),
      'htn-1',
    );
  });

  it('surfaces a rejected hypertension payload as an error rather than writing it', async () => {
    hypertensionAssessmentService.validateSyncPayload.mockRejectedValueOnce(
      new BadRequestException({ code: 'VALIDATION_ERROR' }),
    );

    const results = await service.applyMutations('clinic-1', mockUser as never, [
      {
        id: 'mut-htn-2',
        entityType: 'hypertension_assessment',
        entityId: 'htn-1',
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey: 'htn-idem-2',
        payloadJson: { encounterId: 'enc-1', classification: 'BOGUS' },
      } as SyncMutationDto,
    ]);

    expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
    expect(hypertensionAssessmentService.upsert).not.toHaveBeenCalled();
  });

  /*
    The set, not a row.

    A medication dropped from the reconciled list has to lose its observation, and a per-row replay
    could never say so. `entityId` identifies the set for one encounter and one condition, so the
    two conditions replay independently.
  */
  it('routes an adherence replay through the shared validated service', async () => {
    const mutation: SyncMutationDto = {
      id: 'mut-adh-1',
      entityType: 'encounter_medication_adherence',
      entityId: 'adh-set-1',
      operation: 'UPSERT',
      clinicId: 'clinic-1',
      idempotencyKey: 'adh-idem-1',
      createdAt: '2026-09-13T12:00:00.000Z',
      payloadJson: { encounterId: 'enc-1', context: 'HYPERTENSION', entries: [] },
    } as SyncMutationDto;

    const results = await service.applyMutations('clinic-1', mockUser as never, [mutation]);

    expect(results).toEqual([{ id: 'mut-adh-1', status: 'APPLIED' }]);
    expect(medicationAdherenceService.validateSyncPayload).toHaveBeenCalledWith(
      mutation.payloadJson,
    );
    expect(medicationAdherenceService.replaceForEncounter).toHaveBeenCalledWith(
      'clinic-1',
      'enc-1',
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ context: 'HYPERTENSION' }),
      expect.objectContaining({
        syncMutation: expect.objectContaining({ idempotencyKey: 'adh-idem-1' }),
      }),
    );
  });

  it('surfaces a rejected adherence payload as an error rather than writing it', async () => {
    // The offline path validates through the same DTO as the REST route, so a value outside the
    // vocabulary is refused before anything is written -- which is what hypertension lacked.
    medicationAdherenceService.validateSyncPayload.mockRejectedValueOnce(
      new BadRequestException({ code: 'VALIDATION_ERROR' }),
    );

    const results = await service.applyMutations('clinic-1', mockUser as never, [
      {
        id: 'mut-adh-2',
        entityType: 'encounter_medication_adherence',
        entityId: 'adh-set-1',
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey: 'adh-idem-2',
        payloadJson: {
          encounterId: 'enc-1',
          context: 'HYPERTENSION',
          entries: [{ supplyRemaining: 'BOGUS' }],
        },
      } as SyncMutationDto,
    ]);

    expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
    expect(medicationAdherenceService.replaceForEncounter).not.toHaveBeenCalled();
  });

  /*
    Prescriptions replay through the service, not an inline upsert.

    The handler used to write them with a Prisma upsert that checked neither the drug's clinic nor
    the payload's shape, and took the prescriber from the payload. See #134.
  */
  it('routes a prescription replay through the shared validated service', async () => {
    const mutation = {
      id: 'mut-rx-1',
      entityType: 'prescription',
      entityId: '55555555-5555-4555-8555-555555555555',
      operation: 'UPSERT',
      clinicId: 'clinic-1',
      idempotencyKey: 'rx-idem-1',
      payloadJson: {
        encounterId: 'enc-1',
        drugId: '11111111-1111-4111-8111-111111111111',
        dosage: '10 mg',
        frequency: 'Once daily',
        prescribedByUserId: 'a-different-doctor',
      },
    } as SyncMutationDto;

    const doctor = {
      user: { id: 'user-1' },
      roles: [{ clinicId: 'clinic-1', role: 'DOCTOR' }],
    };
    const results = await service.applyMutations('clinic-1', doctor as never, [mutation]);

    expect(results).toEqual([{ id: 'mut-rx-1', status: 'APPLIED' }]);
    expect(prescriptionService.validateSyncPayload).toHaveBeenCalledWith(mutation.payloadJson);
    expect(prescriptionService.upsertFromSync).toHaveBeenCalledWith(
      'clinic-1',
      'enc-1',
      // The id the device queued, so a redelivery is not a second prescription.
      '55555555-5555-4555-8555-555555555555',
      expect.objectContaining({ dosage: '10 mg' }),
      // The prescriber is the replaying actor; the payload named someone else.
      expect.objectContaining({ actorUserId: 'user-1' }),
    );
  });

  it('surfaces a rejected prescription payload as an error rather than writing it', async () => {
    prescriptionService.validateSyncPayload.mockRejectedValueOnce(
      new BadRequestException({ code: 'VALIDATION_ERROR' }),
    );

    const doctor = {
      user: { id: 'user-1' },
      roles: [{ clinicId: 'clinic-1', role: 'DOCTOR' }],
    };
    const results = await service.applyMutations('clinic-1', doctor as never, [
      {
        id: 'mut-rx-2',
        entityType: 'prescription',
        entityId: '55555555-5555-4555-8555-555555555555',
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey: 'rx-idem-2',
        payloadJson: { encounterId: 'enc-1', drugId: 'not-a-uuid' },
      } as SyncMutationDto,
    ]);

    expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.ERROR);
    expect(prescriptionService.upsertFromSync).not.toHaveBeenCalled();
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

    expect(results[0]).toMatchObject({ status: 'ERROR', conflictType: 'FORBIDDEN' });
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
      conflictType: 'FORBIDDEN',
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

  describe('patient UPSERT - identity conflicts', () => {
    const PATIENT_ID = '44444444-4444-4444-8444-444444444444';
    const pushPatient = (payloadJson: Record<string, unknown>, roles = mockUser.roles) =>
      service.applyMutations('clinic-1', { user: { id: 'user-1' }, roles } as never, [
        {
          id: 'mut-1',
          entityType: 'patient',
          entityId: PATIENT_ID,
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          payloadJson,
          idempotencyKey: `idem-${JSON.stringify(payloadJson)}`,
        } as SyncMutationDto,
      ]);
    const doctor = [{ clinicId: 'clinic-1', role: 'DOCTOR' }];

    beforeAll(() => {
      process.env.NATIONAL_ID_ENCRYPTION_KEY = 'a'.repeat(64);
    });

    beforeEach(() => {
      (prisma.patient as unknown as { update: jest.Mock }).update = jest.fn().mockResolvedValue({
        id: PATIENT_ID,
        primaryClinicId: 'clinic-1',
      });
    });

    it('returns CONFLICT with DUPLICATE_NATIONAL_ID when nationalIdHash matches existing patient with different id', async () => {
      (patientRepo.findByNationalIdHash as jest.Mock).mockResolvedValue({
        id: 'existing-patient-id',
        patientCode: 'NKP-2025-000099',
      });

      const results = await pushPatient({
        nationalId: '1234567890',
        primaryClinicId: 'clinic-1',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'DUPLICATE_NATIONAL_ID',
        retryable: false,
        conflictDetails: {
          existingPatientId: 'existing-patient-id',
          patientCode: 'NKP-2025-000099',
        },
      });
      expect(prisma.patient.upsert).not.toHaveBeenCalled();
      expect(prisma.syncMutation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CONFLICT',
            conflictType: 'DUPLICATE_NATIONAL_ID',
          }),
        }),
      );
    });

    it('applies an offline edit of an existing chart that carries no national ID', async () => {
      // The device stopped storing national IDs, so this is every offline patient edit. It was
      // refused with a plain Error, classified as retryable, and re-sent on every sync forever.
      (patientRepo.findById as jest.Mock).mockResolvedValue({
        id: PATIENT_ID,
        patientCode: 'NKP-2025-000010',
        primaryClinicId: 'clinic-1',
        mergedIntoPatientId: null,
      });

      const results = await pushPatient({ firstName: 'Edited', lastName: 'Name' }, doctor);

      expect(results[0].status).toBe(SYNC_MUTATION_RESULT_STATUS.APPLIED);
      expect(patientRepo.findByNationalIdHash).not.toHaveBeenCalled();
      expect(prisma.patient.upsert).not.toHaveBeenCalled();
      const update = (prisma.patient as unknown as { update: jest.Mock }).update;
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PATIENT_ID },
          data: expect.not.objectContaining({ nationalIdHash: expect.anything() }),
        }),
      );
    });

    it('refuses a new chart without a national ID as something a replay cannot fix', async () => {
      const results = await pushPatient({ firstName: 'No', lastName: 'Identifier' });

      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.ERROR,
        conflictType: 'PATIENT_NATIONAL_ID_REQUIRED',
        retryable: false,
      });
    });

    it('points an edit of a merged chart at the chart that survived', async () => {
      (patientRepo.findById as jest.Mock).mockImplementation(async (id: string) =>
        id === PATIENT_ID
          ? {
              id: PATIENT_ID,
              patientCode: 'NKP-2025-000010-M',
              primaryClinicId: 'clinic-1',
              mergedIntoPatientId: 'canonical-1',
            }
          : { id: 'canonical-1', patientCode: 'NKP-2025-000011', primaryClinicId: 'clinic-1' },
      );

      const results = await pushPatient({ firstName: 'Late', lastName: 'Edit' }, doctor);

      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'PATIENT_MERGED',
        retryable: false,
        conflictDetails: { canonicalPatientId: 'canonical-1', patientCode: 'NKP-2025-000011' },
      });
      expect(prisma.patient.upsert).not.toHaveBeenCalled();
      expect((prisma.patient as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();
    });

    it('refuses an edit of a chart that belongs to another clinic', async () => {
      (patientRepo.findById as jest.Mock).mockResolvedValue({
        id: PATIENT_ID,
        patientCode: 'NKP-2025-000010',
        primaryClinicId: 'clinic-2',
        mergedIntoPatientId: null,
      });

      const results = await pushPatient({ firstName: 'Cross', lastName: 'Tenant' }, doctor);

      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.ERROR,
        conflictType: 'RECORD_NOT_FOUND',
      });
      expect((prisma.patient as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();
    });
  });

  describe('pull', () => {
    const MODELS = [
      'encounter',
      'vitals',
      'tobaccoScreening',
      'diabetesScreening',
      'hypertensionAssessment',
      'encounterMedicationAdherence',
      'carePlan',
      'patientConsent',
      'prescription',
      'medicalHistoryRecord',
      'medicalHistoryRevision',
      'patientMedicationRecord',
      'patientMedicationRevision',
      'medicationReconciliationEvent',
      'patientPharmacyRecord',
      'patientPharmacyRevision',
      'patientPharmacyPreference',
    ];

    it('tells the device which charts a merge retired, and advances the cursor past them', async () => {
      const client = prisma as unknown as Record<string, { findMany: jest.Mock }>;
      for (const model of MODELS) {
        client[model] = { ...client[model], findMany: jest.fn().mockResolvedValue([]) };
      }
      const mergedAt = new Date('2026-09-20T10:00:00.000Z');
      client.patient.findMany = jest
        .fn()
        .mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
          where.mergedIntoPatientId === null
            ? []
            : [{ id: 'retired-1', mergedIntoPatientId: 'canonical-1', updatedAt: mergedAt }],
        );

      const result = await service.pull('clinic-1', '2026-09-19T00:00:00.000Z|x');

      expect(result.mergedPatients).toEqual([
        { id: 'retired-1', mergedIntoPatientId: 'canonical-1' },
      ]);
      expect(result.cursor).toBe(`${mergedAt.toISOString()}|retired-1`);
      expect(client.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            primaryClinicId: 'clinic-1',
            mergedIntoPatientId: { not: null },
          }),
        }),
      );
    });
  });

  describe('changes queued against a merged chart', () => {
    it('points a medical history change at the surviving chart instead of retrying it forever', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue({
        id: 'retired-1',
        mergedIntoPatientId: 'canonical-1',
      });
      (patientRepo.findById as jest.Mock).mockResolvedValue({
        id: 'canonical-1',
        patientCode: 'NKP-2025-000011',
      });

      const results = await service.applyMutations(
        'clinic-1',
        { user: { id: 'user-1' }, roles: [{ clinicId: 'clinic-1', role: 'DOCTOR' }] } as never,
        [
          {
            id: 'mut-history',
            entityType: 'medical_history_revision',
            entityId: '55555555-5555-4555-8555-555555555555',
            operation: 'UPSERT',
            clinicId: 'clinic-1',
            payloadJson: { patientId: 'retired-1', revisionId: 'rev-1', status: 'ACTIVE' },
            idempotencyKey: 'idem-history-merged',
          } as SyncMutationDto,
        ],
      );

      expect(results[0]).toMatchObject({
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'PATIENT_MERGED',
        retryable: false,
        conflictDetails: { canonicalPatientId: 'canonical-1' },
      });
      expect(medicalHistoryService.create).not.toHaveBeenCalled();
      expect(medicalHistoryService.revise).not.toHaveBeenCalled();
    });
  });

  describe('telemetry', () => {
    it('records one event per refused change, with its code and entity type only', async () => {
      const telemetry = { record: jest.fn() };
      (service as unknown as { telemetry: unknown }).telemetry = telemetry;

      await service.applyMutations('clinic-1', mockUser as never, [
        {
          id: 'mut-mismatch',
          entityType: 'encounter',
          entityId: 'enc-1',
          operation: 'UPSERT',
          clinicId: 'clinic-2',
          payloadJson: { notes: 'Ama Mensah' },
          idempotencyKey: 'idem-telemetry',
        } as SyncMutationDto,
      ]);

      expect(telemetry.record).toHaveBeenCalledWith('sync.mutation.refuse', {
        clinicId: 'clinic-1',
        reason: 'CLINIC_MISMATCH',
        entityType: 'encounter',
        retryable: false,
      });
      expect(JSON.stringify(telemetry.record.mock.calls)).not.toContain('Ama');
    });
  });

  describe('conflict code consistency', () => {
    it('tells the client whether every refusal is retryable, whichever path produced it', async () => {
      (encounterRepo.findById as jest.Mock).mockResolvedValue({
        id: 'enc-final',
        status: EncounterStatus.FINALIZED,
      });

      const results = await service.applyMutations('clinic-1', mockUser as never, [
        {
          id: 'mut-mismatch',
          entityType: 'encounter',
          entityId: 'enc-final',
          operation: 'UPSERT',
          clinicId: 'clinic-2',
          payloadJson: {},
          idempotencyKey: 'idem-mismatch',
        } as SyncMutationDto,
        {
          id: 'mut-final',
          entityType: 'encounter',
          entityId: 'enc-final',
          operation: 'UPSERT',
          clinicId: 'clinic-1',
          payloadJson: { patientId: 'patient-1' },
          idempotencyKey: 'idem-final',
        } as SyncMutationDto,
      ]);

      expect(results.map((result) => [result.conflictType, result.retryable])).toEqual([
        ['CLINIC_MISMATCH', false],
        ['CONFLICT_FINALIZED', false],
      ]);
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
        conflictType: 'FORBIDDEN',
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

  describe('a clinician plan sealed offline (#131)', () => {
    const doctor = {
      user: { id: 'doctor-1' },
      roles: [{ clinicId: 'clinic-1', role: 'DOCTOR' }],
    };
    const diabetesPlan = {
      clinicianPlanItems: ['CONTINUE_CURRENT_MANAGEMENT'],
      clinicianPlanOther: null,
      followUpWindow: 'WITHIN_1_MONTH',
      followUpOther: null,
      followUpOwner: 'AKOMAPA_TEAM',
      clinicianComments: 'Recheck after salt reduction',
    };
    // Hypertension adds the blood-pressure goal.
    const plan = { ...diabetesPlan, bpGoalSystolic: 130, bpGoalDiastolic: 80 };

    async function sealed(
      overrides: Partial<{ authorUserId: string; condition: string; encounterId: string }> = {},
      planOverride: Record<string, unknown> = plan,
    ) {
      const seal = moduleRef.get(ClinicianPlanSealService);
      const key = seal.publicKey();
      if (!key.available) throw new Error('seal key unavailable in tests');
      return sealClinicianPlan({ kid: key.kid, spki: key.spki }, planOverride, {
        clinicId: 'clinic-1',
        encounterId: 'enc-1',
        condition: 'HYPERTENSION',
        authorUserId: 'doctor-1',
        ...overrides,
      });
    }

    function mutation(payload: Record<string, unknown>, id = 'mut-plan-1'): SyncMutationDto {
      return {
        id,
        entityType: 'clinician_plan',
        entityId: `plan-${id}`,
        operation: 'UPSERT',
        clinicId: 'clinic-1',
        idempotencyKey: `idem-${id}`,
        payloadJson: payload,
      } as SyncMutationDto;
    }

    it('opens the plan and applies it through the online service, decided when the doctor decided', async () => {
      const decidedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const results = await service.applyMutations('clinic-1', doctor as never, [
        mutation({
          schemaVersion: 1,
          encounterId: 'enc-1',
          condition: 'HYPERTENSION',
          decidedAt,
          sealed: await sealed(),
        }),
      ]);

      expect(results).toEqual([{ id: 'mut-plan-1', status: 'APPLIED' }]);
      expect(hypertensionAssessmentService.upsertClinicianPlan).toHaveBeenCalledWith(
        'clinic-1',
        'enc-1',
        expect.objectContaining({ userId: 'doctor-1' }),
        expect.objectContaining({
          followUpWindow: 'WITHIN_1_MONTH',
          clinicianComments: 'Recheck after salt reduction',
        }),
        expect.objectContaining({
          syncMutation: expect.objectContaining({ idempotencyKey: 'idem-mut-plan-1' }),
        }),
        { decidedAt: new Date(decidedAt) },
      );
    });

    it('routes a diabetes plan to the diabetes service', async () => {
      const results = await service.applyMutations('clinic-1', doctor as never, [
        mutation({
          encounterId: 'enc-1',
          condition: 'DIABETES',
          sealed: await sealed({ condition: 'DIABETES' }, diabetesPlan),
        }),
      ]);
      expect(results[0].status).toBe('APPLIED');
      expect(diabetesScreeningService.upsertClinicianPlan).toHaveBeenCalled();
      expect(hypertensionAssessmentService.upsertClinicianPlan).not.toHaveBeenCalled();
    });

    it('refuses a volunteer before opening anything', async () => {
      const results = await service.applyMutations('clinic-1', mockUser as never, [
        mutation({ encounterId: 'enc-1', condition: 'HYPERTENSION', sealed: await sealed() }),
      ]);
      expect(results[0]).toMatchObject({ status: 'ERROR', conflictType: 'FORBIDDEN' });
      expect(hypertensionAssessmentService.upsertClinicianPlan).not.toHaveBeenCalled();
    });

    it('refuses a plan another doctor sealed, even pushed by a doctor', async () => {
      const results = await service.applyMutations('clinic-1', doctor as never, [
        mutation({
          encounterId: 'enc-1',
          condition: 'HYPERTENSION',
          sealed: await sealed({ authorUserId: 'doctor-2' }),
        }),
      ]);
      expect(results[0]).toMatchObject({
        status: 'ERROR',
        conflictType: 'SEALED_PLAN_UNREADABLE',
        retryable: false,
      });
      expect(hypertensionAssessmentService.upsertClinicianPlan).not.toHaveBeenCalled();
    });

    it('refuses a plan moved to another encounter', async () => {
      const results = await service.applyMutations('clinic-1', doctor as never, [
        mutation({ encounterId: 'enc-2', condition: 'HYPERTENSION', sealed: await sealed() }),
      ]);
      expect(results[0]).toMatchObject({ conflictType: 'SEALED_PLAN_UNREADABLE' });
    });

    it('refuses a plan for a clinic other than the push', async () => {
      const results = await service.applyMutations('clinic-1', doctor as never, [
        {
          ...mutation({ encounterId: 'enc-1', condition: 'HYPERTENSION', sealed: await sealed() }),
          clinicId: 'clinic-2',
        },
      ]);
      expect(results[0]).toMatchObject({ conflictType: 'CLINIC_MISMATCH' });
    });

    it('refuses a plan the online route would refuse, once opened', async () => {
      const results = await service.applyMutations('clinic-1', doctor as never, [
        mutation({
          encounterId: 'enc-1',
          condition: 'HYPERTENSION',
          sealed: await sealed({}, { ...plan, followUpWindow: 'NEXT_YEAR', extra: 'field' }),
        }),
      ]);
      expect(results[0]).toMatchObject({ conflictType: 'VALIDATION_ERROR' });
      expect(hypertensionAssessmentService.upsertClinicianPlan).not.toHaveBeenCalled();
    });

    it('reports a finalized encounter as the service does, without retrying', async () => {
      hypertensionAssessmentService.upsertClinicianPlan.mockRejectedValueOnce(
        new ConflictException({ code: 'CONFLICT_FINALIZED' }),
      );
      const results = await service.applyMutations('clinic-1', doctor as never, [
        mutation({ encounterId: 'enc-1', condition: 'HYPERTENSION', sealed: await sealed() }),
      ]);
      expect(results[0]).toMatchObject({
        status: 'CONFLICT',
        conflictType: 'CONFLICT_FINALIZED',
        retryable: false,
      });
    });
  });
});
