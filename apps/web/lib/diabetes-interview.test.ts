import {
  DIABETES_FIELD_ORDER,
  emptyDiabetesInterview,
  fromDiabetesRecord,
  toDiabetesPayload,
  validateDiabetesInterview,
  withGlucoseUnit,
  type DiabetesInterviewValues,
} from './diabetes-interview';

const COLLECTED_AT = '2026-09-13T12:00:00.000Z';

function values(overrides: Partial<DiabetesInterviewValues> = {}) {
  return { ...emptyDiabetesInterview(), ...overrides };
}

describe('validateDiabetesInterview', () => {
  it('accepts an untouched interview', () => {
    expect(validateDiabetesInterview(values())).toEqual({});
  });

  describe("today's glucose", () => {
    /*
      A reading without its timing cannot be interpreted.

      09_DIABETES_SCREENING.md says an unknown-context measurement is never classified, so a
      glucose recorded without one is a number nobody can act on. Asking while the patient is still
      in the room beats storing something uninterpretable.
    */
    it('requires a timing once a value is entered', () => {
      expect(validateDiabetesInterview(values({ glucose: '126' }))['dm-glucose-timing']).toMatch(
        /cannot be interpreted/i,
      );
      expect(validateDiabetesInterview(values({ glucose: '126', glucoseType: 'FASTING' }))).toEqual(
        {},
      );
    });

    it('does not demand a timing when no glucose was taken', () => {
      expect(validateDiabetesInterview(values({ glucoseType: 'UNKNOWN' }))).toEqual({});
    });

    it('bounds the value', () => {
      expect(
        validateDiabetesInterview(values({ glucose: '9000', glucoseType: 'RANDOM' }))['dm-glucose'],
      ).toMatch(/from 0 to 600 mg\/dL/);
    });
  });

  describe('HbA1c', () => {
    /* A value and "never checked" cannot both be true, and the record has room for both. */
    it('refuses a value alongside "never checked"', () => {
      expect(
        validateDiabetesInterview(values({ hba1c: '7.2', hba1cStatus: 'NEVER_CHECKED' }))[
          'dm-hba1c-status'
        ],
      ).toMatch(/Only one of the two/);
    });

    it('accepts a value with a known status', () => {
      expect(
        validateDiabetesInterview(values({ hba1c: '7.2', hba1cStatus: 'VALUE_KNOWN' })),
      ).toEqual({});
    });

    it('accepts a decimal', () => {
      expect(
        validateDiabetesInterview(values({ hba1c: '6.45', hba1cStatus: 'VALUE_KNOWN' })),
      ).toEqual({});
    });

    it('rejects something that is not a number', () => {
      expect(
        validateDiabetesInterview(values({ hba1c: '7.2%', hba1cStatus: 'VALUE_KNOWN' }))[
          'dm-hba1c'
        ],
      ).toMatch(/Enter a value from 0 to 100%/);
    });
  });

  describe('home readings', () => {
    it('refuses a lowest above the highest', () => {
      const errors = validateDiabetesInterview(
        values({ homeGlucoseLow: '300', homeGlucoseHigh: '100' }),
      );
      expect(errors['dm-home-low']).toMatch(/cannot be higher/i);
      expect(errors['dm-home-high']).toMatch(/cannot be higher/i);
    });

    it('accepts a sensible range, including one where both are equal', () => {
      expect(
        validateDiabetesInterview(values({ homeGlucoseLow: '90', homeGlucoseHigh: '180' })),
      ).toEqual({});
      expect(
        validateDiabetesInterview(values({ homeGlucoseLow: '120', homeGlucoseHigh: '120' })),
      ).toEqual({});
    });
  });

  describe('"none" is an answer, not an absence', () => {
    it.each([
      ['symptoms', 'FATIGUE', 'dm-symptoms'],
      ['urgentSymptoms', 'VOMITING', 'dm-urgent-symptoms'],
    ])('refuses %s holding both NONE and %s', (field, other, fieldId) => {
      expect(
        validateDiabetesInterview(values({ [field]: ['NONE', other] } as never))[fieldId],
      ).toBeTruthy();
    });

    it('accepts NONE on its own in either list', () => {
      expect(
        validateDiabetesInterview(values({ symptoms: ['NONE'], urgentSymptoms: ['NONE'] })),
      ).toEqual({});
    });
  });

  it('surfaces a nutrition problem on the control that produced it', () => {
    const errors = validateDiabetesInterview(
      values({
        nutrition: { ...emptyDiabetesInterview().nutrition, mealsPerDay: 'SEVEN' as never },
      }),
    );
    expect(errors['dm-nutrition-meals']).toBeTruthy();
  });
});

describe('DIABETES_FIELD_ORDER', () => {
  it('names every field the validator can report', () => {
    const emitted = new Set<string>();
    const nextYear = String(new Date().getUTCFullYear() + 1);
    const cases: Partial<DiabetesInterviewValues>[] = [
      { glucose: '9000', glucoseType: 'RANDOM' },
      { glucose: '126' },
      { hba1c: '7.2%', hba1cStatus: 'VALUE_KNOWN' },
      { hba1c: '7.2', hba1cStatus: 'NEVER_CHECKED' },
      { homeGlucoseLow: '300', homeGlucoseHigh: '100' },
      { homeGlucoseLow: '9000' },
      { yearDiagnosed: nextYear },
      { mainConcern: 'OTHER' },
      { reviewReasons: ['OTHER'] },
      { symptoms: ['NONE', 'FATIGUE'] },
      { urgentSymptoms: ['NONE', 'VOMITING'] },
      { volunteerActions: ['NO_INTERVENTION_COMPLETED', 'REVIEWED_TODAYS_GLUCOSE'] },
      { reviewReasons: ['ROUTINE_REVIEW_ONLY', 'FOOT_WOUND'] },
      { nutrition: { ...emptyDiabetesInterview().nutrition, mealsPerDay: 'SEVEN' as never } },
    ];
    for (const override of cases) {
      for (const key of Object.keys(validateDiabetesInterview(values(override)))) {
        emitted.add(key);
      }
    }

    expect(emitted.size).toBeGreaterThan(10);
    expect([...emitted].filter((key) => !DIABETES_FIELD_ORDER.includes(key))).toEqual([]);
  });

  it('lists each field once', () => {
    expect(new Set(DIABETES_FIELD_ORDER).size).toBe(DIABETES_FIELD_ORDER.length);
  });
});

describe('toDiabetesPayload', () => {
  it('turns blank numeric input into null rather than zero', () => {
    const payload = toDiabetesPayload(values(), COLLECTED_AT);
    expect(payload.glucoseMgDl).toBeNull();
    expect(payload.hba1cPercent).toBeNull();
    expect(payload.yearDiagnosed).toBeNull();
  });

  it('parses entered numbers once', () => {
    const payload = toDiabetesPayload(
      values({ glucose: '126', hba1c: '6.4', hba1cStatus: 'VALUE_KNOWN' }),
      COLLECTED_AT,
    );
    expect(payload).toMatchObject({ glucoseMgDl: 126, hba1cPercent: 6.4 });
  });

  /* A stale value behind a changed answer is a second, contradicting record. */
  it('drops an HbA1c the status no longer justifies', () => {
    const payload = toDiabetesPayload(
      values({ hba1c: '6.4', hba1cStatus: 'UNKNOWN' }),
      COLLECTED_AT,
    );
    expect(payload.hba1cPercent).toBeNull();
    expect(payload.hba1cMeasuredOn).toBeNull();
  });

  it('drops home readings when the patient does not monitor', () => {
    const payload = toDiabetesPayload(
      values({
        homeGlucoseMonitoring: 'NO',
        homeGlucoseLow: '90',
        homeGlucoseHigh: '180',
      }),
      COLLECTED_AT,
    );
    expect(payload.homeGlucoseLowMgDl).toBeNull();
    expect(payload.homeGlucoseHighMgDl).toBeNull();
  });

  it('keeps home readings when the patient does monitor', () => {
    const payload = toDiabetesPayload(
      values({
        homeGlucoseMonitoring: 'YES',
        homeGlucoseLow: '90',
        homeGlucoseHigh: '180',
      }),
      COLLECTED_AT,
    );
    expect(payload).toMatchObject({ homeGlucoseLowMgDl: 90, homeGlucoseHighMgDl: 180 });
  });

  /* Derived columns are the server's; sending them would look like an assertion. */
  it('never sends a derived field or a clinician-plan field', () => {
    const payload = toDiabetesPayload(values(), COLLECTED_AT);
    for (const key of [
      'derivedSuspicion',
      'phq2Total',
      'phq2Positive',
      'distressPositive',
      'urgentReviewRequired',
      'urgentReviewReasons',
      'clinicianPlanItems',
      'followUpWindow',
      'clinicianComments',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  /* The two lists answer different questions and must stay separate on the wire. */
  it('sends the past-month and right-now symptoms as separate fields', () => {
    const payload = toDiabetesPayload(
      values({ symptoms: ['FATIGUE'], urgentSymptoms: ['VOMITING'] }),
      COLLECTED_AT,
    );
    expect(payload).toMatchObject({ symptoms: ['FATIGUE'], urgentSymptoms: ['VOMITING'] });
  });
});

describe('fromDiabetesRecord', () => {
  it('reads an absent record as an untouched interview', () => {
    expect(fromDiabetesRecord(null)).toEqual(emptyDiabetesInterview());
  });

  it('round-trips through the payload builder', () => {
    const original = values({
      diabetesStatus: 'KNOWN_DIABETES',
      diabetesType: 'TYPE_2',
      glucose: '148',
      glucoseType: 'BEFORE_MEAL',
      hba1cStatus: 'VALUE_KNOWN',
      hba1c: '7.1',
      symptoms: ['FATIGUE'],
      urgentSymptoms: ['NONE'],
      phq2Interest: 'SEVERAL_DAYS',
      notes: 'Reviewed foot care.',
    });
    const restored = fromDiabetesRecord(toDiabetesPayload(original, COLLECTED_AT));

    expect(restored).toMatchObject({
      diabetesStatus: 'KNOWN_DIABETES',
      diabetesType: 'TYPE_2',
      glucose: '148',
      glucoseType: 'BEFORE_MEAL',
      hba1c: '7.1',
      symptoms: ['FATIGUE'],
      urgentSymptoms: ['NONE'],
      phq2Interest: 'SEVERAL_DAYS',
      notes: 'Reviewed foot care.',
    });
  });

  /* A volunteer's device can be a release behind whatever wrote the row. */
  it('survives a record carrying values this build does not know', () => {
    const restored = fromDiabetesRecord({
      diabetesStatus: 'SOMETHING_NEWER',
      symptoms: ['FATIGUE', 7, null],
      nutrition: { mealsPerDay: 'SEVEN' },
      glucoseMgDl: 'not a number',
    });

    expect(restored.diabetesStatus).toBe('SOMETHING_NEWER');
    expect(restored.symptoms).toEqual(['FATIGUE']);
    expect(restored.nutrition.mealsPerDay).toBe('NOT_ASSESSED');
    expect(restored.glucose).toBe('');
  });

  it('reads an HbA1c date back as a date input value', () => {
    expect(
      fromDiabetesRecord({ hba1cMeasuredOn: '2026-05-14T00:00:00.000Z' }).hba1cMeasuredOn,
    ).toBe('2026-05-14');
  });

  describe('in a clinic that works in mmol/L and mmol/mol', () => {
    const units = { glucoseUnit: 'MMOL_L', hba1cUnit: 'MMOL_MOL' } as const;

    it('shows stored values in the clinic units', () => {
      expect(
        fromDiabetesRecord({ glucoseMgDl: 126, hba1cPercent: 6.5, homeGlucoseLowMgDl: 90 }, units),
      ).toMatchObject({ glucose: '7', hba1c: '48', homeGlucoseLow: '5', glucoseUnit: 'MMOL_L' });
    });

    it('saves typed values in stored units', () => {
      const typed = {
        ...emptyDiabetesInterview(units),
        glucose: '11.1',
        glucoseType: 'RANDOM',
        hba1cStatus: 'VALUE_KNOWN',
        hba1c: '48',
        homeGlucoseMonitoring: 'YES',
        homeGlucoseLow: '4.4',
        homeGlucoseHigh: '10',
      };
      expect(validateDiabetesInterview(typed)).toEqual({});
      expect(toDiabetesPayload(typed, COLLECTED_AT)).toMatchObject({
        glucoseMgDl: 200,
        hba1cPercent: 6.54,
        homeGlucoseLowMgDl: 79,
        homeGlucoseHighMgDl: 180,
      });
    });

    it('saves an unedited record exactly as it was stored', () => {
      const record = {
        glucoseMgDl: 127,
        glucoseType: 'FASTING',
        hba1cStatus: 'VALUE_KNOWN',
        hba1cPercent: 6.5,
        homeGlucoseMonitoring: 'YES',
        homeGlucoseLowMgDl: 91,
        homeGlucoseHighMgDl: 199,
      };
      expect(toDiabetesPayload(fromDiabetesRecord(record, units), COLLECTED_AT)).toMatchObject({
        glucoseMgDl: 127,
        hba1cPercent: 6.5,
        homeGlucoseLowMgDl: 91,
        homeGlucoseHighMgDl: 199,
      });
    });

    it('rejects a mg/dL number typed into an mmol/L field', () => {
      expect(
        validateDiabetesInterview({
          ...emptyDiabetesInterview(units),
          glucose: '126',
          glucoseType: 'FASTING',
        })['dm-glucose'],
      ).toMatch(/mmol\/L/);
    });

    it('switches every glucose answer to the other unit together', () => {
      const switched = withGlucoseUnit(
        { ...emptyDiabetesInterview(units), glucose: '7.0', homeGlucoseLow: '4.4' },
        'MG_DL',
      );
      expect(switched).toMatchObject({
        glucoseUnit: 'MG_DL',
        glucose: '126',
        homeGlucoseLow: '79',
      });
    });
  });
});
