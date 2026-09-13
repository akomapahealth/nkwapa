import {
  DIABETES_DISTRESS_RESPONSES,
  PHQ2_MAX_SCORE,
  PHQ2_POSITIVE_THRESHOLD,
  PHQ2_RESPONSES,
  PHQ2_RESPONSE_LABELS,
  DIABETES_DISTRESS_RESPONSE_LABELS,
  isDiabetesDistressPositive,
  isPhq2Positive,
  phq2Total,
} from './phq2';

describe('phq2Total', () => {
  it.each([
    ['NOT_AT_ALL', 'NOT_AT_ALL', 0],
    ['NOT_AT_ALL', 'SEVERAL_DAYS', 1],
    ['SEVERAL_DAYS', 'SEVERAL_DAYS', 2],
    ['MORE_THAN_HALF_THE_DAYS', 'SEVERAL_DAYS', 3],
    ['NEARLY_EVERY_DAY', 'MORE_THAN_HALF_THE_DAYS', 5],
    ['NEARLY_EVERY_DAY', 'NEARLY_EVERY_DAY', 6],
  ] as const)('scores %s + %s as %i', (interest, mood, expected) => {
    expect(phq2Total(interest, mood)).toBe(expected);
  });

  it('never exceeds the instrument range', () => {
    expect(phq2Total('NEARLY_EVERY_DAY', 'NEARLY_EVERY_DAY')).toBe(PHQ2_MAX_SCORE);
  });

  /*
    A partial total is worse than no total.

    Scoring an unanswered item as 0 turns "one item answered 'nearly every day'" into 3 of 6, which
    reads as a completed screen sitting exactly on the threshold. The missing item could have
    carried it well past.
  */
  it('returns null until both items are answered', () => {
    expect(phq2Total('NEARLY_EVERY_DAY', 'NOT_ASSESSED')).toBeNull();
    expect(phq2Total('NOT_ASSESSED', 'NEARLY_EVERY_DAY')).toBeNull();
    expect(phq2Total('NOT_ASSESSED', 'NOT_ASSESSED')).toBeNull();
    expect(phq2Total(null, 'SEVERAL_DAYS')).toBeNull();
    expect(phq2Total(undefined, undefined)).toBeNull();
  });
});

describe('isPhq2Positive', () => {
  it('is positive at the cut-off and not below it', () => {
    expect(isPhq2Positive(PHQ2_POSITIVE_THRESHOLD)).toBe(true);
    expect(isPhq2Positive(PHQ2_POSITIVE_THRESHOLD - 1)).toBe(false);
    expect(isPhq2Positive(PHQ2_MAX_SCORE)).toBe(true);
    expect(isPhq2Positive(0)).toBe(false);
  });

  /* An incomplete screen is not a negative screen; it is not a screen. */
  it('is not positive for an incomplete screen', () => {
    expect(isPhq2Positive(null)).toBe(false);
    expect(isPhq2Positive(undefined)).toBe(false);
  });
});

describe('isDiabetesDistressPositive', () => {
  it('is positive when either item is moderate or worse', () => {
    expect(isDiabetesDistressPositive('MODERATE_PROBLEM', 'NOT_A_PROBLEM')).toBe(true);
    expect(isDiabetesDistressPositive('NOT_A_PROBLEM', 'MODERATE_PROBLEM')).toBe(true);
    expect(isDiabetesDistressPositive('SERIOUS_PROBLEM', 'NOT_ASSESSED')).toBe(true);
    expect(isDiabetesDistressPositive('NOT_ASSESSED', 'VERY_SERIOUS_PROBLEM')).toBe(true);
  });

  it('is not positive below moderate', () => {
    expect(isDiabetesDistressPositive('SLIGHT_PROBLEM', 'SLIGHT_PROBLEM')).toBe(false);
    expect(isDiabetesDistressPositive('NOT_A_PROBLEM', 'NOT_A_PROBLEM')).toBe(false);
  });

  /*
    Unlike PHQ-2 this does not wait for both answers.

    One moderate response is already positive by the specification's rule, and holding the prompt
    back until the second question is asked would delay the thing the prompt exists to cause.
  */
  it('does not wait for the second item once the first is positive', () => {
    expect(isDiabetesDistressPositive('MODERATE_PROBLEM', 'NOT_ASSESSED')).toBe(true);
  });

  it('is not positive when nothing was asked', () => {
    expect(isDiabetesDistressPositive('NOT_ASSESSED', 'NOT_ASSESSED')).toBe(false);
    expect(isDiabetesDistressPositive(null, undefined)).toBe(false);
  });
});

/*
  Every response a form can render must have a label.

  The note generator reads these labels to describe the screen in prose, so a member added to the
  vocabulary without one would render "undefined" into a clinical note.
*/
describe('vocabulary completeness', () => {
  it('labels every PHQ-2 response', () => {
    for (const response of PHQ2_RESPONSES) {
      expect(PHQ2_RESPONSE_LABELS[response]).toBeTruthy();
    }
  });

  it('labels every distress response', () => {
    for (const response of DIABETES_DISTRESS_RESPONSES) {
      expect(DIABETES_DISTRESS_RESPONSE_LABELS[response]).toBeTruthy();
    }
  });
});
