import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface AdminActor {
  userId: string;
  roles: { clinicId: string | null; role: UserRole }[];
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
  UserRole.PRECEPTOR,
  UserRole.VOLUNTEER,
  UserRole.PATIENT,
];

const MANAGER_LIFECYCLE_ROLES = new Set<UserRole>([
  UserRole.DOCTOR,
  UserRole.PRECEPTOR,
  UserRole.VOLUNTEER,
  UserRole.PATIENT,
]);

const DIRECTOR_LIFECYCLE_ROLES = new Set<UserRole>([
  ...MANAGER_LIFECYCLE_ROLES,
  UserRole.MANAGER,
]);

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async listUsers(actor: AdminActor, status?: string) {
    this.assertSystemAdmin(actor, 'Only System Admin can list all users');

    const users = await this.prisma.user.findMany({
      where: this.buildUserStatusWhere(status, 'all'),
      include: this.userInclude,
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
    });

    return users.map((user) => this.toAdminUserSummary(user));
  }

  async listClinicUsers(
    actor: AdminActor,
    clinicId: string,
    status?: string
  ) {
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
    role: UserRole
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
        'Cannot assign roles to an inactive user. Ask the replacement user to sign in, then reassign access to the new account.'
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

    return this.prisma.userClinicRole.create({
      data: {
        userId: targetUserId,
        clinicId,
        role,
      },
    });
  }

  async removeRole(
    actor: AdminActor,
    targetUserId: string,
    clinicId: string | null,
    role: UserRole,
    requestId?: string
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

    return { deleted: true };
  }

  async revokeClinicRole(
    actor: AdminActor,
    clinicId: string,
    targetUserId: string,
    role: UserRole,
    requestId?: string
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

    return { deleted: true };
  }

  async deactivateUserInClinic(
    actor: AdminActor,
    clinicId: string,
    targetUserId: string,
    requestId?: string
  ) {
    await this.assertActiveClinic(clinicId);
    this.assertNotSelf(
      targetUserId,
      actor.userId,
      'You cannot deactivate your own account'
    );
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

    return this.toLifecycleUserSummary(updated);
  }

  async deactivateUserGlobally(
    actor: AdminActor,
    targetUserId: string,
    requestId?: string
  ) {
    this.assertSystemAdmin(actor, 'Only System Admin can deactivate users globally');
    this.assertNotSelf(
      targetUserId,
      actor.userId,
      'You cannot deactivate your own account'
    );

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

    return this.toLifecycleUserSummary(updated);
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
    defaultStatus: 'active' | 'inactive' | 'all'
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
        (r) =>
          r.clinicId != null &&
          (r.role === UserRole.MANAGER || r.role === UserRole.DIRECTOR)
      )
      .map((r) => r.clinicId as string);

    const canView = target.clinicRoles.some(
      (entry) => entry.clinicId != null && managedClinicIds.includes(entry.clinicId)
    );

    if (!canView) {
      throw new ForbiddenException('You can only view access details for users in clinics you manage');
    }
  }

  private assertCanManageClinicLifecycle(actor: AdminActor, clinicId: string) {
    if (this.isSystemAdmin(actor)) {
      return;
    }

    const canManage = actor.roles.some(
      (r) =>
        r.clinicId === clinicId &&
        (r.role === UserRole.MANAGER || r.role === UserRole.DIRECTOR)
    );

    if (!canManage) {
      throw new ForbiddenException(
        'Only managers, directors, or system admins can manage staff lifecycle'
      );
    }
  }

  private assertCanDeactivateInClinic(
    actor: AdminActor,
    clinicId: string,
    target: UserWithRolesAndClinics
  ) {
    if (this.isSystemAdmin(actor)) {
      return;
    }

    const hasOutsideAccess = target.clinicRoles.some(
      (entry) => entry.clinicId !== clinicId
    );
    if (hasOutsideAccess) {
      throw new ForbiddenException(
        'Only System Admin can deactivate users who have access outside this clinic'
      );
    }

    const allowedRoles = this.getLifecycleRoles(actor, clinicId);
    const clinicRoles = target.clinicRoles.filter((entry) => entry.clinicId === clinicId);

    if (clinicRoles.some((entry) => !allowedRoles.has(entry.role))) {
      throw new ForbiddenException(
        'You cannot deactivate a user with access above your clinic lifecycle authority'
      );
    }
  }

  private assertCanRevokeLifecycleRole(
    actor: AdminActor,
    clinicId: string,
    role: UserRole
  ) {
    if (this.isSystemAdmin(actor)) {
      return;
    }

    const allowedRoles = this.getLifecycleRoles(actor, clinicId);
    if (!allowedRoles.has(role)) {
      throw new ForbiddenException(
        'You cannot revoke that role with your current clinic lifecycle authority'
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
      'Only managers, directors, or system admins can manage staff lifecycle'
    );
  }

  private isSystemAdmin(actor: AdminActor) {
    return actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null
    );
  }

  private toAdminUserSummary(user: UserWithRolesAndClinics) {
    const globalRoles = this.sortRoles(
      user.clinicRoles
        .filter((entry) => entry.clinicId === null)
        .map((entry) => entry.role)
    );
    const clinicMemberships = this.sortRoleEntries(
      user.clinicRoles.filter((entry) => entry.clinicId !== null)
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
    };
  }

  private toClinicUserSummary(user: UserWithRolesAndClinics, clinicId: string) {
    const clinicRoles = this.sortRoles(
      user.clinicRoles
        .filter((entry) => entry.clinicId === clinicId)
        .map((entry) => entry.role)
    );
    const globalRoles = this.sortRoles(
      user.clinicRoles
        .filter((entry) => entry.clinicId === null)
        .map((entry) => entry.role)
    );
    const otherClinicCount = new Set(
      user.clinicRoles
        .filter(
          (entry) => entry.clinicId != null && entry.clinicId !== clinicId
        )
        .map((entry) => entry.clinicId as string)
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
      (left, right) =>
        ROLE_ORDER.indexOf(left) - ROLE_ORDER.indexOf(right)
    );
  }

  private sortRoleEntries<T extends { role: UserRole }>(roles: T[]) {
    return [...roles].sort(
      (left, right) =>
        ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role)
    );
  }

  private validateAssignRole(
    actor: AdminActor,
    clinicId: string | null,
    role: UserRole
  ) {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null
    );
    if (isSystemAdmin) return;

    if (role === UserRole.SYSTEM_ADMIN || role === UserRole.DIRECTOR) {
      throw new ForbiddenException(
        'Only System Admin can assign SYSTEM_ADMIN or DIRECTOR roles'
      );
    }

    if (clinicId == null) return;
    const isDirectorOfClinic = actor.roles.some(
      (r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR
    );
    if (!isDirectorOfClinic) {
      throw new ForbiddenException(
        'You can only assign roles for clinics you direct'
      );
    }
  }

  private validateRemoveRole(
    actor: AdminActor,
    clinicId: string | null,
    role: UserRole
  ) {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null
    );
    if (isSystemAdmin) return;

    if (role === UserRole.SYSTEM_ADMIN || role === UserRole.DIRECTOR) {
      throw new ForbiddenException(
        'Only System Admin can remove SYSTEM_ADMIN or DIRECTOR roles'
      );
    }

    if (clinicId == null) return;
    const isDirectorOfClinic = actor.roles.some(
      (r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR
    );
    if (!isDirectorOfClinic) {
      throw new ForbiddenException(
        'You can only remove roles for clinics you direct'
      );
    }
  }
}
