import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DiabetesScreeningService } from './diabetes-screening.service';

const doctor = { userId: 'user-1', roles: [{ clinicId: 'clinic-1', role: 'DOCTOR' }] } as never;
const director = {
  userId: 'director-1',
  roles: [{ clinicId: 'clinic-1', role: 'DIRECTOR' }],
} as never;

const dto = {
  glucoseMgDl: 126,
  glucoseType: 'FASTING',
  hba1cPercent: 6.4,
  symptoms: ['POLYURIA'],
  notes: 'Clinical note',
  collectedAt: '2026-08-12T12:00:00.000Z',
};

function saved(overrides: Record<string, unknown> = {}) {
  return {
    id: 'screening-1',
    clinicId: 'clinic-1',
    encounterId: 'encounter-1',
    glucoseMgDl: 126,
    glucoseType: 'FASTING',
    hba1cPercent: 6.4,
    symptoms: ['POLYURIA'],
    symptomsJson: null,
    legacySymptomsUnmapped: false,
    notes: 'Clinical note',
    collectedAt: new Date('2026-08-12T12:00:00.000Z'),
    authoredByUserId: 'user-1',
    authoredBy: { id: 'user-1', displayName: 'Dr Example' },
    clinicianPlanAuthor: null,
    clinicianPlanItems: [],
    clinicianPlanOther: null,
    followUpWindow: 'NOT_ASSESSED',
    followUpOther: null,
    followUpOwner: 'NOT_ASSESSED',
    clinicianComments: null,
    clinicianPlanAuthoredAt: null,
    encounter: {
      id: 'encounter-1',
      patientId: 'patient-1',
      createdAt: new Date('2026-08-12T11:00:00.000Z'),
      status: 'DRAFT',
    },
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
    ...overrides,
  };
}

describe('DiabetesScreeningService', () => {
  function setup(encounter = { clinicId: 'clinic-1', patientId: 'patient-1', status: 'DRAFT' }) {
    const tx = {
      encounter: { findUnique: jest.fn().mockResolvedValue(encounter) },
      diabetesScreening: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(saved()),
        update: jest.fn().mockResolvedValue(saved()),
      },
      carePlan: { upsert: jest.fn().mockResolvedValue({}) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      syncMutation: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-1' }) },
      diabetesScreening: { findMany: jest.fn().mockResolvedValue([saved()]) },
    };
    return { service: new DiabetesScreeningService(prisma as never), prisma, tx };
  }

  it('creates a scoped screening with server-controlled author and audit metadata', async () => {
    const { service, tx } = setup();
    const result = await service.upsert('clinic-1', 'encounter-1', doctor, dto as never, {
      requestId: 'request-1',
    });

    expect(tx.diabetesScreening.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clinicId: 'clinic-1',
          encounterId: 'encounter-1',
          authoredByUserId: 'user-1',
          symptoms: ['POLYURIA'],
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DIABETES_SCREENING.CREATE',
        requestId: 'request-1',
      }),
    });
    expect(result).toMatchObject({
      author: { id: 'user-1', displayName: 'Dr Example' },
      sourceEncounter: { id: 'encounter-1', status: 'DRAFT' },
      isEditable: true,
    });
  });

  it('preserves explicit nulls and the existing id on update', async () => {
    const { service, tx } = setup();
    tx.diabetesScreening.findUnique.mockResolvedValue(saved());
    await service.upsert(
      'clinic-1',
      'encounter-1',
      doctor,
      { ...dto, glucoseMgDl: null, hba1cPercent: null, notes: null, symptoms: [] } as never,
      {},
      'different-client-id',
    );

    expect(tx.diabetesScreening.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          glucoseMgDl: null,
          hba1cPercent: null,
          notes: null,
          symptoms: [],
          legacySymptomsUnmapped: false,
        }),
      }),
    );
  });

  it('normalizes deprecated symptoms JSON and rejects ambiguous contracts', async () => {
    const { service } = setup();
    await expect(
      service.validateSyncPayload(
        {
          glucoseMgDl: 145,
          glucoseType: 'RANDOM',
          hba1cPercent: null,
          symptomsJson: '["Polydipsia","Other"]',
          notes: null,
        },
        '2026-08-12T12:00:00.000Z',
      ),
    ).resolves.toMatchObject({
      dto: { symptoms: ['POLYDIPSIA'], collectedAt: '2026-08-12T12:00:00.000Z' },
      compatibility: {
        symptomsJson: '["Polydipsia","Other"]',
        legacySymptomsUnmapped: true,
      },
    });

    await expect(
      service.validateSyncPayload(
        { symptoms: ['FATIGUE'], symptomsJson: '["Fatigue"]' },
        '2026-08-12T12:00:00.000Z',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AMBIGUOUS_SYMPTOMS_CONTRACT' }),
    });
  });

  it('records sync idempotency in the same transaction as the screening', async () => {
    const { service, tx } = setup();
    await service.upsert('clinic-1', 'encounter-1', doctor, dto as never, {
      requestId: 'sync-idempotency-1',
      syncMutation: {
        entityType: 'diabetes_screening',
        entityId: 'screening-1',
        idempotencyKey: 'sync-idempotency-1',
      },
    });

    expect(tx.syncMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'diabetes_screening',
        idempotencyKey: 'sync-idempotency-1',
        status: 'APPLIED',
      }),
    });
  });

  it('rejects writes without screening permission', async () => {
    const { service, tx } = setup();
    await expect(
      service.upsert('clinic-1', 'encounter-1', director, dto as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.diabetesScreening.upsert).not.toHaveBeenCalled();
  });

  it('rejects cross-clinic and finalized encounter writes', async () => {
    const crossClinic = setup({ clinicId: 'clinic-2', patientId: 'patient-1', status: 'DRAFT' });
    await expect(
      crossClinic.service.upsert('clinic-1', 'encounter-1', doctor, dto as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    const finalized = setup({ clinicId: 'clinic-1', patientId: 'patient-1', status: 'FINALIZED' });
    await expect(
      finalized.service.upsert('clinic-1', 'encounter-1', doctor, dto as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects collection times more than five minutes in the future', async () => {
    const { service } = setup();
    await expect(
      service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        collectedAt: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists newest records with source context and read-only status for directors', async () => {
    const { service, prisma } = setup();
    const response = await service.list('clinic-1', 'patient-1', director, { limit: 25 });

    expect(prisma.patient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ primaryClinicId: 'clinic-1' }) }),
    );
    expect(response.items[0]).toMatchObject({
      id: 'screening-1',
      patientId: 'patient-1',
      isEditable: false,
    });
  });

  describe('the guided interview derives, the client does not', () => {
    function writtenTo(tx: { diabetesScreening: { upsert: jest.Mock } }) {
      return tx.diabetesScreening.upsert.mock.calls[0][0].create;
    }

    it('classifies suspicion from the reading and its timing', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        glucoseMgDl: 126,
        glucoseType: 'FASTING',
      } as never);
      expect(writtenTo(tx)).toMatchObject({ derivedSuspicion: 'SUSPECTED' });
    });

    /*
      09_DIABETES_SCREENING.md: an unknown context is never classified.

      NOT_SUSPECTED asserts somebody looked and found nothing, which a reading with no timing does
      not support.
    */
    it('refuses to classify a reading whose timing is unknown', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        glucoseMgDl: 400,
        glucoseType: 'UNKNOWN',
      } as never);
      expect(writtenTo(tx)).toMatchObject({ derivedSuspicion: 'NOT_ASSESSED' });
    });

    it('scores PHQ-2 and marks a positive screen', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        phq2Interest: 'MORE_THAN_HALF_THE_DAYS',
        phq2Mood: 'SEVERAL_DAYS',
      } as never);
      expect(writtenTo(tx)).toMatchObject({ phq2Total: 3, phq2Positive: true });
    });

    /* A partial total reads as a completed screen sitting on the threshold. */
    it('leaves the score null until both items are answered', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        phq2Interest: 'NEARLY_EVERY_DAY',
      } as never);
      expect(writtenTo(tx)).toMatchObject({ phq2Total: null, phq2Positive: false });
    });

    it('escalates an urgent symptom the past-month checklist does not carry', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        urgentSymptoms: ['VOMITING'],
      } as never);
      expect(writtenTo(tx)).toMatchObject({
        urgentReviewRequired: true,
        urgentReviewReasons: ['URGENT_SYMPTOM_VOMITING'],
      });
    });

    it('escalates a foot wound recorded in the preventive-care question', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        currentFootWound: 'YES',
      } as never);
      expect(writtenTo(tx)).toMatchObject({ urgentReviewReasons: ['ACTIVE_FOOT_WOUND'] });
    });

    it('rejects a nutrition payload the shared parser refuses', async () => {
      const { service, tx } = setup();
      await expect(
        service.upsert('clinic-1', 'encounter-1', doctor, {
          ...dto,
          nutrition: { mealsPerDay: 'SEVEN' },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.diabetesScreening.upsert).not.toHaveBeenCalled();
    });
  });

  describe('the supervising clinician plan', () => {
    const plan = {
      clinicianPlanItems: ['MEDICATION_CHANGE'],
      clinicianPlanOther: null,
      followUpWindow: 'WITHIN_1_MONTH',
      followUpOther: null,
      followUpOwner: 'AKOMAPA_TEAM',
      clinicianComments: 'Increase metformin.',
    };

    it('refuses a volunteer', async () => {
      const { service } = setup();
      const volunteer = {
        userId: 'vol-1',
        roles: [{ clinicId: 'clinic-1', role: 'VOLUNTEER' }],
      } as never;
      await expect(
        service.upsertClinicianPlan('clinic-1', 'encounter-1', volunteer, plan as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    /* CarePlan.followUpDate is what EncounterService schedules the reminder from. */
    it('resolves the follow-up window onto the care plan the reminder reads', async () => {
      const { service, tx } = setup();
      tx.diabetesScreening.findUnique.mockResolvedValue(saved());
      await service.upsertClinicianPlan('clinic-1', 'encounter-1', doctor, plan as never);
      expect(tx.carePlan.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { encounterId: 'encounter-1' } }),
      );
    });

    it('refuses a plan before the screening itself exists', async () => {
      const { service, tx } = setup();
      tx.diabetesScreening.findUnique.mockResolvedValue(null);
      await expect(
        service.upsertClinicianPlan('clinic-1', 'encounter-1', doctor, plan as never),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
