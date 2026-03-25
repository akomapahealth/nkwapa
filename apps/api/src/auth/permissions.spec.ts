import { UserRole } from '@prisma/client';
import { computeEffectivePermissions, PERMISSIONS } from './constants/permissions';

describe('OPS permissions', () => {
  it('grants managers dedicated assignment management without broad clinic admin access', () => {
    const permissions = computeEffectivePermissions([UserRole.MANAGER]);

    expect(permissions).toContain(PERMISSIONS.OPS_ASSIGNMENT_MANAGE);
    expect(permissions).not.toContain(PERMISSIONS.CLINIC_MANAGE);
  });

  it('grants volunteers self-service ops permissions but not manager ops permissions', () => {
    const permissions = computeEffectivePermissions([UserRole.VOLUNTEER]);

    expect(permissions).toContain(PERMISSIONS.OPS_SHIFT_WRITE);
    expect(permissions).toContain(PERMISSIONS.OPS_ASSIGNMENT_READ_SELF);
    expect(permissions).not.toContain(PERMISSIONS.OPS_ASSIGNMENT_MANAGE);
  });
});
