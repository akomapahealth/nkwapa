import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicationReconciliationOutcome, PatientMedicationStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { normalizePhoneToE164 } from '@nkwapa/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePatientMedicationDto,
  CreatePatientPharmacyDto,
  EndPreferredPharmacyDto,
  MedicationSnapshotDto,
  PharmacySnapshotDto,
  ReconcileMedicationListDto,
  RevisePatientMedicationDto,
  RevisePatientPharmacyDto,
  SetPreferredPharmacyDto,
} from './dto/medication-reconciliation.dto';

const medicationInclude = {
  recordedBy: { select: { id: true, displayName: true } },
  currentRevision: {
    include: {
      drug: { select: { id: true, name: true, genericName: true } },
      sourceEncounter: { select: { id: true, createdAt: true } },
      authoredBy: { select: { id: true, displayName: true } },
      reconciledBy: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.PatientMedicationRecordInclude;

const pharmacyInclude = {
  recordedBy: { select: { id: true, displayName: true } },
  currentRevision: {
    include: { authoredBy: { select: { id: true, displayName: true } } },
  },
  preferences: {
    orderBy: { effectiveFrom: 'desc' as const },
    include: {
      setBy: { select: { id: true, displayName: true } },
      endedBy: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.PatientPharmacyRecordInclude;

type AuditContext = { requestId?: string; ipAddress?: string; userAgent?: string };

@Injectable()
export class MedicationReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(clinicId: string, patientId: string) {
    await this.requirePatient(clinicId, patientId);
    const [medications, pharmacies, latestReconciliation] = await Promise.all([
      this.prisma.patientMedicationRecord.findMany({
        where: { clinicId, patientId },
        include: medicationInclude,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.patientPharmacyRecord.findMany({
        where: { clinicId, patientId },
        include: pharmacyInclude,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.medicationReconciliationEvent.findFirst({
        where: { clinicId, patientId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          reconciledBy: { select: { id: true, displayName: true } },
          sourceEncounter: { select: { id: true, createdAt: true } },
        },
      }),
    ]);
    return { medications, pharmacies, latestReconciliation };
  }

  async listMedicationRevisions(clinicId: string, patientId: string, recordId: string) {
    await this.requireMedicationRecord(clinicId, patientId, recordId);
    return this.prisma.patientMedicationRevision.findMany({
      where: { recordId },
      orderBy: { revisionNumber: 'desc' },
      include: {
        drug: { select: { id: true, name: true, genericName: true } },
        sourceEncounter: { select: { id: true, createdAt: true } },
        authoredBy: { select: { id: true, displayName: true } },
        reconciledBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async createMedication(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    dto: CreatePatientMedicationDto,
    context: AuditContext = {},
  ) {
    await this.validateMedicationSnapshot(clinicId, patientId, dto);
    const recordId = dto.recordId ?? randomUUID();
    const revisionId = dto.revisionId ?? randomUUID();
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        await tx.patientMedicationRecord.create({
          data: { id: recordId, clinicId, patientId, recordedByUserId: actorUserId },
        });
        await tx.patientMedicationRevision.create({
          data: this.medicationRevisionData(recordId, revisionId, 1, actorUserId, dto),
        });
        return tx.patientMedicationRecord.update({
          where: { id: recordId },
          data: { currentRevisionId: revisionId },
          include: medicationInclude,
        });
      });
      await this.log(
        'MEDICATION_RECONCILIATION.MEDICATION_CREATE',
        clinicId,
        actorUserId,
        recordId,
        null,
        record,
        context,
      );
      return record;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException({
          code: 'MEDICATION_ID_CONFLICT',
          message: 'Medication record identifiers already exist.',
        });
      }
      throw error;
    }
  }

  async reviseMedication(
    clinicId: string,
    patientId: string,
    recordId: string,
    actorUserId: string,
    dto: RevisePatientMedicationDto,
    context: AuditContext = {},
  ) {
    await this.validateMedicationSnapshot(clinicId, patientId, dto);
    const before = await this.requireMedicationRecord(clinicId, patientId, recordId);
    if (before.currentRevisionId !== dto.expectedCurrentRevisionId) {
      throw this.staleMedication(before);
    }
    const revisionId = dto.revisionId ?? randomUUID();
    const nextNumber = before.currentRevision!.revisionNumber + 1;
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.patientMedicationRevision.create({
        data: this.medicationRevisionData(recordId, revisionId, nextNumber, actorUserId, dto),
      });
      const changed = await tx.patientMedicationRecord.updateMany({
        where: {
          id: recordId,
          clinicId,
          patientId,
          currentRevisionId: dto.expectedCurrentRevisionId,
        },
        data: { currentRevisionId: revisionId },
      });
      if (changed.count !== 1) throw this.staleMedication(before);
      return tx.patientMedicationRecord.findUniqueOrThrow({
        where: { id: recordId },
        include: medicationInclude,
      });
    });
    await this.log(
      'MEDICATION_RECONCILIATION.MEDICATION_REVISE',
      clinicId,
      actorUserId,
      recordId,
      before,
      record,
      context,
    );
    return record;
  }

  async reconcile(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    dto: ReconcileMedicationListDto,
    context: AuditContext = {},
  ) {
    await this.requirePatient(clinicId, patientId);
    await this.validateEncounter(clinicId, patientId, dto.sourceEncounterId);
    const current = await this.prisma.patientMedicationRecord.findMany({
      where: { clinicId, patientId, currentRevision: { status: PatientMedicationStatus.CURRENT } },
      include: { currentRevision: true },
      orderBy: { id: 'asc' },
    });
    if (
      dto.outcome === MedicationReconciliationOutcome.NO_KNOWN_CURRENT_MEDICATIONS &&
      current.length > 0
    ) {
      throw new ConflictException({
        code: 'CURRENT_MEDICATIONS_PREVENT_NO_KNOWN',
        message:
          'Revise each current medication to past or stopped before recording no known current medications.',
        currentMedicationIds: current.map((item) => item.id),
      });
    }
    const expected = new Map(dto.items.map((item) => [item.recordId, item]));
    const exact =
      current.length === expected.size &&
      current.every(
        (record) => expected.get(record.id)?.expectedCurrentRevisionId === record.currentRevisionId,
      );
    if (!exact) {
      throw new ConflictException({
        code: 'MEDICATION_LIST_CONFLICT',
        message: 'The current medication list changed. Refresh and review the latest list.',
        current: current.map((record) => ({
          recordId: record.id,
          revisionId: record.currentRevisionId,
        })),
      });
    }
    if (
      dto.outcome === MedicationReconciliationOutcome.CURRENT_LIST_REVIEWED &&
      current.length === 0
    ) {
      throw new BadRequestException({
        code: 'NO_CURRENT_MEDICATIONS',
        message: 'Use no known current medications when the current list is empty.',
      });
    }
    const eventId = dto.eventId ?? randomUUID();
    const reconciledAt = new Date();
    const event = await this.prisma.$transaction(async (tx) => {
      for (const record of current) {
        const item = expected.get(record.id)!;
        const revision = record.currentRevision!;
        await tx.patientMedicationRevision.create({
          data: {
            id: item.newRevisionId,
            recordId: record.id,
            revisionNumber: revision.revisionNumber + 1,
            medicationName: revision.medicationName,
            drugId: revision.drugId,
            strength: revision.strength,
            dose: revision.dose,
            doseUnit: revision.doseUnit,
            route: revision.route,
            frequency: revision.frequency,
            duration: revision.duration,
            startDate: revision.startDate,
            endDate: revision.endDate,
            indication: revision.indication,
            status: revision.status,
            notes: revision.notes,
            sourceEncounterId: dto.sourceEncounterId ?? revision.sourceEncounterId,
            sourceType: revision.sourceType,
            authoredByUserId: actorUserId,
            reconciledByUserId: actorUserId,
            lastReconciledAt: reconciledAt,
          },
        });
        const changed = await tx.patientMedicationRecord.updateMany({
          where: { id: record.id, currentRevisionId: item.expectedCurrentRevisionId },
          data: { currentRevisionId: item.newRevisionId },
        });
        if (changed.count !== 1) throw new ConflictException({ code: 'MEDICATION_LIST_CONFLICT' });
      }
      return tx.medicationReconciliationEvent.create({
        data: {
          id: eventId,
          clinicId,
          patientId,
          outcome: dto.outcome,
          sourceEncounterId: dto.sourceEncounterId,
          reconciledByUserId: actorUserId,
          notes: dto.notes,
          createdAt: reconciledAt,
        },
        include: { reconciledBy: { select: { id: true, displayName: true } } },
      });
    });
    await this.log(
      'MEDICATION_RECONCILIATION.LIST_RECONCILE',
      clinicId,
      actorUserId,
      eventId,
      null,
      event,
      context,
    );
    return event;
  }

  async listPharmacyRevisions(clinicId: string, patientId: string, recordId: string) {
    await this.requirePharmacyRecord(clinicId, patientId, recordId);
    return this.prisma.patientPharmacyRevision.findMany({
      where: { recordId },
      orderBy: { revisionNumber: 'desc' },
      include: { authoredBy: { select: { id: true, displayName: true } } },
    });
  }

  async createPharmacy(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    dto: CreatePatientPharmacyDto,
    context: AuditContext = {},
  ) {
    await this.requirePatient(clinicId, patientId);
    const recordId = dto.recordId ?? randomUUID();
    const revisionId = dto.revisionId ?? randomUUID();
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.patientPharmacyRecord.create({
        data: { id: recordId, clinicId, patientId, recordedByUserId: actorUserId },
      });
      await tx.patientPharmacyRevision.create({
        data: this.pharmacyRevisionData(recordId, revisionId, 1, actorUserId, dto),
      });
      return tx.patientPharmacyRecord.update({
        where: { id: recordId },
        data: { currentRevisionId: revisionId },
        include: pharmacyInclude,
      });
    });
    await this.log(
      'MEDICATION_RECONCILIATION.PHARMACY_CREATE',
      clinicId,
      actorUserId,
      recordId,
      null,
      record,
      context,
    );
    return record;
  }

  async revisePharmacy(
    clinicId: string,
    patientId: string,
    recordId: string,
    actorUserId: string,
    dto: RevisePatientPharmacyDto,
    context: AuditContext = {},
  ) {
    const before = await this.requirePharmacyRecord(clinicId, patientId, recordId);
    if (before.currentRevisionId !== dto.expectedCurrentRevisionId)
      throw this.stalePharmacy(before);
    const revisionId = dto.revisionId ?? randomUUID();
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.patientPharmacyRevision.create({
        data: this.pharmacyRevisionData(
          recordId,
          revisionId,
          before.currentRevision!.revisionNumber + 1,
          actorUserId,
          dto,
        ),
      });
      const changed = await tx.patientPharmacyRecord.updateMany({
        where: {
          id: recordId,
          clinicId,
          patientId,
          currentRevisionId: dto.expectedCurrentRevisionId,
        },
        data: { currentRevisionId: revisionId },
      });
      if (changed.count !== 1) throw this.stalePharmacy(before);
      return tx.patientPharmacyRecord.findUniqueOrThrow({
        where: { id: recordId },
        include: pharmacyInclude,
      });
    });
    await this.log(
      'MEDICATION_RECONCILIATION.PHARMACY_REVISE',
      clinicId,
      actorUserId,
      recordId,
      before,
      record,
      context,
    );
    return record;
  }

  async setPreferredPharmacy(
    clinicId: string,
    patientId: string,
    recordId: string,
    actorUserId: string,
    dto: SetPreferredPharmacyDto,
    context: AuditContext = {},
  ) {
    await this.requirePharmacyRecord(clinicId, patientId, recordId);
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    if (effectiveFrom.getTime() > Date.now() + 1000)
      throw new BadRequestException({ code: 'FUTURE_PREFERENCE_NOT_SUPPORTED' });
    const active = await this.prisma.patientPharmacyPreference.findFirst({
      where: { clinicId, patientId, effectiveTo: null },
    });
    if ((active?.id ?? undefined) !== dto.expectedActivePreferenceId)
      throw this.stalePreference(active);
    if (active?.pharmacyRecordId === recordId) return active;
    let preference;
    try {
      preference = await this.prisma.$transaction(async (tx) => {
        if (active)
          await tx.patientPharmacyPreference.update({
            where: { id: active.id },
            data: { effectiveTo: effectiveFrom, endedByUserId: actorUserId },
          });
        return tx.patientPharmacyPreference.create({
          data: {
            id: dto.preferenceId ?? randomUUID(),
            clinicId,
            patientId,
            pharmacyRecordId: recordId,
            effectiveFrom,
            notes: dto.notes,
            setByUserId: actorUserId,
          },
        });
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const latest = await this.prisma.patientPharmacyPreference.findFirst({
          where: { clinicId, patientId, effectiveTo: null },
        });
        throw this.stalePreference(latest);
      }
      throw error;
    }
    await this.log(
      'MEDICATION_RECONCILIATION.PHARMACY_PREFERENCE_SET',
      clinicId,
      actorUserId,
      preference.id,
      active,
      preference,
      context,
    );
    return preference;
  }

  async endPreferredPharmacy(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    dto: EndPreferredPharmacyDto,
    context: AuditContext = {},
  ) {
    const active = await this.prisma.patientPharmacyPreference.findFirst({
      where: { clinicId, patientId, effectiveTo: null },
    });
    if (!active || active.id !== dto.expectedActivePreferenceId) throw this.stalePreference(active);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : new Date();
    if (effectiveTo < active.effectiveFrom || effectiveTo.getTime() > Date.now() + 1000)
      throw new BadRequestException({ code: 'INVALID_PREFERENCE_END' });
    const ended = await this.prisma.patientPharmacyPreference.update({
      where: { id: active.id },
      data: { effectiveTo, endedByUserId: actorUserId },
    });
    await this.log(
      'MEDICATION_RECONCILIATION.PHARMACY_PREFERENCE_END',
      clinicId,
      actorUserId,
      ended.id,
      active,
      ended,
      context,
    );
    return ended;
  }

  async prescriptionHistory(clinicId: string, patientId: string) {
    await this.requirePatient(clinicId, patientId);
    return this.prisma.prescription.findMany({
      where: { clinicId, encounter: { patientId } },
      orderBy: { createdAt: 'desc' },
      include: {
        drug: { select: { id: true, name: true, genericName: true } },
        encounter: { select: { id: true, createdAt: true, status: true } },
        prescribedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  private async requirePatient(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId, mergedIntoPatientId: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  private async requireMedicationRecord(clinicId: string, patientId: string, recordId: string) {
    const record = await this.prisma.patientMedicationRecord.findFirst({
      where: { id: recordId, clinicId, patientId },
      include: medicationInclude,
    });
    if (!record?.currentRevision) throw new NotFoundException('Medication record not found');
    return record;
  }

  private async requirePharmacyRecord(clinicId: string, patientId: string, recordId: string) {
    const record = await this.prisma.patientPharmacyRecord.findFirst({
      where: { id: recordId, clinicId, patientId },
      include: pharmacyInclude,
    });
    if (!record?.currentRevision) throw new NotFoundException('Pharmacy record not found');
    return record;
  }

  private async validateMedicationSnapshot(
    clinicId: string,
    patientId: string,
    dto: MedicationSnapshotDto,
  ) {
    await this.requirePatient(clinicId, patientId);
    if (dto.status === PatientMedicationStatus.CURRENT && dto.endDate)
      throw new BadRequestException({ code: 'CURRENT_MEDICATION_END_DATE' });
    if (dto.startDate && dto.endDate && dto.endDate < dto.startDate)
      throw new BadRequestException({ code: 'INVALID_MEDICATION_DATE_ORDER' });
    if (dto.drugId) {
      const drug = await this.prisma.drug.findFirst({
        where: { id: dto.drugId, clinicId },
        select: { id: true },
      });
      if (!drug) throw new BadRequestException({ code: 'DRUG_CLINIC_MISMATCH' });
    }
    await this.validateEncounter(clinicId, patientId, dto.sourceEncounterId);
  }

  private async validateEncounter(clinicId: string, patientId: string, encounterId?: string) {
    if (!encounterId) return;
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId, patientId },
      select: { id: true },
    });
    if (!encounter) throw new BadRequestException({ code: 'SOURCE_ENCOUNTER_MISMATCH' });
  }

  private medicationRevisionData(
    recordId: string,
    id: string,
    revisionNumber: number,
    actorUserId: string,
    dto: MedicationSnapshotDto,
  ): Prisma.PatientMedicationRevisionUncheckedCreateInput {
    return {
      id,
      recordId,
      revisionNumber,
      medicationName: dto.medicationName,
      drugId: dto.drugId,
      strength: dto.strength,
      dose: dto.dose,
      doseUnit: dto.doseUnit,
      route: dto.route,
      frequency: dto.frequency,
      duration: dto.duration,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      indication: dto.indication,
      status: dto.status,
      notes: dto.notes,
      sourceEncounterId: dto.sourceEncounterId,
      sourceType: dto.sourceType,
      authoredByUserId: actorUserId,
    };
  }

  private pharmacyRevisionData(
    recordId: string,
    id: string,
    revisionNumber: number,
    actorUserId: string,
    dto: PharmacySnapshotDto,
  ): Prisma.PatientPharmacyRevisionUncheckedCreateInput {
    const phoneE164 = dto.phone ? normalizePhoneToE164(dto.phone, 'GH') : null;
    if (dto.phone && !phoneE164) throw new BadRequestException({ code: 'INVALID_PHARMACY_PHONE' });
    return {
      id,
      recordId,
      revisionNumber,
      name: dto.name,
      phoneE164,
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2,
      city: dto.city,
      region: dto.region,
      postalCode: dto.postalCode,
      countryCode: dto.countryCode?.toUpperCase(),
      addressText: dto.addressText,
      notes: dto.notes,
      authoredByUserId: actorUserId,
    };
  }

  private staleMedication(record: unknown) {
    return new ConflictException({
      code: 'MEDICATION_REVISION_CONFLICT',
      message: 'Medication changed since it was opened.',
      latest: record,
    });
  }
  private stalePharmacy(record: unknown) {
    return new ConflictException({
      code: 'PHARMACY_REVISION_CONFLICT',
      message: 'Pharmacy changed since it was opened.',
      latest: record,
    });
  }
  private stalePreference(active: unknown) {
    return new ConflictException({
      code: 'PHARMACY_PREFERENCE_CONFLICT',
      message: 'Preferred pharmacy changed. Refresh and review the latest preference.',
      active,
    });
  }
  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private async log(
    action: string,
    clinicId: string,
    actorUserId: string,
    entityId: string,
    before: unknown,
    after: unknown,
    context: AuditContext,
  ) {
    await this.audit.logWrite({
      clinicId,
      actorUserId,
      action,
      entityType: action.includes('PHARMACY') ? 'PatientPharmacy' : 'PatientMedication',
      entityId,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }
}
