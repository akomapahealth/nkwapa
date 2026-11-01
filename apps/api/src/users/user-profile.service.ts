import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  formatStaffDisplayName,
  normalizeMiddleInitial,
  normalizePhoneToE164,
  normalizeStaffNamePart,
  staffNameMessage,
  staffNamePartError,
  type StaffNameParts,
} from '@nkwapa/db';
import { AuditService } from '../audit/audit.service';
import { staffNameLabel } from '../common/staff-name.validation';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { PrismaService } from '../prisma/prisma.service';

/** Who changed the name: the person, an admin correcting it, or the invite it came with. */
export type NameChangeSource = 'SELF' | 'ADMIN' | 'INVITE';

export interface NameChangeContext {
  actorUserId: string;
  source: NameChangeSource;
  clinicId?: string | null;
  requestId?: string;
}

export interface StaffNameView {
  userId: string;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  displayName: string;
}

const NAME_SELECT = {
  id: true,
  email: true,
  keycloakSub: true,
  firstName: true,
  middleInitial: true,
  lastName: true,
  displayName: true,
} as const;

type NameRow = Prisma.UserGetPayload<{ select: typeof NAME_SELECT }>;

/**
 * The one place a staff name is written (#225). Nkwapa owns the name: `displayName` is derived
 * here, and Keycloak is told afterwards so its account page and emails agree.
 */
@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly keycloakAdminService: KeycloakAdminService,
  ) {}

  async updateName(
    userId: string,
    input: StaffNameParts,
    context: NameChangeContext,
  ): Promise<StaffNameView> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: NAME_SELECT,
    });
    if (!target) throw new NotFoundException('User not found');

    const name = this.validated(input, target.email);
    const updated = await this.prisma.$transaction((tx) =>
      this.applyName(tx, target, name, context),
    );
    if (!updated) return this.view(target);

    await this.pushToKeycloak(updated, context);
    return this.view(updated);
  }

  /**
   * Write the name and its audit event inside the caller's transaction; null when nothing
   * changed. The caller owns telling Keycloak, which must happen after commit.
   */
  async applyName(
    tx: Prisma.TransactionClient,
    target: NameRow,
    name: Required<StaffNameParts>,
    context: NameChangeContext,
  ): Promise<NameRow | null> {
    const displayName = formatStaffDisplayName(name);
    if (
      target.firstName === name.firstName &&
      target.lastName === name.lastName &&
      target.middleInitial === name.middleInitial &&
      target.displayName === displayName
    ) {
      return null;
    }

    const updated = await tx.user.update({
      where: { id: target.id },
      data: { ...name, displayName },
      select: NAME_SELECT,
    });
    await this.auditService.logWrite(
      {
        clinicId: context.clinicId ?? null,
        actorUserId: context.actorUserId,
        action: 'USER.NAME.UPDATE',
        entityType: 'User',
        entityId: target.id,
        beforeJson: JSON.stringify({ ...this.names(target), source: context.source }),
        afterJson: JSON.stringify({ ...this.names(updated), source: context.source }),
        requestId: context.requestId,
      },
      tx,
    );
    return updated;
  }

  /**
   * The person's own work phone, stored as E.164 (Ghana numbers may be typed locally). Blank
   * clears it. The audit keeps only the last four digits: it is a contact detail, not evidence.
   */
  async updatePhone(
    userId: string,
    raw: string | null | undefined,
    context: NameChangeContext,
  ): Promise<{ userId: string; phoneE164: string | null }> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phoneE164: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const trimmed = raw?.trim() ?? '';
    const phoneE164 = trimmed ? normalizePhoneToE164(trimmed, 'GH') : null;
    if (trimmed && !phoneE164) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Check the phone number and try again.',
        fieldErrors: [
          { field: 'phone', message: 'Enter a valid phone number, such as 024 123 4567.' },
        ],
      });
    }
    if (target.phoneE164 === phoneE164) return { userId, phoneE164 };

    const masked = (value: string | null) => (value ? `***${value.slice(-4)}` : null);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { phoneE164 } });
      await this.auditService.logWrite(
        {
          clinicId: context.clinicId ?? null,
          actorUserId: context.actorUserId,
          action: 'USER.PHONE.UPDATE',
          entityType: 'User',
          entityId: userId,
          beforeJson: JSON.stringify({ phone: masked(target.phoneE164), source: context.source }),
          afterJson: JSON.stringify({ phone: masked(phoneE164), source: context.source }),
          requestId: context.requestId,
        },
        tx,
      );
    });
    return { userId, phoneE164 };
  }

  /** The row shape `applyName` needs, for callers that already hold a transaction. */
  findNameRow(tx: Prisma.TransactionClient, userId: string) {
    return tx.user.findUnique({ where: { id: userId }, select: NAME_SELECT });
  }

  /** Normalize and check a name against the account's email, as a field-level 400. */
  validated(input: StaffNameParts, email: string | null): Required<StaffNameParts> {
    const name = {
      firstName: normalizeStaffNamePart(input.firstName),
      middleInitial: normalizeMiddleInitial(input.middleInitial),
      lastName: normalizeStaffNamePart(input.lastName),
    };
    const fieldErrors = (['firstName', 'lastName'] as const).flatMap((field) => {
      const error = staffNamePartError(name[field], email);
      return error ? [{ field, message: staffNameMessage(error, staffNameLabel(field)) }] : [];
    });
    if (fieldErrors.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Check the name and try again.',
        fieldErrors,
      });
    }
    return name;
  }

  /** Best effort: a failure is recorded for admins and never fails the save. */
  private async pushToKeycloak(user: NameRow, context: NameChangeContext) {
    const result = await this.keycloakAdminService.updateIdentityNames(user.keycloakSub, {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
    });
    if (result.outcome === 'APPLIED' || result.outcome === 'SKIPPED') return;

    this.logger.warn(
      JSON.stringify({ message: 'Name not pushed to Keycloak', reason: result.failureReason }),
    );
    await this.auditService.logWrite({
      clinicId: context.clinicId ?? null,
      actorUserId: context.actorUserId,
      action: 'USER.NAME.KEYCLOAK_SYNC',
      entityType: 'User',
      entityId: user.id,
      afterJson: JSON.stringify({
        outcome: result.outcome,
        failureReason: result.failureReason,
        retryable: result.retryable,
      }),
      requestId: context.requestId,
    });
  }

  private names(row: NameRow) {
    return {
      firstName: row.firstName,
      middleInitial: row.middleInitial,
      lastName: row.lastName,
      displayName: row.displayName,
    };
  }

  private view(row: NameRow): StaffNameView {
    return { userId: row.id, ...this.names(row) };
  }
}
