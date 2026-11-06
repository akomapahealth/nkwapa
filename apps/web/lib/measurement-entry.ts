/**
 * Form text in a clinic's units, to and from the stored values.
 *
 * Every screening form keeps what the person typed as text in the unit on screen, and converts it
 * only when it validates or saves. Conversion itself lives in `@nkwapa/db/measurement-units`; this
 * adds parsing, the error each field shows, and the rule that an unedited value is saved exactly
 * as it was stored (see `storedValueForEntry`).
 */
import {
  GLUCOSE_ENTRY_RANGE,
  GLUCOSE_UNIT_LABELS,
  HBA1C_ENTRY_RANGE,
  HBA1C_UNIT_LABELS,
  cmToFeetInches,
  feetInchesToCm,
  glucoseFromMgDl,
  glucoseToMgDl,
  hba1cFromPercent,
  hba1cToPercent,
  isValidGlucoseEntry,
  storedValueForEntry,
  weightFromKg,
  weightToKg,
  type BodyMeasureUnit,
  type GlucoseUnit,
  type Hba1cUnit,
} from '@nkwapa/db/measurement-units';

/** `null` for an empty field, `NaN` for text that is not a plain decimal number. */
export function parseEntry(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return Number.NaN;
  return Number.parseFloat(trimmed);
}

const asText = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '' : String(value);

// ---- Glucose ------------------------------------------------------------------------------

export function glucoseEntryError(text: string, unit: GlucoseUnit): string | null {
  const value = parseEntry(text);
  if (value === null || isValidGlucoseEntry(value, unit)) return null;
  const { min, max } = GLUCOSE_ENTRY_RANGE[unit];
  return unit === 'MMOL_L'
    ? `Enter a reading from ${min} to ${max} mmol/L, to one decimal place.`
    : `Enter a whole number from ${min} to ${max} mg/dL.`;
}

/** The whole mg/dL to store, or null when the field is empty or invalid. */
export function glucoseTextToMgDl(
  text: string,
  unit: GlucoseUnit,
  previousMgDl?: number | null,
): number | null {
  const value = parseEntry(text);
  if (value === null || !isValidGlucoseEntry(value, unit)) return null;
  return storedValueForEntry(
    value,
    previousMgDl,
    (mgDl) => glucoseFromMgDl(mgDl, unit),
    (entered) => glucoseToMgDl(entered, unit),
  );
}

export function mgDlToGlucoseText(mgDl: number | null | undefined, unit: GlucoseUnit): string {
  return mgDl == null ? '' : asText(glucoseFromMgDl(mgDl, unit));
}

/**
 * The same reading shown in another unit, for a per-entry unit switch. Text that is not a valid
 * reading yet is left as typed: there is nothing to convert, and clearing it would lose input.
 */
export function convertGlucoseText(
  text: string,
  from: GlucoseUnit,
  to: GlucoseUnit,
  previousMgDl?: number | null,
): string {
  if (from === to) return text;
  const mgDl = glucoseTextToMgDl(text, from, previousMgDl);
  return mgDl === null ? text : mgDlToGlucoseText(mgDl, to);
}

export const glucoseUnitLabel = (unit: GlucoseUnit) => GLUCOSE_UNIT_LABELS[unit];

// ---- HbA1c --------------------------------------------------------------------------------

export function hba1cEntryError(text: string, unit: Hba1cUnit): string | null {
  const value = parseEntry(text);
  if (value === null) return null;
  const { min, max } = HBA1C_ENTRY_RANGE[unit];
  const whole = unit === 'MMOL_MOL';
  if (Number.isNaN(value) || value < min || value > max || (whole && !Number.isInteger(value))) {
    return whole
      ? `Enter a whole number from ${min} to ${max} mmol/mol.`
      : `Enter a value from ${min} to ${max}%.`;
  }
  return null;
}

export function hba1cTextToPercent(
  text: string,
  unit: Hba1cUnit,
  previousPercent?: number | null,
): number | null {
  const value = parseEntry(text);
  if (value === null || hba1cEntryError(text, unit)) return null;
  return storedValueForEntry(
    value,
    previousPercent,
    (percent) => hba1cFromPercent(percent, unit),
    (entered) => hba1cToPercent(entered, unit),
  );
}

export function percentToHba1cText(percent: number | null | undefined, unit: Hba1cUnit): string {
  return percent == null ? '' : asText(hba1cFromPercent(percent, unit));
}

export const hba1cUnitLabel = (unit: Hba1cUnit) => HBA1C_UNIT_LABELS[unit];

// ---- Weight and height ----------------------------------------------------------------------

/** Stored bounds, the same the API holds weight and height to. */
const WEIGHT_KG_RANGE = { min: 0.1, max: 700 };
const HEIGHT_CM_RANGE = { min: 20, max: 300 };

export const weightUnitLabel = (unit: BodyMeasureUnit) => (unit === 'US' ? 'lb' : 'kg');

export function weightTextToKg(
  text: string,
  unit: BodyMeasureUnit,
  previousKg?: number | null,
): number | null {
  const value = parseEntry(text);
  if (value === null || Number.isNaN(value)) return null;
  return storedValueForEntry(
    value,
    previousKg,
    (kg) => weightFromKg(kg, unit),
    (entered) => weightToKg(entered, unit),
  );
}

export function weightEntryError(text: string, unit: BodyMeasureUnit): string | null {
  const value = parseEntry(text);
  if (value === null) return null;
  const kg = Number.isNaN(value) ? Number.NaN : weightToKg(value, unit);
  if (!Number.isFinite(kg) || kg < WEIGHT_KG_RANGE.min || kg > WEIGHT_KG_RANGE.max) {
    return unit === 'US'
      ? 'Weight must be from 0.2 to 1543 lb.'
      : `Weight must be from ${WEIGHT_KG_RANGE.min} to ${WEIGHT_KG_RANGE.max} kg.`;
  }
  return null;
}

export function kgToWeightText(kg: number | null | undefined, unit: BodyMeasureUnit): string {
  return kg == null ? '' : asText(unit === 'US' ? weightFromKg(kg, unit) : kg);
}

/** Height as typed: centimetres for a metric clinic, feet and inches for a US one. */
export interface HeightEntry {
  cm: string;
  feet: string;
  inches: string;
}

export function cmToHeightEntry(cm: number | null | undefined): HeightEntry {
  if (cm == null || !Number.isFinite(cm)) return { cm: '', feet: '', inches: '' };
  const { feet, inches } = cmToFeetInches(cm);
  return { cm: String(cm), feet: String(feet), inches: String(inches) };
}

/**
 * The cm to store, `null` when nothing was typed, `NaN` when what was typed is not a height.
 * For feet and inches either part may be left empty and counts as zero, so 5 ft is 5 ft 0 in.
 */
export function heightEntryToCm(
  entry: HeightEntry,
  unit: BodyMeasureUnit,
  previousCm?: number | null,
): number | null {
  if (unit === 'METRIC') return parseEntry(entry.cm);
  const feet = parseEntry(entry.feet);
  const inches = parseEntry(entry.inches);
  if (feet === null && inches === null) return null;
  if (Number.isNaN(feet) || Number.isNaN(inches) || (inches ?? 0) >= 12) return Number.NaN;
  const typed = { feet: feet ?? 0, inches: inches ?? 0 };
  if (previousCm != null && Number.isFinite(previousCm)) {
    const shown = cmToFeetInches(previousCm);
    if (shown.feet === typed.feet && shown.inches === typed.inches) return previousCm;
  }
  return feetInchesToCm(typed.feet, typed.inches);
}

export function heightEntryError(entry: HeightEntry, unit: BodyMeasureUnit): string | null {
  const cm = heightEntryToCm(entry, unit);
  if (cm === null) return null;
  if (!Number.isFinite(cm) || cm < HEIGHT_CM_RANGE.min || cm > HEIGHT_CM_RANGE.max) {
    return unit === 'US'
      ? 'Height must be from 0 ft 8 in to 9 ft 10 in, with inches under 12.'
      : `Height must be from ${HEIGHT_CM_RANGE.min} to ${HEIGHT_CM_RANGE.max} cm.`;
  }
  return null;
}
