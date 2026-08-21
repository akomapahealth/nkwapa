import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { computeEffectivePermissions, hasPermission } from './constants/permissions';

export interface ScopedRole {
  clinicId: string | null;
  role: UserRole;
}

/**
 * The roles a user actually holds *at one clinic*.
 *
 * A user may be a DOCTOR at clinic A and a MANAGER at clinic B. Authorization decisions
 * must only consider the roles held at the clinic being read, otherwise privileges leak
 * sideways between clinics. Global SYSTEM_ADMIN (`clinicId === null`) applies everywhere.
 *
 * `RbacGuard` and any service that derives what data to return must agree on this rule,
 * so both call this function rather than re-implementing the filter.
 */
export function rolesForClinic(
  roles: readonly ScopedRole[],
  clinicId: string | null | undefined,
): Array<{ role: UserRole }> {
  if (clinicId == null) {
    return roles.map((entry) => ({ role: entry.role }));
  }
  return roles
    .filter(
      (entry) =>
        entry.clinicId === clinicId ||
        (entry.clinicId === null && entry.role === UserRole.SYSTEM_ADMIN),
    )
    .map((entry) => ({ role: entry.role }));
}

/** Effective permission strings for a user at one clinic. `'*'` means system admin. */
export function permissionsForClinic(
  roles: readonly ScopedRole[],
  clinicId: string | null | undefined,
): string[] {
  return computeEffectivePermissions(rolesForClinic(roles, clinicId).map((entry) => entry.role));
}

/** Whether a user holds `permission` through a role seated at `clinicId`. */
export function hasPermissionAtClinic(
  roles: readonly ScopedRole[],
  clinicId: string | null | undefined,
  permission: string,
): boolean {
  return hasPermission(rolesForClinic(roles, clinicId), permission);
}

/**
 * Assert a permission held *at one clinic*, throwing `ForbiddenException` otherwise.
 *
 * Services that re-check a permission below the guard layer must use this rather than
 * `hasPermission` over the raw role array. A user may be a manager here and a volunteer elsewhere;
 * checking the unscoped array lets the elsewhere-role authorize a write here.
 */
export function assertPermissionAtClinic(
  roles: readonly ScopedRole[],
  clinicId: string | null | undefined,
  permission: string,
  message?: string,
): void {
  if (!hasPermissionAtClinic(roles, clinicId, permission)) {
    throw new ForbiddenException(message ?? `${permission} permission is required`);
  }
}
