import {
  DIABETES_GLUCOSE_CONTEXTS,
  DIABETES_GLUCOSE_CONTEXT_LABELS,
  DM_FASTING_SUSPICION_MG_DL,
  DM_HYPOGLYCEMIA_MG_DL,
  DM_RANDOM_SUSPICION_MG_DL,
  evaluateGlucoseSuspicion,
  isHypoglycemic,
  suspicionThresholdFor,
} from './diabetes-thresholds';

describe('evaluateGlucoseSuspicion', () => {
  it('applies the approved fasting cut-off', () => {
    expect(evaluateGlucoseSuspicion(DM_FASTING_SUSPICION_MG_DL, 'FASTING')).toBe('SUSPECTED');
    expect(evaluateGlucoseSuspicion(DM_FASTING_SUSPICION_MG_DL - 1, 'FASTING')).toBe(
      'NOT_SUSPECTED',
    );
  });

  it('applies the approved random cut-off', () => {
    expect(evaluateGlucoseSuspicion(DM_RANDOM_SUSPICION_MG_DL, 'RANDOM')).toBe('SUSPECTED');
    expect(evaluateGlucoseSuspicion(DM_RANDOM_SUSPICION_MG_DL - 1, 'RANDOM')).toBe('NOT_SUSPECTED');
  });

  it('maps the two added contexts onto their nearest previously approved rule', () => {
    expect(evaluateGlucoseSuspicion(126, 'BEFORE_MEAL')).toBe('SUSPECTED');
    expect(evaluateGlucoseSuspicion(125, 'BEFORE_MEAL')).toBe('NOT_SUSPECTED');
    expect(evaluateGlucoseSuspicion(200, 'POST_PRANDIAL_2H')).toBe('SUSPECTED');
    expect(evaluateGlucoseSuspicion(199, 'POST_PRANDIAL_2H')).toBe('NOT_SUSPECTED');
  });

  /*
    09_DIABETES_SCREENING.md: "Dashboard flags ... never classify unknown-context measurements."

    A value with no timing is not a weaker finding, it is a different kind of thing. Falling back
    to the random threshold would turn an unlabelled 150 into a reassuring result and an unlabelled
    210 into a diagnosis nobody measured for.
  */
  it('never classifies an unknown-context measurement', () => {
    expect(evaluateGlucoseSuspicion(400, 'UNKNOWN')).toBe('NOT_ASSESSED');
    expect(evaluateGlucoseSuspicion(80, 'UNKNOWN')).toBe('NOT_ASSESSED');
    expect(suspicionThresholdFor('UNKNOWN')).toBeNull();
  });

  /*
    NOT_ASSESSED and NOT_SUSPECTED are different claims.

    NOT_SUSPECTED asserts that somebody looked and found nothing. A missing reading must never
    render as that on a dashboard or in a generated note.
  */
  it('distinguishes "not measured" from "measured and negative"', () => {
    expect(evaluateGlucoseSuspicion(null, 'FASTING')).toBe('NOT_ASSESSED');
    expect(evaluateGlucoseSuspicion(undefined, 'FASTING')).toBe('NOT_ASSESSED');
    expect(evaluateGlucoseSuspicion(Number.NaN, 'FASTING')).toBe('NOT_ASSESSED');
    expect(evaluateGlucoseSuspicion(100, null)).toBe('NOT_ASSESSED');
    expect(evaluateGlucoseSuspicion(100, 'FASTING')).toBe('NOT_SUSPECTED');
  });
});

describe('isHypoglycemic', () => {
  it('fires at or below the low-glucose cut-off', () => {
    expect(isHypoglycemic(DM_HYPOGLYCEMIA_MG_DL)).toBe(true);
    expect(isHypoglycemic(DM_HYPOGLYCEMIA_MG_DL - 1)).toBe(true);
    expect(isHypoglycemic(DM_HYPOGLYCEMIA_MG_DL + 1)).toBe(false);
  });

  it('does not fire on a missing reading', () => {
    expect(isHypoglycemic(null)).toBe(false);
    expect(isHypoglycemic(Number.NaN)).toBe(false);
  });

  /*
    A reading cannot be both low and suspicious for diabetes.

    If the hypoglycemia cut-off were ever raised above a suspicion threshold, one value would
    trigger opposite prompts at once.
  */
  it('cannot overlap a suspicion threshold', () => {
    expect(DM_HYPOGLYCEMIA_MG_DL).toBeLessThan(DM_FASTING_SUSPICION_MG_DL);
  });
});

describe('vocabulary completeness', () => {
  it('labels and resolves a threshold decision for every context', () => {
    for (const context of DIABETES_GLUCOSE_CONTEXTS) {
      expect(DIABETES_GLUCOSE_CONTEXT_LABELS[context]).toBeTruthy();
      // Either a number or an explicit null; `undefined` would mean an unhandled branch.
      expect(suspicionThresholdFor(context)).not.toBeUndefined();
    }
  });
});
