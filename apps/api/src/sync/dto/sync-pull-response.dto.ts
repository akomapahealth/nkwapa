import {
  Encounter,
  Vitals,
  DiabetesScreening,
  HypertensionAssessment,
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
import type { SyncPatientProjection } from '../sync-projection';

export type SyncVitalsRecord = Vitals & {
  /** @deprecated Compatibility alias for pulseBpm. */
  heartRate: number | null;
};

export interface SyncPullResponseDto {
  cursor: string;
  /**
   * Narrowed to the fields the offline client actually uses; see SYNC_PATIENT_SELECT. Typing this
   * as the whole Prisma row is what let every new column reach the browser automatically.
   */
  patients: SyncPatientProjection[];
  encounters: Encounter[];
  vitals: SyncVitalsRecord[];
  tobaccoScreenings: TobaccoScreening[];
  diabetesScreenings: DiabetesScreening[];
  hypertensionAssessments: HypertensionAssessment[];
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
