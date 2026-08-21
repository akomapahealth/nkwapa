import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  assertPermissionAtClinic,
  hasPermissionAtClinic,
  permissionsForClinic,
  rolesForClinic,
} from './clinic-roles';
import { PERMISSIONS } from './constants/permissions';
import {
  CLINIC_A1,
  CLINIC_B1,
  CROSS_CLINIC_MANAGER_VOLUNTEER,
  SYSTEM_ADMIN,
} from '../testing/rbac-harness';

describe('clinic-scoped permission checks', () => {
  it('does not let a seat at another clinic authorize a write here', () => {
    // The whole class of defect this gate exists to close: checking the raw role array lets the
    // clinic-B1 volunteer seat grant a clinical write at clinic A1.
    const roles = CROSS_CLINIC_MANAGER_VOLUNTEER.roles;

    expect(hasPermissionAtClinic(roles, CLINIC_A1, PERMISSIONS.SCREENING_WRITE)).toBe(false);
    expect(hasPermissionAtClinic(roles, CLINIC_B1, PERMISSIONS.SCREENING_WRITE)).toBe(true);
  });

  it('still grants what the local seat legitimately holds', () => {
    const roles = CROSS_CLINIC_MANAGER_VOLUNTEER.roles;
    expect(hasPermissionAtClinic(roles, CLINIC_A1, PERMISSIONS.SYNC_PUSH)).toBe(true);
    expect(hasPermissionAtClinic(roles, CLINIC_A1, PERMISSIONS.OPS_ASSIGNMENT_MANAGE)).toBe(true);
  });

  it('throws for a denied permission and stays silent for a granted one', () => {
    const roles = CROSS_CLINIC_MANAGER_VOLUNTEER.roles;
    expect(() => assertPermissionAtClinic(roles, CLINIC_A1, PERMISSIONS.SCREENING_WRITE)).toThrow(
      ForbiddenException,
    );
    expect(() => assertPermissionAtClinic(roles, CLINIC_A1, PERMISSIONS.SYNC_PUSH)).not.toThrow();
  });

  it('applies a global system administrator everywhere', () => {
    expect(hasPermissionAtClinic(SYSTEM_ADMIN.roles, CLINIC_A1, PERMISSIONS.SCREENING_WRITE)).toBe(
      true,
    );
    expect(hasPermissionAtClinic(SYSTEM_ADMIN.roles, CLINIC_B1, PERMISSIONS.SCREENING_WRITE)).toBe(
      true,
    );
  });

  it('agrees with the helpers it is built on', () => {
    const roles = CROSS_CLINIC_MANAGER_VOLUNTEER.roles;
    expect(rolesForClinic(roles, CLINIC_A1)).toEqual([{ role: UserRole.MANAGER }]);
    expect(permissionsForClinic(roles, CLINIC_A1)).not.toContain(PERMISSIONS.SCREENING_WRITE);
  });
});
