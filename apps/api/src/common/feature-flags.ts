export function parseFeatureFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

const apiFeatureFlagReaders = {
  medicalHistory: () => process.env.FEATURE_MEDICAL_HISTORY_ENABLED,
  medicationReconciliation: () => process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED,
} as const;

export type ApiFeatureFlag = keyof typeof apiFeatureFlagReaders;

export function isApiFeatureEnabled(flag: ApiFeatureFlag): boolean {
  return parseFeatureFlag(apiFeatureFlagReaders[flag]());
}
