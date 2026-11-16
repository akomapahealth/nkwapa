import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EncounterStatus, Prisma, UserRole } from '@prisma/client';
import { PatientChartService, type ChartActor } from './patient-chart.service';
import { encodeKeysetCursor } from '../common/keyset-cursor';
import {
  assembleGlance,
  dedupeConditions,
  followUpState,
  trendDirection,
  worstAdherence,
  BP_DEAD_BAND_MMHG,
  GLUCOSE_DEAD_BAND_MG_DL,
  type GlanceRow,
} from './patient-chart-glance';

const CLINIC = 'clinic-1';
const PATIENT = 'patient-1';

const actor = (role: UserRole, clinicId: string | null = CLINIC): ChartActor => ({
  userId: `${role}-1`,
  roles: [{ clinicId, role }],
});

function encounterFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enc-1',
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    status: EncounterStatus.FINALIZED,
    clinic: { id: CLINIC, name: 'Kumasi Clinic' },
    createdBy: { id: 'user-1', displayName: 'Ama Volunteer' },
    preceptorReviewedBy: null,
    doctorFinalizedBy: { id: 'user-2', displayName: 'Dr Mensah' },
    vitals: { id: 'v-1' },
    diabetesScreening: null,
    tobaccoScreening: null,
    hypertensionAssessment: null,
    carePlan: null,
    clinicalNote: { status: 'COSIGNED' },
    _count: { prescriptions: 2 },
    ...overrides,
  };
}

function vitalsFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vitals-1',
    createdAt: new Date('2026-08-01T09:30:00.000Z'),
    updatedAt: new Date('2026-08-01T09:30:00.000Z'),
    systolicBp: 128,
    diastolicBp: 82,
    pulseBpm: 74,
    temperatureCelsius: 36.8,
    respiratoryRate: 16,
    spo2Percent: 98,
    weightKg: 71.2,
    heightCm: 170,
    bmi: 24.6,
    notes: null,
    encounter: {
      id: 'enc-1',
      status: EncounterStatus.FINALIZED,
      createdAt: new Date('2026-08-01T09:00:00.000Z'),
      clinic: { id: CLINIC, name: 'Kumasi Clinic' },
      createdBy: { id: 'user-1', displayName: 'Ama Volunteer' },
    },
    ...overrides,
  };
}

const EMPTY_ROW: GlanceRow = {
  history: null,
  hypertension_status: null,
  diabetes: null,
  pregnancy: null,
  bp: null,
  glucose_latest: null,
  glucose_previous: null,
  hba1c: null,
  adherence: null,
  tobacco: null,
  eye_at: null,
  counselling_at: null,
  follow_up_at: null,
  timezone: 'Africa/Accra',
};

/** The SQL text and parameters of the glance query a test captured. */
function capturedSql(mock: jest.Mock) {
  const [strings, ...values] = mock.mock.calls[0];
  return Prisma.sql(strings, ...values);
}

function createPrismaMock() {
  return {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: PATIENT }) },
    vitals: {
      findFirst: jest.fn().mockResolvedValue(vitalsFixture()),
      findMany: jest.fn().mockResolvedValue([]),
    },
    diabetesScreening: { findFirst: jest.fn().mockResolvedValue(null) },
    hypertensionAssessment: { findFirst: jest.fn().mockResolvedValue(null) },
    patientMedicationRecord: { count: jest.fn().mockResolvedValue(0) },
    medicationReconciliationEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    clinicalNote: { count: jest.fn().mockResolvedValue(0) },
    encounter: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    patientConsent: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([EMPTY_ROW]),
  };
}

describe('PatientChartService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let medicalHistory: { getAllergySummary: jest.Mock };
  let service: PatientChartService;

  beforeEach(() => {
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'true';
    process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = 'true';
    process.env.FEATURE_CLINICAL_NOTES_ENABLED = 'true';
    prisma = createPrismaMock();
    medicalHistory = {
      getAllergySummary: jest.fn().mockResolvedValue({ state: 'NO_KNOWN_ALLERGIES' }),
    };
    service = new PatientChartService(prisma as never, medicalHistory as never);
  });

  afterEach(() => {
    delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
    delete process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;
    delete process.env.FEATURE_CLINICAL_NOTES_ENABLED;
  });

  describe('clinic scoping', () => {
    it.each([
      ['summary', () => service.getSummary(CLINIC, PATIENT, actor(UserRole.DOCTOR))],
      ['vitals', () => service.listVitals(CLINIC, PATIENT)],
      ['visits', () => service.listVisits(CLINIC, PATIENT, actor(UserRole.DOCTOR))],
    ])('rejects a patient outside the active clinic on %s', async (_name, call) => {
      prisma.patient.findFirst.mockResolvedValue(null);
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    });

    it('excludes merged charts from the scope lookup', async () => {
      await service.listVitals(CLINIC, PATIENT);
      expect(prisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: PATIENT, primaryClinicId: CLINIC, mergedIntoPatientId: null },
        select: { id: true },
      });
    });
  });

  describe('notes access policy', () => {
    it('omits note status from visits for roles without note status access', async () => {
      prisma.encounter.findMany.mockResolvedValue([encounterFixture()]);
      // A volunteer at another clinic must be treated as having no roles here.
      const outsider: ChartActor = {
        userId: 'x',
        roles: [{ clinicId: 'other-clinic', role: UserRole.DOCTOR }],
      };
      const page = await service.listVisits(CLINIC, PATIENT, outsider);
      expect(page.items[0].recorded).not.toHaveProperty('noteStatus');
    });

    it.each([UserRole.DOCTOR, UserRole.VOLUNTEER, UserRole.MANAGER, UserRole.DIRECTOR])(
      'includes note status for %s, who holds clinical note status read',
      async (role) => {
        prisma.encounter.findMany.mockResolvedValue([encounterFixture()]);
        const page = await service.listVisits(CLINIC, PATIENT, actor(role));
        expect(page.items[0].recorded.noteStatus).toBe('COSIGNED');
      },
    );

    it('omits note status entirely when the clinical notes feature is off', async () => {
      process.env.FEATURE_CLINICAL_NOTES_ENABLED = 'false';
      prisma.encounter.findMany.mockResolvedValue([encounterFixture()]);
      const page = await service.listVisits(CLINIC, PATIENT, actor(UserRole.DOCTOR));
      expect(page.items[0].recorded).not.toHaveProperty('noteStatus');
    });

    it('offers the notes section only to doctors and volunteers', async () => {
      const sectionIdsFor = async (role: UserRole) => {
        const summary = await service.getSummary(CLINIC, PATIENT, actor(role));
        return summary.sections.map((section) => section.id);
      };
      expect(await sectionIdsFor(UserRole.DOCTOR)).toContain('notes');
      expect(await sectionIdsFor(UserRole.VOLUNTEER)).toContain('notes');
      expect(await sectionIdsFor(UserRole.MANAGER)).not.toContain('notes');
      expect(await sectionIdsFor(UserRole.DIRECTOR)).not.toContain('notes');
    });

    it('still reports note activity counts to a manager without exposing content', async () => {
      prisma.clinicalNote.count.mockResolvedValue(3);
      const summary = await service.getSummary(CLINIC, PATIENT, actor(UserRole.MANAGER));
      expect(summary.noteActivity).toEqual({ pendingCosign: 3, total: 3 });
      expect(summary.sections.map((s) => s.id)).not.toContain('notes');
    });
  });

  describe('summary block gating', () => {
    it('shows consent status to a reader but only asks a recorder to act on it', async () => {
      const director = await service.getSummary(CLINIC, PATIENT, actor(UserRole.DIRECTOR));
      expect(director.sections.map((s) => s.id)).toContain('consent');
      expect(director.consent).not.toBeNull();
      expect(director.pendingActions.map((a) => a.kind)).not.toContain(
        'RESEARCH_CONSENT_NOT_RECORDED',
      );
      const volunteer = await service.getSummary(CLINIC, PATIENT, actor(UserRole.VOLUNTEER));
      expect(volunteer.pendingActions.map((a) => a.kind)).toContain(
        'RESEARCH_CONSENT_NOT_RECORDED',
      );
    });

    it('drops feature-flagged blocks when the flag is disabled', async () => {
      process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'false';
      process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = 'false';
      const summary = await service.getSummary(CLINIC, PATIENT, actor(UserRole.DOCTOR));
      expect(summary.allergies).toBeNull();
      expect(summary.medications).toBeNull();
      expect(medicalHistory.getAllergySummary).not.toHaveBeenCalled();
    });

    it('surfaces pending clinical actions with their source visit', async () => {
      prisma.encounter.findMany.mockResolvedValue([
        { id: 'enc-draft', status: EncounterStatus.DRAFT },
        { id: 'enc-review', status: EncounterStatus.IN_REVIEW },
      ]);
      const summary = await service.getSummary(CLINIC, PATIENT, actor(UserRole.DOCTOR));
      const kinds = summary.pendingActions.map((action) => action.kind);
      expect(kinds).toContain('OPEN_VISIT');
      expect(kinds).toContain('AWAITING_REVIEW');
      const open = summary.pendingActions.find((a) => a.kind === 'OPEN_VISIT');
      expect(open?.encounterId).toBe('enc-draft');
    });
  });

  describe('hypertension summary', () => {
    it('reports the latest assessment with the reading it classified', async () => {
      prisma.hypertensionAssessment.findFirst.mockResolvedValue({
        id: 'htn-1',
        collectedAt: new Date('2026-09-20T10:00:00.000Z'),
        classification: 'STAGE2',
        suspected: true,
        confirmed: false,
        hypertensionStatus: 'NEWLY_ELEVATED_BP',
        urgentReviewRequired: true,
        clinicianReviewRequested: false,
        encounter: {
          id: 'enc-1',
          status: EncounterStatus.DRAFT,
          createdAt: new Date('2026-09-20T09:00:00.000Z'),
          clinic: { id: CLINIC, name: 'Clinic' },
          createdBy: { id: 'user-1', displayName: 'Ama Volunteer' },
          vitals: { systolicBp: 162, diastolicBp: 101 },
        },
      });

      const summary = await service.getSummary(CLINIC, PATIENT, actor(UserRole.VOLUNTEER));

      expect(summary.sections.map((s) => s.id)).toContain('hypertension');
      expect(summary.hypertension?.latest).toMatchObject({
        id: 'htn-1',
        classification: 'STAGE2',
        urgentReviewRequired: true,
        systolicBp: 162,
        diastolicBp: 101,
        encounterId: 'enc-1',
        locked: false,
      });
      expect(prisma.hypertensionAssessment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clinicId: CLINIC, encounter: { patientId: PATIENT } } }),
      );
    });

    it('keeps the section without the guided-interview flag, since the records exist either way', async () => {
      process.env.FEATURE_GUIDED_CHRONIC_TABS_ENABLED = 'false';
      const summary = await service.getSummary(CLINIC, PATIENT, actor(UserRole.DOCTOR));
      delete process.env.FEATURE_GUIDED_CHRONIC_TABS_ENABLED;

      expect(summary.sections.map((s) => s.id)).toEqual(
        expect.arrayContaining(['diabetes', 'hypertension']),
      );
      expect(summary.hypertension).toEqual({ latest: null });
    });
  });

  describe('bounded retrieval', () => {
    it('defaults to a page size of 25', async () => {
      await service.listVitals(CLINIC, PATIENT);
      expect(prisma.vitals.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 26 }));
    });

    it.each([
      [1, 2],
      [50, 51],
      [100, 101],
    ])('requests limit %i as take %i', async (limit, take) => {
      await service.listVisits(CLINIC, PATIENT, actor(UserRole.DOCTOR), { limit });
      expect(prisma.encounter.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take }));
    });

    it.each([500, 10_000])('clamps an oversized limit of %i to 100', async (limit) => {
      await service.listVitals(CLINIC, PATIENT, { limit });
      expect(prisma.vitals.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 101 }),
      );
    });

    it.each([0, -5, Number.NaN])(
      'falls back to the default for an invalid limit %p',
      async (limit) => {
        await service.listVitals(CLINIC, PATIENT, { limit });
        expect(prisma.vitals.findMany).toHaveBeenLastCalledWith(
          expect.objectContaining({ take: 26 }),
        );
      },
    );

    it('always scopes the query to the clinic and patient and orders deterministically', async () => {
      await service.listVitals(CLINIC, PATIENT);
      const call = prisma.vitals.findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ clinicId: CLINIC, encounter: { patientId: PATIENT } });
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });
  });

  describe('cursor pagination', () => {
    it('returns no cursor when the last page is short', async () => {
      prisma.vitals.findMany.mockResolvedValue([vitalsFixture()]);
      const page = await service.listVitals(CLINIC, PATIENT, { limit: 5 });
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('trims the lookahead row and emits a cursor when more remain', async () => {
      prisma.vitals.findMany.mockResolvedValue([
        vitalsFixture({ id: 'a' }),
        vitalsFixture({ id: 'b' }),
      ]);
      const page = await service.listVitals(CLINIC, PATIENT, { limit: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0].id).toBe('a');
      expect(page.nextCursor).toBe(encodeKeysetCursor(new Date('2026-08-01T09:30:00.000Z'), 'a'));
    });

    it('resumes from a cursor without skipping ties', async () => {
      const cursor = encodeKeysetCursor(new Date('2026-08-01T09:30:00.000Z'), 'a');
      await service.listVitals(CLINIC, PATIENT, { cursor });
      const call = prisma.vitals.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { createdAt: { lt: new Date('2026-08-01T09:30:00.000Z') } },
        { createdAt: new Date('2026-08-01T09:30:00.000Z'), id: { lt: 'a' } },
      ]);
    });

    it('rejects a malformed cursor with a 400 rather than silently restarting', async () => {
      await expect(
        service.listVitals(CLINIC, PATIENT, { cursor: 'nonsense!!' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('record provenance', () => {
    it('carries recorded time, author, clinic, source visit, and locked state', async () => {
      prisma.vitals.findMany.mockResolvedValue([vitalsFixture()]);
      const page = await service.listVitals(CLINIC, PATIENT);
      expect(page.items[0]).toMatchObject({
        recordedAt: new Date('2026-08-01T09:30:00.000Z'),
        recordedBy: { id: 'user-1', displayName: 'Ama Volunteer' },
        clinic: { id: CLINIC, name: 'Kumasi Clinic' },
        encounterId: 'enc-1',
        encounterStatus: EncounterStatus.FINALIZED,
        locked: true,
      });
    });

    it('marks a draft visit as unlocked', async () => {
      prisma.encounter.findMany.mockResolvedValue([
        encounterFixture({ status: EncounterStatus.DRAFT }),
      ]);
      const page = await service.listVisits(CLINIC, PATIENT, actor(UserRole.DOCTOR));
      expect(page.items[0].locked).toBe(false);
      expect(page.items[0].status).toBe(EncounterStatus.DRAFT);
    });

    it('summarises what each visit captured', async () => {
      prisma.encounter.findMany.mockResolvedValue([encounterFixture()]);
      const page = await service.listVisits(CLINIC, PATIENT, actor(UserRole.DOCTOR));
      expect(page.items[0].recorded).toMatchObject({
        vitals: true,
        diabetesScreening: false,
        prescriptions: 2,
      });
    });
  });

  describe('at a glance (#341)', () => {
    const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);
    const fullAccess = { has: () => true, screening: true, counselling: true };
    const baseSummary = {
      patientId: PATIENT,
      clinicId: CLINIC,
      sections: [],
      vitals: { latest: null },
      diabetes: { latest: null },
      hypertension: { latest: null },
      allergies: { state: 'NOT_RECORDED' },
      medications: { currentCount: 0, noKnownCurrentMedications: false, lastReconciledAt: null },
      noteActivity: null,
      visits: { total: 0, open: 0, lastVisitAt: null },
      consent: null,
      pendingActions: [],
    };

    describe('direction rule', () => {
      it('needs three readings', () => {
        expect(trendDirection(150, [140], BP_DEAD_BAND_MMHG)).toBe('NOT_ENOUGH_DATA');
        expect(trendDirection(null, [140, 140], BP_DEAD_BAND_MMHG)).toBe('NOT_ENOUGH_DATA');
      });

      it.each([
        [150, 'STEADY'], // exactly the dead band above the mean of 140
        [151, 'RISING'],
        [130, 'STEADY'],
        [129, 'FALLING'],
      ])('BP %i against previous 138 and 142 is %s', (latest, expected) => {
        expect(trendDirection(latest, [138, 142], BP_DEAD_BAND_MMHG)).toBe(expected);
      });

      it.each([
        [118, 'STEADY'],
        [119, 'RISING'],
        [81, 'FALLING'],
      ])('glucose %i against a mean of 100 is %s', (latest, expected) => {
        expect(trendDirection(latest, [90, 110], GLUCOSE_DEAD_BAND_MG_DL)).toBe(expected);
      });
    });

    it('summarises adherence as the worst answer, ignoring unasked ones', () => {
      expect(worstAdherence(['ALWAYS', 'SOMETIMES', 'NOT_ASSESSED'])).toBe('SOMETIMES');
      expect(worstAdherence(['ALWAYS', 'NOT_TAKING'])).toBe('NOT_TAKING');
      expect(worstAdherence(['NOT_ASSESSED'])).toBeNull();
    });

    it('drops history conditions the assessments already state, and repeats', () => {
      const names = ['Hypertension', 'Type 2 diabetes', 'Asthma', 'asthma ', 'HTN'];
      expect(dedupeConditions(names, { hypertension: true, diabetes: true })).toEqual(['Asthma']);
      expect(dedupeConditions(names, { hypertension: false, diabetes: false })).toEqual([
        'Hypertension',
        'Type 2 diabetes',
        'Asthma',
        'HTN',
      ]);
    });

    it.each([
      ['2026-12-03', '2026-11-15', null, 'UPCOMING'],
      ['2026-11-15', '2026-11-15', null, 'DUE_TODAY'],
      ['2026-11-01', '2026-11-15', '2026-10-01', 'OVERDUE'],
      ['2026-11-01', '2026-11-15', '2026-11-01', 'MET'],
    ])('follow-up due %s on %s, last visit %s, is %s', (dueOn, today, last, state) => {
      expect(followUpState(dueOn, today, last)).toBe(state);
    });

    it('builds every part from the records, using the repeat BP reading', () => {
      const glance = assembleGlance(
        {
          ...EMPTY_ROW,
          history: [
            { category: 'CONDITION', details: { conditionName: 'Hypertension' } },
            { category: 'CONDITION', details: { conditionName: 'Asthma' } },
            {
              category: 'FAMILY_HISTORY',
              details: { relationship: 'Father', familyCondition: 'Stroke' },
            },
          ],
          hypertension_status: 'KNOWN_HYPERTENSION',
          diabetes: { status: 'KNOWN_DIABETES', type: 'TYPE_2' },
          pregnancy: { answer: 'YES', at: '2026-11-01T09:00:00+00:00' },
          bp: [
            {
              systolic: 170,
              diastolic: 100,
              repeatSystolic: 152,
              repeatDiastolic: 94,
              at: '2026-11-03T09:00:00+00:00',
            },
            {
              systolic: 138,
              diastolic: 88,
              repeatSystolic: null,
              repeatDiastolic: null,
              at: '2026-10-03T09:00:00+00:00',
            },
            {
              systolic: 140,
              diastolic: 90,
              repeatSystolic: null,
              repeatDiastolic: null,
              at: '2026-09-03T09:00:00+00:00',
            },
          ],
          glucose_latest: { mgDl: 164, type: 'FASTING', at: '2026-11-03T09:00:00+00:00' },
          glucose_previous: [
            { mgDl: 130, at: '2026-10-03T09:00:00+00:00' },
            { mgDl: 126, at: '2026-09-03T09:00:00+00:00' },
          ],
          adherence: { levels: ['ALWAYS', 'SOMETIMES'], at: '2026-11-03T09:00:00+00:00' },
          tobacco: {
            smoking: 'CURRENT_DAILY',
            smokeless: 'NEVER',
            at: '2026-11-03T09:00:00+00:00',
          },
          eye_at: day('2026-11-03'),
          follow_up_at: day('2026-11-10'),
        },
        fullAccess,
        { ...baseSummary, visits: { total: 4, open: 0, lastVisitAt: day('2026-11-03') } } as never,
        day('2026-11-15'),
      );

      expect(glance.conditions).toEqual({
        history: ['Asthma'],
        screening: {
          hypertension: 'KNOWN_HYPERTENSION',
          diabetes: 'KNOWN_DIABETES',
          diabetesType: 'TYPE_2',
        },
      });
      expect(glance.bloodPressure).toMatchObject({
        latest: { systolic: 152, diastolic: 94, repeat: true },
        direction: 'RISING',
      });
      expect(glance.glucose).toMatchObject({
        latest: { mgDl: 164, type: 'FASTING' },
        direction: 'RISING',
        hba1c: null,
      });
      expect(glance.medications?.adherence).toEqual({
        level: 'SOMETIMES',
        recordedAt: day('2026-11-03'),
      });
      expect(glance.risks).toMatchObject({
        familyHistory: [{ relationship: 'Father', condition: 'Stroke' }],
        screening: { tobacco: { smoking: 'CURRENT_DAILY' }, pregnantRecordedAt: day('2026-11-01') },
      });
      expect(glance.screenings).toEqual([
        { kind: 'VITALS', lastAt: null },
        { kind: 'HYPERTENSION', lastAt: null },
        { kind: 'DIABETES', lastAt: null },
        { kind: 'EYE', lastAt: day('2026-11-03') },
        { kind: 'COUNSELLING', lastAt: null },
        { kind: 'TOBACCO', lastAt: day('2026-11-03') },
      ]);
      expect(glance.care).toEqual({
        visits: 4,
        lastVisitAt: day('2026-11-03'),
        followUp: { dueOn: '2026-11-10', state: 'OVERDUE' },
      });
    });

    it('does not call a pregnancy answered a term ago current', () => {
      const glance = assembleGlance(
        { ...EMPTY_ROW, pregnancy: { answer: 'YES', at: '2026-01-01T09:00:00+00:00' } },
        fullAccess,
        baseSummary as never,
        day('2026-11-15'),
      );
      expect(glance.risks?.screening?.pregnantRecordedAt).toBeNull();
    });

    it('gives a brand new patient a block of empty parts, not nulls', () => {
      expect(assembleGlance(EMPTY_ROW, fullAccess, baseSummary as never)).toMatchObject({
        conditions: { history: [], screening: { hypertension: null, diabetes: null } },
        bloodPressure: { latest: null, previous: [], direction: 'NOT_ENOUGH_DATA' },
        glucose: { latest: null, hba1c: null, direction: 'NOT_ENOUGH_DATA' },
        medications: { currentCount: 0, adherence: null },
        risks: { familyHistory: [], screening: { tobacco: null, pregnantRecordedAt: null } },
        care: { visits: 0, followUp: null },
      });
    });

    it('sends no BP, glucose, tobacco, eye or pregnancy without SCREENING.READ, and reads none', async () => {
      const access = { has: () => true, screening: false, counselling: false };
      // Even a row that held them would not reach the payload.
      const glance = assembleGlance(
        {
          ...EMPTY_ROW,
          bp: [
            {
              systolic: 1,
              diastolic: 1,
              repeatSystolic: null,
              repeatDiastolic: null,
              at: '2026-11-03T09:00:00+00:00',
            },
          ],
        },
        access,
        { ...baseSummary, hypertension: null, diabetes: null } as never,
      );
      expect(glance.bloodPressure).toBeNull();
      expect(glance.glucose).toBeNull();
      expect(glance.conditions?.screening).toBeNull();
      expect(glance.risks?.screening).toBeNull();
      expect(glance.screenings.map((entry) => entry.kind)).toEqual(['VITALS']);

      const { loadGlanceRow } = await import('./patient-chart-glance');
      await loadGlanceRow(prisma as never, CLINIC, PATIENT, access);
      const sql = capturedSql(prisma.$queryRaw).sql;
      for (const table of [
        '"Vitals"',
        '"TobaccoScreening"',
        '"EyeScreening"',
        '"HypertensionAssessment"',
        '"CounsellingRecord"',
      ])
        expect(sql).not.toContain(table);
    });

    it('drops the medical history and medication parts when their flags are off', async () => {
      delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
      delete process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;
      const { glance } = await service.getSummary(CLINIC, PATIENT, actor(UserRole.DOCTOR));
      expect(glance.conditions?.history).toBeNull();
      expect(glance.risks?.familyHistory).toBeNull();
      expect(glance.risks?.allergies).toBeNull();
      expect(glance.medications).toBeNull();
      const sql = capturedSql(prisma.$queryRaw).sql;
      expect(sql).not.toContain('"MedicalHistoryRecord"');
      expect(sql).not.toContain('"EncounterMedicationAdherence"');
    });

    it('leaves counselling out for a manager, who cannot read it', async () => {
      const { glance } = await service.getSummary(CLINIC, PATIENT, actor(UserRole.MANAGER));
      expect(glance.screenings.map((entry) => entry.kind)).not.toContain('COUNSELLING');
      expect(capturedSql(prisma.$queryRaw).sql).not.toContain('"CounsellingRecord"');
    });

    it('binds the clinic and patient as parameters of the one glance query', async () => {
      await service.getSummary(CLINIC, PATIENT, actor(UserRole.DOCTOR));
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const query = capturedSql(prisma.$queryRaw);
      expect(query.values).toEqual(expect.arrayContaining([CLINIC, PATIENT]));
      expect(query.values.filter((value) => typeof value === 'string')).toEqual(
        expect.arrayContaining([CLINIC, PATIENT]),
      );
      // Nothing else is interpolated: the gates are booleans and the probe limits small integers.
      expect(
        query.values.every(
          (value) =>
            [CLINIC, PATIENT, true, false].includes(value as never) ||
            (Number.isInteger(value) && (value as number) <= 3),
        ),
      ).toBe(true);
    });
  });
});
