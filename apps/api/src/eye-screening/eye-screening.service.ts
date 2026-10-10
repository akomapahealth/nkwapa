import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EncounterStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpsertEyeScreeningDto } from './dto/eye-screening.dto';

const AUTHOR_SELECT = { select: { id: true, displayName: true } } as const;
const SCREENING_INCLUDE = {
  author: AUTHOR_SELECT,
  findings: { orderBy: [{ eye: 'asc' }, { structure: 'asc' }] },
} satisfies Prisma.EyeScreeningInclude;

type EyeScreeningWithDetail = Prisma.EyeScreeningGetPayload<{
  include: typeof SCREENING_INCLUDE;
}>;

/**
 * What the Eye station found: visual acuity, the penlight examination and ophthalmoscopy.
 *
 * Online only, like the counselling record beside it: taking and handing on a patient at a
 * station already needs a connection. Editable until the encounter is finalized, so a doctor can
 * correct a finding after the session.
 *
 * Findings are replaced as a set on every save. The station form always holds the whole
 * examination, so "absent from this save" means "no longer recorded", not "unchanged".
 *
 * Content stays out of the audit trail, as counselling content does: the audit records that a
 * version was written, by whom, and whether a referral was recommended.
 */
@Injectable()
export class EyeScreeningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async get(clinicId: string, encounterId: string) {
    await this.findEncounter(this.prisma, clinicId, encounterId);
    const record = await this.prisma.eyeScreening.findUnique({
      where: { encounterId },
      include: SCREENING_INCLUDE,
    });
    return { record: record ? this.toResponse(record) : null };
  }

  async upsert(
    clinicId: string,
    encounterId: string,
    actorUserId: string,
    dto: UpsertEyeScreeningDto,
    requestId?: string,
  ) {
    const { findings, ...data } = this.normalize(dto);
    const saved = await this.prisma.$transaction(async (tx) => {
      const encounter = await this.findEncounter(tx, clinicId, encounterId);
      if (encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot change the eye examination on a finalized encounter',
        });
      }
      const existing = await tx.eyeScreening.findUnique({ where: { encounterId } });
      if (existing && dto.expectedVersion !== existing.version) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Someone else changed this eye examination. Reload it before saving.',
          currentVersion: existing.version,
        });
      }

      const parent = existing
        ? await tx.eyeScreening.update({
            where: { encounterId },
            data: { ...data, authorUserId: actorUserId, version: { increment: 1 } },
          })
        : await tx.eyeScreening.create({
            data: { ...data, clinicId, encounterId, authorUserId: actorUserId },
          });
      await tx.eyeExamFinding.deleteMany({ where: { eyeScreeningId: parent.id } });
      if (findings.length) {
        await tx.eyeExamFinding.createMany({
          data: findings.map((finding) => ({ ...finding, eyeScreeningId: parent.id })),
        });
      }
      const record = await tx.eyeScreening.findUniqueOrThrow({
        where: { id: parent.id },
        include: SCREENING_INCLUDE,
      });

      await this.auditService.logWrite(
        {
          clinicId,
          actorUserId,
          action: existing ? 'EYE_SCREENING.UPDATE' : 'EYE_SCREENING.CREATE',
          entityType: 'EyeScreening',
          entityId: record.id,
          beforeJson: existing ? JSON.stringify({ version: existing.version }) : null,
          afterJson: JSON.stringify({
            version: record.version,
            referralRecommended: record.referralRecommended,
          }),
          requestId,
        },
        tx,
      );
      return record;
    });
    return { record: this.toResponse(saved) };
  }

  /** Detail fields belong to their choice; a stray one is a client bug worth hearing about. */
  private normalize(dto: UpsertEyeScreeningDto) {
    const fieldError = (field: string, message: string): never => {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Eye examination validation failed',
        fieldErrors: [{ field, message }],
      });
    };
    const complaintHistory = dto.complaintHistory?.trim() || null;
    if (!dto.hasEyeComplaint && complaintHistory) {
      fieldError('complaintHistory', 'Record an eye complaint before describing it');
    }
    const referralNote = dto.referralNote?.trim() || null;
    if (!dto.referralRecommended && referralNote) {
      fieldError('referralNote', 'Recommend a referral before describing it');
    }
    const seen = new Set<string>();
    const findings = dto.findings.map((finding, index) => {
      const key = `${finding.eye}:${finding.structure}`;
      if (seen.has(key)) {
        fieldError(
          `findings.${index}`,
          `${finding.structure} is recorded twice for ${finding.eye}`,
        );
      }
      seen.add(key);
      return {
        eye: finding.eye,
        structure: finding.structure,
        result: finding.result,
        note: finding.note?.trim() || null,
      };
    });
    return {
      hasEyeComplaint: dto.hasEyeComplaint,
      complaintHistory,
      wearsCorrection: dto.wearsCorrection,
      vaOdUnaided: dto.vaOdUnaided ?? null,
      vaOsUnaided: dto.vaOsUnaided ?? null,
      vaOuUnaided: dto.vaOuUnaided ?? null,
      vaOdAided: dto.vaOdAided ?? null,
      vaOsAided: dto.vaOsAided ?? null,
      vaOuAided: dto.vaOuAided ?? null,
      vaOdPinhole: dto.vaOdPinhole ?? null,
      vaOsPinhole: dto.vaOsPinhole ?? null,
      cupDiscRatioOd: dto.cupDiscRatioOd ?? null,
      cupDiscRatioOs: dto.cupDiscRatioOs ?? null,
      visionLossCause: dto.visionLossCause ?? null,
      diabeticSignsSeen: dto.diabeticSignsSeen,
      hypertensiveSignsSeen: dto.hypertensiveSignsSeen,
      referralRecommended: dto.referralRecommended,
      referralNote,
      notes: dto.notes?.trim() || null,
      findings,
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

  private toResponse(record: EyeScreeningWithDetail) {
    return {
      id: record.id,
      encounterId: record.encounterId,
      hasEyeComplaint: record.hasEyeComplaint,
      complaintHistory: record.complaintHistory,
      wearsCorrection: record.wearsCorrection,
      vaOdUnaided: record.vaOdUnaided,
      vaOsUnaided: record.vaOsUnaided,
      vaOuUnaided: record.vaOuUnaided,
      vaOdAided: record.vaOdAided,
      vaOsAided: record.vaOsAided,
      vaOuAided: record.vaOuAided,
      vaOdPinhole: record.vaOdPinhole,
      vaOsPinhole: record.vaOsPinhole,
      cupDiscRatioOd: record.cupDiscRatioOd?.toNumber() ?? null,
      cupDiscRatioOs: record.cupDiscRatioOs?.toNumber() ?? null,
      findings: record.findings.map((finding) => ({
        eye: finding.eye,
        structure: finding.structure,
        result: finding.result,
        note: finding.note,
      })),
      visionLossCause: record.visionLossCause,
      diabeticSignsSeen: record.diabeticSignsSeen,
      hypertensiveSignsSeen: record.hypertensiveSignsSeen,
      referralRecommended: record.referralRecommended,
      referralNote: record.referralNote,
      notes: record.notes,
      author: record.author,
      version: record.version,
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
