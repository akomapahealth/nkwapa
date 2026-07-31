import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MedicalHistoryCategory, MedicalHistoryStatus } from '@prisma/client';
import { MedicalHistoryService } from './medical-history.service';

const clinicId = '00000000-0000-4000-8000-000000000001';
const patientId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';
const recordId = '00000000-0000-4000-8000-000000000004';
const revisionId = '00000000-0000-4000-8000-000000000005';

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: revisionId,
    recordId,
    revisionNumber: 1,
    status: MedicalHistoryStatus.ACTIVE,
    onsetDate: null,
    occurrenceDate: null,
    resolvedDate: null,
    detailsSchemaVersion: 1,
    details: { conditionName: 'Hypertension' },
    notes: null,
    sourceEncounterId: null,
    authoredByUserId: actorId,
    createdAt: new Date('2026-07-30T12:00:00Z'),
    authoredBy: { id: actorId, displayName: 'Clinician' },
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: recordId,
    clinicId,
    patientId,
    category: MedicalHistoryCategory.CONDITION,
    currentRevisionId: revisionId,
    currentRevision: revision(),
    createdAt: new Date('2026-07-30T12:00:00Z'),
    updatedAt: new Date('2026-07-30T12:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const prisma = {
    patient: {
      findFirst: jest.fn().mockResolvedValue({ id: patientId }),
    },
    encounter: {
      findFirst: jest.fn().mockResolvedValue({ id: 'encounter-1' }),
    },
    medicalHistoryRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(record()),
      create: jest.fn().mockResolvedValue(record({ currentRevisionId: null })),
      update: jest.fn().mockResolvedValue(record()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    medicalHistoryRevision: {
      create: jest.fn().mockResolvedValue(revision()),
      findMany: jest.fn().mockResolvedValue([revision()]),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
  );
  const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    audit,
    service: new MedicalHistoryService(prisma as never, audit as never),
  };
}

describe('MedicalHistoryService', () => {
  it.each([
    [MedicalHistoryCategory.CONDITION, { conditionName: 'Hypertension' }],
    [
      MedicalHistoryCategory.ALLERGY,
      { kind: 'ALLERGY', substance: 'Penicillin', reaction: 'Rash', severity: 'MODERATE' },
    ],
    [MedicalHistoryCategory.SURGERY_PROCEDURE, { procedureName: 'Appendectomy' }],
    [
      MedicalHistoryCategory.FAMILY_HISTORY,
      { relationship: 'Parent', familyCondition: 'Diabetes' },
    ],
    [
      MedicalHistoryCategory.SOCIAL_HISTORY,
      { socialType: 'TOBACCO', description: 'Former smoker' },
    ],
  ])('accepts validated structured details for %s', async (category, details) => {
    const { service } = setup();

    await expect(
      service.create(clinicId, patientId, actorId, {
        category,
        status: MedicalHistoryStatus.ACTIVE,
        details,
      } as never),
    ).resolves.toBeDefined();
  });

  it('creates an authored initial revision and audit event', async () => {
    const { service, prisma, audit } = setup();

    await service.create(clinicId, patientId, actorId, {
      recordId,
      revisionId,
      category: MedicalHistoryCategory.CONDITION,
      status: MedicalHistoryStatus.ACTIVE,
      details: { conditionName: 'Hypertension' },
    });

    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: { id: patientId, primaryClinicId: clinicId, mergedIntoPatientId: null },
      select: { id: true },
    });
    expect(prisma.medicalHistoryRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: revisionId,
        recordId,
        revisionNumber: 1,
        authoredByUserId: actorId,
      }),
    });
    expect(audit.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MEDICAL_HISTORY.CREATE', actorUserId: actorId }),
    );
  });

  it.each([
    [MedicalHistoryCategory.CONDITION, {}],
    [MedicalHistoryCategory.SURGERY_PROCEDURE, {}],
    [MedicalHistoryCategory.FAMILY_HISTORY, { relationship: 'Parent' }],
    [MedicalHistoryCategory.SOCIAL_HISTORY, { socialType: 'TOBACCO' }],
    [MedicalHistoryCategory.ALLERGY, { kind: 'ALLERGY' }],
  ])('rejects incomplete structured details for %s', async (category, details) => {
    const { service } = setup();

    await expect(
      service.create(clinicId, patientId, actorId, {
        category,
        status: MedicalHistoryStatus.ACTIVE,
        details,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks NKA while an active allergy exists', async () => {
    const { service, prisma } = setup();
    prisma.medicalHistoryRecord.findMany.mockResolvedValue([
      record({
        id: 'allergy-record',
        category: MedicalHistoryCategory.ALLERGY,
        currentRevision: revision({
          details: { kind: 'ALLERGY', substance: 'Penicillin', severity: 'SEVERE' },
        }),
      }),
    ]);

    await expect(
      service.create(clinicId, patientId, actorId, {
        category: MedicalHistoryCategory.ALLERGY,
        status: MedicalHistoryStatus.ACTIVE,
        details: { kind: 'NO_KNOWN_ALLERGIES' },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACTIVE_ALLERGIES_PREVENT_NKA' }),
    });
  });

  it('retires NKA with its own revision and audit event when an allergy is added', async () => {
    const { service, prisma, audit } = setup();
    prisma.medicalHistoryRecord.findMany.mockResolvedValue([
      record({
        id: 'nka-record',
        category: MedicalHistoryCategory.ALLERGY,
        currentRevision: revision({
          recordId: 'nka-record',
          details: { kind: 'NO_KNOWN_ALLERGIES', severity: 'UNKNOWN' },
        }),
      }),
    ]);

    await service.create(clinicId, patientId, actorId, {
      category: MedicalHistoryCategory.ALLERGY,
      status: MedicalHistoryStatus.ACTIVE,
      details: { kind: 'ALLERGY', substance: 'Penicillin', severity: 'SEVERE' },
    });

    expect(prisma.medicalHistoryRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordId: 'nka-record',
        status: MedicalHistoryStatus.INACTIVE,
      }),
    });
    expect(audit.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MEDICAL_HISTORY.NKA_RETIRE',
        entityId: 'nka-record',
      }),
    );
  });

  it('rejects a stale expected revision and returns the latest revision', async () => {
    const { service } = setup();

    await expect(
      service.revise(clinicId, patientId, recordId, actorId, {
        expectedCurrentRevisionId: '00000000-0000-4000-8000-000000000099',
        status: MedicalHistoryStatus.RESOLVED,
        resolvedDate: '2026-07-30',
        details: { conditionName: 'Hypertension' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a resolved date for a resolved transition', async () => {
    const { service } = setup();

    await expect(
      service.revise(clinicId, patientId, recordId, actorId, {
        expectedCurrentRevisionId: revisionId,
        status: MedicalHistoryStatus.RESOLVED,
        details: { conditionName: 'Hypertension' },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RESOLVED_DATE_REQUIRED' }),
    });
  });

  it('treats entered-in-error as a terminal state', async () => {
    const { service, prisma } = setup();
    prisma.medicalHistoryRecord.findFirst.mockResolvedValue(
      record({
        currentRevision: revision({ status: MedicalHistoryStatus.ENTERED_IN_ERROR }),
      }),
    );

    await expect(
      service.revise(clinicId, patientId, recordId, actorId, {
        expectedCurrentRevisionId: revisionId,
        status: MedicalHistoryStatus.ACTIVE,
        details: { conditionName: 'Hypertension' },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEDICAL_HISTORY_TERMINAL' }),
    });
  });

  it('blocks cross-clinic creation before writing a record', async () => {
    const { service, prisma } = setup();
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.create(clinicId, patientId, actorId, {
        category: MedicalHistoryCategory.CONDITION,
        status: MedicalHistoryStatus.ACTIVE,
        details: { conditionName: 'Hypertension' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.medicalHistoryRecord.create).not.toHaveBeenCalled();
  });
});
