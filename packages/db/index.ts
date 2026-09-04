// packages/db/index.ts
export { PrismaClient } from '@prisma/client';
export {
  encryptNationalId,
  decryptNationalId,
  hashNationalId,
  nationalIdLast4,
  hasEncryptionKey,
} from './src/national-id';
export { generatePatientCode } from './src/patient-code';
export { normalizePhoneToE164 } from './src/phone';
export {
  computeBmi,
  roundClinicalValue,
  toCelsius,
  type TemperatureUnit,
} from './src/clinical-measurements';
export {
  DIABETES_GLUCOSE_TYPES,
  DIABETES_SYMPTOMS,
  DIABETES_SYMPTOM_LABELS,
  DIABETES_GLUCOSE_MIN_MG_DL,
  DIABETES_GLUCOSE_MAX_MG_DL,
  DIABETES_HBA1C_MIN_PERCENT,
  DIABETES_HBA1C_MAX_PERCENT,
  parseLegacyDiabetesSymptoms,
  serializeLegacyDiabetesSymptoms,
  type DiabetesGlucoseType,
  type DiabetesSymptom,
  type ParsedLegacyDiabetesSymptoms,
} from './src/diabetes-screening';
export {
  CLINICAL_NOTE_SECTION_MAX_LENGTH,
  CLINICAL_NOTE_ADDENDUM_REASON_MAX_LENGTH,
  CLINICAL_NOTE_ADDENDUM_CONTENT_MAX_LENGTH,
  CLINICAL_NOTE_STATUS,
  type ClinicalNoteStatusValue,
} from './src/clinical-notes';
export {
  GHANA_REGIONS,
  GHANA_REGION_LABELS,
  GHANA_DISTRICTS_BY_REGION,
  PATIENT_LOCATION_STATUS_LABELS,
  isGhanaRegion,
  isDistrictInRegion,
  normalizeDistrict,
} from './src/ghana-locations';
export {
  DUPLICATE_CONFIDENCE_LEVELS,
  DUPLICATE_CONFIDENCE_THRESHOLDS,
  DUPLICATE_MATCH_REASONS,
  DUPLICATE_MATCH_REASON_LABELS,
  DUPLICATE_MATCH_WEIGHTS,
  DUPLICATE_NAME_EDIT_DISTANCE,
  duplicatePairKey,
  editDistanceWithin,
  evaluateDuplicatePair,
  normalizeEmailForMatch,
  normalizeNameForMatch,
  parseDuplicatePairKey,
  sameCalendarDay,
  scoreToConfidence,
  type DuplicateCandidateInput,
  type DuplicateConfidence,
  type DuplicateMatchReason,
  type DuplicatePairEvaluation,
} from './src/patient-duplicates';
export {
  PATIENT_CHART_SECTION_IDS,
  PATIENT_CHART_SECTIONS,
  canAccessPatientChartSection,
  getPatientChartSection,
  isPatientChartSectionId,
  resolveAccessiblePatientChartSections,
  resolvePatientChartSectionId,
  type PatientChartAccessInput,
  type PatientChartFeatureFlag,
  type PatientChartSection,
  type PatientChartSectionId,
} from './src/patient-chart-sections';
export {
  TENANT_ORGANIZATIONS,
  TENANT_CLINICS,
  TENANT_CLINICAL_ROLES,
  TENANT_CROSS_CLINIC_USERS,
  TENANT_SYSTEM_ADMIN,
  TENANT_USERS,
  TENANT_PATIENTS,
  tenantUser,
  tenantFixtureSql,
  type TenantFixtureRole,
  type TenantFixtureOrganization,
  type TenantFixtureClinic,
  type TenantFixtureRoleGrant,
  type TenantFixtureUser,
  type TenantFixturePatient,
} from './src/testing/tenant-fixture';
export {
  confirmedVisitStart,
  terminalVisitStart,
  weekStartUtc,
  isInVisibleWeek,
} from './src/appointment-fixture-window';
