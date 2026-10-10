/**
 * The blood-pressure classification vocabulary, in one place.
 *
 * The enum values came out of the database and reached clinicians untranslated: the assessment
 * form offered "STAGE1" and "CRISIS" in its picker, and the dashboard chart labelled its bars the
 * same way. #82's design bar asks for plain language and no jargon, and "Stage 1" is what the
 * clinical guideline actually calls it.
 *
 * The order is clinical severity, not alphabetical and not by count. A distribution sorted by
 * count hides whether a clinic is drifting toward the severe end, which is the only reason to
 * look at it.
 */

import type { DistributionTone } from '@/components/dashboard/DistributionChart';

export const HYPERTENSION_CLASSIFICATIONS = [
  'NORMAL',
  'ELEVATED',
  'STAGE1',
  'STAGE2',
  'CRISIS',
  'UNKNOWN',
] as const;

export type HypertensionClassification = (typeof HYPERTENSION_CLASSIFICATIONS)[number];

export const HYPERTENSION_LABELS: Record<HypertensionClassification, string> = {
  NORMAL: 'Normal',
  ELEVATED: 'Elevated',
  STAGE1: 'Stage 1',
  STAGE2: 'Stage 2',
  CRISIS: 'Crisis',
  UNKNOWN: 'Not classified',
};

/**
 * `UNKNOWN` is neutral on purpose. It is not a clinical finding, it is a missing one, and giving
 * it a severity colour puts an absence of information in the same visual class as a reading.
 */
export const HYPERTENSION_TONES: Record<string, DistributionTone> = {
  [HYPERTENSION_LABELS.NORMAL]: 'success',
  [HYPERTENSION_LABELS.ELEVATED]: 'warning',
  [HYPERTENSION_LABELS.STAGE1]: 'destructive',
  [HYPERTENSION_LABELS.STAGE2]: 'destructive',
  [HYPERTENSION_LABELS.CRISIS]: 'destructive',
  [HYPERTENSION_LABELS.UNKNOWN]: 'neutral',
};

/** Severity order, expressed in the labels the chart's axis actually shows. */
export const HYPERTENSION_ORDER = HYPERTENSION_CLASSIFICATIONS.map(
  (value) => HYPERTENSION_LABELS[value],
);

/** Re-keys an API distribution from enum values to the labels a clinician reads. */
export function toLabelledDistribution(
  distribution: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(distribution).map(([key, value]) => [
      HYPERTENSION_LABELS[key as HypertensionClassification] ?? key,
      value,
    ]),
  );
}
