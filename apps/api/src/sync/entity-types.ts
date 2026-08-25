/**
 * Entity types the offline outbox may replay.
 *
 * Kept in its own module so the permission table and the request DTO can both depend on it without
 * importing `SyncService`, which would be a cycle.
 *
 * Clinical notes are deliberately absent: HAP note content is server-only and is never queued,
 * cached, or replayed. See docs/specs/10_CLINICAL_NOTES.md.
 */
export type EntityType =
  | 'patient'
  | 'encounter'
  | 'vitals'
  | 'encounter_vitals_bundle'
  | 'diabetes_screening'
  | 'hypertension_assessment'
  | 'care_plan'
  | 'patient_consent'
  | 'prescription'
  | 'medical_history_revision'
  | 'patient_medication_revision'
  | 'medication_reconciliation'
  | 'patient_pharmacy_revision'
  | 'patient_pharmacy_preference';
