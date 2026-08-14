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
