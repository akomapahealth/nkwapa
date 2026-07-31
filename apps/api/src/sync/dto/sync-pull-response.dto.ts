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
} from '@prisma/client';

export interface SyncPullResponseDto {
  cursor: string;
  patients: Patient[];
  encounters: Encounter[];
  vitals: Vitals[];
  diabetesScreenings: DiabetesScreening[];
  hypertensionAssessments: HypertensionAssessment[];
  carePlans: CarePlan[];
  patientConsents: PatientConsent[];
  prescriptions: Prescription[];
  medicalHistoryRecords: MedicalHistoryRecord[];
  medicalHistoryRevisions: MedicalHistoryRevision[];
}
