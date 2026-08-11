export interface SyncPullResponseDto {
  cursor: string;
  patients: Array<Record<string, unknown>>;
  encounters: Array<Record<string, unknown>>;
  vitals: Array<Record<string, unknown>>;
  tobaccoScreenings: Array<Record<string, unknown>>;
  diabetesScreenings: Array<Record<string, unknown>>;
  hypertensionAssessments: Array<Record<string, unknown>>;
  carePlans: Array<Record<string, unknown>>;
  patientConsents: Array<Record<string, unknown>>;
  prescriptions: Array<Record<string, unknown>>;
  medicalHistoryRecords: Array<Record<string, unknown>>;
  medicalHistoryRevisions: Array<Record<string, unknown>>;
  patientMedicationRecords: Array<Record<string, unknown>>;
  patientMedicationRevisions: Array<Record<string, unknown>>;
  medicationReconciliationEvents: Array<Record<string, unknown>>;
  patientPharmacyRecords: Array<Record<string, unknown>>;
  patientPharmacyRevisions: Array<Record<string, unknown>>;
  patientPharmacyPreferences: Array<Record<string, unknown>>;
}
