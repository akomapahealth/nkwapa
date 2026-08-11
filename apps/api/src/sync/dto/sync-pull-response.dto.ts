import {
  Patient,
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

export type SyncVitalsRecord = Vitals & {
  /** @deprecated Compatibility alias for pulseBpm. */
  heartRate: number | null;
};

export interface SyncPullResponseDto {
  cursor: string;
  patients: Patient[];
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
