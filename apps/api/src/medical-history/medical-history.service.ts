import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicalHistoryCategory, MedicalHistoryStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateMedicalHistoryDto,
  ListMedicalHistoryQueryDto,
  MedicalHistoryDetailsDto,
  MedicalHistorySnapshotDto,
  ReviseMedicalHistoryDto,
} from './dto/medical-history.dto';

type TransactionClient = Prisma.TransactionClient;
type HistoryWithCurrent = Prisma.MedicalHistoryRecordGetPayload<{
  include: {
    currentRevision: {
      include: { authoredBy: { select: { id: true; displayName: true } } };
    };
  };
}>;

const ACTIVE = MedicalHistoryStatus.ACTIVE;
const TERMINAL = MedicalHistoryStatus.ENTERED_IN_ERROR;

@Injectable()
export class MedicalHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(clinicId: string, patientId: string, query: ListMedicalHistoryQueryDto = {}) {
    await this.assertPatientScope(this.prisma, clinicId, patientId);
    const records = await this.prisma.medicalHistoryRecord.findMany({
      where: {
        clinicId,
        patientId,
        ...(query.category ? { category: query.category } : {}),
        ...(query.status ? { currentRevision: { status: query.status } } : {}),
      },
      include: {
        currentRevision: {
          include: { authoredBy: { select: { id: true, displayName: true } } },
        },
      },
    });
    const sorted = records.sort((left, right) => {
      const leftActive = left.currentRevision?.status === ACTIVE ? 0 : 1;
      const rightActive = right.currentRevision?.status === ACTIVE ? 0 : 1;
      return leftActive - rightActive || right.updatedAt.getTime() - left.updatedAt.getTime();
    });
    return {
      state: records.length === 0 ? ('EMPTY' as const) : ('RECORDED' as const),
      allergySummary: await this.getAllergySummary(clinicId, patientId),
      records: sorted,
    };
  }

  async getAllergySummary(clinicId: string, patientId: string) {
    await this.assertPatientScope(this.prisma, clinicId, patientId);
    const records = await this.prisma.medicalHistoryRecord.findMany({
      where: { clinicId, patientId, category: MedicalHistoryCategory.ALLERGY },
      include: { currentRevision: true },
      orderBy: { updatedAt: 'desc' },
    });
    const usable = records.filter(
      (record) => record.currentRevision && record.currentRevision.status !== TERMINAL,
    );
    const active = usable.filter((record) => record.currentRevision?.status === ACTIVE);
    const activeAllergies = active.filter(
      (record) => this.details(record.currentRevision?.details).kind === 'ALLERGY',
    );
    const hasNka = active.some(
      (record) => this.details(record.currentRevision?.details).kind === 'NO_KNOWN_ALLERGIES',
    );
    const state =
      activeAllergies.length > 0
        ? 'ACTIVE_ALLERGIES'
        : hasNka
          ? 'NO_KNOWN_ALLERGIES'
          : usable.length > 0
            ? 'HISTORICAL_ONLY'
            : 'NOT_RECORDED';
    return {
      state,
      activeAllergies: activeAllergies.map((record) => ({
        recordId: record.id,
        revisionId: record.currentRevision!.id,
        substance: this.details(record.currentRevision!.details).substance,
        reaction: this.details(record.currentRevision!.details).reaction,
        severity: this.details(record.currentRevision!.details).severity ?? 'UNKNOWN',
      })),
      updatedAt: usable[0]?.updatedAt ?? null,
    };
  }

  async listRevisions(clinicId: string, patientId: string, recordId: string) {
    const record = await this.findScopedRecord(this.prisma, clinicId, patientId, recordId);
    return this.prisma.medicalHistoryRevision.findMany({
      where: { recordId: record.id },
      include: { authoredBy: { select: { id: true, displayName: true } } },
      orderBy: { revisionNumber: 'desc' },
    });
  }

  async create(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    dto: CreateMedicalHistoryDto,
    requestId: string = randomUUID(),
  ) {
    this.validateSnapshot(dto.category, dto);
    return this.prisma.$transaction(async (tx) => {
      await this.assertPatientScope(tx, clinicId, patientId);
      await this.assertSourceEncounter(tx, clinicId, patientId, dto.sourceEncounterId);
      await this.enforceAllergyState(tx, clinicId, patientId, actorUserId, dto.category, dto);

      const recordId = dto.recordId ?? randomUUID();
      const revisionId = dto.revisionId ?? randomUUID();
      const existing = await tx.medicalHistoryRecord.findUnique({ where: { id: recordId } });
      if (existing) {
        throw new ConflictException({
          code: 'MEDICAL_HISTORY_RECORD_EXISTS',
          message: 'A medical history record with this identifier already exists.',
        });
      }
      const record = await tx.medicalHistoryRecord.create({
        data: { id: recordId, clinicId, patientId, category: dto.category },
      });
      const revision = await tx.medicalHistoryRevision.create({
        data: this.revisionData(record.id, revisionId, 1, actorUserId, dto),
      });
      const updated = await tx.medicalHistoryRecord.update({
        where: { id: record.id },
        data: { currentRevisionId: revision.id },
        include: { currentRevision: true },
      });
      await this.auditService.logWrite({
        clinicId,
        actorUserId,
        action: 'MEDICAL_HISTORY.CREATE',
        entityType: 'MedicalHistoryRecord',
        entityId: record.id,
        afterJson: JSON.stringify(updated),
        requestId,
      });
      return updated;
    });
  }

  async revise(
    clinicId: string,
    patientId: string,
    recordId: string,
    actorUserId: string,
    dto: ReviseMedicalHistoryDto,
    requestId: string = randomUUID(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      const record = await this.findScopedRecord(tx, clinicId, patientId, recordId);
      if (!record.currentRevision) {
        throw new ConflictException({
          code: 'MEDICAL_HISTORY_MISSING_CURRENT_REVISION',
          message: 'The record has no current revision.',
        });
      }
      if (record.currentRevisionId !== dto.expectedCurrentRevisionId) {
        this.throwStale(record);
      }
      if (record.currentRevision.status === TERMINAL) {
        throw new ConflictException({
          code: 'MEDICAL_HISTORY_TERMINAL',
          message: 'An entered-in-error record cannot be revised.',
        });
      }
      this.validateSnapshot(record.category, dto);
      await this.assertSourceEncounter(tx, clinicId, patientId, dto.sourceEncounterId);
      await this.enforceAllergyState(
        tx,
        clinicId,
        patientId,
        actorUserId,
        record.category,
        dto,
        record.id,
      );

      const revision = await tx.medicalHistoryRevision.create({
        data: this.revisionData(
          record.id,
          dto.revisionId ?? randomUUID(),
          record.currentRevision.revisionNumber + 1,
          actorUserId,
          dto,
        ),
      });
      const update = await tx.medicalHistoryRecord.updateMany({
        where: { id: record.id, currentRevisionId: dto.expectedCurrentRevisionId },
        data: { currentRevisionId: revision.id },
      });
      if (update.count !== 1) {
        const latest = await this.findScopedRecord(tx, clinicId, patientId, recordId);
        this.throwStale(latest);
      }
      const updated = await this.findScopedRecord(tx, clinicId, patientId, recordId);
      await this.auditService.logWrite({
        clinicId,
        actorUserId,
        action: 'MEDICAL_HISTORY.REVISE',
        entityType: 'MedicalHistoryRecord',
        entityId: record.id,
        beforeJson: JSON.stringify(record),
        afterJson: JSON.stringify(updated),
        requestId,
      });
      return updated;
    });
  }

  private async enforceAllergyState(
    tx: TransactionClient,
    clinicId: string,
    patientId: string,
    actorUserId: string,
    category: MedicalHistoryCategory,
    snapshot: MedicalHistorySnapshotDto,
    excludedRecordId?: string,
  ) {
    if (category !== MedicalHistoryCategory.ALLERGY || snapshot.status !== ACTIVE) return;
    const kind = snapshot.details.kind;
    const activeRecords = await tx.medicalHistoryRecord.findMany({
      where: {
        clinicId,
        patientId,
        category: MedicalHistoryCategory.ALLERGY,
        ...(excludedRecordId ? { id: { not: excludedRecordId } } : {}),
        currentRevision: { status: ACTIVE },
      },
      include: { currentRevision: true },
    });
    if (kind === 'NO_KNOWN_ALLERGIES') {
      const allergies = activeRecords.filter(
        (record) => this.details(record.currentRevision?.details).kind === 'ALLERGY',
      );
      if (allergies.length > 0) {
        throw new ConflictException({
          code: 'ACTIVE_ALLERGIES_PREVENT_NKA',
          message: 'Resolve or inactivate active allergies before recording no known allergies.',
          activeRecordIds: allergies.map((record) => record.id),
        });
      }
      return;
    }

    for (const nka of activeRecords.filter(
      (record) =>
        this.details(record.currentRevision?.details).kind === 'NO_KNOWN_ALLERGIES' &&
        record.currentRevision,
    )) {
      const current = nka.currentRevision!;
      const retired = await tx.medicalHistoryRevision.create({
        data: {
          recordId: nka.id,
          revisionNumber: current.revisionNumber + 1,
          status: MedicalHistoryStatus.INACTIVE,
          onsetDate: current.onsetDate,
          occurrenceDate: current.occurrenceDate,
          resolvedDate: current.resolvedDate,
          detailsSchemaVersion: current.detailsSchemaVersion,
          details: current.details as Prisma.InputJsonValue,
          notes: current.notes,
          sourceEncounterId: current.sourceEncounterId,
          authoredByUserId: actorUserId,
        },
      });
      await tx.medicalHistoryRecord.update({
        where: { id: nka.id },
        data: { currentRevisionId: retired.id },
      });
    }
  }

  private validateSnapshot(category: MedicalHistoryCategory, snapshot: MedicalHistorySnapshotDto) {
    const details = snapshot.details;
    const required: Record<MedicalHistoryCategory, Array<keyof MedicalHistoryDetailsDto>> = {
      CONDITION: ['conditionName'],
      ALLERGY: ['kind'],
      SURGERY_PROCEDURE: ['procedureName'],
      FAMILY_HISTORY: ['relationship', 'familyCondition'],
      SOCIAL_HISTORY: ['socialType', 'description'],
    };
    const missing = required[category].filter((field) => !details[field]);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_MEDICAL_HISTORY_DETAILS',
        message: `Missing required ${category.toLowerCase()} details.`,
        fields: missing,
      });
    }
    if (
      category === MedicalHistoryCategory.ALLERGY &&
      details.kind === 'ALLERGY' &&
      !details.substance
    ) {
      throw new BadRequestException({
        code: 'INVALID_MEDICAL_HISTORY_DETAILS',
        message: 'Allergy substance is required.',
        fields: ['substance'],
      });
    }
    if (
      category === MedicalHistoryCategory.ALLERGY &&
      details.kind === 'NO_KNOWN_ALLERGIES' &&
      (details.substance || details.reaction)
    ) {
      throw new BadRequestException({
        code: 'INVALID_MEDICAL_HISTORY_DETAILS',
        message: 'No known allergies cannot include a substance or reaction.',
      });
    }
    const onset = snapshot.onsetDate ? new Date(snapshot.onsetDate) : null;
    const occurrence = snapshot.occurrenceDate ? new Date(snapshot.occurrenceDate) : null;
    const resolved = snapshot.resolvedDate ? new Date(snapshot.resolvedDate) : null;
    if (snapshot.status === MedicalHistoryStatus.RESOLVED && !resolved) {
      throw new BadRequestException({
        code: 'RESOLVED_DATE_REQUIRED',
        message: 'Resolved records require a resolved date.',
      });
    }
    if (resolved && ((onset && resolved < onset) || (occurrence && resolved < occurrence))) {
      throw new BadRequestException({
        code: 'INVALID_CLINICAL_DATE_ORDER',
        message: 'Resolved date cannot be before onset or occurrence date.',
      });
    }
  }

  private revisionData(
    recordId: string,
    id: string,
    revisionNumber: number,
    actorUserId: string,
    snapshot: MedicalHistorySnapshotDto,
  ): Prisma.MedicalHistoryRevisionUncheckedCreateInput {
    return {
      id,
      recordId,
      revisionNumber,
      status: snapshot.status,
      onsetDate: snapshot.onsetDate ? new Date(snapshot.onsetDate) : null,
      occurrenceDate: snapshot.occurrenceDate ? new Date(snapshot.occurrenceDate) : null,
      resolvedDate: snapshot.resolvedDate ? new Date(snapshot.resolvedDate) : null,
      detailsSchemaVersion: 1,
      details: snapshot.details as Prisma.InputJsonObject,
      notes: snapshot.notes ?? null,
      sourceEncounterId: snapshot.sourceEncounterId ?? null,
      authoredByUserId: actorUserId,
    };
  }

  private async assertPatientScope(
    client: TransactionClient | PrismaService,
    clinicId: string,
    patientId: string,
  ) {
    const patient = await client.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId, mergedIntoPatientId: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found in this clinic.');
  }

  private async assertSourceEncounter(
    client: TransactionClient | PrismaService,
    clinicId: string,
    patientId: string,
    encounterId?: string,
  ) {
    if (!encounterId) return;
    const encounter = await client.encounter.findFirst({
      where: { id: encounterId, clinicId, patientId },
      select: { id: true },
    });
    if (!encounter) {
      throw new BadRequestException({
        code: 'INVALID_SOURCE_ENCOUNTER',
        message: 'Source encounter must belong to the same patient and clinic.',
      });
    }
  }

  private async findScopedRecord(
    client: TransactionClient | PrismaService,
    clinicId: string,
    patientId: string,
    recordId: string,
  ): Promise<HistoryWithCurrent> {
    const record = await client.medicalHistoryRecord.findFirst({
      where: { id: recordId, clinicId, patientId },
      include: {
        currentRevision: {
          include: { authoredBy: { select: { id: true, displayName: true } } },
        },
      },
    });
    if (!record) throw new NotFoundException('Medical history record not found.');
    return record;
  }

  private throwStale(record: HistoryWithCurrent): never {
    throw new ConflictException({
      code: 'STALE_MEDICAL_HISTORY_REVISION',
      message: 'This history record changed after it was loaded.',
      latestRevision: record.currentRevision,
    });
  }

  private details(value: Prisma.JsonValue | null | undefined): MedicalHistoryDetailsDto {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as MedicalHistoryDetailsDto)
      : {};
  }
}
