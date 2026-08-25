import { UserRole } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/constants/permissions';
import type { EntityType } from '../sync/entity-types';

/**
 * Every record type the clinical-records initiative introduced, and the permission that governs
 * each way of reaching it.
 *
 * This is the single description the role matrix test and the published role matrix document are
 * both generated from, so the documentation cannot drift from what the code enforces. Adding a
 * record type here without deciding its permissions is a type error.
 */
export interface ClinicalRecordSurface {
  /** Stable identifier used as the document's row key. */
  readonly id: string;
  readonly label: string;
  readonly read: string;
  readonly write: string;
  /** Permissions beyond read and write, e.g. cosigning a note. */
  readonly additional?: ReadonlyArray<{ label: string; permission: string }>;
  /** Offline entity types that can write this record, or an empty list when it is online-only. */
  readonly syncEntityTypes: readonly EntityType[];
  /** Anything the permission table alone does not capture. */
  readonly note?: string;
}

export const CLINICAL_RECORD_SURFACES: readonly ClinicalRecordSurface[] = [
  {
    id: 'medical-history',
    label: 'Medical history and allergies',
    read: PERMISSIONS.MEDICAL_HISTORY_READ,
    write: PERMISSIONS.MEDICAL_HISTORY_WRITE,
    syncEntityTypes: ['medical_history_revision'],
    note: 'Append-only. Revisions carry the expected current revision so a stale offline edit conflicts instead of overwriting.',
  },
  {
    id: 'vitals',
    label: 'Encounter vitals',
    read: PERMISSIONS.ENCOUNTER_READ,
    write: PERMISSIONS.SCREENING_WRITE,
    syncEntityTypes: ['vitals', 'encounter_vitals_bundle'],
    note: 'No HTTP write route exists; vitals are written only through offline sync.',
  },
  {
    id: 'tobacco',
    label: 'Tobacco screening',
    read: PERMISSIONS.ENCOUNTER_READ,
    write: PERMISSIONS.SCREENING_WRITE,
    syncEntityTypes: ['encounter_vitals_bundle'],
    note: 'Captured alongside vitals in the same bundle.',
  },
  {
    id: 'diabetes',
    label: 'Diabetes screening',
    read: PERMISSIONS.SCREENING_READ,
    write: PERMISSIONS.SCREENING_WRITE,
    syncEntityTypes: ['diabetes_screening'],
  },
  {
    id: 'medication-reconciliation',
    label: 'Medication reconciliation and pharmacy history',
    read: PERMISSIONS.MEDICATION_RECONCILIATION_READ,
    write: PERMISSIONS.MEDICATION_RECONCILIATION_WRITE,
    syncEntityTypes: [
      'patient_medication_revision',
      'medication_reconciliation',
      'patient_pharmacy_revision',
      'patient_pharmacy_preference',
    ],
    note: 'Prescription history within this module requires PRESCRIPTION.READ, which a volunteer does not hold.',
  },
  {
    id: 'clinical-notes',
    label: 'HAP clinical notes',
    read: PERMISSIONS.CLINICAL_NOTE_READ,
    write: PERMISSIONS.CLINICAL_NOTE_WRITE,
    additional: [
      { label: 'Cosign', permission: PERMISSIONS.CLINICAL_NOTE_COSIGN },
      { label: 'Addendum', permission: PERMISSIONS.CLINICAL_NOTE_ADDENDUM },
      { label: 'Status only', permission: PERMISSIONS.CLINICAL_NOTE_STATUS_READ },
    ],
    syncEntityTypes: [],
    note: 'Online-only and never queued. A system administrator must separately hold a doctor or volunteer seat at the clinic to read content.',
  },
  {
    id: 'residential-location',
    label: 'Patient residential location',
    read: PERMISSIONS.PATIENT_READ,
    write: PERMISSIONS.PATIENT_UPDATE,
    syncEntityTypes: ['patient'],
    note: 'Registering a patient requires PATIENT.CREATE; editing an existing chart requires PATIENT.UPDATE.',
  },
  {
    id: 'patient-chart',
    label: 'Patient chart summary and history',
    read: PERMISSIONS.PATIENT_READ,
    write: PERMISSIONS.PATIENT_UPDATE,
    syncEntityTypes: [],
    note: 'Read-only. Each tab is additionally gated by the permission of the record it shows.',
  },
];

/** Roles that can hold a clinic seat, in the order the documentation lists them. */
export const MATRIX_ROLES: readonly UserRole[] = [
  UserRole.SYSTEM_ADMIN,
  UserRole.DIRECTOR,
  UserRole.MANAGER,
  UserRole.DOCTOR,
  UserRole.VOLUNTEER,
  UserRole.PATIENT,
];

export function roleHolds(role: UserRole, permission: string): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return granted.includes('*') || granted.includes(permission);
}
