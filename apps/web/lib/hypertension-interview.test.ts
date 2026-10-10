import {
  HYPERTENSION_FIELD_ORDER,
  emptyHypertensionInterview,
  fromHypertensionRecord,
  toHypertensionPayload,
  validateHypertensionInterview,
  type HypertensionInterviewValues,
} from './hypertension-interview';

const COLLECTED_AT = '2026-09-13T12:00:00.000Z';

function values(overrides: Partial<HypertensionInterviewValues> = {}) {
  return { ...emptyHypertensionInterview(), ...overrides };
}

describe('validateHypertensionInterview', () => {
  it('accepts an untouched interview', () => {
    expect(validateHypertensionInterview(values())).toEqual({});
  });

  describe('the repeat reading', () => {
    /*
      A repeat is a reading, and half a reading is not one.

      Both the trend and the escalation treat it as a pair, so a systolic entered without its
      diastolic is silently ignored by both -- which looks to a volunteer like the value did not
      save.
    */
    it('requires both halves or neither', () => {
      const errors = validateHypertensionInterview(values({ repeatSystolicBp: '142' }));
      expect(errors['htn-repeat-systolic']).toMatch(/both repeat readings/i);
      expect(errors['htn-repeat-diastolic']).toMatch(/both repeat readings/i);

      expect(
        validateHypertensionInterview(values({ repeatSystolicBp: '142', repeatDiastolicBp: '88' })),
      ).toEqual({});
    });

    it('catches a transposed reading', () => {
      const errors = validateHypertensionInterview(
        values({ repeatSystolicBp: '80', repeatDiastolicBp: '140' }),
      );
      expect(errors['htn-repeat-systolic']).toMatch(/swapped/i);
    });

    it('rejects a value outside the plausible range', () => {
      expect(
        validateHypertensionInterview(values({ repeatSystolicBp: '999', repeatDiastolicBp: '88' }))[
          'htn-repeat-systolic'
        ],
      ).toMatch(/between 40 and 300/);
    });

    it('rejects something that is not a whole number', () => {
      expect(
        validateHypertensionInterview(values({ repeatSystolicBp: '14x' }))['htn-repeat-systolic'],
      ).toMatch(/whole number/i);
    });
  });

  describe('the year of diagnosis', () => {
    it('rejects a year in the future', () => {
      const nextYear = String(new Date().getUTCFullYear() + 1);
      expect(
        validateHypertensionInterview(values({ yearDiagnosed: nextYear }))['htn-year-diagnosed'],
      ).toMatch(/Enter a year between/);
    });

    /*
      The record has room to store both, and both cannot be true. Two answers with nothing saying
      which the note should render is worse than one refusal.
    */
    it('refuses a year and "unknown" together', () => {
      expect(
        validateHypertensionInterview(
          values({ yearDiagnosed: '2020', yearDiagnosedUnknown: true }),
        )['htn-year-diagnosed'],
      ).toMatch(/Only one of the two/);
    });

    it('accepts "unknown" on its own', () => {
      expect(validateHypertensionInterview(values({ yearDiagnosedUnknown: true }))).toEqual({});
    });
  });

  describe('"none" is an answer, not an absence', () => {
    it.each([
      ['currentSymptoms', 'NONE', 'CHEST_PAIN', 'htn-symptoms'],
      ['relevantConditions', 'NONE_KNOWN', 'DIABETES', 'htn-conditions'],
      ['contributingSubstances', 'NONE', 'NSAID', 'htn-substances'],
      [
        'volunteerActions',
        'NO_INTERVENTION_COMPLETED',
        'REVIEWED_TODAYS_BP',
        'htn-volunteer-actions',
      ],
      ['reviewReasons', 'ROUTINE_REVIEW_ONLY', 'MEDICATION_PROBLEM', 'htn-review-reasons'],
    ])('refuses %s holding both %s and %s', (field, none, other, fieldId) => {
      const errors = validateHypertensionInterview(values({ [field]: [none, other] } as never));
      expect(errors[fieldId]).toBeTruthy();
    });

    it('accepts the exclusive answer on its own', () => {
      expect(validateHypertensionInterview(values({ currentSymptoms: ['NONE'] }))).toEqual({});
    });
  });

  describe('free text that a choice makes mandatory', () => {
    it('requires a description for Other', () => {
      expect(
        validateHypertensionInterview(values({ mainConcern: 'OTHER' }))['htn-main-concern-other'],
      ).toBeTruthy();
      expect(
        validateHypertensionInterview(values({ reviewReasons: ['OTHER'] }))[
          'htn-review-reason-other'
        ],
      ).toBeTruthy();
    });

    it('requires a facility name once one is claimed to be selected', () => {
      expect(
        validateHypertensionInterview(values({ usualCareFacilityStatus: 'SELECTED' }))[
          'htn-usual-care-facility'
        ],
      ).toBeTruthy();
      expect(
        validateHypertensionInterview(
          values({ usualCareFacilityStatus: 'SELECTED', usualCareFacility: 'Cape Coast Teaching' }),
        ),
      ).toEqual({});
    });
  });

  /* The shared parser owns the JSONB contract; this asserts its issues reach a real control. */
  it('surfaces a lifestyle problem on the control that produced it', () => {
    const errors = validateHypertensionInterview(
      values({
        lifestyle: { ...emptyHypertensionInterview().lifestyle, activeDaysPerWeek: 99 },
      }),
    );
    expect(errors['htn-lifestyle-active-days']).toBeTruthy();
  });
});

/*
  `focusFirstInvalid` walks FIELD_ORDER, not the error object.

  Iterating the errors gives insertion order -- whatever order the validator happened to run in --
  which on a form this long is the difference between landing on the first problem and landing on
  an arbitrary one three sections away. A key the validator can emit but the list does not name is
  a field focus silently skips.
*/
describe('HYPERTENSION_FIELD_ORDER', () => {
  it('names every field the validator can report', () => {
    const emitted = new Set<string>();
    const nextYear = String(new Date().getUTCFullYear() + 1);
    const cases: Partial<HypertensionInterviewValues>[] = [
      { repeatSystolicBp: '14x' },
      { repeatSystolicBp: '142' },
      { homeSystolicAvg: '999' },
      { homeDiastolicAvg: '999' },
      { homeSystolicAvg: '90', homeDiastolicAvg: '120' },
      { yearDiagnosed: nextYear },
      { mainConcern: 'OTHER' },
      { reviewReasons: ['OTHER'] },
      { medicationReminderStrategies: ['OTHER'] },
      { usualCareFacilityStatus: 'SELECTED' },
      { currentSymptoms: ['NONE', 'CHEST_PAIN'] },
      { relevantConditions: ['NONE_KNOWN', 'DIABETES'] },
      { contributingSubstances: ['NONE', 'NSAID'] },
      { volunteerActions: ['NO_INTERVENTION_COMPLETED', 'REVIEWED_TODAYS_BP'] },
      { reviewReasons: ['ROUTINE_REVIEW_ONLY', 'MEDICATION_PROBLEM'] },
      { lifestyle: { ...emptyHypertensionInterview().lifestyle, activeDaysPerWeek: 99 } },
    ];
    for (const override of cases) {
      for (const key of Object.keys(validateHypertensionInterview(values(override)))) {
        emitted.add(key);
      }
    }

    expect(emitted.size).toBeGreaterThan(10);
    const missing = [...emitted].filter((key) => !HYPERTENSION_FIELD_ORDER.includes(key));
    expect(missing).toEqual([]);
  });

  it('lists each field once', () => {
    expect(new Set(HYPERTENSION_FIELD_ORDER).size).toBe(HYPERTENSION_FIELD_ORDER.length);
  });
});

describe('toHypertensionPayload', () => {
  it('turns blank numeric input into null rather than zero', () => {
    const payload = toHypertensionPayload(values(), COLLECTED_AT);
    expect(payload.repeatSystolicBp).toBeNull();
    expect(payload.yearDiagnosed).toBeNull();
    expect(payload.homeSystolicAvg).toBeNull();
  });

  it('parses entered numbers once', () => {
    const payload = toHypertensionPayload(
      values({ repeatSystolicBp: '142', repeatDiastolicBp: '88', yearDiagnosed: '2020' }),
      COLLECTED_AT,
    );
    expect(payload).toMatchObject({
      repeatSystolicBp: 142,
      repeatDiastolicBp: 88,
      yearDiagnosed: 2020,
    });
  });

  /*
    The server ignores a classification unless the override flag is set, so sending one without it
    is noise that looks like an assertion. Omitting it keeps the payload honest.
  */
  it('sends a classification only when the clinician claimed an override', () => {
    expect(
      toHypertensionPayload(values({ classification: 'NORMAL' }), COLLECTED_AT),
    ).not.toHaveProperty('classification');
    expect(
      toHypertensionPayload(
        values({ classification: 'NORMAL', classificationOverridden: true }),
        COLLECTED_AT,
      ),
    ).toMatchObject({ classification: 'NORMAL', classificationOverridden: true });
  });

  /* Free text that its own choice no longer justifies must not survive in the record. */
  it('drops conditional free text when the choice that required it changes', () => {
    const payload = toHypertensionPayload(
      values({ mainConcern: 'HIGH_BP', mainConcernOther: 'left over from an earlier answer' }),
      COLLECTED_AT,
    );
    expect(payload.mainConcernOther).toBeNull();
  });

  it('clears home readings once they are marked unknown', () => {
    const payload = toHypertensionPayload(
      values({ homeSystolicAvg: '130', homeDiastolicAvg: '85', homeReadingsUnknown: true }),
      COLLECTED_AT,
    );
    expect(payload.homeSystolicAvg).toBeNull();
    expect(payload.homeDiastolicAvg).toBeNull();
  });

  it('clears the year once it is marked unknown', () => {
    const payload = toHypertensionPayload(
      values({ yearDiagnosed: '2020', yearDiagnosedUnknown: true }),
      COLLECTED_AT,
    );
    expect(payload.yearDiagnosed).toBeNull();
  });

  /* Derived columns are the server's. Sending them would look like an assertion. */
  it('never sends a derived field', () => {
    const payload = toHypertensionPayload(values(), COLLECTED_AT);
    for (const key of ['derivedClassification', 'urgentReviewRequired', 'urgentReviewReasons']) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('never sends a clinician-plan field', () => {
    const payload = toHypertensionPayload(values(), COLLECTED_AT);
    for (const key of [
      'clinicianPlanItems',
      'bpGoalSystolic',
      'followUpWindow',
      'clinicianComments',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});

describe('fromHypertensionRecord', () => {
  it('reads an absent record as an untouched interview', () => {
    expect(fromHypertensionRecord(null)).toEqual(emptyHypertensionInterview());
  });

  it('round-trips through the payload builder', () => {
    const original = values({
      hypertensionStatus: 'KNOWN_HYPERTENSION',
      yearDiagnosed: '2019',
      repeatSystolicBp: '138',
      repeatDiastolicBp: '86',
      currentSymptoms: ['SEVERE_HEADACHE'],
      reviewReasons: ['MEDICATION_PROBLEM'],
      notes: 'Tolerating amlodipine.',
    });
    const restored = fromHypertensionRecord(toHypertensionPayload(original, COLLECTED_AT));

    expect(restored.hypertensionStatus).toBe('KNOWN_HYPERTENSION');
    expect(restored.yearDiagnosed).toBe('2019');
    expect(restored.repeatSystolicBp).toBe('138');
    expect(restored.currentSymptoms).toEqual(['SEVERE_HEADACHE']);
    expect(restored.notes).toBe('Tolerating amlodipine.');
  });

  /*
    A record written by a build that knew more than this one must not crash the form.

    Sync pulls whatever the server has, and a volunteer's device can be a release behind.
  */
  it('survives a record carrying values this build does not know', () => {
    const restored = fromHypertensionRecord({
      hypertensionStatus: 'SOMETHING_NEWER',
      currentSymptoms: ['CHEST_PAIN', 42, null],
      lifestyle: { saltAtTable: 'CONSTANTLY' },
      yearDiagnosed: 'not a number',
    });

    expect(restored.hypertensionStatus).toBe('SOMETHING_NEWER');
    expect(restored.currentSymptoms).toEqual(['CHEST_PAIN']);
    expect(restored.lifestyle.saltAtTable).toBe('NOT_ASSESSED');
    expect(restored.yearDiagnosed).toBe('');
  });
});
