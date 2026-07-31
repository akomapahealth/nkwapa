import { isWebFeatureEnabled, parseFeatureFlag } from './feature-flags';

describe('web feature flags', () => {
  const originalMedicalHistoryFlag = process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED;

  afterEach(() => {
    if (originalMedicalHistoryFlag === undefined) {
      delete process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED;
      return;
    }

    process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED = originalMedicalHistoryFlag;
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
});
