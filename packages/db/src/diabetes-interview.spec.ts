import {
  DIABETES_CLINICIAN_PLAN_ITEMS,
  DIABETES_CLINICIAN_PLAN_ITEM_LABELS,
  DIABETES_CONCERNS,
  DIABETES_CONCERN_LABELS,
  DIABETES_ESCALATION_REASON_LABELS,
  DIABETES_INTERVIEW_SYMPTOMS,
  DIABETES_INTERVIEW_SYMPTOM_LABELS,
  DIABETES_NUTRITION_SCHEMA_VERSION,
  DIABETES_REVIEW_REASONS,
  DIABETES_REVIEW_REASON_LABELS,
  DIABETES_STATUSES,
  DIABETES_STATUS_LABELS,
  DIABETES_TYPES,
  DIABETES_TYPE_LABELS,
  DIABETES_URGENT_SYMPTOMS,
  DIABETES_URGENT_SYMPTOM_LABELS,
  DIABETES_VOLUNTEER_ACTIONS,
  DIABETES_VOLUNTEER_ACTION_LABELS,
  deriveDiabetesEscalation,
  emptyDiabetesNutrition,
  evaluateDiabetesMentalHealth,
  parseDiabetesNutrition,
  reviewReasonsForDiabetesEscalation,
  serializeDiabetesNutrition,
} from './diabetes-interview';
import { DM_HYPOGLYCEMIA_MG_DL } from './diabetes-thresholds';

describe('parseDiabetesNutrition', () => {
  it('round-trips a serialized payload without issues', () => {
    const original = {
      ...emptyDiabetesNutrition(),
      mealsPerDay: 'THREE' as const,
      sugarSweetenedDrinks: 'DAILY' as const,
      dinnerYesterday: 'Banku and okro stew',
    };
    const parsed = parseDiabetesNutrition(serializeDiabetesNutrition(original));
    expect(parsed.issues).toEqual([]);
    expect(parsed.payload).toEqual(original);
    expect(parsed.schemaVersion).toBe(DIABETES_NUTRITION_SCHEMA_VERSION);
  });

  it('reads an absent section as an unanswered one', () => {
    expect(parseDiabetesNutrition(undefined).payload).toEqual(emptyDiabetesNutrition());
    expect(parseDiabetesNutrition(undefined).issues).toEqual([]);
  });

  it('reports bad values and unknown keys at usable paths', () => {
    const parsed = parseDiabetesNutrition({ mealsPerDay: 'SEVEN', snacks: 'lots' });
    expect(parsed.issues.map((i) => [i.path, i.code]).sort()).toEqual([
      ['nutrition.mealsPerDay', 'UNKNOWN_VALUE'],
      ['nutrition.snacks', 'UNKNOWN_KEY'],
    ]);
  });
});

describe('deriveDiabetesEscalation', () => {
  it('does not escalate an ordinary visit', () => {
    expect(
      deriveDiabetesEscalation({
        urgentSymptoms: ['NONE'],
        currentFootWound: 'NO',
        glucoseMgDl: 140,
        glucoseContext: 'RANDOM',
      }),
    ).toEqual({ urgentReviewRequired: false, reasons: [] });
  });

  /*
    These are the symptoms the specification names as requiring immediate review, and none of them
    except the foot wound appear in its own past-month checklist. Asking them separately is what
    makes the rule implementable.
  */
  it.each([
    ['VOMITING', 'URGENT_SYMPTOM_VOMITING'],
    ['CONFUSION', 'URGENT_SYMPTOM_CONFUSION'],
    ['DIFFICULTY_BREATHING', 'URGENT_SYMPTOM_DIFFICULTY_BREATHING'],
    ['LOSS_OF_CONSCIOUSNESS', 'URGENT_SYMPTOM_LOSS_OF_CONSCIOUSNESS'],
    ['ACTIVE_FOOT_WOUND', 'ACTIVE_FOOT_WOUND'],
  ] as const)('escalates on %s', (symptom, reason) => {
    const result = deriveDiabetesEscalation({ urgentSymptoms: [symptom] });
    expect(result.urgentReviewRequired).toBe(true);
    expect(result.reasons).toContain(reason);
  });

  /*
    A foot wound is asked in two sections by two parts of the specification.

    A volunteer who records it in the preventive-care question should not also have to tick it in
    the urgent list for the escalation to fire.
  */
  it('escalates a foot wound recorded in either place, and reports it once', () => {
    expect(deriveDiabetesEscalation({ currentFootWound: 'YES' }).reasons).toEqual([
      'ACTIVE_FOOT_WOUND',
    ]);
    expect(
      deriveDiabetesEscalation({
        urgentSymptoms: ['ACTIVE_FOOT_WOUND'],
        currentFootWound: 'YES',
      }).reasons,
    ).toEqual(['ACTIVE_FOOT_WOUND']);
  });

  it('does not escalate an unsure or absent foot wound', () => {
    expect(deriveDiabetesEscalation({ currentFootWound: 'UNSURE' }).urgentReviewRequired).toBe(
      false,
    );
    expect(
      deriveDiabetesEscalation({ currentFootWound: 'NOT_ASSESSED' }).urgentReviewRequired,
    ).toBe(false);
  });

  /*
    Hypoglycemia is the one conclusion an unknown measurement context does not suppress.

    A glucose of 55 is low whether it was fasting or random, and the failure mode of being wrong
    here is a clinician looking at a patient who was fine.
  */
  it('escalates a low glucose regardless of measurement context', () => {
    for (const context of ['FASTING', 'RANDOM', 'UNKNOWN'] as const) {
      expect(
        deriveDiabetesEscalation({
          glucoseMgDl: DM_HYPOGLYCEMIA_MG_DL - 10,
          glucoseContext: context,
        }).reasons,
      ).toEqual(['HYPOGLYCEMIA']);
    }
  });

  it('does not escalate a glucose above the low cut-off', () => {
    expect(
      deriveDiabetesEscalation({ glucoseMgDl: DM_HYPOGLYCEMIA_MG_DL + 1 }).urgentReviewRequired,
    ).toBe(false);
  });

  it('lists every reason when several apply', () => {
    const result = deriveDiabetesEscalation({
      urgentSymptoms: ['VOMITING', 'CONFUSION'],
      currentFootWound: 'YES',
      glucoseMgDl: 50,
    });
    expect(result.reasons).toEqual([
      'URGENT_SYMPTOM_VOMITING',
      'URGENT_SYMPTOM_CONFUSION',
      'ACTIVE_FOOT_WOUND',
      'HYPOGLYCEMIA',
    ]);
  });

  it('escalates nothing from an empty record', () => {
    expect(deriveDiabetesEscalation({})).toEqual({ urgentReviewRequired: false, reasons: [] });
  });
});

describe('reviewReasonsForDiabetesEscalation', () => {
  it('only ever names a declared review reason', () => {
    const declared = new Set<string>(DIABETES_REVIEW_REASONS);
    const reasons = reviewReasonsForDiabetesEscalation({
      urgentReviewRequired: true,
      reasons: [
        'ACTIVE_FOOT_WOUND',
        'HYPOGLYCEMIA',
        'URGENT_SYMPTOM_VOMITING',
        'URGENT_SYMPTOM_CONFUSION',
      ],
    });
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) expect(declared.has(reason)).toBe(true);
  });

  it('selects nothing when nothing escalated', () => {
    expect(
      reviewReasonsForDiabetesEscalation({ urgentReviewRequired: false, reasons: [] }),
    ).toEqual([]);
  });
});

describe('evaluateDiabetesMentalHealth', () => {
  it('scores a completed negative screen', () => {
    const result = evaluateDiabetesMentalHealth({
      phq2Interest: 'NOT_AT_ALL',
      phq2Mood: 'SEVERAL_DAYS',
      distressOverwhelmed: 'SLIGHT_PROBLEM',
      distressFailing: 'NOT_A_PROBLEM',
    });
    expect(result).toEqual({
      phq2Total: 1,
      phq2Positive: false,
      distressPositive: false,
      reviewReasons: [],
    });
  });

  it('raises a review reason for a positive PHQ-2', () => {
    const result = evaluateDiabetesMentalHealth({
      phq2Interest: 'MORE_THAN_HALF_THE_DAYS',
      phq2Mood: 'SEVERAL_DAYS',
    });
    expect(result.phq2Total).toBe(3);
    expect(result.phq2Positive).toBe(true);
    expect(result.reviewReasons).toEqual(['POSITIVE_MENTAL_HEALTH_SCREEN']);
  });

  it('raises a review reason for distress at moderate or greater', () => {
    const result = evaluateDiabetesMentalHealth({ distressFailing: 'MODERATE_PROBLEM' });
    expect(result.distressPositive).toBe(true);
    expect(result.reviewReasons).toEqual(['DIABETES_DISTRESS']);
  });

  it('raises both when both screens are positive', () => {
    const result = evaluateDiabetesMentalHealth({
      phq2Interest: 'NEARLY_EVERY_DAY',
      phq2Mood: 'NEARLY_EVERY_DAY',
      distressOverwhelmed: 'VERY_SERIOUS_PROBLEM',
    });
    expect(result.reviewReasons).toEqual(['POSITIVE_MENTAL_HEALTH_SCREEN', 'DIABETES_DISTRESS']);
  });

  /* An unasked screen is not a negative screen, and must raise nothing. */
  it('raises nothing for a screen that was never administered', () => {
    expect(evaluateDiabetesMentalHealth({})).toEqual({
      phq2Total: null,
      phq2Positive: false,
      distressPositive: false,
      reviewReasons: [],
    });
  });
});

describe('vocabulary completeness', () => {
  it.each([
    ['statuses', DIABETES_STATUSES, DIABETES_STATUS_LABELS],
    ['types', DIABETES_TYPES, DIABETES_TYPE_LABELS],
    ['concerns', DIABETES_CONCERNS, DIABETES_CONCERN_LABELS],
    ['interview symptoms', DIABETES_INTERVIEW_SYMPTOMS, DIABETES_INTERVIEW_SYMPTOM_LABELS],
    ['urgent symptoms', DIABETES_URGENT_SYMPTOMS, DIABETES_URGENT_SYMPTOM_LABELS],
    ['volunteer actions', DIABETES_VOLUNTEER_ACTIONS, DIABETES_VOLUNTEER_ACTION_LABELS],
    ['review reasons', DIABETES_REVIEW_REASONS, DIABETES_REVIEW_REASON_LABELS],
    ['clinician plan items', DIABETES_CLINICIAN_PLAN_ITEMS, DIABETES_CLINICIAN_PLAN_ITEM_LABELS],
  ] as ReadonlyArray<[string, readonly string[], Record<string, string>]>)(
    'labels every one of the %s',
    (_name, members, labels) => {
      expect(Object.keys(labels).sort()).toEqual([...members].sort());
    },
  );

  it('labels every escalation reason', () => {
    const produced = deriveDiabetesEscalation({
      urgentSymptoms: [...DIABETES_URGENT_SYMPTOMS],
      currentFootWound: 'YES',
      glucoseMgDl: 40,
    }).reasons;
    expect(produced.length).toBeGreaterThan(0);
    for (const reason of produced) {
      expect(DIABETES_ESCALATION_REASON_LABELS[reason]).toBeTruthy();
    }
  });

  /*
    The two symptom lists answer different questions and must stay distinguishable.

    The past-month list is recall; the urgent list is about this minute. If they ever converged,
    "had a foot wound last month" and "has an open wound now" would collapse into one fact.
  */
  it('keeps the past-month and right-now symptom lists distinct', () => {
    expect(DIABETES_INTERVIEW_SYMPTOMS).toContain('FOOT_WOUND');
    expect(DIABETES_URGENT_SYMPTOMS).toContain('ACTIVE_FOOT_WOUND');
    expect(DIABETES_INTERVIEW_SYMPTOMS).not.toContain('ACTIVE_FOOT_WOUND');
    expect(DIABETES_URGENT_SYMPTOMS).not.toContain('FOOT_WOUND');
  });
});
