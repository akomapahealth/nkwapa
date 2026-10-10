import {
  DIABETES_SYMPTOM_LABELS,
  parseLegacyDiabetesSymptoms,
  serializeLegacyDiabetesSymptoms,
} from './diabetes-screening';

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

  /*
    A display label and a wire label are different things.

    The interview re-worded these into plain language for the volunteer reading them aloud, but an
    older deployed client still parses `symptomsJson` against the clinical terms it shipped with.
    Changing what is on screen must not change what goes over the wire.
  */
  it('serializes canonical symptoms for legacy clients', () => {
    expect(DIABETES_SYMPTOM_LABELS.POLYDIPSIA).toBe('Increased thirst');
    expect(serializeLegacyDiabetesSymptoms(['POLYDIPSIA', 'FATIGUE'])).toBe(
      '["Polydipsia","Fatigue"]',
    );
  });
});

describe('symptoms added by the guided interview', () => {
  /* An older client cannot render these, so it flags them rather than receiving nothing. */
  it('sends a newly added symptom under its own name', () => {
    expect(serializeLegacyDiabetesSymptoms(['HYPOGLYCEMIA_SYMPTOMS'])).toBe(
      '["Shaking, sweating, dizziness, or confusion"]',
    );
  });

  it('still parses every wording a previous release could have written', () => {
    for (const [label, expected] of [
      ['Polyuria', 'POLYURIA'],
      ['Polydipsia', 'POLYDIPSIA'],
      ['Weight loss', 'WEIGHT_LOSS'],
      ['Blurred vision', 'BLURRED_VISION'],
      ['Fatigue', 'FATIGUE'],
    ] as const) {
      const parsed = parseLegacyDiabetesSymptoms(JSON.stringify([label]));
      expect(parsed.symptoms).toEqual([expected]);
      expect(parsed.hasUnmapped).toBe(false);
    }
  });

  it('parses the new wording too, so a round trip is stable', () => {
    const parsed = parseLegacyDiabetesSymptoms('["Increased thirst","Foot wound"]');
    expect(parsed.symptoms).toEqual(['POLYDIPSIA', 'FOOT_WOUND']);
    expect(parsed.hasUnmapped).toBe(false);
  });
});
