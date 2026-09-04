import { ShiftRole, UserRole } from '@prisma/client';
import { computeEffectivePermissions, PERMISSIONS } from './constants/permissions';

describe('OPS permissions', () => {
  it('grants managers clinic manage for their assigned clinic and ops assignment management', () => {
    const permissions = computeEffectivePermissions([UserRole.MANAGER]);

    expect(permissions).toContain(PERMISSIONS.OPS_ASSIGNMENT_MANAGE);
    expect(permissions).toContain(PERMISSIONS.CLINIC_MANAGE);
    expect(permissions).toContain(PERMISSIONS.APPOINTMENT_READ);
  });

  it('keeps clinical note content limited to doctors and volunteers', () => {
    for (const role of [UserRole.DOCTOR, UserRole.VOLUNTEER]) {
      const permissions = computeEffectivePermissions([role]);
      expect(permissions).toContain(PERMISSIONS.CLINICAL_NOTE_READ);
      expect(permissions).toContain(PERMISSIONS.CLINICAL_NOTE_WRITE);
    }
    for (const role of [UserRole.DIRECTOR, UserRole.MANAGER, UserRole.PATIENT]) {
      const permissions = computeEffectivePermissions([role]);
      expect(permissions).not.toContain(PERMISSIONS.CLINICAL_NOTE_READ);
      expect(permissions).not.toContain(PERMISSIONS.CLINICAL_NOTE_WRITE);
    }
    expect(computeEffectivePermissions([UserRole.DOCTOR])).toEqual(
      expect.arrayContaining([
        PERMISSIONS.CLINICAL_NOTE_COSIGN,
        PERMISSIONS.CLINICAL_NOTE_ADDENDUM,
      ]),
    );
    expect(computeEffectivePermissions([UserRole.VOLUNTEER])).not.toContain(
      PERMISSIONS.CLINICAL_NOTE_COSIGN,
    );
  });

  it('lets clinic administrators review suspected duplicates but not clinical roles', () => {
    // Merging two charts stays SYSTEM_ADMIN only. Reviewing candidates is a separate, read-only
    // permission so the people who actually recognise the patients can triage and escalate.
    for (const role of [UserRole.DIRECTOR, UserRole.MANAGER]) {
      expect(computeEffectivePermissions([role])).toContain(PERMISSIONS.PATIENT_DUPLICATE_REVIEW);
    }
    for (const role of [UserRole.DOCTOR, UserRole.VOLUNTEER, UserRole.PATIENT]) {
      expect(computeEffectivePermissions([role])).not.toContain(
        PERMISSIONS.PATIENT_DUPLICATE_REVIEW,
      );
    }
    expect(computeEffectivePermissions([UserRole.SYSTEM_ADMIN])).toEqual(['*']);
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
    expect(permissions).toContain(PERMISSIONS.MEDICATION_RECONCILIATION_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE);
  });

  it('lets volunteers read back the screenings they are allowed to record', () => {
    const permissions = computeEffectivePermissions([UserRole.VOLUNTEER]);

    expect(permissions).toContain(PERMISSIONS.SCREENING_WRITE);
    expect(permissions).toContain(PERMISSIONS.SCREENING_READ);
    // Prescribing stays a doctor concern; reading it is not implied by screening access.
    expect(permissions).not.toContain(PERMISSIONS.PRESCRIPTION_READ);
    expect(permissions).not.toContain(PERMISSIONS.PRESCRIPTION_WRITE);
  });

  it('keeps screening read available to every clinical staff role', () => {
    for (const role of [UserRole.DIRECTOR, UserRole.MANAGER, UserRole.DOCTOR, UserRole.VOLUNTEER]) {
      expect(computeEffectivePermissions([role])).toContain(PERMISSIONS.SCREENING_READ);
    }
    expect(computeEffectivePermissions([UserRole.PATIENT])).not.toContain(
      PERMISSIONS.SCREENING_READ,
    );
  });

  it('grants doctors clinical review and finalization permissions', () => {
    const permissions = computeEffectivePermissions([UserRole.DOCTOR]);

    expect(permissions).toContain(PERMISSIONS.ENCOUNTER_REVIEW);
    expect(permissions).toContain(PERMISSIONS.SCREENING_WRITE);
    expect(permissions).toContain(PERMISSIONS.DOCTOR_FINALIZE);
    expect(permissions).toContain(PERMISSIONS.APPOINTMENT_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
    expect(permissions).toContain(PERMISSIONS.MEDICATION_RECONCILIATION_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE);
  });

  it('grants directors appointment schedule access', () => {
    const permissions = computeEffectivePermissions([UserRole.DIRECTOR]);

    expect(permissions).toContain(PERMISSIONS.APPOINTMENT_READ);
    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
    expect(permissions).toContain(PERMISSIONS.MEDICATION_RECONCILIATION_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE);
  });

  it('keeps medical history management read-only for managers', () => {
    const permissions = computeEffectivePermissions([UserRole.MANAGER]);

    expect(permissions).toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
    expect(permissions).toContain(PERMISSIONS.MEDICATION_RECONCILIATION_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE);
  });

  it('does not grant patient users staff appointment schedule access', () => {
    const permissions = computeEffectivePermissions([UserRole.PATIENT]);

    expect(permissions).not.toContain(PERMISSIONS.APPOINTMENT_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICAL_HISTORY_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICAL_HISTORY_WRITE);
    expect(permissions).not.toContain(PERMISSIONS.MEDICATION_RECONCILIATION_READ);
    expect(permissions).not.toContain(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE);
  });

  it('does not expose the retired preceptor role enums', () => {
    expect(Object.values(UserRole)).not.toContain('PRECEPTOR');
    expect(Object.values(ShiftRole)).not.toContain('PRECEPTOR');
  });
});
