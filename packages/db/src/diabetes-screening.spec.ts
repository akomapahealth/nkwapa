import { parseLegacyDiabetesSymptoms, serializeLegacyDiabetesSymptoms } from './diabetes-screening';

describe('diabetes screening shared contract', () => {
  it('maps legacy display labels and canonical values without duplicates', () => {
    expect(parseLegacyDiabetesSymptoms('["Polyuria","POLYURIA","Weight loss"]')).toEqual({
      symptoms: ['POLYURIA', 'WEIGHT_LOSS'],
      hasUnmapped: false,
    });
  });

  it.each(['{broken', '{"Polyuria":true}', '["Polyuria","Other"]'])(
    'flags unmapped legacy input %s',
    (input) => {
      expect(parseLegacyDiabetesSymptoms(input).hasUnmapped).toBe(true);
    },
  );

  it('serializes canonical symptoms for legacy clients', () => {
    expect(serializeLegacyDiabetesSymptoms(['POLYDIPSIA', 'FATIGUE'])).toBe(
      '["Polydipsia","Fatigue"]',
    );
  });
});
