import {
  HYPERTENSION_CLASSIFICATIONS,
  HYPERTENSION_LABELS,
  HYPERTENSION_ORDER,
  HYPERTENSION_TONES,
  toLabelledDistribution,
} from './hypertension';

describe('hypertension vocabulary', () => {
  it('translates every enum value out of database casing', () => {
    for (const value of HYPERTENSION_CLASSIFICATIONS) {
      const label = HYPERTENSION_LABELS[value];
      expect(label).toBeTruthy();
      // The defect this guards: "STAGE1" and "CRISIS" reached the assessment picker and the
      // dashboard chart untranslated.
      expect(label).not.toBe(value);
      expect(label).not.toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('orders by clinical severity, with the missing-value bucket last', () => {
    expect(HYPERTENSION_ORDER).toEqual([
      'Normal',
      'Elevated',
      'Stage 1',
      'Stage 2',
      'Crisis',
      'Not classified',
    ]);
  });

  it('gives every label a tone, and keeps the missing-value bucket neutral', () => {
    for (const label of HYPERTENSION_ORDER) {
      expect(HYPERTENSION_TONES[label]).toBeDefined();
    }
    // Not a clinical finding but a missing one, so it must not be coloured like a reading.
    expect(HYPERTENSION_TONES['Not classified']).toBe('neutral');
    expect(HYPERTENSION_TONES.Normal).toBe('success');
    expect(HYPERTENSION_TONES.Crisis).toBe('destructive');
  });

  it('re-keys an API distribution to the labels the axis shows', () => {
    expect(toLabelledDistribution({ NORMAL: 41, STAGE1: 17, UNKNOWN: 6 })).toEqual({
      Normal: 41,
      'Stage 1': 17,
      'Not classified': 6,
    });
  });

  it('passes through a key it does not recognise rather than dropping the count', () => {
    // A value added to the API before the front end knows about it must still be visible.
    expect(toLabelledDistribution({ NORMAL: 2, FUTURE_BAND: 5 })).toEqual({
      Normal: 2,
      FUTURE_BAND: 5,
    });
  });
});
