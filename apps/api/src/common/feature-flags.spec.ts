import { isApiFeatureEnabled, parseFeatureFlag } from './feature-flags';

describe('API feature flags', () => {
  const originalMedicalHistoryFlag = process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
  const originalMedicationReconciliationFlag =
    process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;

  afterEach(() => {
    if (originalMedicalHistoryFlag === undefined) {
      delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
    } else {
      process.env.FEATURE_MEDICAL_HISTORY_ENABLED = originalMedicalHistoryFlag;
    }
    if (originalMedicationReconciliationFlag === undefined) {
      delete process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;
    } else {
      process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = originalMedicationReconciliationFlag;
    }
  });

  it.each([
    ['unset', undefined, false],
    ['empty', '', false],
    ['false', 'false', false],
    ['invalid', 'enabled', false],
    ['true', 'true', true],
    ['trimmed uppercase true', '  TRUE  ', true],
  ])('parses %s values', (_label, value, expected) => {
    expect(parseFeatureFlag(value)).toBe(expected);
  });

  it('maps the medical history flag to its API environment variable', () => {
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'true';

    expect(isApiFeatureEnabled('medicalHistory')).toBe(true);
  });

  it('keeps medical history disabled when its API environment variable is unset', () => {
    delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;

    expect(isApiFeatureEnabled('medicalHistory')).toBe(false);
  });

  it('maps medication reconciliation to its dedicated API environment variable', () => {
    process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = 'true';

    expect(isApiFeatureEnabled('medicationReconciliation')).toBe(true);
  });
});
