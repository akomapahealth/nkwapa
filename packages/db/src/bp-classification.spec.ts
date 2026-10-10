import {
  BP_ESCALATION_DIASTOLIC,
  BP_ESCALATION_SYSTOLIC,
  BP_REPEAT_PROMPT_DIASTOLIC,
  BP_REPEAT_PROMPT_SYSTOLIC,
  classifyBloodPressure,
  isHypotensive,
  isSeverelyElevated,
  shouldPromptRepeat,
} from './bp-classification';

describe('classifyBloodPressure', () => {
  it.each([
    [119, 79, 'NORMAL'],
    [110, 70, 'NORMAL'],
    [120, 79, 'ELEVATED'],
    [129, 79, 'ELEVATED'],
    [130, 79, 'STAGE1'],
    [119, 80, 'STAGE1'],
    [139, 89, 'STAGE1'],
    [140, 79, 'STAGE2'],
    [119, 90, 'STAGE2'],
    [179, 119, 'STAGE2'],
    [180, 79, 'CRISIS'],
    [119, 120, 'CRISIS'],
  ] as const)('classifies %i/%i as %s', (systolic, diastolic, expected) => {
    expect(classifyBloodPressure(systolic, diastolic)).toBe(expected);
  });

  /*
    The bands overlap, so evaluation order is the definition.

    190/85 satisfies the crisis rule (systolic >= 180) and the stage 2 rule (systolic >= 140) at
    once. Ascending evaluation would return STAGE2 and tell a volunteer that a hypertensive
    emergency was ordinary. These two cases are the reason the implementation tests downward.
  */
  it('prefers crisis over stage 2 when a reading satisfies both', () => {
    expect(classifyBloodPressure(190, 85)).toBe('CRISIS');
    expect(classifyBloodPressure(150, 125)).toBe('CRISIS');
  });

  it('prefers the higher band when systolic and diastolic disagree', () => {
    expect(classifyBloodPressure(118, 95)).toBe('STAGE2');
    expect(classifyBloodPressure(145, 65)).toBe('STAGE2');
  });

  describe('partial readings', () => {
    it('classifies upward from a single value when the rule is disjunctive', () => {
      expect(classifyBloodPressure(185, null)).toBe('CRISIS');
      expect(classifyBloodPressure(null, 95)).toBe('STAGE2');
      expect(classifyBloodPressure(135, null)).toBe('STAGE1');
    });

    /*
      "Normal" is a claim about the whole reading, so half a reading cannot make it.

      Returning NORMAL from a lone systolic of 118 would state that a patient whose diastolic was
      never measured has a normal blood pressure.
    */
    it('refuses to call a half-measured reading normal or elevated', () => {
      expect(classifyBloodPressure(118, null)).toBe('UNKNOWN');
      expect(classifyBloodPressure(125, null)).toBe('UNKNOWN');
      expect(classifyBloodPressure(null, 70)).toBe('UNKNOWN');
    });

    it('is UNKNOWN when nothing was measured', () => {
      expect(classifyBloodPressure(null, null)).toBe('UNKNOWN');
      expect(classifyBloodPressure(undefined, undefined)).toBe('UNKNOWN');
    });
  });

  /*
    NaN fails every comparison silently, so an unguarded implementation returns NORMAL for it.
    Readings arrive from JSON payloads and from `Number(input.value)` in a form, both of which
    produce NaN without anyone writing it deliberately.
  */
  it('treats non-finite values as unmeasured rather than as normal', () => {
    expect(classifyBloodPressure(Number.NaN, Number.NaN)).toBe('UNKNOWN');
    expect(classifyBloodPressure(Number.NaN, 95)).toBe('STAGE2');
    expect(classifyBloodPressure(Number.POSITIVE_INFINITY, 70)).toBe('UNKNOWN');
  });
});

describe('shouldPromptRepeat', () => {
  it('prompts at the stage 2 edge and not below it', () => {
    expect(shouldPromptRepeat(BP_REPEAT_PROMPT_SYSTOLIC, 70)).toBe(true);
    expect(shouldPromptRepeat(BP_REPEAT_PROMPT_SYSTOLIC - 1, 70)).toBe(false);
    expect(shouldPromptRepeat(120, BP_REPEAT_PROMPT_DIASTOLIC)).toBe(true);
    expect(shouldPromptRepeat(120, BP_REPEAT_PROMPT_DIASTOLIC - 1)).toBe(false);
  });

  it('does not prompt when nothing was measured', () => {
    expect(shouldPromptRepeat(null, null)).toBe(false);
  });

  /*
    Every reading that escalates must also have been offered a repeat.

    If the escalation threshold were ever lowered below the repeat threshold, a volunteer could be
    told to summon a clinician for a reading the system never asked them to confirm.
  */
  it('never escalates a reading it did not ask to be repeated', () => {
    expect(BP_ESCALATION_SYSTOLIC).toBeGreaterThanOrEqual(BP_REPEAT_PROMPT_SYSTOLIC);
    expect(BP_ESCALATION_DIASTOLIC).toBeGreaterThanOrEqual(BP_REPEAT_PROMPT_DIASTOLIC);
  });
});

describe('isSeverelyElevated', () => {
  it('fires at the escalation edge and not below it', () => {
    expect(isSeverelyElevated(BP_ESCALATION_SYSTOLIC, 80)).toBe(true);
    expect(isSeverelyElevated(BP_ESCALATION_SYSTOLIC - 1, 80)).toBe(false);
    expect(isSeverelyElevated(120, BP_ESCALATION_DIASTOLIC)).toBe(true);
    expect(isSeverelyElevated(120, BP_ESCALATION_DIASTOLIC - 1)).toBe(false);
  });

  it('agrees with the crisis band', () => {
    expect(isSeverelyElevated(185, 80)).toBe(classifyBloodPressure(185, 80) === 'CRISIS');
    expect(isSeverelyElevated(150, 95)).toBe(classifyBloodPressure(150, 95) === 'CRISIS');
  });

  it('does not fire on an unmeasured reading', () => {
    expect(isSeverelyElevated(null, null)).toBe(false);
  });
});

describe('isHypotensive', () => {
  it('fires at or below the low-reading edge', () => {
    expect(isHypotensive(90, 70)).toBe(true);
    expect(isHypotensive(91, 70)).toBe(false);
    expect(isHypotensive(110, 60)).toBe(true);
    expect(isHypotensive(110, 61)).toBe(false);
  });

  it('does not fire on an unmeasured reading', () => {
    expect(isHypotensive(null, null)).toBe(false);
    expect(isHypotensive(Number.NaN, Number.NaN)).toBe(false);
  });
});
