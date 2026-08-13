import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EncounterStatus, Prisma, type UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hasPermission, PERMISSIONS } from '../auth/constants/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertDiabetesScreeningDto } from './dto/diabetes-screening.dto';

const MAX_FUTURE_COLLECTION_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 25;

type DiabetesWithContext = Prisma.DiabetesScreeningGetPayload<{
  include: {
    authoredBy: { select: { id: true; displayName: true } };
    encounter: { select: { id: true; patientId: true; createdAt: true; status: true } };
  };
}>;

export interface DiabetesActor {
  userId: string;
  roles: Array<{ role: UserRole }>;
}

export interface DiabetesRequestMetadata {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class DiabetesScreeningService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    clinicId: string,
    patientId: string,
    actor: DiabetesActor,
    params: { cursor?: string; limit?: number } = {},
  ) {
    this.assertReadPermission(actor.roles);
    await this.assertPatientScope(clinicId, patientId);

    const cursor = params.cursor ? this.decodeCursor(params.cursor) : null;
    const limit = params.limit ?? DEFAULT_PAGE_SIZE;
    const records = await this.prisma.diabetesScreening.findMany({
      where: {
        clinicId,
        encounter: { patientId },
        ...(cursor
          ? {
              OR: [
                { collectedAt: { lt: cursor.collectedAt } },
                { collectedAt: cursor.collectedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: this.contextInclude(),
      orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map((record) => this.toResponse(record, actor.roles));
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? this.encodeCursor(new Date(last.collectedAt), last.id) : null,
    };
  }

  async upsert(
    clinicId: string,
    encounterId: string,
    actor: DiabetesActor,
    dto: UpsertDiabetesScreeningDto,
    metadata: DiabetesRequestMetadata = {},
    screeningId?: string,
  ) {
    this.assertWritePermission(actor.roles);
    const collectedAt = this.validateCollectionTime(dto.collectedAt);

    const screening = await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        select: { clinicId: true, patientId: true, status: true },
      });
      if (!encounter || encounter.clinicId !== clinicId) {
        throw new NotFoundException('Encounter not found in the active clinic');
      }
      if (encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot modify diabetes screening for a finalized encounter',
          existingStatus: encounter.status,
        });
      }

      const existing = await tx.diabetesScreening.findUnique({ where: { encounterId } });
      const saved = await tx.diabetesScreening.upsert({
        where: { encounterId },
        create: {
          id: screeningId ?? randomUUID(),
          clinicId,
          encounterId,
          glucoseMgDl: dto.glucoseMgDl,
          glucoseType: dto.glucoseType,
          hba1cPercent: dto.hba1cPercent,
          symptoms: dto.symptoms,
          notes: dto.notes,
          collectedAt,
          authoredByUserId: actor.userId,
        },
        update: {
          glucoseMgDl: dto.glucoseMgDl,
          glucoseType: dto.glucoseType,
          hba1cPercent: dto.hba1cPercent,
          symptoms: dto.symptoms,
          notes: dto.notes,
          collectedAt,
          authoredByUserId: actor.userId,
          legacySymptomsUnmapped: false,
        },
        include: this.contextInclude(),
      });

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId: actor.userId,
          action: existing ? 'DIABETES_SCREENING.UPSERT' : 'DIABETES_SCREENING.CREATE',
          entityType: 'DiabetesScreening',
          entityId: saved.id,
          beforeJson: existing ? JSON.stringify(existing) : undefined,
          afterJson: JSON.stringify(saved),
          requestId: metadata.requestId ?? randomUUID(),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      return saved;
    });

    return this.toResponse(screening, actor.roles);
  }

  toResponse(record: DiabetesWithContext, roles: Array<{ role: UserRole }>) {
    return {
      id: record.id,
      clinicId: record.clinicId,
      patientId: record.encounter.patientId,
      glucoseMgDl: record.glucoseMgDl,
      glucoseType: record.glucoseType,
      hba1cPercent: record.hba1cPercent,
      symptoms: record.symptoms,
      notes: record.notes,
      collectedAt: record.collectedAt.toISOString(),
      author: record.authoredBy,
      sourceEncounter: {
        id: record.encounter.id,
        createdAt: record.encounter.createdAt.toISOString(),
        status: record.encounter.status,
      },
      legacySymptomsUnmapped: record.legacySymptomsUnmapped,
      isEditable:
        record.encounter.status !== EncounterStatus.FINALIZED &&
        hasPermission(roles, PERMISSIONS.SCREENING_WRITE),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private validateCollectionTime(value: string): Date {
    const collectedAt = new Date(value);
    if (!Number.isFinite(collectedAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_COLLECTION_TIME',
        message: 'Collection time must be a valid ISO timestamp.',
      });
    }
    if (collectedAt.getTime() > Date.now() + MAX_FUTURE_COLLECTION_SKEW_MS) {
      throw new BadRequestException({
        code: 'COLLECTION_TIME_IN_FUTURE',
        message: 'Collection time cannot be more than five minutes in the future.',
      });
    }
    return collectedAt;
  }

  private async assertPatientScope(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId, mergedIntoPatientId: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found in the active clinic');
  }

  private assertReadPermission(roles: Array<{ role: UserRole }>): void {
    if (!hasPermission(roles, PERMISSIONS.SCREENING_READ)) {
      throw new ForbiddenException('SCREENING.READ permission is required');
    }
  }

  private assertWritePermission(roles: Array<{ role: UserRole }>): void {
    if (!hasPermission(roles, PERMISSIONS.SCREENING_WRITE)) {
      throw new ForbiddenException('SCREENING.WRITE permission is required');
    }
  }

  private contextInclude() {
    return {
      authoredBy: { select: { id: true, displayName: true } },
      encounter: { select: { id: true, patientId: true, createdAt: true, status: true } },
    } satisfies Prisma.DiabetesScreeningInclude;
  }

  private encodeCursor(collectedAt: Date, id: string): string {
    return Buffer.from(`${collectedAt.toISOString()}|${id}`).toString('base64url');
  }

  private decodeCursor(cursor: string): { collectedAt: Date; id: string } {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const separator = decoded.lastIndexOf('|');
      const collectedAt = new Date(decoded.slice(0, separator));
      const id = decoded.slice(separator + 1);
      if (separator < 1 || !id || !Number.isFinite(collectedAt.getTime())) throw new Error();
      return { collectedAt, id };
    } catch {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'The diabetes history cursor is invalid.',
      });
    }
  }
}
