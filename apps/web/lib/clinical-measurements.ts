import { computeBmi, toCelsius, type TemperatureUnit } from '@nkwapa/db/clinical-measurements';
import { db, type TobaccoScreeningRecord, type VitalsRecord } from './db';
import { buildOutboxMutation, SYNC_OPERATION } from './outbox';

export const BP_SITES = ['LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'OTHER'] as const;
export const PATIENT_POSITIONS = ['SITTING', 'STANDING', 'SUPINE', 'OTHER'] as const;
export const CUFF_SIZES = [
  'INFANT',
  'CHILD',
  'SMALL_ADULT',
  'ADULT',
  'LARGE_ADULT',
  'THIGH',
  'OTHER',
] as const;
export const TEMPERATURE_SOURCES = [
  'ORAL',
  'AXILLARY',
  'TYMPANIC',
  'TEMPORAL',
  'RECTAL',
  'OTHER',
] as const;
export const TOBACCO_USE_STATUSES = ['NOT_ASSESSED', 'NEVER', 'FORMER', 'CURRENT'] as const;
export const SCREENING_ANSWERS = ['NOT_ASSESSED', 'NO', 'YES'] as const;
export const READINESS_OPTIONS = [
  'NOT_ASSESSED',
  'NOT_READY',
  'CONSIDERING',
  'READY',
  'NOT_APPLICABLE',
] as const;

export type VitalsFormValues = {
  systolicBp: string;
  diastolicBp: string;
  bpSite: string;
  bpSiteOther: string;
  patientPosition: string;
  patientPositionOther: string;
  cuffSize: string;
  cuffSizeOther: string;
  pulseBpm: string;
  temperatureValue: string;
  temperatureUnit: TemperatureUnit;
  temperatureSource: string;
  temperatureSourceOther: string;
  respiratoryRate: string;
  spo2Percent: string;
  weightKg: string;
  heightCm: string;
  notes: string;
};

export type TobaccoFormValues = {
  smokingStatus: string;
  smokelessTobaccoStatus: string;
  passiveExposure: string;
  readinessToQuit: string;
  counselingGiven: string;
};

export type ClinicalFieldErrors = Record<string, string>;

export function generateClinicalId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validateRange(
  errors: ClinicalFieldErrors,
  field: string,
  value: number | null,
  min: number,
  max: number,
  label: string,
) {
  if (value != null && (!Number.isFinite(value) || value < min || value > max)) {
    errors[field] = `${label} must be between ${min} and ${max}.`;
  }
}

function validateOther(
  errors: ClinicalFieldErrors,
  field: string,
  selected: string,
  detail: string,
) {
  if (selected === 'OTHER' && !detail.trim()) errors[field] = 'Add a short description for Other.';
  if (selected !== 'OTHER' && detail.trim()) errors[field] = 'Select Other before adding detail.';
}

export function validateClinicalMeasurements(
  vitals: VitalsFormValues,
  _tobacco: TobaccoFormValues,
): ClinicalFieldErrors {
  const errors: ClinicalFieldErrors = {};
  const systolicBp = optionalNumber(vitals.systolicBp);
  const diastolicBp = optionalNumber(vitals.diastolicBp);
  const hasSystolic = systolicBp != null;
  const hasDiastolic = diastolicBp != null;
  if (hasSystolic !== hasDiastolic) {
    errors.systolicBp = 'Enter systolic and diastolic blood pressure together.';
    errors.diastolicBp = 'Enter systolic and diastolic blood pressure together.';
  }
  validateRange(errors, 'systolicBp', systolicBp, 40, 300, 'Systolic BP');
  validateRange(errors, 'diastolicBp', diastolicBp, 20, 200, 'Diastolic BP');
  if (systolicBp != null && diastolicBp != null && systolicBp <= diastolicBp) {
    errors.systolicBp = 'Systolic BP must be greater than diastolic BP.';
  }
  if (hasSystolic && !vitals.bpSite) errors.bpSite = 'Select the blood pressure site.';
  if (!hasSystolic && (vitals.bpSite || vitals.patientPosition || vitals.cuffSize)) {
    errors.bpSite = 'Blood pressure context requires a blood pressure reading.';
  }
  validateOther(errors, 'bpSiteOther', vitals.bpSite, vitals.bpSiteOther);
  validateOther(
    errors,
    'patientPositionOther',
    vitals.patientPosition,
    vitals.patientPositionOther,
  );
  validateOther(errors, 'cuffSizeOther', vitals.cuffSize, vitals.cuffSizeOther);

  validateRange(errors, 'pulseBpm', optionalNumber(vitals.pulseBpm), 20, 300, 'Pulse');
  validateRange(
    errors,
    'respiratoryRate',
    optionalNumber(vitals.respiratoryRate),
    1,
    100,
    'Respiratory rate',
  );
  validateRange(errors, 'spo2Percent', optionalNumber(vitals.spo2Percent), 1, 100, 'SpO₂');
  validateRange(errors, 'weightKg', optionalNumber(vitals.weightKg), 0.1, 700, 'Weight');
  validateRange(errors, 'heightCm', optionalNumber(vitals.heightCm), 20, 300, 'Height');

  const temperatureValue = optionalNumber(vitals.temperatureValue);
  if (temperatureValue != null) {
    if (!Number.isFinite(temperatureValue)) errors.temperatureValue = 'Enter a valid temperature.';
    if (!vitals.temperatureSource) errors.temperatureSource = 'Select the temperature source.';
    const canonical = Number.isFinite(temperatureValue)
      ? toCelsius(temperatureValue, vitals.temperatureUnit)
      : null;
    if (canonical != null && (canonical < 25 || canonical > 45)) {
      errors.temperatureValue = 'Temperature must convert to a value between 25 and 45 °C.';
    }
  } else if (vitals.temperatureSource) {
    errors.temperatureValue = 'Enter a temperature for the selected source.';
  }
  validateOther(
    errors,
    'temperatureSourceOther',
    vitals.temperatureSource,
    vitals.temperatureSourceOther,
  );
  if (vitals.notes.length > 2000) errors.notes = 'Notes cannot exceed 2,000 characters.';
  return errors;
}

export function derivedBmi(vitals: Pick<VitalsFormValues, 'weightKg' | 'heightCm'>): number | null {
  return computeBmi(optionalNumber(vitals.weightKg), optionalNumber(vitals.heightCm));
}

export async function saveClinicalMeasurementsOffline(params: {
  clinicId: string;
  encounterId: string;
  vitalsId: string;
  tobaccoScreeningId: string;
  vitals: VitalsFormValues;
  tobacco: TobaccoFormValues;
  markTobaccoReviewed?: boolean;
  existingVitals?: VitalsRecord | null;
  existingTobacco?: TobaccoScreeningRecord | null;
}) {
  const errors = validateClinicalMeasurements(params.vitals, params.tobacco);
  if (Object.keys(errors).length) return { errors };

  const now = new Date().toISOString();
  const temperatureValue = optionalNumber(params.vitals.temperatureValue);
  const temperatureCelsius =
    temperatureValue == null
      ? undefined
      : toCelsius(temperatureValue, params.vitals.temperatureUnit);
  const tobaccoChanged =
    !params.existingTobacco ||
    params.existingTobacco.smokingStatus !== params.tobacco.smokingStatus ||
    params.existingTobacco.smokelessTobaccoStatus !== params.tobacco.smokelessTobaccoStatus ||
    params.existingTobacco.passiveExposure !== params.tobacco.passiveExposure ||
    params.existingTobacco.readinessToQuit !== params.tobacco.readinessToQuit ||
    params.existingTobacco.counselingGiven !== params.tobacco.counselingGiven;

  const vitalsRecord: VitalsRecord = {
    id: params.vitalsId,
    clinicId: params.clinicId,
    encounterId: params.encounterId,
    systolicBp: optionalNumber(params.vitals.systolicBp) ?? undefined,
    diastolicBp: optionalNumber(params.vitals.diastolicBp) ?? undefined,
    bpSite: params.vitals.bpSite || undefined,
    bpSiteOther: params.vitals.bpSiteOther.trim() || undefined,
    patientPosition: params.vitals.patientPosition || undefined,
    patientPositionOther: params.vitals.patientPositionOther.trim() || undefined,
    cuffSize: params.vitals.cuffSize || undefined,
    cuffSizeOther: params.vitals.cuffSizeOther.trim() || undefined,
    pulseBpm: optionalNumber(params.vitals.pulseBpm) ?? undefined,
    temperatureCelsius,
    temperatureSource: params.vitals.temperatureSource || undefined,
    temperatureSourceOther: params.vitals.temperatureSourceOther.trim() || undefined,
    respiratoryRate: optionalNumber(params.vitals.respiratoryRate) ?? undefined,
    spo2Percent: optionalNumber(params.vitals.spo2Percent) ?? undefined,
    weightKg: optionalNumber(params.vitals.weightKg) ?? undefined,
    heightCm: optionalNumber(params.vitals.heightCm) ?? undefined,
    bmi: derivedBmi(params.vitals) ?? undefined,
    notes: params.vitals.notes.trim() || undefined,
    createdAt: params.existingVitals?.createdAt ?? now,
    updatedAt: now,
  };
  const tobaccoRecord: TobaccoScreeningRecord = {
    id: params.tobaccoScreeningId,
    clinicId: params.clinicId,
    encounterId: params.encounterId,
    ...params.tobacco,
    reviewedByUserId:
      !params.markTobaccoReviewed && !tobaccoChanged
        ? params.existingTobacco?.reviewedByUserId
        : undefined,
    reviewedAt:
      !params.markTobaccoReviewed && !tobaccoChanged
        ? params.existingTobacco?.reviewedAt
        : undefined,
    reviewPending: params.markTobaccoReviewed === true,
    createdAt: params.existingTobacco?.createdAt ?? now,
    updatedAt: now,
  };
  const outbox = buildOutboxMutation({
    clinicId: params.clinicId,
    entityType: 'encounter_vitals_bundle',
    entityId: params.vitalsId,
    operation: SYNC_OPERATION.UPSERT,
    payloadJson: {
      schemaVersion: 1,
      encounterId: params.encounterId,
      vitalsId: params.vitalsId,
      tobaccoScreeningId: params.tobaccoScreeningId,
      vitals: {
        systolicBp: optionalNumber(params.vitals.systolicBp),
        diastolicBp: optionalNumber(params.vitals.diastolicBp),
        bpSite: params.vitals.bpSite || null,
        bpSiteOther: params.vitals.bpSiteOther.trim() || null,
        patientPosition: params.vitals.patientPosition || null,
        patientPositionOther: params.vitals.patientPositionOther.trim() || null,
        cuffSize: params.vitals.cuffSize || null,
        cuffSizeOther: params.vitals.cuffSizeOther.trim() || null,
        pulseBpm: optionalNumber(params.vitals.pulseBpm),
        temperatureValue,
        temperatureUnit: params.vitals.temperatureUnit,
        temperatureSource: params.vitals.temperatureSource || null,
        temperatureSourceOther: params.vitals.temperatureSourceOther.trim() || null,
        respiratoryRate: optionalNumber(params.vitals.respiratoryRate),
        spo2Percent: optionalNumber(params.vitals.spo2Percent),
        weightKg: optionalNumber(params.vitals.weightKg),
        heightCm: optionalNumber(params.vitals.heightCm),
        notes: params.vitals.notes.trim() || null,
      },
      tobacco: params.tobacco,
      markTobaccoReviewed: params.markTobaccoReviewed === true,
    },
  });

  await db.transaction('rw', db.vitals, db.tobacco_screenings, db.outbox, async () => {
    await db.vitals.put(vitalsRecord);
    await db.tobacco_screenings.put(tobaccoRecord);
    await db.outbox.add(outbox);
  });
  return { errors: {}, vitalsRecord, tobaccoRecord, outbox };
}
