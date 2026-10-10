import { UserRole } from '@prisma/client';
import { SYNC_ENTITY_PERMISSIONS, SYNC_ENTITY_TYPES, isSyncEntityType } from './sync-permissions';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/constants/permissions';
import type { EntityType } from './entity-types';

const holds = (role: UserRole, permission: string) =>
  ROLE_PERMISSIONS[role].includes('*') || ROLE_PERMISSIONS[role].includes(permission);

describe('sync entity permissions', () => {
  it('declares a permission for every replayable entity type', () => {
    // The Record<EntityType, …> type makes this a compile error too; this asserts the runtime
    // list stays in step so the DTO rejects the same set the dispatcher accepts.
    expect(SYNC_ENTITY_TYPES.sort()).toEqual(Object.keys(SYNC_ENTITY_PERMISSIONS).sort());
    for (const entityType of SYNC_ENTITY_TYPES) {
      const policy = SYNC_ENTITY_PERMISSIONS[entityType];
      expect(typeof policy.create).toBe('string');
      expect(typeof policy.update).toBe('string');
    }
  });

  it('never queues clinical note content', () => {
    // HAP note content is server-only. A replayable note entity would put it in IndexedDB.
    expect(SYNC_ENTITY_TYPES.filter((t) => t.includes('note'))).toEqual([]);
    expect(isSyncEntityType('clinical_note')).toBe(false);
  });

  it('rejects an unrecognised entity type', () => {
    expect(isSyncEntityType('patient')).toBe(true);
    expect(isSyncEntityType('Patient')).toBe(false);
    expect(isSyncEntityType('')).toBe(false);
    expect(isSyncEntityType(undefined)).toBe(false);
    expect(isSyncEntityType('__proto__')).toBe(false);
  });

  describe('an offline write is never more powerful than the same write made online', () => {
    // Every role below holds SYNC.PUSH, so before this table the offline path granted whatever
    // the handler implemented. These are the writes each role must still be refused.
    const forbidden: Array<[UserRole, EntityType, string]> = [
      [UserRole.DIRECTOR, 'patient', PERMISSIONS.PATIENT_CREATE],
      [UserRole.DIRECTOR, 'encounter', PERMISSIONS.ENCOUNTER_CREATE],
      [UserRole.DIRECTOR, 'care_plan', PERMISSIONS.CAREPLAN_WRITE],
      [UserRole.DIRECTOR, 'patient_consent', PERMISSIONS.CONSENT_RECORD],
      [UserRole.DIRECTOR, 'prescription', PERMISSIONS.PRESCRIPTION_WRITE],
      [UserRole.DIRECTOR, 'vitals', PERMISSIONS.SCREENING_WRITE],
      [UserRole.DIRECTOR, 'diabetes_screening', PERMISSIONS.SCREENING_WRITE],
      [UserRole.DIRECTOR, 'medical_history_revision', PERMISSIONS.MEDICAL_HISTORY_WRITE],
      [UserRole.MANAGER, 'care_plan', PERMISSIONS.CAREPLAN_WRITE],
      [UserRole.MANAGER, 'patient_consent', PERMISSIONS.CONSENT_RECORD],
      [UserRole.MANAGER, 'prescription', PERMISSIONS.PRESCRIPTION_WRITE],
      [UserRole.MANAGER, 'vitals', PERMISSIONS.SCREENING_WRITE],
      [UserRole.MANAGER, 'medication_reconciliation', PERMISSIONS.MEDICATION_RECONCILIATION_WRITE],
      [UserRole.VOLUNTEER, 'care_plan', PERMISSIONS.CAREPLAN_WRITE],
      [UserRole.VOLUNTEER, 'prescription', PERMISSIONS.PRESCRIPTION_WRITE],
      [UserRole.DOCTOR, 'patient_consent', PERMISSIONS.CONSENT_RECORD],
    ];

    it.each(forbidden)('refuses %s the %s entity', (role, entityType, permission) => {
      expect(SYNC_ENTITY_PERMISSIONS[entityType].create).toBe(permission);
      expect(holds(role, permission)).toBe(false);
    });

    const allowed: Array<[UserRole, EntityType]> = [
      [UserRole.VOLUNTEER, 'patient'],
      [UserRole.VOLUNTEER, 'encounter'],
      [UserRole.VOLUNTEER, 'vitals'],
      [UserRole.VOLUNTEER, 'encounter_vitals_bundle'],
      [UserRole.VOLUNTEER, 'diabetes_screening'],
      [UserRole.VOLUNTEER, 'patient_consent'],
      [UserRole.VOLUNTEER, 'medical_history_revision'],
      [UserRole.VOLUNTEER, 'medication_reconciliation'],
      [UserRole.DOCTOR, 'care_plan'],
      [UserRole.DOCTOR, 'prescription'],
      [UserRole.DOCTOR, 'vitals'],
      [UserRole.DOCTOR, 'medical_history_revision'],
    ];

    it.each(allowed)('still lets %s queue the %s entity', (role, entityType) => {
      expect(holds(role, SYNC_ENTITY_PERMISSIONS[entityType].create)).toBe(true);
    });
  });

  it('separates registering a patient from editing an existing chart', () => {
    // A volunteer registers patients offline but may not edit a chart, so an upsert cannot use a
    // single permission for both effects.
    const policy = SYNC_ENTITY_PERMISSIONS.patient;
    expect(policy.create).toBe(PERMISSIONS.PATIENT_CREATE);
    expect(policy.update).toBe(PERMISSIONS.PATIENT_UPDATE);
    expect(holds(UserRole.VOLUNTEER, policy.create)).toBe(true);
    expect(holds(UserRole.VOLUNTEER, policy.update)).toBe(false);
  });

  it('marks append-only records as undeletable', () => {
    for (const entityType of [
      'medical_history_revision',
      'patient_medication_revision',
      'patient_pharmacy_revision',
      'medication_reconciliation',
      'patient',
      'encounter',
    ] as EntityType[]) {
      expect(SYNC_ENTITY_PERMISSIONS[entityType].delete).toBeNull();
    }
  });
});
