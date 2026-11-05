/**
 * The units a clinic records screening measurements in.
 *
 * Storage never changes: glucose is whole mg/dL, weight kg, height cm, HbA1c NGSP %. A clinic's
 * units apply only where a person types or reads a value, so every threshold (glucose suspicion,
 * BMI, BP), every export and every queued offline payload keeps one meaning. A value is converted
 * to the stored unit before it is saved or queued, never after.
 *
 * Precision is chosen so a value typed in a clinic unit comes back exactly as typed:
 * - mmol/L to 1 dp -> whole mg/dL loses at most 0.5 mg/dL = 0.028 mmol/L, under half of 0.1.
 * - lb to 1 dp -> kg to 2 dp loses at most 0.005 kg = 0.011 lb.
 * - inches to 1 dp -> cm to 2 dp loses at most 0.005 cm = 0.002 in.
 * - whole mmol/mol -> % to 2 dp loses at most 0.005 % = 0.055 mmol/mol.
 * The API already accepts 2 dp for weight, height and HbA1c.
 */
import { roundClinicalValue } from './clinical-measurements';

export const GLUCOSE_UNITS = ['MG_DL', 'MMOL_L'] as const;
export type GlucoseUnit = (typeof GLUCOSE_UNITS)[number];
export const BODY_MEASURE_UNITS = ['METRIC', 'US'] as const;
export type BodyMeasureUnit = (typeof BODY_MEASURE_UNITS)[number];
export const HBA1C_UNITS = ['PERCENT', 'MMOL_MOL'] as const;
export type Hba1cUnit = (typeof HBA1C_UNITS)[number];

export interface ClinicUnits {
  glucoseUnit: GlucoseUnit;
  bodyUnit: BodyMeasureUnit;
  hba1cUnit: Hba1cUnit;
}

/** The stored units. Also the fallback when a clinic's units are not known yet. */
export const STORED_UNITS: ClinicUnits = {
  glucoseUnit: 'MG_DL',
  bodyUnit: 'METRIC',
  hba1cUnit: 'PERCENT',
};

export const GLUCOSE_UNIT_LABELS: Record<GlucoseUnit, string> = {
  MG_DL: 'mg/dL',
  MMOL_L: 'mmol/L',
};
export const BODY_MEASURE_UNIT_LABELS: Record<BodyMeasureUnit, string> = {
  METRIC: 'Metric (kg, cm)',
  US: 'US (lb, ft and in)',
};
export const HBA1C_UNIT_LABELS: Record<Hba1cUnit, string> = {
  PERCENT: '%',
  MMOL_MOL: 'mmol/mol',
};

/**
 * Countries whose glucose meters and guidelines use mg/dL; everywhere else defaults to mmol/L.
 * shortcut: a starting list, not a survey. A manager can change any clinic's units.
 */
export const MG_DL_COUNTRY_CODES = ['US', 'IN', 'JP', 'FR', 'IL', 'EG', 'BR', 'MX'] as const;
export const US_BODY_COUNTRY_CODES = ['US', 'LR', 'MM'] as const;

/**
 * Units a new clinic in this country starts with. HbA1c defaults to % everywhere: mmol/mol is a
 * lab reporting choice a manager makes, not something the country implies.
 */
export function defaultUnitsForCountry(countryCode: string | null | undefined): ClinicUnits {
  const code = (countryCode ?? '').trim().toUpperCase();
  return {
    glucoseUnit: (MG_DL_COUNTRY_CODES as readonly string[]).includes(code) ? 'MG_DL' : 'MMOL_L',
    bodyUnit: (US_BODY_COUNTRY_CODES as readonly string[]).includes(code) ? 'US' : 'METRIC',
    hba1cUnit: 'PERCENT',
  };
}

export function isGlucoseUnit(value: unknown): value is GlucoseUnit {
  return typeof value === 'string' && (GLUCOSE_UNITS as readonly string[]).includes(value);
}
export function isBodyMeasureUnit(value: unknown): value is BodyMeasureUnit {
  return typeof value === 'string' && (BODY_MEASURE_UNITS as readonly string[]).includes(value);
}
export function isHba1cUnit(value: unknown): value is Hba1cUnit {
  return typeof value === 'string' && (HBA1C_UNITS as readonly string[]).includes(value);
}

/** Any object with some unit fields, as whoami or an older cached bootstrap may send it. */
export function resolveClinicUnits(
  source: Partial<Record<keyof ClinicUnits, unknown>> | null | undefined,
): ClinicUnits {
  const { glucoseUnit, bodyUnit, hba1cUnit } = source ?? {};
  return {
    glucoseUnit: isGlucoseUnit(glucoseUnit) ? glucoseUnit : STORED_UNITS.glucoseUnit,
    bodyUnit: isBodyMeasureUnit(bodyUnit) ? bodyUnit : STORED_UNITS.bodyUnit,
    hba1cUnit: isHba1cUnit(hba1cUnit) ? hba1cUnit : STORED_UNITS.hba1cUnit,
  };
}

/**
 * The stored value to save for a field a form showed in a clinic unit.
 *
 * Display rounding is lossy in that direction: 127 mg/dL shows as 7.1 mmol/L, and 7.1 converts to
 * 128. So when the person left the shown value as it was, the stored value is kept as it was, and
 * only an edited value is converted.
 */
export function storedValueForEntry(
  entered: number,
  previousStored: number | null | undefined,
  fromStored: (stored: number) => number,
  toStored: (entered: number) => number,
): number {
  if (
    previousStored != null &&
    Number.isFinite(previousStored) &&
    fromStored(previousStored) === entered
  ) {
    return previousStored;
  }
  return toStored(entered);
}

// ---- Glucose ------------------------------------------------------------------------------

/**
 * 18 (glucose 180.16 g/mol, rounded) is the clinical convention, and the factor the screening-sheet
 * import already used for the 2026-10 data. It maps the WHO lines exactly: 7.0 -> 126,
 * 11.1 -> 200, 3.9 -> 70.
 */
export const MG_DL_PER_MMOL_L = 18;

/** Entry bounds in each unit. mmol/L tops out where it still converts inside 0-600 mg/dL. */
export const GLUCOSE_ENTRY_RANGE: Record<GlucoseUnit, { min: number; max: number; step: number }> =
  {
    MG_DL: { min: 0, max: 600, step: 1 },
    MMOL_L: { min: 0, max: 33.3, step: 0.1 },
  };

/** A typed reading to stored whole mg/dL. */
export function glucoseToMgDl(value: number, unit: GlucoseUnit): number {
  return Math.round(unit === 'MMOL_L' ? value * MG_DL_PER_MMOL_L : value);
}

/** Stored mg/dL to the clinic unit: mmol/L to 1 dp, mg/dL unchanged. */
export function glucoseFromMgDl(mgDl: number, unit: GlucoseUnit): number {
  return unit === 'MMOL_L' ? roundClinicalValue(mgDl / MG_DL_PER_MMOL_L, 1) : mgDl;
}

/** Whether a typed value is a valid entry in this unit (whole mg/dL, or mmol/L to 1 dp). */
export function isValidGlucoseEntry(value: number, unit: GlucoseUnit): boolean {
  const { min, max } = GLUCOSE_ENTRY_RANGE[unit];
  if (!Number.isFinite(value) || value < min || value > max) return false;
  return unit === 'MG_DL'
    ? Number.isInteger(value)
    : Math.abs(roundClinicalValue(value, 1) - value) < 1e-9;
}

export function formatGlucose(mgDl: number | null | undefined, unit: GlucoseUnit): string | null {
  if (mgDl == null || !Number.isFinite(mgDl)) return null;
  const value = glucoseFromMgDl(mgDl, unit);
  return `${unit === 'MMOL_L' ? value.toFixed(1) : value} ${GLUCOSE_UNIT_LABELS[unit]}`;
}

// ---- Weight and height ----------------------------------------------------------------------

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

export function weightToKg(value: number, unit: BodyMeasureUnit): number {
  return roundClinicalValue(unit === 'US' ? value * KG_PER_LB : value, 2);
}

/** Stored kg to the clinic unit, 1 dp. */
export function weightFromKg(kg: number, unit: BodyMeasureUnit): number {
  return roundClinicalValue(unit === 'US' ? kg / KG_PER_LB : kg, 1);
}

export function formatWeight(kg: number | null | undefined, unit: BodyMeasureUnit): string | null {
  if (kg == null || !Number.isFinite(kg)) return null;
  return `${weightFromKg(kg, unit)} ${unit === 'US' ? 'lb' : 'kg'}`;
}

/** Feet and inches to stored cm. Either part may be zero; inches may carry 1 dp. */
export function feetInchesToCm(feet: number, inches: number): number {
  return roundClinicalValue((feet * 12 + inches) * CM_PER_INCH, 2);
}

/** Stored cm to whole feet and inches to 1 dp, carrying 12.0 in up to the next foot. */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = roundClinicalValue(cm / CM_PER_INCH, 1);
  const feet = Math.floor((totalInches + 1e-9) / 12);
  return { feet, inches: roundClinicalValue(totalInches - feet * 12, 1) };
}

export function formatHeight(cm: number | null | undefined, unit: BodyMeasureUnit): string | null {
  if (cm == null || !Number.isFinite(cm)) return null;
  if (unit === 'METRIC') return `${roundClinicalValue(cm, 1)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet} ft ${inches} in`;
}

// ---- HbA1c ----------------------------------------------------------------------------------

/** The IFCC-NGSP master equation: mmol/mol = 10.929 x (% - 2.15). */
export const IFCC_SLOPE = 10.929;
export const IFCC_NGSP_OFFSET = 2.15;

/** Entry bounds in each unit. 0-200 mmol/mol is 2.15-20.45 %. */
export const HBA1C_ENTRY_RANGE: Record<Hba1cUnit, { min: number; max: number; step: number }> = {
  PERCENT: { min: 0, max: 100, step: 0.1 },
  MMOL_MOL: { min: 0, max: 200, step: 1 },
};

export function hba1cToPercent(value: number, unit: Hba1cUnit): number {
  return roundClinicalValue(unit === 'MMOL_MOL' ? value / IFCC_SLOPE + IFCC_NGSP_OFFSET : value, 2);
}

/** Stored % to the clinic unit: whole mmol/mol, or % unchanged. */
export function hba1cFromPercent(percent: number, unit: Hba1cUnit): number {
  return unit === 'MMOL_MOL' ? Math.round((percent - IFCC_NGSP_OFFSET) * IFCC_SLOPE) : percent;
}

export function formatHba1c(percent: number | null | undefined, unit: Hba1cUnit): string | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  return unit === 'MMOL_MOL' ? `${hba1cFromPercent(percent, unit)} mmol/mol` : `${percent}%`;
}
