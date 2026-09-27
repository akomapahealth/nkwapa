import {
  Encounter,
  Vitals,
  CarePlan,
  PatientConsent,
  Prescription,
  MedicalHistoryRecord,
  MedicalHistoryRevision,
  TobaccoScreening,
  PatientMedicationRecord,
  PatientMedicationRevision,
  MedicationReconciliationEvent,
  PatientPharmacyRecord,
  PatientPharmacyRevision,
  PatientPharmacyPreference,
} from '@prisma/client';
import type {
  SyncDiabetesScreeningProjection,
  SyncEncounterMedicationAdherenceProjection,
  SyncHypertensionAssessmentProjection,
  SyncPatientProjection,
} from '../sync-projection';

export type SyncVitalsRecord = Vitals & {
  /** @deprecated Compatibility alias for pulseBpm. */
  heartRate: number | null;
};

/** A chart a merge retired, and the chart that survived it. */
export interface SyncMergedPatientRecord {
  id: string;
  mergedIntoPatientId: string;
}

export interface SyncPullResponseDto {
  cursor: string;
  /**
   * Narrowed to the fields the offline client actually uses; see SYNC_PATIENT_SELECT. Typing this
   * as the whole Prisma row is what let every new column reach the browser automatically.
   */
  patients: SyncPatientProjection[];
  /**
   * Charts retired by a merge since the cursor. `patients` excludes them, so without this a device
   * kept its copy of a merged chart indefinitely and went on queueing changes against it.
   */
  mergedPatients: SyncMergedPatientRecord[];
  encounters: Encounter[];
  vitals: SyncVitalsRecord[];
  tobaccoScreenings: TobaccoScreening[];
  diabetesScreenings: SyncDiabetesScreeningProjection[];
  hypertensionAssessments: SyncHypertensionAssessmentProjection[];
  medicationAdherence: SyncEncounterMedicationAdherenceProjection[];
  carePlans: CarePlan[];
  patientConsents: PatientConsent[];
  prescriptions: Prescription[];
  medicalHistoryRecords: MedicalHistoryRecord[];
  medicalHistoryRevisions: MedicalHistoryRevision[];
  patientMedicationRecords: PatientMedicationRecord[];
  patientMedicationRevisions: PatientMedicationRevision[];
  medicationReconciliationEvents: MedicationReconciliationEvent[];
  patientPharmacyRecords: PatientPharmacyRecord[];
  patientPharmacyRevisions: PatientPharmacyRevision[];
  patientPharmacyPreferences: PatientPharmacyPreference[];
}
