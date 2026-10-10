export const DIABETES_GLUCOSE_TYPES = ['FASTING', 'RANDOM', 'UNKNOWN'] as const;
export type DiabetesGlucoseType = (typeof DIABETES_GLUCOSE_TYPES)[number];

/**
 * Symptoms over the past month.
 *
 * The first five predate the guided interview (#114); the last three are what its checklist adds.
 * This is the one vocabulary behind the `symptoms` column -- the interview reads it rather than
 * declaring its own, because two lists for one column is how a form comes to offer an option every
 * write rejects.
 */
export const DIABETES_SYMPTOMS = [
  'POLYDIPSIA',
  'POLYURIA',
  'BLURRED_VISION',
  'WEIGHT_LOSS',
  'FATIGUE',
  'HYPOGLYCEMIA_SYMPTOMS',
  'FOOT_WOUND',
  'NONE',
] as const;
export type DiabetesSymptom = (typeof DIABETES_SYMPTOMS)[number];

/**
 * Plain language, because a volunteer reads these aloud to a patient.
 *
 * The clinical terms these replaced are still recognised when parsing legacy `symptomsJson`; see
 * LEGACY_SYMPTOM_LABELS below.
 */
export const DIABETES_SYMPTOM_LABELS: Record<DiabetesSymptom, string> = {
  POLYDIPSIA: 'Increased thirst',
  POLYURIA: 'Frequent urination',
  BLURRED_VISION: 'Blurred vision',
  WEIGHT_LOSS: 'Unintentional weight loss',
  FATIGUE: 'Fatigue',
  HYPOGLYCEMIA_SYMPTOMS: 'Shaking, sweating, dizziness, or confusion',
  FOOT_WOUND: 'Foot wound',
  NONE: 'None',
};

/**
 * The wording legacy `symptomsJson` rows were written with.
 *
 * Renaming a display label must not silently stop old data parsing. Every string a previous
 * release could have serialised still resolves to its member; the migration that reads those rows
 * flags anything it cannot map rather than dropping it.
 */
const LEGACY_SYMPTOM_LABELS: Record<string, DiabetesSymptom> = {
  Polyuria: 'POLYURIA',
  Polydipsia: 'POLYDIPSIA',
  'Weight loss': 'WEIGHT_LOSS',
  'Blurred vision': 'BLURRED_VISION',
  Fatigue: 'FATIGUE',
};

export const DIABETES_GLUCOSE_MIN_MG_DL = 0;
export const DIABETES_GLUCOSE_MAX_MG_DL = 600;
export const DIABETES_HBA1C_MIN_PERCENT = 0;
export const DIABETES_HBA1C_MAX_PERCENT = 100;

const LEGACY_SYMPTOM_LOOKUP = new Map<string, DiabetesSymptom>([
  ...DIABETES_SYMPTOMS.map((symptom) => [symptom, symptom] as const),
  ...DIABETES_SYMPTOMS.map((symptom) => [DIABETES_SYMPTOM_LABELS[symptom], symptom] as const),
  ...Object.entries(LEGACY_SYMPTOM_LABELS).map(
    ([label, symptom]) => [label, symptom] as [string, DiabetesSymptom],
  ),
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

/** The wire wording for a member, reversed out of LEGACY_SYMPTOM_LABELS. */
const WIRE_LABELS: Partial<Record<DiabetesSymptom, string>> = Object.fromEntries(
  Object.entries(LEGACY_SYMPTOM_LABELS).map(([label, symptom]) => [symptom, label]),
);

/**
 * Render symptoms the way a previously deployed client expects to read them.
 *
 * This is a wire format, not a display one, and the two moved apart when the guided interview
 * (#114) re-worded the labels into plain language. An older client still parses `symptomsJson`
 * against the clinical terms it shipped with, so those five keep their original wording here no
 * matter what the form now says on screen.
 *
 * The three members the interview added have no older wording, so they go over as themselves. An
 * old client cannot render them and will flag them through the existing `legacySymptomsUnmapped`
 * path -- which is the designed behaviour, and better than dropping a recorded symptom on the
 * floor because the reader is a release behind.
 */
export function serializeLegacyDiabetesSymptoms(symptoms: readonly DiabetesSymptom[]): string {
  return JSON.stringify(
    symptoms.map((symptom) => WIRE_LABELS[symptom] ?? DIABETES_SYMPTOM_LABELS[symptom]),
  );
}
