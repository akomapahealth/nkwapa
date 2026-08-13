export const DIABETES_GLUCOSE_TYPES = ['FASTING', 'RANDOM', 'UNKNOWN'] as const;
export type DiabetesGlucoseType = (typeof DIABETES_GLUCOSE_TYPES)[number];

export const DIABETES_SYMPTOMS = [
  'POLYURIA',
  'POLYDIPSIA',
  'WEIGHT_LOSS',
  'BLURRED_VISION',
  'FATIGUE',
] as const;
export type DiabetesSymptom = (typeof DIABETES_SYMPTOMS)[number];

export const DIABETES_SYMPTOM_LABELS: Record<DiabetesSymptom, string> = {
  POLYURIA: 'Polyuria',
  POLYDIPSIA: 'Polydipsia',
  WEIGHT_LOSS: 'Weight loss',
  BLURRED_VISION: 'Blurred vision',
  FATIGUE: 'Fatigue',
};

export const DIABETES_GLUCOSE_MIN_MG_DL = 0;
export const DIABETES_GLUCOSE_MAX_MG_DL = 600;
export const DIABETES_HBA1C_MIN_PERCENT = 0;
export const DIABETES_HBA1C_MAX_PERCENT = 100;

const LEGACY_SYMPTOM_LOOKUP = new Map<string, DiabetesSymptom>([
  ...DIABETES_SYMPTOMS.map((symptom) => [symptom, symptom] as const),
  ...DIABETES_SYMPTOMS.map((symptom) => [DIABETES_SYMPTOM_LABELS[symptom], symptom] as const),
]);

export interface ParsedLegacyDiabetesSymptoms {
  symptoms: DiabetesSymptom[];
  hasUnmapped: boolean;
}

export function parseLegacyDiabetesSymptoms(value: unknown): ParsedLegacyDiabetesSymptoms {
  if (value == null || value === '') return { symptoms: [], hasUnmapped: false };

  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return { symptoms: [], hasUnmapped: true };
    }
  }

  if (!Array.isArray(parsed)) return { symptoms: [], hasUnmapped: true };

  const symptoms = new Set<DiabetesSymptom>();
  let hasUnmapped = false;
  for (const item of parsed) {
    const symptom = typeof item === 'string' ? LEGACY_SYMPTOM_LOOKUP.get(item) : undefined;
    if (symptom) symptoms.add(symptom);
    else hasUnmapped = true;
  }
  return { symptoms: [...symptoms], hasUnmapped };
}

export function serializeLegacyDiabetesSymptoms(symptoms: readonly DiabetesSymptom[]): string {
  return JSON.stringify(symptoms.map((symptom) => DIABETES_SYMPTOM_LABELS[symptom]));
}
