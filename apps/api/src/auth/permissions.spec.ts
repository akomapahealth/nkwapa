import { ShiftRole, UserRole } from '@prisma/client';
import { computeEffectivePermissions, PERMISSIONS } from './constants/permissions';

describe('OPS permissions', () => {
  it('grants managers clinic manage for their assigned clinic and ops assignment management', () => {
    const permissions = computeEffectivePermissions([UserRole.MANAGER]);

    expect(permissions).toContain(PERMISSIONS.OPS_ASSIGNMENT_MANAGE);
    expect(permissions).toContain(PERMISSIONS.CLINIC_MANAGE);
    expect(permissions).toContain(PERMISSIONS.APPOINTMENT_READ);
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
    expect(permissions).toContain(PERMISSIONS.APPOINTMENT_READ);
    expect(permissions).not.toContain(PERMISSIONS.OPS_ASSIGNMENT_MANAGE);
    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
  });

  it('grants doctors clinical review and finalization permissions', () => {
    const permissions = computeEffectivePermissions([UserRole.DOCTOR]);

    expect(permissions).toContain(PERMISSIONS.ENCOUNTER_REVIEW);
    expect(permissions).toContain(PERMISSIONS.SCREENING_WRITE);
    expect(permissions).toContain(PERMISSIONS.DOCTOR_FINALIZE);
    expect(permissions).toContain(PERMISSIONS.APPOINTMENT_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
  });

  it('grants directors appointment schedule access', () => {
    const permissions = computeEffectivePermissions([UserRole.DIRECTOR]);

    expect(permissions).toContain(PERMISSIONS.APPOINTMENT_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
  });

  it('keeps medical history management read-only for managers', () => {
    const permissions = computeEffectivePermissions([UserRole.MANAGER]);

    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
  });

  it('does not grant patient users staff appointment schedule access', () => {
    const permissions = computeEffectivePermissions([UserRole.PATIENT]);

    expect(permissions).not.toContain(PERMISSIONS.APPOINTMENT_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
  });

  it('does not expose the retired preceptor role enums', () => {
    expect(Object.values(UserRole)).not.toContain('PRECEPTOR');
    expect(Object.values(ShiftRole)).not.toContain('PRECEPTOR');
  });
});
