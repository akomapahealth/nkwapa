import { UserRole } from '@prisma/client';
import { computeEffectivePermissions, PERMISSIONS } from './constants/permissions';

describe('OPS permissions', () => {
  it('grants managers clinic manage for their assigned clinic and ops assignment management', () => {
    const permissions = computeEffectivePermissions([UserRole.MANAGER]);

    expect(permissions).toContain(PERMISSIONS.OPS_ASSIGNMENT_MANAGE);
    expect(permissions).toContain(PERMISSIONS.CLINIC_MANAGE);
  });

  it('grants managers clinic scope but not org-wide research export approval', () => {
    const permissions = computeEffectivePermissions([UserRole.MANAGER]);

    expect(permissions).not.toContain(PERMISSIONS.RESEARCH_EXPORT_APPROVE);
    expect(permissions).not.toContain(PERMISSIONS.RESEARCH_SETTINGS_UPDATE);
  });

  it('grants volunteers self-service ops permissions but not manager ops permissions', () => {
    const permissions = computeEffectivePermissions([UserRole.VOLUNTEER]);

    expect(permissions).toContain(PERMISSIONS.OPS_SHIFT_WRITE);
    expect(permissions).toContain(PERMISSIONS.OPS_ASSIGNMENT_READ_SELF);
    expect(permissions).not.toContain(PERMISSIONS.OPS_ASSIGNMENT_MANAGE);
  });
});
