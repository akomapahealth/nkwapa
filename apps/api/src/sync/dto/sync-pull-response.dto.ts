import {
  Patient,
  Encounter,
  Vitals,
  DiabetesScreening,
  HypertensionAssessment,
  CarePlan,
  PatientConsent,
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
}
