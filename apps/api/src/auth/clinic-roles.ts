import { UserRole } from '@prisma/client';
import { computeEffectivePermissions } from './constants/permissions';

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
