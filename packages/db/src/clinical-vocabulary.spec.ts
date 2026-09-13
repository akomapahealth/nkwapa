import {
  ALCOHOL_USE_STATUSES,
  ALCOHOL_USE_STATUS_LABELS,
  FOLLOW_UP_OWNERS,
  FOLLOW_UP_OWNER_LABELS,
  FOLLOW_UP_WINDOWS,
  FOLLOW_UP_WINDOW_LABELS,
  FREQUENCY_NEVER_SOMETIMES_DAILY,
  FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS,
  FREQUENCY_NEVER_SOMETIMES_OFTEN,
  FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS,
  FREQUENCY_NEVER_SOMETIMES_USUALLY,
  FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS,
  FREQUENCY_RARELY_SOME_MOST,
  FREQUENCY_RARELY_SOME_MOST_LABELS,
  MEALS_PER_DAY_BANDS,
  MEALS_PER_DAY_BAND_LABELS,
  MEDICATION_ADHERENCE_LEVELS,
  MEDICATION_ADHERENCE_LEVEL_LABELS,
  MEDICATION_DOSES_MISSED,
  MEDICATION_DOSES_MISSED_LABELS,
  MEDICATION_PROBLEMS,
  MEDICATION_PROBLEM_LABELS,
  MEDICATION_REMINDER_STRATEGIES,
  MEDICATION_REMINDER_STRATEGY_LABELS,
  MEDICATION_SUPPLY_STATUSES,
  MEDICATION_SUPPLY_STATUS_LABELS,
  MEDICATION_USE_STATUSES,
  MEDICATION_USE_STATUS_LABELS,
  NKWAPA_ANSWERS,
  NKWAPA_ANSWER_LABELS,
  SCREENING_COMPLETION_STATUSES,
  SCREENING_COMPLETION_STATUS_LABELS,
  TOBACCO_USE_STATUSES,
  TOBACCO_USE_STATUS_LABELS,
  resolveFollowUpDate,
} from './clinical-vocabulary';

/**
 * Every scale, paired with its label map.
 *
 * Listed as data so that adding a scale without a label map, or a member without a label, fails
 * here rather than rendering "undefined" into a clinical note.
 */
const SCALES: ReadonlyArray<[string, readonly string[], Record<string, string>]> = [
  ['NKWAPA_ANSWERS', NKWAPA_ANSWERS, NKWAPA_ANSWER_LABELS],
  [
    'FREQUENCY_NEVER_SOMETIMES_USUALLY',
    FREQUENCY_NEVER_SOMETIMES_USUALLY,
    FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS,
  ],
  [
    'FREQUENCY_NEVER_SOMETIMES_DAILY',
    FREQUENCY_NEVER_SOMETIMES_DAILY,
    FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS,
  ],
  ['FREQUENCY_RARELY_SOME_MOST', FREQUENCY_RARELY_SOME_MOST, FREQUENCY_RARELY_SOME_MOST_LABELS],
  [
    'FREQUENCY_NEVER_SOMETIMES_OFTEN',
    FREQUENCY_NEVER_SOMETIMES_OFTEN,
    FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS,
  ],
  [
    'SCREENING_COMPLETION_STATUSES',
    SCREENING_COMPLETION_STATUSES,
    SCREENING_COMPLETION_STATUS_LABELS,
  ],
  ['MEDICATION_USE_STATUSES', MEDICATION_USE_STATUSES, MEDICATION_USE_STATUS_LABELS],
  ['MEDICATION_SUPPLY_STATUSES', MEDICATION_SUPPLY_STATUSES, MEDICATION_SUPPLY_STATUS_LABELS],
  ['MEDICATION_ADHERENCE_LEVELS', MEDICATION_ADHERENCE_LEVELS, MEDICATION_ADHERENCE_LEVEL_LABELS],
  ['MEDICATION_DOSES_MISSED', MEDICATION_DOSES_MISSED, MEDICATION_DOSES_MISSED_LABELS],
  ['MEDICATION_PROBLEMS', MEDICATION_PROBLEMS, MEDICATION_PROBLEM_LABELS],
  [
    'MEDICATION_REMINDER_STRATEGIES',
    MEDICATION_REMINDER_STRATEGIES,
    MEDICATION_REMINDER_STRATEGY_LABELS,
  ],
  ['TOBACCO_USE_STATUSES', TOBACCO_USE_STATUSES, TOBACCO_USE_STATUS_LABELS],
  ['ALCOHOL_USE_STATUSES', ALCOHOL_USE_STATUSES, ALCOHOL_USE_STATUS_LABELS],
  ['MEALS_PER_DAY_BANDS', MEALS_PER_DAY_BANDS, MEALS_PER_DAY_BAND_LABELS],
  ['FOLLOW_UP_WINDOWS', FOLLOW_UP_WINDOWS, FOLLOW_UP_WINDOW_LABELS],
  ['FOLLOW_UP_OWNERS', FOLLOW_UP_OWNERS, FOLLOW_UP_OWNER_LABELS],
];

describe('answer scales', () => {
  it.each(SCALES)('%s labels every member', (_name, members, labels) => {
    for (const member of members) {
      expect(labels[member]).toBeTruthy();
    }
  });

  it.each(SCALES)('%s has no duplicate members', (_name, members) => {
    expect(new Set(members).size).toBe(members.length);
  });

  it.each(SCALES)('%s labels nothing it does not declare', (_name, members, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...members].sort());
  });

  /*
    An unasked question must not read as an answer.

    These records are saved half-finished on every tab change, so a scale without NOT_ASSESSED
    would make "skipped" indistinguishable from its first member -- and a generated note would
    report that the patient denied something nobody asked about.

    The two exceptions are genuine multi-select checklists, where an empty array already carries
    "nothing recorded" and a NOT_ASSESSED member would be a second, conflicting way to say it.
  */
  const MULTI_SELECT_SCALES = new Set(['MEDICATION_PROBLEMS', 'MEDICATION_REMINDER_STRATEGIES']);

  it.each(SCALES)('%s distinguishes an unasked question', (name, members) => {
    if (MULTI_SELECT_SCALES.has(name)) {
      expect(members).not.toContain('NOT_ASSESSED');
      return;
    }
    expect(members).toContain('NOT_ASSESSED');
  });
});

describe('resolveFollowUpDate', () => {
  const visit = new Date('2026-09-13T14:30:00.000Z');

  it.each([
    ['TODAY', '2026-09-13'],
    ['WITHIN_1_WEEK', '2026-09-20'],
    ['WITHIN_1_MONTH', '2026-10-13'],
    ['WITHIN_3_MONTHS', '2026-12-12'],
  ] as const)('resolves %s to %s', (window, expected) => {
    expect(resolveFollowUpDate(window, visit)?.toISOString().slice(0, 10)).toBe(expected);
  });

  it('normalizes to the start of the day', () => {
    expect(resolveFollowUpDate('TODAY', visit)?.toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  /*
    A window cannot invent a date the clinician did not choose.

    OTHER means they typed a specific date; deriving one here would overwrite it. NOT_ASSESSED
    means no follow-up was decided, and a date would schedule a reminder nobody asked for.
  */
  it('derives no date for OTHER or an unanswered window', () => {
    expect(resolveFollowUpDate('OTHER', visit)).toBeNull();
    expect(resolveFollowUpDate('NOT_ASSESSED', visit)).toBeNull();
    expect(resolveFollowUpDate(null, visit)).toBeNull();
    expect(resolveFollowUpDate(undefined, visit)).toBeNull();
  });

  /* Month-end arithmetic must roll over rather than clamp or produce an invalid date. */
  it('rolls over month and year boundaries', () => {
    const janEnd = new Date('2026-01-31T09:00:00.000Z');
    expect(resolveFollowUpDate('WITHIN_1_MONTH', janEnd)?.toISOString().slice(0, 10)).toBe(
      '2026-03-02',
    );

    const yearEnd = new Date('2026-12-28T09:00:00.000Z');
    expect(resolveFollowUpDate('WITHIN_1_WEEK', yearEnd)?.toISOString().slice(0, 10)).toBe(
      '2027-01-04',
    );
  });

  /*
    Adding days rather than milliseconds.

    A millisecond-based implementation drifts across a daylight-saving boundary and can land on the
    previous calendar day, which silently moves a follow-up a day earlier than the clinician chose.
  */
  it('lands on the same weekday a week later regardless of the hour', () => {
    for (const hour of ['00:30', '12:00', '23:45']) {
      const at = new Date(`2026-03-08T${hour}:00.000Z`);
      expect(resolveFollowUpDate('WITHIN_1_WEEK', at)?.toISOString().slice(0, 10)).toBe(
        '2026-03-15',
      );
    }
  });

  it('never resolves a date in the past', () => {
    for (const window of FOLLOW_UP_WINDOWS) {
      const resolved = resolveFollowUpDate(window, visit);
      if (!resolved) continue;
      const visitDay = new Date('2026-09-13T00:00:00.000Z');
      expect(resolved.getTime()).toBeGreaterThanOrEqual(visitDay.getTime());
    }
  });
});
