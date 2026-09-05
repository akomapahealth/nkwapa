import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { isSystemAdmin } from '../auth/clinic-roles';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';

export interface AdminActor {
  userId: string;
  roles: { clinicId: string | null; role: UserRole }[];
}

export type PatientPortalStatus = 'LINKED' | 'ROLE_ONLY' | 'LINK_ONLY' | 'NONE';

export interface PatientPortalSummary {
  status: PatientPortalStatus;
  patientId: string | null;
  patientCode: string | null;
  clinicId: string | null;
  clinicName: string | null;
}

type UserWithRolesAndClinics = Prisma.UserGetPayload<{
  include: {
    clinicRoles: {
      include: {
        clinic: {
          select: {
            name: true;
          };
        };
      };
    };
  };
}>;

const ROLE_ORDER: UserRole[] = [
  UserRole.SYSTEM_ADMIN,
  UserRole.DIRECTOR,
  UserRole.MANAGER,
  UserRole.DOCTOR,
  UserRole.VOLUNTEER,
  UserRole.PATIENT,
];

const MANAGER_LIFECYCLE_ROLES = new Set<UserRole>([
  UserRole.DOCTOR,
  UserRole.VOLUNTEER,
  UserRole.PATIENT,
]);

const DIRECTOR_LIFECYCLE_ROLES = new Set<UserRole>([...MANAGER_LIFECYCLE_ROLES, UserRole.MANAGER]);

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly reminderService: ReminderService,
  ) {}

  async listUsers(actor: AdminActor, status?: string) {
    this.assertSystemAdmin(actor, 'Only System Admin can list all users');

    const users = await this.prisma.user.findMany({
      where: this.buildUserStatusWhere(status, 'all'),
      include: this.userInclude,
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
    });

    return this.toAdminUserSummaries(users);
  }

  async listClinicUsers(actor: AdminActor, clinicId: string, status?: string) {
    await this.assertActiveClinic(clinicId);
    this.assertCanViewClinicRoster(actor, clinicId);

    const users = await this.prisma.user.findMany({
      where: {
        ...this.buildUserStatusWhere(status, 'active'),
        clinicRoles: {
          some: { clinicId },
        },
      },
      include: this.userInclude,
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      items: users.map((user) => this.toClinicUserSummary(user, clinicId)),
    };
  }

  async getUserRoles(actor: AdminActor, userId: string) {
    const user = await this.findUserWithRoles(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.assertCanViewUser(actor, user);

    return this.sortRoleEntries(user.clinicRoles).map((r) => ({
      id: r.id,
      clinicId: r.clinicId,
      role: r.role,
      clinicName: r.clinic?.name ?? null,
    }));
  }

  async assignRole(
    actor: AdminActor,
    targetUserId: string,
    clinicId: string | null,
    role: UserRole,
  ) {
    this.validateAssignRole(actor, clinicId, role);

    const targetExists = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetExists) {
      throw new NotFoundException('User not found');
    }
    if (!targetExists.isActive) {
      throw new ConflictException(
        'Cannot assign roles to an inactive user. Ask the replacement user to sign in, then reassign access to the new account.',
      );
    }

    if (role === UserRole.SYSTEM_ADMIN && clinicId != null) {
      throw new BadRequestException('SYSTEM_ADMIN must have clinicId null');
    }
    if (role !== UserRole.SYSTEM_ADMIN && clinicId == null) {
      throw new BadRequestException('Clinic is required for non-SYSTEM_ADMIN roles');
    }

    const existing = await this.prisma.userClinicRole.findFirst({
      where: {
        userId: targetUserId,
        clinicId,
        role,
      },
    });
    if (existing) {
      return existing;
    }

    const created = await this.prisma.userClinicRole.create({
      data: {
        userId: targetUserId,
        clinicId,
        role,
      },
    });

    // Deliberately after the duplicate guard above: re-assigning a role someone already
    // holds returns early, and emailing them about a no-op would be noise. A
    // SYSTEM_ADMIN grant has no clinic by construction and is not a clinic access
    // change, so it is not announced either.
    if (clinicId) {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { name: true },
      });
      await this.notifyStaffLifecycle({
        templateKey: 'STAFF_ROLE_GRANTED_V1',
        clinicId,
        recipient: targetExists,
        clinicName: clinic?.name ?? null,
        role,
        scope: 'CLINIC',
        actorUserId: actor.userId,
      });
    }

    return created;
  }

  async removeRole(
    actor: AdminActor,
    targetUserId: string,
    clinicId: string | null,
    role: UserRole,
    requestId?: string,
  ) {
    this.assertNotSelf(targetUserId, actor.userId, 'You cannot revoke your own roles');
    this.validateRemoveRole(actor, clinicId, role);

    const existing = await this.prisma.userClinicRole.findFirst({
      where: {
        userId: targetUserId,
        clinicId,
        role,
      },
      include: {
        clinic: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Role assignment not found');
    }

    await this.prisma.userClinicRole.delete({
      where: { id: existing.id },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: 'ROLE.REVOKE',
      entityType: 'UserClinicRole',
      entityId: existing.id,
      beforeJson: JSON.stringify(existing),
      requestId,
    });

    if (clinicId) {
      const recipient = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, displayName: true },
      });
      if (recipient) {
        await this.notifyStaffLifecycle({
          templateKey: 'STAFF_ROLE_REVOKED_V1',
          clinicId,
          recipient,
          clinicName: existing.clinic?.name ?? null,
          role,
          scope: 'CLINIC',
          actorUserId: actor.userId,
          requestId,
        });
      }
    }

    return { deleted: true };
  }

  async revokeClinicRole(
    actor: AdminActor,
    clinicId: string,
    targetUserId: string,
    role: UserRole,
    requestId?: string,
  ) {
    await this.assertActiveClinic(clinicId);
    this.assertNotSelf(targetUserId, actor.userId, 'You cannot revoke your own roles');
    this.assertCanManageClinicLifecycle(actor, clinicId);
    this.assertCanRevokeLifecycleRole(actor, clinicId, role);

    const existing = await this.prisma.userClinicRole.findFirst({
      where: {
        userId: targetUserId,
        clinicId,
        role,
      },
      include: {
        clinic: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Role assignment not found');
    }

    await this.prisma.userClinicRole.delete({
      where: { id: existing.id },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: 'ROLE.REVOKE',
      entityType: 'UserClinicRole',
      entityId: existing.id,
      beforeJson: JSON.stringify(existing),
      requestId,
    });

    if (clinicId) {
      const recipient = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, displayName: true },
      });
      if (recipient) {
        await this.notifyStaffLifecycle({
          templateKey: 'STAFF_ROLE_REVOKED_V1',
          clinicId,
          recipient,
          clinicName: existing.clinic?.name ?? null,
          role,
          scope: 'CLINIC',
          actorUserId: actor.userId,
          requestId,
        });
      }
    }

    return { deleted: true };
  }

  async deactivateUserInClinic(
    actor: AdminActor,
    clinicId: string,
    targetUserId: string,
    requestId?: string,
  ) {
    await this.assertActiveClinic(clinicId);
    this.assertNotSelf(targetUserId, actor.userId, 'You cannot deactivate your own account');
    this.assertCanManageClinicLifecycle(actor, clinicId);

    const target = await this.findUserWithRoles(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (!target.clinicRoles.some((entry) => entry.clinicId === clinicId)) {
      throw new NotFoundException('User is not assigned to this clinic');
    }
    if (!target.isActive) {
      throw new ConflictException('User is already deactivated');
    }

    this.assertCanDeactivateInClinic(actor, clinicId, target);

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
      include: this.userInclude,
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: 'USER.DEACTIVATE',
      entityType: 'User',
      entityId: updated.id,
      beforeJson: JSON.stringify(target),
      afterJson: JSON.stringify(updated),
      requestId,
    });

    await this.notifyStaffLifecycle({
      templateKey: 'STAFF_ACCOUNT_DEACTIVATED_V1',
      clinicId,
      recipient: updated,
      clinicName:
        target.clinicRoles.find((entry) => entry.clinicId === clinicId)?.clinic?.name ?? null,
      role: null,
      scope: 'CLINIC',
      actorUserId: actor.userId,
      requestId,
    });

    return this.toLifecycleUserSummary(updated);
  }

  async deactivateUserGlobally(actor: AdminActor, targetUserId: string, requestId?: string) {
    this.assertSystemAdmin(actor, 'Only System Admin can deactivate users globally');
    this.assertNotSelf(targetUserId, actor.userId, 'You cannot deactivate your own account');

    const target = await this.findUserWithRoles(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (!target.isActive) {
      throw new ConflictException('User is already deactivated');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
      include: this.userInclude,
    });

    await this.auditService.logWrite({
      clinicId: null,
      actorUserId: actor.userId,
      action: 'USER.DEACTIVATE',
      entityType: 'User',
      entityId: updated.id,
      beforeJson: JSON.stringify(target),
      afterJson: JSON.stringify(updated),
      requestId,
    });

    // Recorded with a null clinic, matching the audit event immediately above. Naming
    // one of the user's clinics would misreport a system-wide action as belonging to a
    // single clinic; the name is used only to address the message.
    const { clinicId: notificationClinicId, clinicName } = this.resolveNotificationClinic(
      target.clinicRoles,
    );
    await this.notifyStaffLifecycle({
      templateKey: 'STAFF_ACCOUNT_DEACTIVATED_V1',
      clinicId: notificationClinicId,
      recipient: updated,
      clinicName,
      role: null,
      scope: 'GLOBAL',
      actorUserId: actor.userId,
      requestId,
    });

    return this.toLifecycleUserSummary(updated);
  }

  /**
   * Tell a staff member their access changed.
   *
   * Everything needed is resolved before the write, never recovered after it. The whole
   * request runs inside one Postgres transaction, so a statement that errors aborts the
   * transaction regardless of any catch around it — a try/catch here would look like
   * resilience against a jest mock and fail against a real database.
   *
   * A user with no email on file records a visible NO_CONTACT_METHOD row rather than
   * failing the role change itself; access management must not depend on a mailbox.
   */
  private async notifyStaffLifecycle(params: {
    templateKey: 'STAFF_ROLE_GRANTED_V1' | 'STAFF_ROLE_REVOKED_V1' | 'STAFF_ACCOUNT_DEACTIVATED_V1';
    clinicId: string | null;
    recipient: { id: string; email: string | null; displayName: string | null };
    clinicName: string | null;
    role: UserRole | null;
    scope: 'CLINIC' | 'GLOBAL';
    actorUserId: string;
    requestId?: string;
  }) {
    await this.reminderService.sendNotificationNow({
      clinicId: params.clinicId,
      recipientType: 'USER',
      recipientUserId: params.recipient.id,
      toAddress: params.recipient.email,
      templateKey: params.templateKey,
      payload: {
        displayName: params.recipient.displayName,
        clinicName: params.clinicName,
        role: params.role,
        scope: params.scope,
      },
      actorUserId: params.actorUserId,
      requestId: params.requestId,
    });
  }

  /**
   * The clinic a global account change is recorded against.
   *
   * A global deactivation belongs to no clinic, and the ledger stores that as a null
   * clinicId visible only to system admins. Sorting by id as well as creation time keeps
   * the choice deterministic when two memberships share a timestamp.
   */
  private resolveNotificationClinic(
    clinicRoles: Array<{ clinicId: string | null; clinic?: { name: string } | null }>,
  ): { clinicId: string | null; clinicName: string | null } {
    const scoped = clinicRoles
      .filter((entry): entry is typeof entry & { clinicId: string } => entry.clinicId !== null)
      .sort((a, b) => a.clinicId.localeCompare(b.clinicId));
    return { clinicId: null, clinicName: scoped[0]?.clinic?.name ?? null };
  }

  private readonly userInclude = {
    clinicRoles: {
      include: {
        clinic: {
          select: {
            name: true,
          },
        },
      },
    },
  } satisfies Prisma.UserInclude;

  private buildUserStatusWhere(
    status: string | undefined,
    defaultStatus: 'active' | 'inactive' | 'all',
  ) {
    const resolved = (status ?? defaultStatus).toLowerCase();
    if (resolved === 'active') {
      return { isActive: true };
    }
    if (resolved === 'inactive') {
      return { isActive: false };
    }
    if (resolved === 'all') {
      return {};
    }

    throw new BadRequestException('status must be active, inactive, or all');
  }

  private async findUserWithRoles(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: this.userInclude,
    });
  }

  private async assertActiveClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, isActive: true },
      select: { id: true },
    });
    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }
  }

  private assertSystemAdmin(actor: AdminActor, message: string) {
    if (!this.isSystemAdmin(actor)) {
      throw new ForbiddenException(message);
    }
  }

  private assertNotSelf(targetUserId: string, actorUserId: string, message: string) {
    if (targetUserId === actorUserId) {
      throw new BadRequestException(message);
    }
  }

  private assertCanViewClinicRoster(actor: AdminActor, clinicId: string) {
    if (this.isSystemAdmin(actor)) {
      return;
    }

    const hasMembership = actor.roles.some((r) => r.clinicId === clinicId);
    if (!hasMembership) {
      throw new ForbiddenException('Access denied to clinic');
    }
  }

  private assertCanViewUser(actor: AdminActor, target: UserWithRolesAndClinics) {
    if (this.isSystemAdmin(actor)) {
      return;
    }

    const managedClinicIds = actor.roles
      .filter(
        (r) => r.clinicId != null && (r.role === UserRole.MANAGER || r.role === UserRole.DIRECTOR),
      )
      .map((r) => r.clinicId as string);

    const canView = target.clinicRoles.some(
      (entry) => entry.clinicId != null && managedClinicIds.includes(entry.clinicId),
    );

    if (!canView) {
      throw new ForbiddenException(
        'You can only view access details for users in clinics you manage',
      );
    }
  }

  private assertCanManageClinicLifecycle(actor: AdminActor, clinicId: string) {
    if (this.isSystemAdmin(actor)) {
      return;
    }

    const canManage = actor.roles.some(
      (r) =>
        r.clinicId === clinicId && (r.role === UserRole.MANAGER || r.role === UserRole.DIRECTOR),
    );

    if (!canManage) {
      throw new ForbiddenException(
        'Only managers, directors, or system admins can manage staff lifecycle',
      );
    }
  }

  private assertCanDeactivateInClinic(
    actor: AdminActor,
    clinicId: string,
    target: UserWithRolesAndClinics,
  ) {
    if (this.isSystemAdmin(actor)) {
      return;
    }

    const hasOutsideAccess = target.clinicRoles.some((entry) => entry.clinicId !== clinicId);
    if (hasOutsideAccess) {
      throw new ForbiddenException(
        'Only System Admin can deactivate users who have access outside this clinic',
      );
    }

    const allowedRoles = this.getLifecycleRoles(actor, clinicId);
    const clinicRoles = target.clinicRoles.filter((entry) => entry.clinicId === clinicId);

    if (clinicRoles.some((entry) => !allowedRoles.has(entry.role))) {
      throw new ForbiddenException(
        'You cannot deactivate a user with access above your clinic lifecycle authority',
      );
    }
  }

  private assertCanRevokeLifecycleRole(actor: AdminActor, clinicId: string, role: UserRole) {
    if (this.isSystemAdmin(actor)) {
      return;
    }

    const allowedRoles = this.getLifecycleRoles(actor, clinicId);
    if (!allowedRoles.has(role)) {
      throw new ForbiddenException(
        'You cannot revoke that role with your current clinic lifecycle authority',
      );
    }
  }

  private getLifecycleRoles(actor: AdminActor, clinicId: string) {
    if (this.isSystemAdmin(actor)) {
      return new Set(ROLE_ORDER);
    }

    const clinicRoles = actor.roles
      .filter((entry) => entry.clinicId === clinicId)
      .map((entry) => entry.role);

    if (clinicRoles.includes(UserRole.DIRECTOR)) {
      return DIRECTOR_LIFECYCLE_ROLES;
    }
    if (clinicRoles.includes(UserRole.MANAGER)) {
      return MANAGER_LIFECYCLE_ROLES;
    }

    throw new ForbiddenException(
      'Only managers, directors, or system admins can manage staff lifecycle',
    );
  }

  private isSystemAdmin(actor: AdminActor) {
    return isSystemAdmin(actor.roles);
  }

  private async toAdminUserSummaries(users: UserWithRolesAndClinics[]) {
    const patientPortalByUserId = await this.buildPatientPortalSummaryMap(users);
    return users.map((user) =>
      this.toAdminUserSummary(
        user,
        patientPortalByUserId.get(user.id) ?? this.emptyPatientPortalSummary(),
      ),
    );
  }

  private async buildPatientPortalSummaryMap(users: UserWithRolesAndClinics[]) {
    const userIds = [...new Set(users.map((user) => user.id))];
    const keycloakSubs = [
      ...new Set(
        users.map((user) => user.keycloakSub).filter((value): value is string => Boolean(value)),
      ),
    ];

    const accountLinks =
      keycloakSubs.length > 0
        ? await this.prisma.patientAccountLink.findMany({
            where: {
              keycloakSub: { in: keycloakSubs },
            },
            select: {
              keycloakSub: true,
              patient: {
                select: {
                  id: true,
                  patientCode: true,
                  primaryClinicId: true,
                  primaryClinic: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          })
        : [];

    const legacyLinks =
      userIds.length > 0
        ? await this.prisma.patient.findMany({
            where: {
              portalUserId: { in: userIds },
            },
            select: {
              id: true,
              patientCode: true,
              primaryClinicId: true,
              portalUserId: true,
              primaryClinic: {
                select: {
                  name: true,
                },
              },
            },
          })
        : [];

    const accountLinkByKeycloakSub = new Map(
      accountLinks.map((link) => [
        link.keycloakSub,
        {
          patientId: link.patient.id,
          patientCode: link.patient.patientCode,
          clinicId: link.patient.primaryClinicId,
          clinicName: link.patient.primaryClinic.name,
        },
      ]),
    );
    const legacyLinkByUserId = new Map(
      legacyLinks
        .filter((patient) => Boolean(patient.portalUserId))
        .map((patient) => [
          patient.portalUserId as string,
          {
            patientId: patient.id,
            patientCode: patient.patientCode,
            clinicId: patient.primaryClinicId,
            clinicName: patient.primaryClinic.name,
          },
        ]),
    );

    return new Map(
      users.map((user) => {
        const linkedPatient =
          accountLinkByKeycloakSub.get(user.keycloakSub) ?? legacyLinkByUserId.get(user.id) ?? null;
        const patientRoleClinicIds = new Set(
          user.clinicRoles
            .filter((entry) => entry.clinicId != null && entry.role === UserRole.PATIENT)
            .map((entry) => entry.clinicId as string),
        );

        let status: PatientPortalStatus = 'NONE';
        if (linkedPatient) {
          status = patientRoleClinicIds.has(linkedPatient.clinicId) ? 'LINKED' : 'LINK_ONLY';
        } else if (patientRoleClinicIds.size > 0) {
          status = 'ROLE_ONLY';
        }

        return [
          user.id,
          {
            status,
            patientId: linkedPatient?.patientId ?? null,
            patientCode: linkedPatient?.patientCode ?? null,
            clinicId: linkedPatient?.clinicId ?? null,
            clinicName: linkedPatient?.clinicName ?? null,
          } satisfies PatientPortalSummary,
        ];
      }),
    );
  }

  private emptyPatientPortalSummary(): PatientPortalSummary {
    return {
      status: 'NONE',
      patientId: null,
      patientCode: null,
      clinicId: null,
      clinicName: null,
    };
  }

  private toAdminUserSummary(user: UserWithRolesAndClinics, patientPortal: PatientPortalSummary) {
    const globalRoles = this.sortRoles(
      user.clinicRoles.filter((entry) => entry.clinicId === null).map((entry) => entry.role),
    );
    const clinicMemberships = this.sortRoleEntries(
      user.clinicRoles.filter((entry) => entry.clinicId !== null),
    ).map((entry) => ({
      id: entry.id,
      clinicId: entry.clinicId as string,
      clinicName: entry.clinic?.name ?? '',
      role: entry.role,
    }));

    return {
      id: user.id,
      keycloakSub: user.keycloakSub,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      globalRoles,
      clinicMemberships,
      patientPortal,
    };
  }

  private toClinicUserSummary(user: UserWithRolesAndClinics, clinicId: string) {
    const clinicRoles = this.sortRoles(
      user.clinicRoles.filter((entry) => entry.clinicId === clinicId).map((entry) => entry.role),
    );
    const globalRoles = this.sortRoles(
      user.clinicRoles.filter((entry) => entry.clinicId === null).map((entry) => entry.role),
    );
    const otherClinicCount = new Set(
      user.clinicRoles
        .filter((entry) => entry.clinicId != null && entry.clinicId !== clinicId)
        .map((entry) => entry.clinicId as string),
    ).size;

    return {
      id: user.id,
      keycloakSub: user.keycloakSub,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      clinicRoles,
      globalRoles,
      otherClinicCount,
    };
  }

  private toLifecycleUserSummary(user: UserWithRolesAndClinics) {
    return {
      id: user.id,
      displayName: user.displayName,
      isActive: user.isActive,
    };
  }

  private sortRoles(roles: UserRole[]) {
    return [...new Set(roles)].sort(
      (left, right) => ROLE_ORDER.indexOf(left) - ROLE_ORDER.indexOf(right),
    );
  }

  private sortRoleEntries<T extends { role: UserRole }>(roles: T[]) {
    return [...roles].sort(
      (left, right) => ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role),
    );
  }

  private validateAssignRole(actor: AdminActor, clinicId: string | null, role: UserRole) {
    if (role === UserRole.PATIENT) {
      throw new BadRequestException(
        'Patient access must be granted from a patient record via portal link.',
      );
    }

    if (isSystemAdmin(actor.roles)) return;

    if (role === UserRole.SYSTEM_ADMIN || role === UserRole.DIRECTOR) {
      throw new ForbiddenException('Only System Admin can assign SYSTEM_ADMIN or DIRECTOR roles');
    }

    if (clinicId == null) return;
    const isDirectorOfClinic = actor.roles.some(
      (r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR,
    );
    if (!isDirectorOfClinic) {
      throw new ForbiddenException('You can only assign roles for clinics you direct');
    }
  }

  private validateRemoveRole(actor: AdminActor, clinicId: string | null, role: UserRole) {
    if (isSystemAdmin(actor.roles)) return;

    if (role === UserRole.SYSTEM_ADMIN || role === UserRole.DIRECTOR) {
      throw new ForbiddenException('Only System Admin can remove SYSTEM_ADMIN or DIRECTOR roles');
    }

    if (clinicId == null) return;
    const isDirectorOfClinic = actor.roles.some(
      (r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR,
    );
    if (!isDirectorOfClinic) {
      throw new ForbiddenException('You can only remove roles for clinics you direct');
    }
  }
}
