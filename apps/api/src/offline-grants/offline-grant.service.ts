import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OFFLINE_GRANT_ROLES,
  requiresStaffAgreement,
  type OfflineGrantClaims,
  type OfflineGrantPublicKey,
  type OfflineSessionStamp,
} from '@nkwapa/db';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockForTransaction } from '../prisma/transaction-lock';
import { ClinicService } from '../clinics/clinic.service';
import { membershipsFor, type ReqUser } from '../auth/auth.controller';
import { computeEffectivePermissions } from '../auth/constants/permissions';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { AuditService } from '../audit/audit.service';
import { OfflineGrantKeysService } from './offline-grant-keys.service';

export const OFFLINE_GRANT_DEFAULT_TTL_HOURS = 72;

/** `OFFLINE_GRANT_TTL_HOURS`, clamped to 1 to 168; 72 when unset or unreadable. */
export function offlineGrantTtlHours(raw = process.env.OFFLINE_GRANT_TTL_HOURS): number {
  const parsed = Number(raw);
  if (!raw?.trim() || !Number.isFinite(parsed)) return OFFLINE_GRANT_DEFAULT_TTL_HOURS;
  return Math.min(168, Math.max(1, parsed));
}

export type OfflineGrantRevokeReason =
  'SIGN_OUT' | 'DEVICE_REVOKED' | 'ROLE_REMOVED' | 'DEACTIVATED' | 'ADMIN_SIGN_OUT';

/**
 * A grant whose window ran out and was replaced by a fresh one on the next opt-in.
 *
 * It is closed only so the device can hold a new live grant (one per person and device). It is not
 * revoked: writes recorded under it before it expired are still accepted.
 */
const LAPSED = 'LAPSED';

export type OfflineGrantRefusal = 'OFFLINE_GRANT_REVOKED' | 'OFFLINE_GRANT_EXPIRED';

export interface IssuedOfflineGrant {
  grant: string;
  claims: OfflineGrantClaims;
  /** This person's data key on this device, base64. Never stored by the server. */
  dataKey: string;
  /** The keys for this device's local data, as `deviceKeys` returns them, for offline unlock. */
  deviceKeys: Record<string, string>;
  keys: OfflineGrantPublicKey[];
}

export interface OfflineGrantSummary {
  id: string;
  deviceId: string;
  issuedAt: string;
  expiresAt: string;
  userAgent: string | null;
}

const STAFF_ROLES = new Set<string>(OFFLINE_GRANT_ROLES);

@Injectable()
export class OfflineGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicService: ClinicService,
    private readonly keys: OfflineGrantKeysService,
    private readonly auditService: AuditService,
  ) {}

  private assertAvailable(): void {
    if (!isApiFeatureEnabled('offlineSession')) {
      throw new ForbiddenException({
        code: 'OFFLINE_SESSION_DISABLED',
        message: 'Offline access is not turned on for this service.',
      });
    }
    if (!this.keys.isAvailable()) {
      throw new ServiceUnavailableException({
        code: 'OFFLINE_SESSION_UNAVAILABLE',
        message: 'Offline access is not available right now.',
      });
    }
  }

  /**
   * The keys this device encrypts its local copy of clinical data with, for this person (#207):
   * `user:<id>` for their own portal copy, and `clinic:<id>` for every clinic they hold a staff role
   * in. A system admin gets the one clinic they ask for, as the clinic scope guard lets them read
   * any. A patient's clinic role never yields a clinic key. Base64, never stored by the server.
   */
  deviceKeys(reqUser: ReqUser, deviceId: string, clinicId?: string): Record<string, string> {
    this.assertAvailable();
    const scopes = new Set([`user:${reqUser.user.id}`]);
    for (const entry of reqUser.roles) {
      if (entry.clinicId && entry.role !== UserRole.PATIENT) scopes.add(`clinic:${entry.clinicId}`);
    }
    if (clinicId && reqUser.roles.some((entry) => entry.role === UserRole.SYSTEM_ADMIN)) {
      scopes.add(`clinic:${clinicId}`);
    }
    return Object.fromEntries(
      [...scopes].map((scope) => [
        scope,
        this.keys.deriveDeviceKey(deviceId, scope).toString('base64'),
      ]),
    );
  }

  publicKeys(): OfflineGrantPublicKey[] {
    return this.keys.publicKeys();
  }

  /**
   * Issue, or refresh in place, this person's grant for this device.
   *
   * Refused for anyone with a global role (a system admin's work is online work, and a stolen
   * admin grant has the widest reach), for anyone without a staff seat, and while onboarding is
   * unfinished.
   */
  async issue(
    reqUser: ReqUser,
    deviceId: string,
    userAgent: string | undefined,
    now = new Date(),
  ): Promise<IssuedOfflineGrant> {
    this.assertAvailable();
    const { user, roles } = reqUser;
    if (roles.some((entry) => entry.clinicId === null)) {
      throw new ForbiddenException({
        code: 'OFFLINE_SESSION_NOT_ALLOWED',
        message: 'Accounts with access across every clinic cannot be used offline.',
      });
    }
    const staffRoles = roles.filter(
      (entry) => entry.clinicId !== null && STAFF_ROLES.has(entry.role),
    );
    if (staffRoles.length === 0) {
      throw new ForbiddenException({
        code: 'OFFLINE_SESSION_NOT_ALLOWED',
        message: 'Only clinic staff can use this device offline.',
      });
    }
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true, staffAgreementVersion: true },
    });
    if (
      !profile?.firstName ||
      !profile.lastName ||
      requiresStaffAgreement(
        roles.map((entry) => entry.role),
        profile.staffAgreementVersion ?? null,
      )
    ) {
      throw new ForbiddenException({
        code: 'OFFLINE_SESSION_NOT_ALLOWED',
        message: 'Finish setting up your account before using this device offline.',
      });
    }

    const clinics = await this.clinicService.findByIds([
      ...new Set(staffRoles.map((entry) => entry.clinicId as string)),
    ]);
    const memberships = membershipsFor(staffRoles, clinics).map((membership) => ({
      clinicId: membership.clinicId,
      clinicName: membership.clinicName,
      roles: membership.roles,
      permissions: computeEffectivePermissions(membership.roles as UserRole[]),
    }));
    if (memberships.length === 0) {
      throw new ForbiddenException({
        code: 'OFFLINE_SESSION_NOT_ALLOWED',
        message: 'Only clinic staff can use this device offline.',
      });
    }

    const expiresAt = new Date(now.getTime() + offlineGrantTtlHours() * 3_600_000);
    const row = await this.prisma.$transaction(async (tx) => {
      // Two tabs refreshing at once must not both find no live grant and both create one.
      await lockForTransaction(tx, `offline-grant:${user.id}:${deviceId}`);
      const live = await tx.offlineGrant.findFirst({
        where: { userId: user.id, deviceId, revokedAt: null },
      });
      const data = { issuedAt: now, expiresAt, userAgent: userAgent?.slice(0, 400) || null };
      if (live && live.expiresAt > now) {
        return tx.offlineGrant.update({ where: { id: live.id }, data });
      }
      if (live) {
        // Moving an expired grant's window forward would also accept what was recorded after
        // it ran out, so it is closed and a new one starts.
        await tx.offlineGrant.update({
          where: { id: live.id },
          data: { revokedAt: now, revokedReason: LAPSED },
        });
      }
      const created = await tx.offlineGrant.create({
        data: { userId: user.id, deviceId, ...data },
      });
      // A refresh is routine; a device newly able to work offline is worth a record.
      await this.auditService.logWrite(
        {
          // AuditEvent RLS admits a null clinic only for a system admin.
          clinicId: memberships[0]?.clinicId ?? null,
          actorUserId: user.id,
          action: 'OFFLINE_GRANT.ISSUE',
          entityType: 'OfflineGrant',
          entityId: created.id,
          afterJson: JSON.stringify({ deviceId, expiresAt: created.expiresAt.toISOString() }),
        },
        tx,
      );
      return created;
    });

    const claims: OfflineGrantClaims = {
      grantId: row.id,
      userId: user.id,
      displayName: user.displayName,
      deviceId,
      globalRoles: [],
      memberships,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
    return {
      grant: this.keys.sign(claims),
      claims,
      dataKey: this.keys.deriveDataKey(user.id, deviceId).toString('base64'),
      deviceKeys: this.deviceKeys(reqUser, deviceId),
      keys: this.keys.publicKeys(),
    };
  }

  /** This person's devices that can still resume offline, for the settings page. */
  async listLive(userId: string, now = new Date()): Promise<OfflineGrantSummary[]> {
    const rows = await this.prisma.offlineGrant.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { issuedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      userAgent: row.userAgent,
    }));
  }

  /** Revoke one of the caller's own grants: a lost device, or signing out of this one. */
  async revokeOwn(
    userId: string,
    grantId: string,
    reason: Extract<OfflineGrantRevokeReason, 'SIGN_OUT' | 'DEVICE_REVOKED'>,
    /** One of the caller's clinics, for the audit row. */
    clinicId: string | null,
    now = new Date(),
  ): Promise<void> {
    const grant = await this.prisma.offlineGrant.findFirst({ where: { id: grantId, userId } });
    if (!grant) throw new NotFoundException('Offline access for that device was not found');
    if (grant.revokedAt && grant.revokedReason !== LAPSED) return;
    await this.prisma.offlineGrant.update({
      where: { id: grantId },
      data: { revokedAt: now, revokedReason: reason },
    });
    await this.auditService.logWrite({
      clinicId: clinicId ?? null,
      actorUserId: userId,
      action: 'OFFLINE_GRANT.REVOKE',
      entityType: 'OfflineGrant',
      entityId: grantId,
      afterJson: JSON.stringify({ reason }),
    });
  }

  /**
   * Revoke every grant a person holds, on every device. For offboarding, a role removed, or a
   * manager signing them out. Runs as the system: the caller is usually someone else.
   *
   * Lapsed grants are revoked too, so nothing recorded under them is accepted any more either.
   * Returns how many were revoked.
   */
  async revokeAllForUser(
    userId: string,
    reason: Exclude<OfflineGrantRevokeReason, 'SIGN_OUT' | 'DEVICE_REVOKED'>,
    now = new Date(),
  ): Promise<number> {
    // Detached, so it commits on its own: if the caller's change later rolls back, the grants
    // stay revoked, which fails closed. The device opts in again on its next online sign-in.
    const { count } = await this.prisma.detachFromRlsContext(() =>
      this.prisma.withSystemContext({ systemReason: 'Revoke offline access' }, (client) =>
        client.offlineGrant.updateMany({
          where: { userId, OR: [{ revokedAt: null }, { revokedReason: LAPSED }] },
          data: { revokedAt: now, revokedReason: reason },
        }),
      ),
    );
    return count;
  }

  /**
   * Why a write queued in an offline session must be refused, or null to let it through.
   *
   * Expiry is judged against the server's own record of the grant, using the time the device says
   * the write was recorded. Push time cannot be used: work recorded at hour 71 is routinely sent
   * after hour 72. Someone with devtools can backdate that time; the controls that hold against
   * them are the live sign-in every push needs, and revocation.
   */
  async refusalFor(
    userId: string,
    stamp: Pick<OfflineSessionStamp, 'grantId' | 'deviceId'>,
    recordedAt: string | undefined,
  ): Promise<OfflineGrantRefusal | null> {
    const grant = await this.prisma.offlineGrant.findFirst({
      where: { id: stamp.grantId, userId },
    });
    if (!grant || grant.deviceId !== stamp.deviceId) return 'OFFLINE_GRANT_REVOKED';
    if (grant.revokedAt && grant.revokedReason !== LAPSED) return 'OFFLINE_GRANT_REVOKED';
    const recorded = recordedAt ? Date.parse(recordedAt) : Number.NaN;
    if (Number.isNaN(recorded) || recorded > grant.expiresAt.getTime()) {
      return 'OFFLINE_GRANT_EXPIRED';
    }
    return null;
  }
}
