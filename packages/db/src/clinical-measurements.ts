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
