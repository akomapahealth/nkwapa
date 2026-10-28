import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  formatStaffDisplayName,
  normalizeMiddleInitial,
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
