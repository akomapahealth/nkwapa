import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ClinicalNoteStatus, UserRole } from '@prisma/client';
import { ClinicalNoteService } from './clinical-note.service';

const clinicId = '10000000-0000-4000-8000-000000000001';
const encounterId = '10000000-0000-4000-8000-000000000002';
const volunteerId = '10000000-0000-4000-8000-000000000003';
const doctorId = '10000000-0000-4000-8000-000000000004';

const roles = (userId: string, role: UserRole, scopedClinicId = clinicId) => ({
  userId,
  roles: [{ clinicId: scopedClinicId, role }],
});

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000005',
    clinicId,
    encounterId,
    patientId: '10000000-0000-4000-8000-000000000006',
    authorUserId: volunteerId,
    authorRole: UserRole.VOLUNTEER,
    status: ClinicalNoteStatus.DRAFT,
    version: 1,
    history: 'History',
    assessment: 'Assessment',
    plan: 'Plan',
    submittedByUserId: null,
    cosignedByUserId: null,
    ...overrides,
  };
}

describe('ClinicalNoteService', () => {
  const prisma = {
    $transaction: jest.fn(),
    clinicalNote: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    clinicalNoteAddendum: { create: jest.fn() },
    patientAssignment: { findFirst: jest.fn() },
    patient: { findFirst: jest.fn() },
    encounter: { findFirst: jest.fn() },
  };
  const repository = {
    findEncounterNote: jest.fn(),
    findPatientNotes: jest.fn(),
    findPendingForDoctor: jest.fn(),
  };
  const audit = { logWrite: jest.fn() };
  let service: ClinicalNoteService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    audit.logWrite.mockResolvedValue(undefined);
    service = new ClinicalNoteService(prisma as never, repository as never, audit as never);
  });

  it.each([UserRole.SYSTEM_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER, UserRole.PATIENT])(
    'denies %s access to clinical note content',
    async (role) => {
      await expect(
        service.getEncounterNote(clinicId, encounterId, roles('actor', role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.findEncounterNote).not.toHaveBeenCalled();
    },
  );

  it.each([UserRole.DOCTOR, UserRole.VOLUNTEER])(
    'permits clinic-scoped %s content reads',
    async (role) => {
      repository.findEncounterNote.mockResolvedValue(note());
      await expect(
        service.getEncounterNote(clinicId, encounterId, roles('actor', role)),
      ).resolves.toMatchObject({ id: expect.any(String) });
    },
  );

  it('denies a clinical role from another clinic', async () => {
    await expect(
      service.getEncounterNote(
        clinicId,
        encounterId,
        roles('actor', UserRole.DOCTOR, '20000000-0000-4000-8000-000000000001'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('submits a volunteer draft to the active assigned doctor and audits metadata only', async () => {
    prisma.clinicalNote.findFirst.mockResolvedValue(note());
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment',
      assignedVolunteerId: volunteerId,
      assignedDoctorId: doctorId,
      assignedAt: new Date('2026-08-13T12:00:00Z'),
      assignedVolunteer: { id: volunteerId, displayName: 'Volunteer' },
      assignedDoctor: { id: doctorId, displayName: 'Doctor' },
    });
    prisma.clinicalNote.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(note({ ...data, status: ClinicalNoteStatus.PENDING_COSIGN, version: 2 })),
    );

    const result = await service.submit(
      clinicId,
      encounterId,
      roles(volunteerId, UserRole.VOLUNTEER),
    );

    expect(result).toMatchObject({
      status: ClinicalNoteStatus.PENDING_COSIGN,
      assignedDoctorId: doctorId,
    });
    expect(audit.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLINICAL_NOTE.SUBMIT',
        afterJson: JSON.stringify({ status: ClinicalNoteStatus.PENDING_COSIGN, version: 2 }),
      }),
    );
    expect(audit.logWrite.mock.calls[0][0].afterJson).not.toContain('History');
  });

  it('signs a doctor-authored note without a second cosigner', async () => {
    prisma.clinicalNote.findFirst.mockResolvedValue(
      note({ authorUserId: doctorId, authorRole: UserRole.DOCTOR }),
    );
    prisma.patientAssignment.findFirst.mockResolvedValue(null);
    prisma.clinicalNote.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(
        note({
          ...data,
          authorUserId: doctorId,
          authorRole: UserRole.DOCTOR,
          status: ClinicalNoteStatus.COSIGNED,
          version: 2,
        }),
      ),
    );

    const result = await service.submit(clinicId, encounterId, roles(doctorId, UserRole.DOCTOR));
    expect(result).toMatchObject({
      status: ClinicalNoteStatus.COSIGNED,
      cosignedByUserId: doctorId,
      signedContentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('treats a duplicate submission by the same submitter as idempotent', async () => {
    const pending = note({
      status: ClinicalNoteStatus.PENDING_COSIGN,
      submittedByUserId: volunteerId,
    });
    prisma.clinicalNote.findFirst.mockResolvedValue(pending);

    await expect(
      service.submit(clinicId, encounterId, roles(volunteerId, UserRole.VOLUNTEER)),
    ).resolves.toBe(pending);
    expect(prisma.clinicalNote.update).not.toHaveBeenCalled();
    expect(audit.logWrite).not.toHaveBeenCalled();
  });

  it('allows only the snapshotted doctor to cosign and freezes signed content', async () => {
    prisma.clinicalNote.findFirst.mockResolvedValue(
      note({ status: ClinicalNoteStatus.PENDING_COSIGN, assignedDoctorId: doctorId }),
    );
    prisma.clinicalNote.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(note({ ...data, status: ClinicalNoteStatus.COSIGNED, version: 2 })),
    );

    const signed = await service.cosign(clinicId, encounterId, roles(doctorId, UserRole.DOCTOR));
    expect(signed).toMatchObject({
      signedHistory: 'History',
      signedAssessment: 'Assessment',
      signedPlan: 'Plan',
      signedContentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    prisma.clinicalNote.findFirst.mockResolvedValue(
      note({ status: ClinicalNoteStatus.PENDING_COSIGN, assignedDoctorId: 'another-doctor' }),
    );
    await expect(
      service.cosign(clinicId, encounterId, roles(doctorId, UserRole.DOCTOR)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects draft edits after submission and stale draft versions', async () => {
    prisma.clinicalNote.findFirst.mockResolvedValue(
      note({ status: ClinicalNoteStatus.PENDING_COSIGN }),
    );
    await expect(
      service.updateDraft(clinicId, encounterId, roles(volunteerId, UserRole.VOLUNTEER), {
        history: 'H',
        assessment: 'A',
        plan: 'P',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.clinicalNote.findFirst.mockResolvedValue(note({ version: 2 }));
    await expect(
      service.updateDraft(clinicId, encounterId, roles(volunteerId, UserRole.VOLUNTEER), {
        history: 'H',
        assessment: 'A',
        plan: 'P',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows only doctors to append a reasoned addendum to a signed note', async () => {
    prisma.clinicalNote.findFirst.mockResolvedValue(note({ status: ClinicalNoteStatus.COSIGNED }));
    prisma.clinicalNoteAddendum.create.mockResolvedValue({ id: 'addendum' });
    prisma.clinicalNote.update.mockResolvedValue(note({ status: ClinicalNoteStatus.AMENDED }));
    prisma.clinicalNote.findUniqueOrThrow.mockResolvedValue(
      note({ status: ClinicalNoteStatus.AMENDED }),
    );

    await expect(
      service.addAddendum(clinicId, encounterId, roles(doctorId, UserRole.DOCTOR), {
        reason: 'Correction',
        content: 'Clarification',
      }),
    ).resolves.toMatchObject({ status: ClinicalNoteStatus.AMENDED });

    await expect(
      service.addAddendum(clinicId, encounterId, roles(volunteerId, UserRole.VOLUNTEER), {
        reason: 'Correction',
        content: 'Clarification',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  describe('seeding a draft from the interviews', () => {
    function adherenceRow(context: 'HYPERTENSION' | 'DIABETES', medicationName: string) {
      return {
        context,
        medicationRecordId: 'record-1',
        observedRevisionId: 'revision-1',
        tookToday: 'YES',
        dosesMissed7d: 'NOT_ASSESSED',
        takingAsPrescribed: 'NOT_ASSESSED',
        supplyRemaining: 'NOT_ASSESSED',
        problems: [],
        problemsOther: null,
        observedRevision: {
          medicationName,
          strength: '10mg',
          dose: null,
          doseUnit: null,
          frequency: 'once daily',
        },
      };
    }

    function seedEncounter(overrides: Record<string, unknown> = {}) {
      return {
        patient: { firstName: 'Ama', lastName: 'Mensah' },
        vitals: { systolicBp: 152, diastolicBp: 94, pulseBpm: 78 },
        hypertensionAssessment: null,
        diabetesScreening: null,
        medicationAdherence: [],
        ...overrides,
      };
    }

    function seededDraft() {
      return (
        prisma.clinicalNote.create.mock.calls[0]?.[0]?.data ??
        prisma.clinicalNote.update.mock.calls[0]?.[0]?.data
      );
    }

    beforeEach(() => {
      prisma.clinicalNote.findFirst.mockResolvedValue(null);
      prisma.patient.findFirst.mockResolvedValue({ id: 'patient-1' });
      prisma.patientAssignment.findFirst.mockResolvedValue(null);
      prisma.clinicalNote.create.mockResolvedValue(note());
      prisma.clinicalNote.findUniqueOrThrow.mockResolvedValue(note());
    });

    /*
      `NarrativeInput.medications` has existed since the generators were written and nothing ever
      supplied it, so every note said no medications were recorded regardless of what the patient
      was on.
    */
    it('names the medications the volunteer recorded adherence for', async () => {
      prisma.encounter.findFirst.mockResolvedValue(
        seedEncounter({
          hypertensionAssessment: {
            clinicianPlanItems: [],
            reviewReasons: [],
            currentSymptoms: [],
          },
          medicationAdherence: [adherenceRow('HYPERTENSION', 'Amlodipine')],
        }),
      );

      await service.seedFromInterviews(clinicId, encounterId, roles(doctorId, UserRole.DOCTOR), {});

      expect(seededDraft().history).toContain('Amlodipine 10mg once daily');
      expect(seededDraft().history).toContain('took it today');
    });

    /*
      One encounter can carry both conditions, and each note section must name only its own
      medications. Without the filter a diabetes paragraph would list the patient's antihypertensives
      as diabetes medications.
    */
    it('gives each condition only its own medications', async () => {
      prisma.encounter.findFirst.mockResolvedValue(
        seedEncounter({
          diabetesScreening: {
            clinicianPlanItems: [],
            reviewReasons: [],
            symptoms: [],
            urgentSymptoms: [],
          },
          medicationAdherence: [
            adherenceRow('HYPERTENSION', 'Amlodipine'),
            adherenceRow('DIABETES', 'Metformin'),
          ],
        }),
      );

      await service.seedFromInterviews(clinicId, encounterId, roles(doctorId, UserRole.DOCTOR), {});

      expect(seededDraft().history).toContain('Metformin');
      expect(seededDraft().history).not.toContain('Amlodipine');
    });

    it('still says none were recorded when the encounter has no adherence', async () => {
      prisma.encounter.findFirst.mockResolvedValue(
        seedEncounter({
          hypertensionAssessment: {
            clinicianPlanItems: [],
            reviewReasons: [],
            currentSymptoms: [],
          },
        }),
      );

      await service.seedFromInterviews(clinicId, encounterId, roles(doctorId, UserRole.DOCTOR), {});

      expect(seededDraft().history).toContain('No blood-pressure medications were recorded');
    });
  });
});
