import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { HypertensionAssessmentService } from './hypertension-assessment.service';

const volunteer = {
  userId: 'user-1',
  roles: [{ clinicId: 'clinic-1', role: 'VOLUNTEER' }],
} as never;
const doctor = { userId: 'doctor-1', roles: [{ clinicId: 'clinic-1', role: 'DOCTOR' }] } as never;
const director = {
  userId: 'director-1',
  roles: [{ clinicId: 'clinic-1', role: 'DIRECTOR' }],
} as never;

const dto = {
  hypertensionStatus: 'KNOWN_HYPERTENSION',
  yearDiagnosed: 2020,
  yearDiagnosedUnknown: false,
  mainConcern: 'HIGH_BP',
  mainConcernOther: null,
  usualCareFacility: null,
  usualCareFacilityStatus: 'UNKNOWN',
  repeatPerformed: 'NOT_ASSESSED',
  repeatSystolicBp: null,
  repeatDiastolicBp: null,
  repeatPromptShown: false,
  homeMonitorStatus: 'DOES_NOT_HAVE_ONE',
  homeCheckFrequency: 'NEVER',
  homeSystolicAvg: null,
  homeDiastolicAvg: null,
  homeReadingsUnknown: false,
  homeReadingSource: 'NOT_ASSESSED',
  currentSymptoms: [],
  medicationReminderStrategies: [],
  reminderStrategyOther: null,
  contributingSubstances: [],
  relevantConditions: [],
  pregnantNow: 'NOT_ASSESSED',
  planningPregnancy: 'NOT_ASSESSED',
  kidneyFunctionTesting: 'NOT_ASSESSED',
  urineProteinTesting: 'NOT_ASSESSED',
  cholesterolTesting: 'NOT_ASSESSED',
  ecgCompleted: 'NOT_ASSESSED',
  statinUse: 'NOT_ASSESSED',
  aspirinUse: 'NOT_ASSESSED',
  clinicianReviewRequested: false,
  reviewReasons: [],
  reviewReasonOther: null,
  classificationOverridden: false,
  suspected: false,
  confirmed: false,
  notes: null,
  collectedAt: '2026-09-13T12:00:00.000Z',
};

function saved(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assessment-1',
    clinicId: 'clinic-1',
    encounterId: 'encounter-1',
    classification: 'STAGE2',
    derivedClassification: 'STAGE2',
    classificationOverridden: false,
    suspected: false,
    confirmed: false,
    hypertensionStatus: 'KNOWN_HYPERTENSION',
    yearDiagnosed: 2020,
    yearDiagnosedUnknown: false,
    mainConcern: 'HIGH_BP',
    mainConcernOther: null,
    usualCareFacility: null,
    usualCareFacilityStatus: 'UNKNOWN',
    repeatPerformed: 'NOT_ASSESSED',
    repeatSystolicBp: null,
    repeatDiastolicBp: null,
    repeatPosition: null,
    repeatCuffSize: null,
    repeatMeasuredAt: null,
    repeatPromptShown: false,
    homeMonitorStatus: 'DOES_NOT_HAVE_ONE',
    homeCheckFrequency: 'NEVER',
    homeSystolicAvg: null,
    homeDiastolicAvg: null,
    homeReadingsUnknown: false,
    homeReadingSource: 'NOT_ASSESSED',
    currentSymptoms: [],
    urgentReviewRequired: false,
    urgentReviewReasons: [],
    medicationReminderStrategies: [],
    reminderStrategyOther: null,
    contributingSubstances: [],
    substanceSchemaVersion: 1,
    substanceDetails: { entries: [] },
    lifestyleSchemaVersion: 1,
    lifestyle: {},
    relevantConditions: [],
    pregnantNow: 'NOT_ASSESSED',
    planningPregnancy: 'NOT_ASSESSED',
    kidneyFunctionTesting: 'NOT_ASSESSED',
    urineProteinTesting: 'NOT_ASSESSED',
    cholesterolTesting: 'NOT_ASSESSED',
    ecgCompleted: 'NOT_ASSESSED',
    statinUse: 'NOT_ASSESSED',
    aspirinUse: 'NOT_ASSESSED',
    volunteerActionsSchemaVersion: 1,
    volunteerActions: null,
    clinicianReviewRequested: false,
    reviewReasons: [],
    reviewReasonOther: null,
    clinicianPlanItems: ['ADJUST_MEDICATION'],
    clinicianPlanOther: null,
    bpGoalSystolic: 130,
    bpGoalDiastolic: 80,
    followUpWindow: 'WITHIN_1_MONTH',
    followUpOther: null,
    followUpOwner: 'AKOMAPA_TEAM',
    clinicianComments: 'Titrate amlodipine.',
    clinicianPlanAuthorId: 'doctor-1',
    clinicianPlanAuthoredAt: new Date('2026-09-13T13:00:00.000Z'),
    clinicianPlanAuthor: { id: 'doctor-1', displayName: 'Dr Example' },
    notes: null,
    collectedAt: new Date('2026-09-13T12:00:00.000Z'),
    authoredByUserId: 'user-1',
    authoredBy: { id: 'user-1', displayName: 'Kofi Volunteer' },
    encounter: {
      id: 'encounter-1',
      patientId: 'patient-1',
      createdAt: new Date('2026-09-13T11:00:00.000Z'),
      status: 'DRAFT',
      vitals: { systolicBp: 152, diastolicBp: 94 },
    },
    createdAt: new Date('2026-09-13T12:00:00.000Z'),
    updatedAt: new Date('2026-09-13T12:00:00.000Z'),
    ...overrides,
  };
}

describe('HypertensionAssessmentService', () => {
  function setup(
    encounter: Record<string, unknown> = {
      clinicId: 'clinic-1',
      status: 'DRAFT',
      vitals: { systolicBp: 152, diastolicBp: 94 },
    },
  ) {
    const tx = {
      encounter: { findUnique: jest.fn().mockResolvedValue(encounter) },
      hypertensionAssessment: {
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
      hypertensionAssessment: { findMany: jest.fn().mockResolvedValue([saved()]) },
    };
    return { service: new HypertensionAssessmentService(prisma as never), prisma, tx };
  }

  function writtenTo(tx: ReturnType<typeof setup>['tx']) {
    return tx.hypertensionAssessment.upsert.mock.calls[0][0].create;
  }

  describe('the server derives, the client does not', () => {
    /*
      Today's reading is never copied onto this record.

      It lives on Vitals, the interview reads it, and the classification is recomputed from it on
      every write. Correcting a mistyped vital therefore corrects the classification with no second
      edit, and one encounter cannot hold two disagreeing answers to "what was the blood pressure
      today".
    */
    it('classifies from the encounter vitals rather than from the payload', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', volunteer, dto as never);

      // 152/94 is stage 2 under the documented bands.
      expect(writtenTo(tx)).toMatchObject({ derivedClassification: 'STAGE2' });
    });

    it('ignores a classification the client sent when it did not claim an override', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', volunteer, {
        ...dto,
        classification: 'NORMAL',
        classificationOverridden: false,
      } as never);

      expect(writtenTo(tx)).toMatchObject({
        classification: 'STAGE2',
        derivedClassification: 'STAGE2',
      });
    });

    /*
      A clinician may still disagree with the threshold, and the flag is what distinguishes that
      from a client echoing back the value it was shown.
    */
    /*
      The override fields sit on the volunteer-writable payload because they belong to the record
      rather than to the plan. Without this the derivation would be advisory: anyone who could
      write a screening could assert whatever classification they liked.
    */
    it('refuses an override from someone who is not a clinician', async () => {
      const { service, tx } = setup();
      await expect(
        service.upsert('clinic-1', 'encounter-1', volunteer, {
          ...dto,
          classification: 'NORMAL',
          classificationOverridden: true,
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.hypertensionAssessment.upsert).not.toHaveBeenCalled();
    });

    it('lets a volunteer save without claiming an override', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', volunteer, dto as never);
      expect(tx.hypertensionAssessment.upsert).toHaveBeenCalled();
    });

    it('honours a classification when the clinician claimed an override', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        classification: 'ELEVATED',
        classificationOverridden: true,
      } as never);

      expect(writtenTo(tx)).toMatchObject({
        classification: 'ELEVATED',
        derivedClassification: 'STAGE2',
        classificationOverridden: true,
      });
    });

    it('derives the escalation from symptoms and the reading, not from the payload', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', volunteer, {
        ...dto,
        currentSymptoms: ['CHEST_PAIN'],
      } as never);

      expect(writtenTo(tx)).toMatchObject({
        urgentReviewRequired: true,
        urgentReviewReasons: ['URGENT_SYMPTOM_CHEST_PAIN'],
      });
    });

    /* The repeat is what separates a rushed cuff from a finding. */
    it('escalates from the repeat reading when one was taken', async () => {
      const { service, tx } = setup({
        clinicId: 'clinic-1',
        status: 'DRAFT',
        vitals: { systolicBp: 195, diastolicBp: 122 },
      });
      await service.upsert('clinic-1', 'encounter-1', volunteer, {
        ...dto,
        repeatSystolicBp: 148,
        repeatDiastolicBp: 90,
      } as never);

      expect(writtenTo(tx)).toMatchObject({
        urgentReviewRequired: false,
        urgentReviewReasons: [],
      });
    });

    it('classifies as UNKNOWN when no vitals were recorded', async () => {
      const { service, tx } = setup({ clinicId: 'clinic-1', status: 'DRAFT', vitals: null });
      await service.upsert('clinic-1', 'encounter-1', volunteer, dto as never);

      expect(writtenTo(tx)).toMatchObject({ derivedClassification: 'UNKNOWN' });
    });
  });

  describe('scope and lifecycle', () => {
    it('records the actor as author and writes an audit event', async () => {
      const { service, tx } = setup();
      await service.upsert('clinic-1', 'encounter-1', volunteer, dto as never, {
        requestId: 'request-1',
      });

      expect(writtenTo(tx)).toMatchObject({ authoredByUserId: 'user-1' });
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'HYPERTENSION_ASSESSMENT.CREATE',
          entityType: 'HypertensionAssessment',
          requestId: 'request-1',
        }),
      });
    });

    it('refuses a role without SCREENING.WRITE', async () => {
      const { service, tx } = setup();
      await expect(
        service.upsert('clinic-1', 'encounter-1', director, dto as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.hypertensionAssessment.upsert).not.toHaveBeenCalled();
    });

    it('refuses an encounter belonging to another clinic', async () => {
      const { service } = setup({ clinicId: 'clinic-2', status: 'DRAFT', vitals: null });
      await expect(
        service.upsert('clinic-1', 'encounter-1', volunteer, dto as never),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('refuses to modify a finalized encounter', async () => {
      const { service } = setup({ clinicId: 'clinic-1', status: 'FINALIZED', vitals: null });
      await expect(
        service.upsert('clinic-1', 'encounter-1', volunteer, dto as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a lifestyle payload the shared parser refuses', async () => {
      const { service, tx } = setup();
      await expect(
        service.upsert('clinic-1', 'encounter-1', volunteer, {
          ...dto,
          lifestyle: { saltAtTable: 'CONSTANTLY' },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.hypertensionAssessment.upsert).not.toHaveBeenCalled();
    });
  });

  describe('the supervising clinician plan', () => {
    const plan = {
      clinicianPlanItems: ['ADJUST_MEDICATION'],
      clinicianPlanOther: null,
      bpGoalSystolic: 130,
      bpGoalDiastolic: 80,
      followUpWindow: 'WITHIN_1_MONTH',
      followUpOther: null,
      followUpOwner: 'AKOMAPA_TEAM',
      clinicianComments: 'Titrate amlodipine.',
    };

    /*
      The UI also hides this section from a volunteer, but hiding is not a boundary.
    */
    it('refuses a volunteer', async () => {
      const { service, tx } = setup();
      await expect(
        service.upsertClinicianPlan('clinic-1', 'encounter-1', volunteer, plan as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.hypertensionAssessment.update).not.toHaveBeenCalled();
    });

    it('lets a doctor record one and stamps its authorship', async () => {
      const { service, tx } = setup();
      tx.hypertensionAssessment.findUnique.mockResolvedValue(saved());
      await service.upsertClinicianPlan('clinic-1', 'encounter-1', doctor, plan as never);

      expect(tx.hypertensionAssessment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clinicianPlanItems: ['ADJUST_MEDICATION'],
            clinicianPlanAuthorId: 'doctor-1',
          }),
        }),
      );
    });

    /*
      The follow-up window has to become a date.

      `CarePlan.followUpDate` is what EncounterService schedules the patient's reminder from on
      finalize. A plan that stored only "within 1 month" would read as complete and schedule
      nothing.
    */
    it('resolves the follow-up window onto the care plan the reminder reads', async () => {
      const { service, tx } = setup();
      tx.hypertensionAssessment.findUnique.mockResolvedValue(saved());
      await service.upsertClinicianPlan('clinic-1', 'encounter-1', doctor, plan as never);

      expect(tx.carePlan.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { encounterId: 'encounter-1' },
          update: { followUpDate: expect.any(Date) },
        }),
      );
    });

    it('schedules nothing when the clinician chose no window', async () => {
      const { service, tx } = setup();
      tx.hypertensionAssessment.findUnique.mockResolvedValue(saved());
      await service.upsertClinicianPlan('clinic-1', 'encounter-1', doctor, {
        ...plan,
        followUpWindow: 'NOT_ASSESSED',
      } as never);

      expect(tx.carePlan.upsert).not.toHaveBeenCalled();
    });

    it('refuses a plan before the interview itself exists', async () => {
      const { service, tx } = setup();
      tx.hypertensionAssessment.findUnique.mockResolvedValue(null);
      await expect(
        service.upsertClinicianPlan('clinic-1', 'encounter-1', doctor, plan as never),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('the response omits what the reader may not see', () => {
    /*
      Omitted, not blanked.

      A key present with a null value tells a volunteer there is a plan they cannot see, which is
      more than they are entitled to know and enough to build a UI that hints at it.
    */
    it('gives a volunteer no clinician-plan key at all', async () => {
      const { service } = setup();
      const result = await service.upsert('clinic-1', 'encounter-1', volunteer, dto as never);

      expect(result).not.toHaveProperty('clinicianPlan');
      expect(JSON.stringify(result)).not.toContain('Titrate amlodipine');
    });

    it('gives a doctor the plan', async () => {
      const { service } = setup();
      const result = await service.upsert('clinic-1', 'encounter-1', doctor, dto as never);

      expect(result).toMatchObject({
        clinicianPlan: expect.objectContaining({ comments: 'Titrate amlodipine.' }),
      });
    });

    it('surfaces the vitals the interview reads without copying them onto the record', async () => {
      const { service } = setup();
      const result = await service.upsert('clinic-1', 'encounter-1', volunteer, dto as never);

      expect(result.todaysVitals).toEqual({ systolicBp: 152, diastolicBp: 94 });
    });
  });

  describe('offline replay validates exactly as the REST route does', () => {
    /*
      The inline upsert this replaced cast `payload.classification` straight to the enum, so
      `{ classification: 'BOGUS' }` was accepted by the API and failed deeper down.
    */
    it('rejects a classification outside the vocabulary', async () => {
      const { service } = setup();
      await expect(
        service.validateSyncPayload(
          { ...dto, classification: 'BOGUS' },
          '2026-09-13T12:00:00.000Z',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /*
      The outbox addresses a mutation by putting encounterId and clinicId in the payload, and the
      DTO runs with forbidNonWhitelisted. Leaving them in rejected every offline hypertension write
      -- the local save succeeded, the replay was refused, and nothing surfaced to the volunteer.
      Found by running the interview end to end, not by reading the code.
    */
    it('ignores the routing fields the outbox stores alongside the record', async () => {
      const { service } = setup();
      await expect(
        service.validateSyncPayload(
          { ...dto, encounterId: 'encounter-1', clinicId: 'clinic-1' },
          '2026-09-13T12:00:00.000Z',
        ),
      ).resolves.toBeDefined();
    });

    it('strips derived fields so a device cannot assert its own escalation', async () => {
      const { service } = setup();
      const { dto: normalized } = await service.validateSyncPayload(
        { ...dto, urgentReviewRequired: true, urgentReviewReasons: ['SEVERELY_ELEVATED_BP'] },
        '2026-09-13T12:00:00.000Z',
      );

      expect(normalized).not.toHaveProperty('urgentReviewRequired');
      expect(normalized).not.toHaveProperty('urgentReviewReasons');
    });

    it('strips clinician-plan fields, which have their own route and permission', async () => {
      const { service } = setup();
      const { dto: normalized } = await service.validateSyncPayload(
        { ...dto, clinicianComments: 'Smuggled through the outbox.', bpGoalSystolic: 120 },
        '2026-09-13T12:00:00.000Z',
      );

      expect(normalized).not.toHaveProperty('clinicianComments');
      expect(normalized).not.toHaveProperty('bpGoalSystolic');
    });

    it('rejects a collection time in the future', async () => {
      const { service } = setup();
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await expect(
        service.validateSyncPayload({ ...dto, collectedAt: future }, future),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
