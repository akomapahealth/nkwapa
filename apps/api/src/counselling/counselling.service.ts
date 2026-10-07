import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EncounterStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpsertCounsellingDto } from './dto/counselling.dto';

const AUTHOR_SELECT = { select: { id: true, displayName: true } } as const;

type CounsellingWithAuthor = Prisma.CounsellingRecordGetPayload<{
  include: { author: typeof AUTHOR_SELECT };
}>;

/**
 * What the review station told the patient (#167).
 *
 * Volunteers write this, unlike the doctor-only care plan. It locks when the review station
 * completes the session; after that a doctor corrects or adds to it through a clinical note
 * addendum, which keeps what was actually said to the patient readable as it was said.
 *
 * Content stays out of the audit trail, as clinical note content does: the audit records that
 * a version was written and by whom.
 */
@Injectable()
export class CounsellingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async get(clinicId: string, encounterId: string) {
    await this.findEncounter(this.prisma, clinicId, encounterId);
    const record = await this.prisma.counsellingRecord.findUnique({
      where: { encounterId },
      include: { author: AUTHOR_SELECT },
    });
    return { record: record ? this.toResponse(record) : null };
  }

  async upsert(
    clinicId: string,
    encounterId: string,
    actorUserId: string,
    dto: UpsertCounsellingDto,
    requestId?: string,
  ) {
    const data = this.normalize(dto);
    const saved = await this.prisma.$transaction(async (tx) => {
      const encounter = await this.findEncounter(tx, clinicId, encounterId);
      if (encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot change counselling on a finalized encounter',
        });
      }
      const existing = await tx.counsellingRecord.findUnique({ where: { encounterId } });
      if (existing?.lockedAt) {
        throw new ConflictException({
          code: 'COUNSELLING_LOCKED',
          message:
            'This session is complete. A doctor can add to the record with a clinical note addendum.',
        });
      }
      if (existing && dto.expectedVersion !== existing.version) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Someone else changed this counselling record. Reload it before saving.',
          currentVersion: existing.version,
        });
      }

      const record = existing
        ? await tx.counsellingRecord.update({
            where: { encounterId },
            data: { ...data, authorUserId: actorUserId, version: { increment: 1 } },
            include: { author: AUTHOR_SELECT },
          })
        : await tx.counsellingRecord.create({
            data: { ...data, clinicId, encounterId, authorUserId: actorUserId },
            include: { author: AUTHOR_SELECT },
          });

      await this.auditService.logWrite(
        {
          clinicId,
          actorUserId,
          action: existing ? 'COUNSELLING.UPDATE' : 'COUNSELLING.CREATE',
          entityType: 'CounsellingRecord',
          entityId: record.id,
          beforeJson: existing ? JSON.stringify({ version: existing.version }) : null,
          afterJson: JSON.stringify({ version: record.version }),
          requestId,
        },
        tx,
      );
      return record;
    });
    return { record: this.toResponse(saved) };
  }

  /** Detail fields belong to their choice; a stray one is a client bug worth hearing about. */
  private normalize(dto: UpsertCounsellingDto) {
    const fieldError = (field: string, message: string): never => {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Counselling validation failed',
        fieldErrors: [{ field, message }],
      });
    };
    const topicOther = dto.topicOther?.trim() || null;
    if (dto.topics.includes('OTHER') && !topicOther) {
      fieldError('topicOther', 'Describe the other topic');
    }
    if (!dto.topics.includes('OTHER') && topicOther) {
      fieldError('topicOther', 'Select Other before describing it');
    }
    const followUpOther = dto.followUpOther?.trim() || null;
    if (dto.followUpRecommended && dto.followUpWindow === 'NOT_ASSESSED') {
      fieldError('followUpWindow', 'Choose when the patient should follow up');
    }
    if (!dto.followUpRecommended && dto.followUpWindow !== 'NOT_ASSESSED') {
      fieldError('followUpWindow', 'Recommend a follow-up before choosing its window');
    }
    if (dto.followUpWindow === 'OTHER' && !followUpOther) {
      fieldError('followUpOther', 'Describe the follow-up timing');
    }
    const referralTo = dto.referralTo?.trim() || null;
    const referralReason = dto.referralReason?.trim() || null;
    if (dto.referralRecommended && !referralTo) {
      fieldError('referralTo', 'Say where the patient is referred');
    }
    if (!dto.referralRecommended && (referralTo || referralReason || dto.referralUrgency)) {
      fieldError('referralTo', 'Recommend a referral before describing it');
    }
    return {
      topics: dto.topics,
      topicOther,
      adviceGiven: dto.adviceGiven.trim(),
      followUpRecommended: dto.followUpRecommended,
      followUpWindow: dto.followUpWindow,
      followUpOther: dto.followUpWindow === 'OTHER' ? followUpOther : null,
      referralRecommended: dto.referralRecommended,
      referralTo,
      referralReason,
      referralUrgency: dto.referralRecommended ? (dto.referralUrgency ?? null) : null,
    };
  }

  private async findEncounter(
    client: Prisma.TransactionClient | PrismaService,
    clinicId: string,
    encounterId: string,
  ) {
    const encounter = await client.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true, clinicId: true, status: true },
    });
    if (!encounter || encounter.clinicId !== clinicId) {
      throw new NotFoundException('Encounter not found in the active clinic');
    }
    return encounter;
  }

  private toResponse(record: CounsellingWithAuthor) {
    return {
      id: record.id,
      encounterId: record.encounterId,
      topics: record.topics,
      topicOther: record.topicOther,
      adviceGiven: record.adviceGiven,
      followUpRecommended: record.followUpRecommended,
      followUpWindow: record.followUpWindow,
      followUpOther: record.followUpOther,
      referralRecommended: record.referralRecommended,
      referralTo: record.referralTo,
      referralReason: record.referralReason,
      referralUrgency: record.referralUrgency,
      author: record.author,
      version: record.version,
      lockedAt: record.lockedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
