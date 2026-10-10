import {
  BP_ESCALATION_DIASTOLIC,
  BP_ESCALATION_SYSTOLIC,
  BP_HYPOTENSION_SYSTOLIC,
} from './bp-classification';
import {
  BP_AFFECTING_SUBSTANCES,
  BP_AFFECTING_SUBSTANCE_LABELS,
  CARDIOMETABOLIC_CONDITIONS,
  CARDIOMETABOLIC_CONDITION_LABELS,
  HYPERTENSION_CLINICIAN_PLAN_ITEMS,
  HYPERTENSION_CLINICIAN_PLAN_ITEM_LABELS,
  HYPERTENSION_CONCERNS,
  HYPERTENSION_CONCERN_LABELS,
  HYPERTENSION_ESCALATION_REASON_LABELS,
  HYPERTENSION_LIFESTYLE_SCHEMA_VERSION,
  HYPERTENSION_REVIEW_REASONS,
  HYPERTENSION_REVIEW_REASON_LABELS,
  HYPERTENSION_STATUSES,
  HYPERTENSION_STATUS_LABELS,
  HYPERTENSION_SYMPTOMS,
  HYPERTENSION_SYMPTOM_LABELS,
  HYPERTENSION_VOLUNTEER_ACTIONS,
  HYPERTENSION_VOLUNTEER_ACTION_LABELS,
  contributingSubstancesForReview,
  deriveHypertensionEscalation,
  emptyHypertensionLifestyle,
  parseHypertensionLifestyle,
  parseHypertensionSubstanceDetails,
  reviewReasonsForEscalation,
  serializeHypertensionLifestyle,
  serializeHypertensionSubstanceDetails,
} from './hypertension-interview';

describe('parseHypertensionLifestyle', () => {
  it('round-trips a serialized payload without issues', () => {
    const original = {
      ...emptyHypertensionLifestyle(),
      saltDuringCooking: 'USUALLY' as const,
      fruitVegetables: 'SOME_DAYS' as const,
      activeDaysPerWeek: 3,
      alcoholUse: 'OCCASIONALLY' as const,
      breakfastYesterday: 'Koko and bread',
    };
    const parsed = parseHypertensionLifestyle(serializeHypertensionLifestyle(original));
    expect(parsed.issues).toEqual([]);
    expect(parsed.payload).toEqual(original);
    expect(parsed.schemaVersion).toBe(HYPERTENSION_LIFESTYLE_SCHEMA_VERSION);
  });

  it('reads an absent section as an unanswered one', () => {
    const parsed = parseHypertensionLifestyle(null);
    expect(parsed.issues).toEqual([]);
    expect(parsed.payload).toEqual(emptyHypertensionLifestyle());
  });

  /*
    Paths are dotted so the form can key a FieldError off them directly.

    This is the whole reason parsing returns issues instead of throwing: the DTO renders this list
    as a BadRequestException and the form renders the same list next to the controls that caused
    it, from one parse.
  */
  it('reports an unknown value at a path the form can use as a field key', () => {
    const parsed = parseHypertensionLifestyle({ saltAtTable: 'CONSTANTLY' });
    expect(parsed.issues).toEqual([
      expect.objectContaining({ path: 'lifestyle.saltAtTable', code: 'UNKNOWN_VALUE' }),
    ]);
    expect(parsed.payload.saltAtTable).toBe('NOT_ASSESSED');
  });

  it('rejects a key the contract does not declare', () => {
    const parsed = parseHypertensionLifestyle({ favouriteColour: 'blue' });
    expect(parsed.issues).toEqual([
      expect.objectContaining({ path: 'lifestyle.favouriteColour', code: 'UNKNOWN_KEY' }),
    ]);
  });

  it('bounds activity days to a week', () => {
    expect(parseHypertensionLifestyle({ activeDaysPerWeek: 7 }).issues).toEqual([]);
    expect(parseHypertensionLifestyle({ activeDaysPerWeek: 8 }).issues).toEqual([
      expect.objectContaining({ path: 'lifestyle.activeDaysPerWeek' }),
    ]);
    expect(parseHypertensionLifestyle({ activeDaysPerWeek: -1 }).issues).toHaveLength(1);
  });

  it('reports every problem in one pass', () => {
    const parsed = parseHypertensionLifestyle({
      saltAtTable: 'CONSTANTLY',
      activeDaysPerWeek: 99,
      somethingElse: true,
    });
    expect(parsed.issues.map((i) => i.path).sort()).toEqual([
      'lifestyle.activeDaysPerWeek',
      'lifestyle.saltAtTable',
      'lifestyle.somethingElse',
    ]);
  });

  it('reports a payload written by a newer build without throwing', () => {
    const parsed = parseHypertensionLifestyle({
      schemaVersion: HYPERTENSION_LIFESTYLE_SCHEMA_VERSION + 1,
    });
    expect(parsed.issues).toEqual([
      expect.objectContaining({ path: 'schemaVersion', code: 'SCHEMA_VERSION' }),
    ]);
  });
});

describe('deriveHypertensionEscalation', () => {
  it('does not escalate an ordinary visit', () => {
    expect(
      deriveHypertensionEscalation({ symptoms: ['NONE'], systolicBp: 128, diastolicBp: 78 }),
    ).toEqual({ urgentReviewRequired: false, reasons: [] });
  });

  it.each([
    ['CHEST_PAIN', 'URGENT_SYMPTOM_CHEST_PAIN'],
    ['SHORTNESS_OF_BREATH', 'URGENT_SYMPTOM_SHORTNESS_OF_BREATH'],
    ['CONFUSION', 'URGENT_SYMPTOM_CONFUSION'],
    ['FAINTING', 'URGENT_SYMPTOM_FAINTING'],
    ['NEW_WEAKNESS_OR_NUMBNESS', 'URGENT_SYMPTOM_NEUROLOGIC'],
    ['DIFFICULTY_SPEAKING', 'URGENT_SYMPTOM_NEUROLOGIC'],
  ] as const)('escalates on %s', (symptom, reason) => {
    const result = deriveHypertensionEscalation({ symptoms: [symptom] });
    expect(result.urgentReviewRequired).toBe(true);
    expect(result.reasons).toContain(reason);
  });

  /* Chest pain at a normal blood pressure is still chest pain. */
  it('escalates on a symptom regardless of the reading', () => {
    const result = deriveHypertensionEscalation({
      symptoms: ['CHEST_PAIN'],
      systolicBp: 118,
      diastolicBp: 76,
    });
    expect(result.urgentReviewRequired).toBe(true);
  });

  it('does not escalate on the non-urgent symptoms', () => {
    const result = deriveHypertensionEscalation({
      symptoms: ['SEVERE_HEADACHE', 'BLURRED_VISION', 'SEVERE_DIZZINESS'],
    });
    expect(result.urgentReviewRequired).toBe(false);
  });

  it('reports one neurologic reason even when both neurologic symptoms are present', () => {
    const result = deriveHypertensionEscalation({
      symptoms: ['NEW_WEAKNESS_OR_NUMBNESS', 'DIFFICULTY_SPEAKING'],
    });
    expect(result.reasons).toEqual(['URGENT_SYMPTOM_NEUROLOGIC']);
  });

  it('escalates a severely elevated reading', () => {
    const result = deriveHypertensionEscalation({
      systolicBp: BP_ESCALATION_SYSTOLIC,
      diastolicBp: 90,
    });
    expect(result.reasons).toEqual(['SEVERELY_ELEVATED_BP']);
  });

  it('escalates a low reading', () => {
    const result = deriveHypertensionEscalation({
      systolicBp: BP_HYPOTENSION_SYSTOLIC - 5,
      diastolicBp: 55,
    });
    expect(result.reasons).toEqual(['HYPOTENSION']);
  });

  describe('the repeat reading wins', () => {
    /*
      This is the entire purpose of asking for a repeat.

      A single high reading is frequently an artefact of a rushed cuff or the walk into the room.
      Escalating on the initial value after a calm repeat came back normal would fire the alert on
      a large share of a screening clinic and train volunteers to dismiss it.
    */
    it('does not escalate when a calm repeat came back normal', () => {
      const result = deriveHypertensionEscalation({
        systolicBp: 190,
        diastolicBp: 115,
        repeatSystolicBp: 142,
        repeatDiastolicBp: 88,
      });
      expect(result.urgentReviewRequired).toBe(false);
    });

    it('escalates when the repeat confirms the reading', () => {
      const result = deriveHypertensionEscalation({
        systolicBp: 190,
        diastolicBp: 115,
        repeatSystolicBp: 186,
        repeatDiastolicBp: 112,
      });
      expect(result.reasons).toEqual(['SEVERELY_ELEVATED_BP']);
    });

    it('escalates when only the repeat is severe', () => {
      const result = deriveHypertensionEscalation({
        systolicBp: 150,
        diastolicBp: 92,
        repeatSystolicBp: BP_ESCALATION_SYSTOLIC + 4,
        repeatDiastolicBp: BP_ESCALATION_DIASTOLIC + 2,
      });
      expect(result.reasons).toEqual(['SEVERELY_ELEVATED_BP']);
    });

    it('uses the initial reading when no repeat was taken', () => {
      const result = deriveHypertensionEscalation({ systolicBp: 195, diastolicBp: 120 });
      expect(result.reasons).toEqual(['SEVERELY_ELEVATED_BP']);
    });

    /* A half-entered repeat still counts as a repeat; it must not silently fall back. */
    it('treats a partially entered repeat as the reading of record', () => {
      const result = deriveHypertensionEscalation({
        systolicBp: 195,
        diastolicBp: 120,
        repeatSystolicBp: 138,
        repeatDiastolicBp: null,
      });
      expect(result.urgentReviewRequired).toBe(false);
    });
  });

  it('lists every reason when several apply', () => {
    const result = deriveHypertensionEscalation({
      symptoms: ['CHEST_PAIN', 'CONFUSION'],
      systolicBp: 200,
      diastolicBp: 125,
    });
    expect(result.reasons).toEqual([
      'URGENT_SYMPTOM_CHEST_PAIN',
      'URGENT_SYMPTOM_CONFUSION',
      'SEVERELY_ELEVATED_BP',
    ]);
  });

  it('escalates nothing from an empty record', () => {
    expect(deriveHypertensionEscalation({})).toEqual({
      urgentReviewRequired: false,
      reasons: [],
    });
    expect(deriveHypertensionEscalation({ symptoms: null })).toEqual({
      urgentReviewRequired: false,
      reasons: [],
    });
  });
});

describe('reviewReasonsForEscalation', () => {
  it('maps each escalation onto a reason the guided plan offers', () => {
    expect(
      reviewReasonsForEscalation({
        urgentReviewRequired: true,
        reasons: ['SEVERELY_ELEVATED_BP'],
      }),
    ).toEqual(['SEVERELY_ELEVATED_BP']);

    expect(
      reviewReasonsForEscalation({ urgentReviewRequired: true, reasons: ['HYPOTENSION'] }),
    ).toEqual(['LOW_BP_OR_DIZZINESS']);

    expect(
      reviewReasonsForEscalation({
        urgentReviewRequired: true,
        reasons: ['URGENT_SYMPTOM_CHEST_PAIN', 'URGENT_SYMPTOM_CONFUSION'],
      }),
    ).toEqual(['CONCERNING_SYMPTOMS']);
  });

  it('selects nothing when nothing escalated', () => {
    expect(reviewReasonsForEscalation({ urgentReviewRequired: false, reasons: [] })).toEqual([]);
  });

  /* Whatever it preselects must be an option the form actually renders. */
  it('only ever names a declared review reason', () => {
    const declared = new Set<string>(HYPERTENSION_REVIEW_REASONS);
    const all = reviewReasonsForEscalation({
      urgentReviewRequired: true,
      reasons: [
        'SEVERELY_ELEVATED_BP',
        'HYPOTENSION',
        'URGENT_SYMPTOM_CHEST_PAIN',
        'URGENT_SYMPTOM_NEUROLOGIC',
      ],
    });
    for (const reason of all) expect(declared.has(reason)).toBe(true);
  });
});

describe('vocabulary completeness', () => {
  it.each([
    ['statuses', HYPERTENSION_STATUSES, HYPERTENSION_STATUS_LABELS],
    ['concerns', HYPERTENSION_CONCERNS, HYPERTENSION_CONCERN_LABELS],
    ['symptoms', HYPERTENSION_SYMPTOMS, HYPERTENSION_SYMPTOM_LABELS],
    ['substances', BP_AFFECTING_SUBSTANCES, BP_AFFECTING_SUBSTANCE_LABELS],
    ['conditions', CARDIOMETABOLIC_CONDITIONS, CARDIOMETABOLIC_CONDITION_LABELS],
    ['volunteer actions', HYPERTENSION_VOLUNTEER_ACTIONS, HYPERTENSION_VOLUNTEER_ACTION_LABELS],
    ['review reasons', HYPERTENSION_REVIEW_REASONS, HYPERTENSION_REVIEW_REASON_LABELS],
    [
      'clinician plan items',
      HYPERTENSION_CLINICIAN_PLAN_ITEMS,
      HYPERTENSION_CLINICIAN_PLAN_ITEM_LABELS,
    ],
  ] as ReadonlyArray<[string, readonly string[], Record<string, string>]>)(
    'labels every one of the %s',
    (_name, members, labels) => {
      expect(Object.keys(labels).sort()).toEqual([...members].sort());
      for (const member of members) expect(labels[member]).toBeTruthy();
    },
  );

  /*
    The note generator renders these labels into prose, so an escalation reason without one would
    put "undefined" into a clinical note.
  */
  it('labels every escalation reason', () => {
    const produced = new Set(
      deriveHypertensionEscalation({
        symptoms: [...HYPERTENSION_SYMPTOMS],
        systolicBp: 200,
        diastolicBp: 125,
      }).reasons,
    );
    produced.add('HYPOTENSION');
    for (const reason of produced) {
      expect(HYPERTENSION_ESCALATION_REASON_LABELS[reason]).toBeTruthy();
    }
  });
});

describe('parseHypertensionSubstanceDetails', () => {
  it('round-trips entries without issues', () => {
    const payload = {
      entries: [
        { substance: 'NSAID' as const, name: 'Ibuprofen', frequency: 'DAILY' as const },
        {
          substance: 'HERBAL_OR_TRADITIONAL' as const,
          name: null,
          frequency: 'OCCASIONALLY' as const,
        },
      ],
    };
    const parsed = parseHypertensionSubstanceDetails(
      serializeHypertensionSubstanceDetails(payload),
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.payload).toEqual(payload);
  });

  it('reads an absent section as no entries', () => {
    expect(parseHypertensionSubstanceDetails(null).payload).toEqual({ entries: [] });
    expect(parseHypertensionSubstanceDetails(null).issues).toEqual([]);
  });

  /*
    One entry per substance.

    Two entries for NSAIDs could carry two different frequencies, and the note generator would
    have no principled way to choose which to render.
  */
  it('rejects a duplicate substance rather than keeping both', () => {
    const parsed = parseHypertensionSubstanceDetails({
      entries: [
        { substance: 'NSAID', frequency: 'DAILY' },
        { substance: 'NSAID', frequency: 'OCCASIONALLY' },
      ],
    });
    expect(parsed.payload.entries).toHaveLength(1);
    expect(parsed.payload.entries[0].frequency).toBe('DAILY');
    expect(parsed.issues[0]).toMatchObject({ path: 'substances.entries[1].substance' });
  });

  it('reports a bad entry by index and keeps the good ones', () => {
    const parsed = parseHypertensionSubstanceDetails({
      entries: [{ substance: 'STEROIDS' }, { frequency: 'DAILY' }],
    });
    expect(parsed.payload.entries.map((e) => e.substance)).toEqual(['STEROIDS']);
    expect(parsed.issues[0]).toMatchObject({ path: 'substances.entries[1].substance' });
  });

  it('reports an over-long substance name', () => {
    const parsed = parseHypertensionSubstanceDetails({
      entries: [{ substance: 'STIMULANTS', name: 'x'.repeat(500), frequency: 'DAILY' }],
    });
    expect(parsed.issues[0]).toMatchObject({ code: 'TOO_LONG' });
  });
});

describe('contributingSubstancesForReview', () => {
  /*
    NONE and UNSURE are answers to the question, not substances.

    Flagging "None" for clinician review would send a clinician to look at a patient because the
    volunteer confirmed there was nothing to look at.
  */
  it('excludes the answers that name no substance', () => {
    expect(contributingSubstancesForReview(['NONE'])).toEqual([]);
    expect(contributingSubstancesForReview(['UNSURE'])).toEqual([]);
    expect(contributingSubstancesForReview(['NSAID', 'NONE', 'STEROIDS'])).toEqual([
      'NSAID',
      'STEROIDS',
    ]);
  });

  it('flags nothing for an unasked section', () => {
    expect(contributingSubstancesForReview(null)).toEqual([]);
    expect(contributingSubstancesForReview([])).toEqual([]);
  });
});
