import { ConflictException } from '@nestjs/common';
import {
  MedicationReconciliationOutcome,
  MedicationSourceType,
  PatientMedicationStatus,
} from '@prisma/client';
import { MedicationReconciliationService } from './medication-reconciliation.service';

const clinicId = '00000000-0000-4000-8000-000000000001';
const patientId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';
const recordId = '00000000-0000-4000-8000-000000000004';
const revisionId = '00000000-0000-4000-8000-000000000005';

function medicationRecord(currentId = revisionId) {
  return {
    id: recordId,
    clinicId,
    patientId,
    currentRevisionId: currentId,
    recordedByUserId: actorId,
    currentRevision: {
      id: currentId,
      revisionNumber: 1,
      medicationName: 'External medicine',
      status: PatientMedicationStatus.CURRENT,
      sourceType: MedicationSourceType.PATIENT_REPORTED,
    },
  };
}

function setup() {
  const prisma = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: patientId }) },
    drug: { findFirst: jest.fn() },
    encounter: { findFirst: jest.fn() },
    patientMedicationRecord: {
      create: jest.fn().mockResolvedValue(medicationRecord()),
      update: jest.fn().mockResolvedValue(medicationRecord()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(medicationRecord()),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(medicationRecord()),
    },
    patientMedicationRevision: { create: jest.fn(), findMany: jest.fn() },
    medicationReconciliationEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      findFirst: jest.fn(),
    },
    patientPharmacyRecord: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    patientPharmacyRevision: { create: jest.fn(), findMany: jest.fn() },
    patientPharmacyPreference: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'preference-new',
        pharmacyRecordId: recordId,
      }),
      update: jest.fn(),
    },
    prescription: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
  );
  const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    audit,
    service: new MedicationReconciliationService(prisma as never, audit as never),
  };
}

describe('MedicationReconciliationService', () => {
  it('records an uncatalogued external medication without creating or looking up a Drug', async () => {
    const { service, prisma, audit } = setup();

    await service.createMedication(clinicId, patientId, actorId, {
      recordId,
      revisionId,
      medicationName: 'External medicine',
      status: PatientMedicationStatus.CURRENT,
      sourceType: MedicationSourceType.PATIENT_REPORTED,
    });

    expect(prisma.drug.findFirst).not.toHaveBeenCalled();
    expect(prisma.patientMedicationRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ drugId: undefined, medicationName: 'External medicine' }),
    });
    expect(audit.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MEDICATION_RECONCILIATION.MEDICATION_CREATE' }),
    );
  });

  it('rejects a stale revision and returns the latest record context', async () => {
    const { service } = setup();

    await expect(
      service.reviseMedication(clinicId, patientId, recordId, actorId, {
        expectedCurrentRevisionId: '00000000-0000-4000-8000-000000000099',
        medicationName: 'External medicine',
        status: PatientMedicationStatus.CURRENT,
        sourceType: MedicationSourceType.PATIENT_REPORTED,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEDICATION_REVISION_CONFLICT' }),
    });
  });

  it('blocks no-known-current attestation while a current medication exists', async () => {
    const { service, prisma } = setup();
    prisma.patientMedicationRecord.findMany.mockResolvedValue([medicationRecord()]);

    await expect(
      service.reconcile(clinicId, patientId, actorId, {
        outcome: MedicationReconciliationOutcome.NO_KNOWN_CURRENT_MEDICATIONS,
        items: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('atomically stamps an exact current list and records one reconciliation event', async () => {
    const { service, prisma } = setup();
    prisma.patientMedicationRecord.findMany.mockResolvedValue([medicationRecord()]);

    await service.reconcile(clinicId, patientId, actorId, {
      outcome: MedicationReconciliationOutcome.CURRENT_LIST_REVIEWED,
      items: [
        {
          recordId,
          expectedCurrentRevisionId: revisionId,
          newRevisionId: '00000000-0000-4000-8000-000000000006',
        },
      ],
    });

    expect(prisma.patientMedicationRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordId,
        revisionNumber: 2,
        reconciledByUserId: actorId,
        lastReconciledAt: expect.any(Date),
      }),
    });
    expect(prisma.medicationReconciliationEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale preferred-pharmacy transition', async () => {
    const { service, prisma } = setup();
    prisma.patientPharmacyRecord.findFirst.mockResolvedValue({
      id: recordId,
      currentRevision: { revisionNumber: 1 },
    });
    prisma.patientPharmacyPreference.findFirst.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      pharmacyRecordId: recordId,
    });

    await expect(
      service.setPreferredPharmacy(clinicId, patientId, recordId, actorId, {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PHARMACY_PREFERENCE_CONFLICT' }),
    });
  });

  it('closes the prior preference before creating the next history period', async () => {
    const { service, prisma } = setup();
    const activeId = '00000000-0000-4000-8000-000000000010';
    prisma.patientPharmacyRecord.findFirst.mockResolvedValue({
      id: recordId,
      currentRevision: { revisionNumber: 1 },
    });
    prisma.patientPharmacyPreference.findFirst.mockResolvedValue({
      id: activeId,
      pharmacyRecordId: '00000000-0000-4000-8000-000000000011',
    });

    await service.setPreferredPharmacy(clinicId, patientId, recordId, actorId, {
      expectedActivePreferenceId: activeId,
    });

    expect(prisma.patientPharmacyPreference.update).toHaveBeenCalledWith({
      where: { id: activeId },
      data: { effectiveTo: expect.any(Date), endedByUserId: actorId },
    });
    expect(prisma.patientPharmacyPreference.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ pharmacyRecordId: recordId, setByUserId: actorId }),
    });
  });

  it('rejects cross-clinic medication creation before writing', async () => {
    const { service, prisma } = setup();
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.createMedication(clinicId, patientId, actorId, {
        medicationName: 'External medicine',
        status: PatientMedicationStatus.CURRENT,
        sourceType: MedicationSourceType.PATIENT_REPORTED,
      }),
    ).rejects.toThrow('Patient not found');
    expect(prisma.patientMedicationRecord.create).not.toHaveBeenCalled();
  });
});
