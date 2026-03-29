import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConsentType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateConsentDto } from "./dto/create-consent.dto";

const CONSENT_VERSION_V1_EN = "v1-en";

export interface GrantContext {
  actorUserId: string;
  requestId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async grant(
    clinicId: string,
    patientId: string,
    dto: CreateConsentDto,
    context: GrantContext
  ) {
    const consentVersion = dto.consentVersion ?? CONSENT_VERSION_V1_EN;
    if (consentVersion !== CONSENT_VERSION_V1_EN) {
      throw new BadRequestException(
        `consent_version must be "${CONSENT_VERSION_V1_EN}"`
      );
    }
    const text = (dto.consentTextSnapshot ?? "").trim();
    if (!text) {
      throw new BadRequestException("consent_text_snapshot must be non-empty");
    }

    const consentType = dto.consentType as ConsentType;

    const consent = await this.prisma.$transaction(async (tx) => {
      const existingGranted = await tx.patientConsent.findFirst({
        where: {
          patientId,
          clinicId,
          consentType,
          status: "GRANTED",
        },
      });

      if (existingGranted) {
        const before = JSON.stringify(existingGranted);
        await tx.patientConsent.update({
          where: { id: existingGranted.id },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
          },
        });
        await this.auditService.logWrite({
          clinicId,
          actorUserId: context.actorUserId,
          action: "CONSENT.REVOKE",
          entityType: "PatientConsent",
          entityId: existingGranted.id,
          beforeJson: before,
          afterJson: JSON.stringify({
            ...existingGranted,
            status: "REVOKED",
            revokedAt: new Date().toISOString(),
          }),
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }

      const grantedAt = new Date();
      const consent = await tx.patientConsent.create({
        data: {
          patientId,
          clinicId,
          consentType,
          status: "GRANTED",
          consentVersion,
          consentTextSnapshot: dto.consentTextSnapshot,
          grantedAt,
          revokedAt: null,
          recordedByUserId: context.actorUserId,
          witnessName: dto.witnessName ?? null,
          witnessPhoneE164: dto.witnessPhoneE164 ?? null,
        },
      });

      await this.auditService.logWrite({
        clinicId,
        actorUserId: context.actorUserId,
        action: "CONSENT.GRANT",
        entityType: "PatientConsent",
        entityId: consent.id,
        beforeJson: null,
        afterJson: JSON.stringify(consent),
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return consent;
    });

    return consent;
  }

  async revoke(
    clinicId: string,
    patientId: string,
    consentType: ConsentType,
    context: GrantContext
  ) {
    const existing = await this.prisma.patientConsent.findFirst({
      where: {
        patientId,
        clinicId,
        consentType,
        status: "GRANTED",
      },
    });

    if (!existing) {
      throw new NotFoundException(
        "No active granted consent found to revoke"
      );
    }

    const before = JSON.stringify(existing);
    const updated = await this.prisma.patientConsent.update({
      where: { id: existing.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: context.actorUserId,
      action: "CONSENT.REVOKE",
      entityType: "PatientConsent",
      entityId: updated.id,
      beforeJson: before,
      afterJson: JSON.stringify(updated),
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return updated;
  }

  async getConsentStatusForClinic(
    patientId: string,
    clinicId: string
  ): Promise<Array<{ consentType: string; status: string; grantedAt?: Date }>> {
    const consents = await this.prisma.patientConsent.findMany({
      where: { patientId, clinicId },
      orderBy: { grantedAt: "desc" },
    });

    const byType = new Map<string, typeof consents[0]>();
    for (const c of consents) {
      if (!byType.has(c.consentType)) {
        byType.set(c.consentType, c);
      }
    }

    return Array.from(byType.values()).map((c) => ({
      consentType: c.consentType,
      status: c.status,
      grantedAt: c.grantedAt,
    }));
  }
}
