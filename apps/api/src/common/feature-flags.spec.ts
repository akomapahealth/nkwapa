import { isApiFeatureEnabled, parseFeatureFlag } from './feature-flags';

describe('API feature flags', () => {
  const originalMedicalHistoryFlag = process.env.FEATURE_MEDICAL_HISTORY_ENABLED;

  afterEach(() => {
    if (originalMedicalHistoryFlag === undefined) {
      delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
      return;
    }

    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = originalMedicalHistoryFlag;
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
});
