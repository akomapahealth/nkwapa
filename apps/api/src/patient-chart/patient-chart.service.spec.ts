import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EncounterStatus, UserRole } from '@prisma/client';
import { PatientChartService, type ChartActor } from './patient-chart.service';
import { encodeKeysetCursor } from '../common/keyset-cursor';

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

function createPrismaMock() {
  return {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: PATIENT }) },
    vitals: {
      findFirst: jest.fn().mockResolvedValue(vitalsFixture()),
      findMany: jest.fn().mockResolvedValue([]),
    },
    diabetesScreening: { findFirst: jest.fn().mockResolvedValue(null) },
    patientMedicationRecord: { count: jest.fn().mockResolvedValue(0) },
    medicationReconciliationEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    clinicalNote: { count: jest.fn().mockResolvedValue(0) },
    encounter: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    patientConsent: { findFirst: jest.fn().mockResolvedValue(null) },
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
    it('omits blocks the caller may not read rather than blanking them', async () => {
      // A director does not hold CONSENT.RECORD, so the consent block must be absent.
      const summary = await service.getSummary(CLINIC, PATIENT, actor(UserRole.DIRECTOR));
      expect(summary.sections.map((s) => s.id)).not.toContain('consent');
      expect(summary.consent).toBeNull();
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
});
