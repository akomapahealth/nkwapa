export function parseFeatureFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

const webFeatureFlagReaders = {
  medicalHistory: () => process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED,
  medicationReconciliation: () => process.env.NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED,
} as const;

export type WebFeatureFlag = keyof typeof webFeatureFlagReaders;

export function isWebFeatureEnabled(flag: WebFeatureFlag): boolean {
  return parseFeatureFlag(webFeatureFlagReaders[flag]());
}
