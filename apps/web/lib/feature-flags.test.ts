import { isWebFeatureEnabled, parseFeatureFlag } from './feature-flags';

describe('web feature flags', () => {
  const originalMedicalHistoryFlag = process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED;
  const originalMedicationReconciliationFlag =
    process.env.NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED;
  const originalClinicalNotesFlag = process.env.NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED;

  afterEach(() => {
    if (originalMedicalHistoryFlag === undefined) {
      delete process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED = originalMedicalHistoryFlag;
    }
    if (originalMedicationReconciliationFlag === undefined) {
      delete process.env.NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED =
        originalMedicationReconciliationFlag;
    }
    if (originalClinicalNotesFlag === undefined) {
      delete process.env.NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED = originalClinicalNotesFlag;
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

  it('maps the medical history flag to its public web environment variable', () => {
    process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED = 'true';

    expect(isWebFeatureEnabled('medicalHistory')).toBe(true);
  });

  it('keeps medical history disabled when its public web environment variable is unset', () => {
    delete process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED;

    expect(isWebFeatureEnabled('medicalHistory')).toBe(false);
  });

  it('maps medication reconciliation to its public web environment variable', () => {
    process.env.NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED = 'true';

    expect(isWebFeatureEnabled('medicationReconciliation')).toBe(true);
  });

  it('keeps clinical notes disabled by default and maps its public flag', () => {
    delete process.env.NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED;
    expect(isWebFeatureEnabled('clinicalNotes')).toBe(false);
    process.env.NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED = 'true';
    expect(isWebFeatureEnabled('clinicalNotes')).toBe(true);
  });
});
