export type TemperatureUnit = 'CELSIUS' | 'FAHRENHEIT';

export function roundClinicalValue(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function toCelsius(value: number, unit: TemperatureUnit): number {
  return roundClinicalValue(unit === 'FAHRENHEIT' ? ((value - 32) * 5) / 9 : value);
}

export function computeBmi(weightKg?: number | null, heightCm?: number | null): number | null {
  if (weightKg == null || heightCm == null || weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return roundClinicalValue(weightKg / (heightM * heightM));
}

/**
 * Field groups of the one-per-encounter Vitals row. A station line records BP and anthropometry
 * at different stations, often on different devices, so a schemaVersion 2 bundle names the
 * groups it writes and the server leaves every other column untouched. BMI belongs to
 * anthropometry because it is derived from weight and height alone.
 */
export const VITALS_SECTIONS = ['bloodPressure', 'anthropometry', 'otherVitals', 'notes'] as const;
export type VitalsSection = (typeof VITALS_SECTIONS)[number];

export const VITALS_SECTION_FIELDS = {
  bloodPressure: [
    'systolicBp',
    'diastolicBp',
    'bpSite',
    'bpSiteOther',
    'patientPosition',
    'patientPositionOther',
    'cuffSize',
    'cuffSizeOther',
  ],
  anthropometry: ['weightKg', 'heightCm', 'bmi'],
  otherVitals: [
    'pulseBpm',
    'temperatureCelsius',
    'temperatureSource',
    'temperatureSourceOther',
    'respiratoryRate',
    'spo2Percent',
  ],
  notes: ['notes'],
} as const satisfies Record<VitalsSection, readonly string[]>;

/** The input-side keys of each group: what a client may send, as opposed to what is stored. */
export const VITALS_SECTION_INPUT_FIELDS = {
  bloodPressure: VITALS_SECTION_FIELDS.bloodPressure,
  anthropometry: ['weightKg', 'heightCm', 'bmi'],
  otherVitals: [
    'pulseBpm',
    'heartRate',
    'temperatureValue',
    'temperatureUnit',
    'temperatureSource',
    'temperatureSourceOther',
    'respiratoryRate',
    'spo2Percent',
  ],
  notes: ['notes'],
} as const satisfies Record<VitalsSection, readonly string[]>;
