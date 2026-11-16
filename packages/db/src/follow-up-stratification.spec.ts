/**
 * The follow-up criteria as a specification (#335). Each test name is a sentence a clinician can
 * check against the Akomapa Follow-Up Criteria and issues #333 to #335.
 *
 * Unless a test says otherwise, "today" is 16 Nov 2026 and the clinic is in Accra (UTC).
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

import {
  DM_FASTING_SUSPICION_MG_DL,
  DM_HYPOGLYCEMIA_MG_DL,
  DM_RANDOM_SUSPICION_MG_DL,
} from './diabetes-thresholds';
import {
  DEFAULT_FOLLOW_UP_CONFIG,
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_ACTION_LABELS,
  FOLLOW_UP_CAUGHT_BY,
  FOLLOW_UP_CAUGHT_BY_LABELS,
  FOLLOW_UP_CHARTS,
  FOLLOW_UP_CHART_LABELS,
  FOLLOW_UP_CONTROL_STATUSES,
  FOLLOW_UP_CONTROL_STATUS_LABELS,
  FOLLOW_UP_MISSING_INPUTS,
  FOLLOW_UP_MISSING_INPUT_LABELS,
  FOLLOW_UP_MOVEMENT_DIRECTIONS,
  FOLLOW_UP_MOVEMENT_DIRECTION_LABELS,
  FOLLOW_UP_MOVEMENT_TRIGGERS,
  FOLLOW_UP_MOVEMENT_TRIGGER_LABELS,
  FOLLOW_UP_REASONS,
  FOLLOW_UP_REASON_LABELS,
  FOLLOW_UP_SCREENING_GROUPS,
  FOLLOW_UP_SCREENING_GROUP_LABELS,
  FOLLOW_UP_TELE_CHANNELS,
  FOLLOW_UP_TELE_CHANNEL_LABELS,
  FOLLOW_UP_TIERS,
  FOLLOW_UP_TIER_LABELS,
  addMonths,
  assessFollowUp,
  movement,
  nextContact,
  type FollowUpBpReading,
  type FollowUpConfig,
  type FollowUpInput,
} from './follow-up-stratification';
import {
  CHART_AGE_BANDS,
  LAB_CHART_WITHOUT_DIABETES,
  LAB_CHART_WITH_DIABETES,
  NON_LAB_CHART,
  type ChartTable,
} from './who-cvd-risk-chart-wssa';

const TODAY = new Date('2026-11-16T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * DAY);

function bp(systolic: number, diastolic: number, days = 0, measured = true): FollowUpBpReading {
  return { systolic, diastolic, at: daysAgo(days), measured };
}

/** A 50-year-old man, non-smoker, BMI 22, no known conditions, normal BP today. */
function patient(overrides: Partial<FollowUpInput> = {}): FollowUpInput {
  return {
    ageYears: 50,
    sex: 'MALE',
    smoker: false,
    bmi: 22,
    conditions: ['NONE_KNOWN'],
    hypertensionDiagnosed: false,
    readings: [bp(118, 76)],
    today: TODAY,
    ...overrides,
  };
}

/** A 50-year-old man treated for hypertension, at target on two days. */
function treatedHypertensive(overrides: Partial<FollowUpInput> = {}): FollowUpInput {
  return patient({
    hypertensionDiagnosed: true,
    onTreatment: { hypertension: true },
    readings: [bp(132, 84, 1), bp(134, 82, 40)],
    ...overrides,
  });
}

/** A 50-year-old man with diabetes on treatment, BP under 130 on two days, HbA1c 6.5%. */
function treatedDiabetic(overrides: Partial<FollowUpInput> = {}): FollowUpInput {
  return patient({
    conditions: ['DIABETES'],
    onTreatment: { diabetes: true },
    readings: [bp(124, 78, 1), bp(126, 80, 40)],
    hba1c: { percent: 6.5, at: daysAgo(20) },
    ...overrides,
  });
}

function withConfig(change: Partial<FollowUpConfig>): FollowUpConfig {
  return { ...DEFAULT_FOLLOW_UP_CONFIG, ...change };
}

/* =============================================================================== Config */

describe('the configuration', () => {
  it('names every open decision from #334 with its proposed default', () => {
    expect(DEFAULT_FOLLOW_UP_CONFIG).toMatchObject({
      bpTargetUnder65: { systolic: 140, diastolic: 90 },
      prediabetesFastingMmol: 5.6,
      stepDownOnTargetReadings: 2,
      selfReportedCountsTowardControl: false,
      teleChannels: ['PHONE_CALL'],
      missedContactGraceDays: 7,
      confirmationIntervalDays: 14,
      laboratoryChartEnabled: false,
      asymptomaticSevereAssessmentDays: 7,
      signedOff: null,
    });
    expect(DEFAULT_FOLLOW_UP_CONFIG.version).toMatch(/draft/);
  });

  it('uses the same diabetes and low-sugar lines as screening, once converted to mg/dL', () => {
    const toMgDl = (mmol: number) => Math.round(mmol * 18);
    expect(toMgDl(DEFAULT_FOLLOW_UP_CONFIG.diabetesFastingMmol)).toBe(DM_FASTING_SUSPICION_MG_DL);
    expect(toMgDl(DEFAULT_FOLLOW_UP_CONFIG.diabetesRandomMmol)).toBe(DM_RANDOM_SUSPICION_MG_DL);
    expect(toMgDl(DEFAULT_FOLLOW_UP_CONFIG.hypoglycaemiaMmol)).toBe(DM_HYPOGLYCEMIA_MG_DL);
  });

  it('writes no threshold outside the config object', () => {
    const source = readFileSync(join(__dirname, 'follow-up-stratification.ts'), 'utf8');
    const outsideConfig = source
      .replace(/export const DEFAULT_FOLLOW_UP_CONFIG[\s\S]*?\n};\n/, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/'[^'\n]*'/g, "''");
    const numbers = outsideConfig.match(/(?<![\w.])\d+(\.\d+)?(?![\w])/g) ?? [];
    // 0 to 2 are indexing and arithmetic; 10 is the YYYY-MM-DD length; 24, 60 and 1000 make a day.
    expect(numbers.filter((n) => !['0', '1', '2', '10', '24', '60', '1000'].includes(n))).toEqual(
      [],
    );
  });

  it('has a plain-words label for every code', () => {
    const pairs: [readonly string[], Record<string, string>][] = [
      [FOLLOW_UP_TIERS, FOLLOW_UP_TIER_LABELS],
      [FOLLOW_UP_CAUGHT_BY, FOLLOW_UP_CAUGHT_BY_LABELS],
      [FOLLOW_UP_REASONS, FOLLOW_UP_REASON_LABELS],
      [FOLLOW_UP_ACTIONS, FOLLOW_UP_ACTION_LABELS],
      [FOLLOW_UP_MISSING_INPUTS, FOLLOW_UP_MISSING_INPUT_LABELS],
      [FOLLOW_UP_CHARTS, FOLLOW_UP_CHART_LABELS],
      [FOLLOW_UP_CONTROL_STATUSES, FOLLOW_UP_CONTROL_STATUS_LABELS],
      [FOLLOW_UP_SCREENING_GROUPS, FOLLOW_UP_SCREENING_GROUP_LABELS],
      [FOLLOW_UP_MOVEMENT_DIRECTIONS, FOLLOW_UP_MOVEMENT_DIRECTION_LABELS],
      [FOLLOW_UP_MOVEMENT_TRIGGERS, FOLLOW_UP_MOVEMENT_TRIGGER_LABELS],
      [FOLLOW_UP_TELE_CHANNELS, FOLLOW_UP_TELE_CHANNEL_LABELS],
    ];
    for (const [codes, labels] of pairs) {
      expect(Object.keys(labels).sort()).toEqual([...codes].sort());
      for (const code of codes) expect(labels[code]).toMatch(/^[A-Z0-9][^_]*$/);
    }
  });
});

describe('the module', () => {
  it('imports nothing from Prisma, Nest, Node or the DOM, directly or through its imports', () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const [, spec] of source.matchAll(/from '([^']+)'/g)) {
        if (spec.startsWith('.')) visit(resolve(dirname(file), `${spec}.ts`));
        else throw new Error(`${file} imports '${spec}'`);
      }
      expect(source).not.toMatch(/\b(window|document|localStorage|process)\./);
    };
    visit(join(__dirname, 'follow-up-stratification.ts'));
    expect(seen.size).toBeGreaterThan(2);
  });
});

/* ======================================================================= Check 1: danger */

describe('Check 1: danger signs make a patient Urgent', () => {
  const chestPain = { hypertension: ['CHEST_PAIN'] as const };

  it('180/110 with a danger symptom is Urgent: refer today and call to check they reached care', () => {
    const result = assessFollowUp(patient({ readings: [bp(180, 110)], symptoms: chestPain }));
    expect(result.tier).toBe('URGENT');
    expect(result.caughtBy).toBe('DANGER_SIGNS');
    expect(result.reasons).toContain('DANGER_BP_WITH_SYMPTOMS');
    expect(result.actions).toEqual(['SAME_DAY_REFERRAL', 'CALL_TO_CONFIRM_CARE']);
  });

  it('179/109 with a danger symptom is not a danger sign (it is High for the new symptom)', () => {
    const result = assessFollowUp(patient({ readings: [bp(179, 109)], symptoms: chestPain }));
    expect(result.tier).toBe('HIGH');
    expect(result.reasons).not.toContain('DANGER_BP_WITH_SYMPTOMS');
    expect(result.reasons).toContain('NEW_SYMPTOMS');
  });

  it('either number alone is enough: 180/100 and 170/110 with a symptom are both Urgent', () => {
    expect(assessFollowUp(patient({ readings: [bp(180, 100)], symptoms: chestPain })).tier).toBe(
      'URGENT',
    );
    expect(assessFollowUp(patient({ readings: [bp(170, 110)], symptoms: chestPain })).tier).toBe(
      'URGENT',
    );
  });

  it('178/112 follows the higher row: Urgent with a symptom, High without', () => {
    expect(assessFollowUp(patient({ readings: [bp(178, 112)], symptoms: chestPain })).tier).toBe(
      'URGENT',
    );
    const quiet = assessFollowUp(patient({ readings: [bp(178, 112)] }));
    expect(quiet.tier).toBe('HIGH');
    expect(quiet.reasons).toEqual(['SEVERE_BP_ASYMPTOMATIC']);
  });

  it.each([
    'CHEST_PAIN',
    'SEVERE_HEADACHE',
    'CONFUSION',
    'NEW_WEAKNESS_OR_NUMBNESS',
    'DIFFICULTY_SPEAKING',
    'SHORTNESS_OF_BREATH',
    'BLURRED_VISION',
  ] as const)('%s with 180/110 is a danger sign', (symptom) => {
    const result = assessFollowUp(
      patient({ readings: [bp(185, 112)], symptoms: { hypertension: [symptom] } }),
    );
    expect(result.tier).toBe('URGENT');
  });

  it.each(['FAINTING', 'SEVERE_DIZZINESS', 'NONE'] as const)(
    '%s with 180/110 is not on the danger list, so the patient is High, not Urgent',
    (symptom) => {
      const result = assessFollowUp(
        patient({ readings: [bp(185, 112)], symptoms: { hypertension: [symptom] } }),
      );
      expect(result.tier).toBe('HIGH');
    },
  );

  it('a danger reading reported by phone counts the same as one taken at the clinic', () => {
    const result = assessFollowUp(
      patient({ readings: [bp(190, 115, 0, false)], symptoms: chestPain }),
    );
    expect(result.tier).toBe('URGENT');
  });

  it('a danger reading counts for 7 days, and not on the 8th', () => {
    expect(assessFollowUp(patient({ readings: [bp(190, 115, 7)], symptoms: chestPain })).tier).toBe(
      'URGENT',
    );
    expect(
      assessFollowUp(patient({ readings: [bp(190, 115, 8)], symptoms: chestPain })).tier,
    ).not.toBe('URGENT');
  });

  describe('180/110 or higher without danger symptoms is High, not Urgent', () => {
    it('on a first reading: repeat it now, and phone within a week', () => {
      const result = assessFollowUp(patient({ readings: [bp(180, 110)] }));
      expect(result.tier).toBe('HIGH');
      expect(result.reasons).toEqual(['SEVERE_BP_ASYMPTOMATIC']);
      expect(result.actions).toEqual(['REPEAT_READING_TODAY', 'PROMPT_TELE_CONTACT']);
    });

    it('still 180/110 or higher on the repeat: refer for a prompt clinical assessment', () => {
      const repeat = { ...bp(182, 111), at: new Date(TODAY.getTime() + 10 * 60 * 1000) };
      const result = assessFollowUp(patient({ readings: [repeat, bp(186, 114)] }));
      expect(result.actions).toEqual(['PROMPT_CLINICAL_ASSESSMENT', 'PROMPT_TELE_CONTACT']);
    });

    it('a repeat below 180/110 at the same visit settles it: no severe-BP rule', () => {
      const repeat = { ...bp(168, 98), at: new Date(TODAY.getTime() + 10 * 60 * 1000) };
      const result = assessFollowUp(patient({ readings: [repeat, bp(184, 112)] }));
      expect(result.reasons).not.toContain('SEVERE_BP_ASYMPTOMATIC');
    });
  });

  it('blood sugar above 18 mmol/L is Urgent; exactly 18 (324 mg/dL) is not', () => {
    const at = daysAgo(0);
    expect(assessFollowUp(patient({ glucose: { mgDl: 325, context: 'RANDOM', at } })).tier).toBe(
      'URGENT',
    );
    expect(
      assessFollowUp(patient({ glucose: { mgDl: 324, context: 'RANDOM', at } })).tier,
    ).not.toBe('URGENT');
  });

  describe('blood sugar above 13.9 mmol/L with ketones and symptoms', () => {
    const vomiting = { diabetes: ['VOMITING'] as const };
    const glucose = (mgDl: number) => ({ mgDl, context: 'RANDOM' as const, at: daysAgo(0) });

    it('is Urgent just above the line (251 mg/dL)', () => {
      const result = assessFollowUp(
        patient({ glucose: glucose(251), ketonesPresent: true, symptoms: vomiting }),
      );
      expect(result.reasons).toContain('DANGER_GLUCOSE_HIGH_WITH_KETONES');
      expect(result.tier).toBe('URGENT');
    });

    it('is not a danger sign at the line (250 mg/dL)', () => {
      const result = assessFollowUp(
        patient({ glucose: glucose(250), ketonesPresent: true, symptoms: vomiting }),
      );
      expect(result.tier).not.toBe('URGENT');
    });

    it('cannot fire today, because ketones are not recorded anywhere yet (#334.14)', () => {
      const result = assessFollowUp(patient({ glucose: glucose(300), symptoms: vomiting }));
      expect(result.reasons).not.toContain('DANGER_GLUCOSE_HIGH_WITH_KETONES');
    });

    it('needs a symptom as well as ketones', () => {
      const result = assessFollowUp(patient({ glucose: glucose(300), ketonesPresent: true }));
      expect(result.tier).not.toBe('URGENT');
    });
  });

  it('low blood sugar (70 mg/dL or under) with symptoms is Urgent; 71, or no symptoms, is not', () => {
    const glucose = (mgDl: number) => ({ mgDl, context: 'RANDOM' as const, at: daysAgo(0) });
    expect(
      assessFollowUp(patient({ glucose: glucose(70), hypoglycaemiaSymptoms: true })).tier,
    ).toBe('URGENT');
    expect(
      assessFollowUp(patient({ glucose: glucose(71), hypoglycaemiaSymptoms: true })).tier,
    ).not.toBe('URGENT');
    expect(assessFollowUp(patient({ glucose: glucose(70) })).tier).not.toBe('URGENT');
  });

  describe('pregnant with raised blood sugar is Urgent', () => {
    const pregnant = (mgDl: number, context: 'FASTING' | 'RANDOM' | 'UNKNOWN') =>
      assessFollowUp(
        patient({ sex: 'FEMALE', pregnant: true, glucose: { mgDl, context, at: daysAgo(0) } }),
      ).tier;

    it('fasting 7.0 mmol/L (126 mg/dL) or more is Urgent; 125 is not', () => {
      expect(pregnant(126, 'FASTING')).toBe('URGENT');
      expect(pregnant(125, 'FASTING')).not.toBe('URGENT');
    });

    it('any other timing 11.1 mmol/L (200 mg/dL) or more is Urgent; 199 is not', () => {
      expect(pregnant(200, 'RANDOM')).toBe('URGENT');
      expect(pregnant(199, 'RANDOM')).not.toBe('URGENT');
    });

    it('an unknown timing is never assumed fasting: 150 is not Urgent, 200 is', () => {
      expect(pregnant(150, 'UNKNOWN')).not.toBe('URGENT');
      expect(pregnant(200, 'UNKNOWN')).toBe('URGENT');
    });

    it('pregnancy recorded as a condition counts too', () => {
      const result = assessFollowUp(
        patient({
          sex: 'FEMALE',
          conditions: ['PREGNANCY'],
          glucose: { mgDl: 130, context: 'FASTING', at: TODAY },
        }),
      );
      expect(result.tier).toBe('URGENT');
    });
  });

  it('a danger sign is caught even when age, sex, BMI and smoking are all unknown', () => {
    const result = assessFollowUp({ today: TODAY, readings: [bp(186, 114)], symptoms: chestPain });
    expect(result.tier).toBe('URGENT');
    expect(result.missing).toEqual(expect.arrayContaining(['conditions']));
  });
});

/* ======================================================================== Check order */

describe('the checks run in order and the first that catches decides', () => {
  it('a patient with a danger sign and diabetes is Urgent, and both reasons are listed', () => {
    const result = assessFollowUp(
      treatedDiabetic({ readings: [bp(185, 112)], symptoms: { hypertension: ['CHEST_PAIN'] } }),
    );
    expect(result.tier).toBe('URGENT');
    expect(result.reasons).toEqual([
      'DANGER_BP_WITH_SYMPTOMS',
      'ABOVE_TARGET_ON_TREATMENT',
      'NEW_SYMPTOMS',
      'KNOWN_DIABETES',
    ]);
  });

  it('a patient with diabetes and a low chart risk is High, not Low', () => {
    const result = assessFollowUp(
      patient({
        ageYears: 42,
        conditions: ['DIABETES'],
        onTreatment: { diabetes: true },
        hba1c: { percent: 8.5, at: daysAgo(10) },
      }),
    );
    expect(result.tier).toBe('HIGH');
    expect(result.cvdRiskPercent).toBeNull();
  });
});

/* =================================================================== Check 2: auto high */

describe('Check 2: these patients are High without the chart', () => {
  it.each([
    ['DIABETES', 'KNOWN_DIABETES'],
    ['HEART_DISEASE_OR_MI', 'KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE'],
    ['HEART_FAILURE', 'KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE'],
    ['PERIPHERAL_VASCULAR_DISEASE', 'KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE'],
    ['STROKE_OR_TIA', 'KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE'],
    ['KIDNEY_DISEASE', 'KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE'],
  ] as const)('known %s', (condition, reason) => {
    const result = assessFollowUp(patient({ conditions: [condition] }));
    expect(result.tier).toBe('HIGH');
    expect(result.caughtBy).toBe('AUTO_HIGH');
    expect(result.reasons).toContain(reason);
  });

  it('high cholesterol alone (HIGH_CHOLESTEROL as a condition) is not automatic', () => {
    expect(assessFollowUp(patient({ conditions: ['HIGH_CHOLESTEROL'] })).tier).not.toBe('HIGH');
  });

  describe('BP 160/100 or higher on the two most recent days', () => {
    it('is High at 160/100 on both days', () => {
      const result = assessFollowUp(patient({ readings: [bp(160, 100, 0), bp(160, 100, 14)] }));
      expect(result.reasons).toContain('BP_PERSISTENTLY_HIGH');
      expect(result.tier).toBe('HIGH');
    });

    it('is not High at 159/99 on one of them', () => {
      const result = assessFollowUp(patient({ readings: [bp(159, 99, 0), bp(165, 104, 14)] }));
      expect(result.reasons).not.toContain('BP_PERSISTENTLY_HIGH');
    });

    it('follows the higher row on each day: 165/95 then 150/102 counts', () => {
      const result = assessFollowUp(patient({ readings: [bp(165, 95, 0), bp(150, 102, 14)] }));
      expect(result.reasons).toContain('BP_PERSISTENTLY_HIGH');
    });

    it('needs two different days: two high readings at one visit do not count', () => {
      const later = { ...bp(166, 104), at: new Date(TODAY.getTime() + 5 * 60 * 1000) };
      const result = assessFollowUp(patient({ readings: [later, bp(168, 105)] }));
      expect(result.reasons).not.toContain('BP_PERSISTENTLY_HIGH');
    });

    it('uses the two most recent days: an old high reading does not count once the latest is lower', () => {
      const result = assessFollowUp(
        patient({ readings: [bp(150, 92, 0), bp(170, 105, 14), bp(172, 106, 30)] }),
      );
      expect(result.reasons).not.toContain('BP_PERSISTENTLY_HIGH');
    });

    it('counts measured readings only, not ones reported by phone', () => {
      const result = assessFollowUp(
        patient({ readings: [bp(170, 105, 0, false), bp(170, 105, 14)] }),
      );
      expect(result.reasons).not.toContain('BP_PERSISTENTLY_HIGH');
    });

    it('a day is represented by its repeat reading, the last of the day', () => {
      const repeat = { ...bp(150, 92, 14), at: new Date(daysAgo(14).getTime() + 10 * 60 * 1000) };
      const result = assessFollowUp(
        patient({ readings: [bp(165, 102, 0), repeat, bp(170, 104, 14)] }),
      );
      expect(result.reasons).not.toContain('BP_PERSISTENTLY_HIGH');
    });
  });

  it('diagnosed hypertension not on medicine is High', () => {
    const result = assessFollowUp(
      patient({ hypertensionDiagnosed: true, onTreatment: { hypertension: false } }),
    );
    expect(result.reasons).toContain('UNTREATED_HYPERTENSION');
    expect(result.tier).toBe('HIGH');
  });

  it('diagnosed diabetes not on medicine is High, with both reasons', () => {
    const result = assessFollowUp(
      patient({ conditions: ['DIABETES'], onTreatment: { diabetes: false } }),
    );
    expect(result.reasons).toEqual(['UNTREATED_DIABETES', 'KNOWN_DIABETES']);
  });

  it('a diagnosis without knowing whether they take medicine lists it as missing', () => {
    const result = assessFollowUp(patient({ hypertensionDiagnosed: true }));
    expect(result.missing).toContain('onTreatment');
  });

  it('medicine started or changed within the last month is High; just over a month ago is not', () => {
    const oneMonthAgo = addMonths(TODAY, -1);
    expect(
      assessFollowUp(treatedHypertensive({ medicationChangedAt: oneMonthAgo })).reasons,
    ).toContain('MEDICATION_CHANGED_RECENTLY');
    const justOver = new Date(oneMonthAgo.getTime() - 60 * 1000);
    expect(assessFollowUp(treatedHypertensive({ medicationChangedAt: justOver })).tier).toBe(
      'STABLE',
    );
  });

  it('total cholesterol 8.0 mmol/L is High; 7.9 is not', () => {
    expect(assessFollowUp(patient({ totalCholesterolMmol: 8 })).reasons).toContain(
      'HIGH_CHOLESTEROL',
    );
    expect(assessFollowUp(patient({ totalCholesterolMmol: 7.9 })).reasons).not.toContain(
      'HIGH_CHOLESTEROL',
    );
  });

  describe('the criteria move a patient up to the High rhythm', () => {
    it('on a missed contact: more than 7 days past due with no contact since', () => {
      expect(
        assessFollowUp(treatedHypertensive({ nextContactDueAt: daysAgo(8) })).reasons,
      ).toContain('MISSED_CONTACT');
      expect(assessFollowUp(treatedHypertensive({ nextContactDueAt: daysAgo(7) })).tier).toBe(
        'STABLE',
      );
    });

    it('not on a contact made after it fell due', () => {
      const result = assessFollowUp(
        treatedHypertensive({ nextContactDueAt: daysAgo(20), lastCompletedContactAt: daysAgo(18) }),
      );
      expect(result.tier).toBe('STABLE');
    });

    it('on new symptoms of any kind', () => {
      const result = assessFollowUp(
        treatedHypertensive({ symptoms: { hypertension: ['FAINTING'] } }),
      );
      expect(result.tier).toBe('HIGH');
      expect(result.reasons).toContain('NEW_SYMPTOMS');
    });

    it('not on a symptom list that says "none"', () => {
      expect(
        assessFollowUp(treatedHypertensive({ symptoms: { hypertension: ['NONE'] } })).tier,
      ).toBe('STABLE');
    });
  });
});

/* =============================================================================== Stable */

describe('Stable: on treatment and at target', () => {
  it('a treated hypertensive at target on the last two days is Stable', () => {
    const result = assessFollowUp(treatedHypertensive());
    expect(result.tier).toBe('STABLE');
    expect(result.caughtBy).toBe('CONTROL_ONLY');
    expect(result.reasons).toEqual(['ON_TREATMENT_AT_TARGET']);
  });

  it('a patient with known diabetes, on treatment and at target, is Stable (the main question for #334)', () => {
    const result = assessFollowUp(treatedDiabetic());
    expect(result.tier).toBe('STABLE');
    expect(result.reasons).toEqual(['KNOWN_DIABETES', 'ON_TREATMENT_AT_TARGET']);
  });

  it('turning off stableOverridesKnownDisease keeps that patient High', () => {
    const result = assessFollowUp(
      treatedDiabetic(),
      withConfig({ stableOverridesKnownDisease: false }),
    );
    expect(result.tier).toBe('HIGH');
  });

  it('a danger sign or an active Check 2 rule beats Stable', () => {
    expect(assessFollowUp(treatedDiabetic({ medicationChangedAt: daysAgo(3) })).tier).toBe('HIGH');
    expect(
      assessFollowUp(treatedDiabetic({ glucose: { mgDl: 340, context: 'RANDOM', at: TODAY } }))
        .tier,
    ).toBe('URGENT');
  });

  it('above target on treatment is High', () => {
    const result = assessFollowUp(
      treatedHypertensive({ readings: [bp(146, 88, 1), bp(132, 82, 40)] }),
    );
    expect(result.tier).toBe('HIGH');
    expect(result.reasons).toEqual(['ABOVE_TARGET_ON_TREATMENT']);
    expect(result.atTarget).toBe(false);
  });

  describe('stepping down needs stepDownOnTargetReadings days at target in a row', () => {
    const backAtTarget = treatedHypertensive({ readings: [bp(132, 84, 1), bp(150, 94, 40)] });

    it('with the default of 2, one day back at target stays High', () => {
      const result = assessFollowUp(backAtTarget);
      expect(result.tier).toBe('HIGH');
      expect(result.reasons).toEqual(['STEP_DOWN_PENDING']);
      expect(result.atTarget).toBe(true);
    });

    it('set to 1, the same patient is Stable', () => {
      expect(assessFollowUp(backAtTarget, withConfig({ stepDownOnTargetReadings: 1 })).tier).toBe(
        'STABLE',
      );
    });

    it('set to 3, two days at target after a high one is still High', () => {
      const twoDays = treatedHypertensive({
        readings: [bp(132, 84, 1), bp(134, 82, 30), bp(150, 94, 60)],
      });
      expect(assessFollowUp(twoDays).tier).toBe('STABLE');
      expect(assessFollowUp(twoDays, withConfig({ stepDownOnTargetReadings: 3 })).tier).toBe(
        'HIGH',
      );
    });
  });

  it('at target only on a reading older than 3 months is not Stable, and asks for a recent one', () => {
    const result = assessFollowUp(
      treatedHypertensive({ readings: [bp(130, 80, 100), bp(130, 80, 140)] }),
    );
    expect(result.tier).not.toBe('STABLE');
    expect(result.atTarget).toBeNull();
    expect(result.missing).toContain('recentBpReading');
  });
});

/* ============================================================================== Targets */

describe('at target', () => {
  const htnAt = (systolic: number, diastolic: number, ageYears = 70) =>
    assessFollowUp(treatedHypertensive({ ageYears, readings: [bp(systolic, diastolic, 1)] }))
      .atTarget;

  it('hypertension only: below 140/90 (139/89 yes; 140/89 and 139/90 no)', () => {
    expect(htnAt(139, 89)).toBe(true);
    expect(htnAt(140, 89)).toBe(false);
    expect(htnAt(139, 90)).toBe(false);
  });

  it('ages 18 to 64 use bpTargetUnder65: set to 130/80, 135/85 is above target at 50 but not at 65', () => {
    const config = withConfig({ bpTargetUnder65: { systolic: 130, diastolic: 80 } });
    const at = (ageYears: number) =>
      assessFollowUp(treatedHypertensive({ ageYears, readings: [bp(135, 85, 1)] }), config);
    expect(at(50).tier).toBe('HIGH');
    expect(at(50).reasons).toEqual(['ABOVE_TARGET_ON_TREATMENT']);
    expect(at(65).atTarget).toBe(true);
    expect(assessFollowUp(treatedHypertensive({ readings: [bp(135, 85, 1)] })).tier).toBe('STABLE');
  });

  it('an unknown age only matters when the two age targets differ', () => {
    const noAge = treatedHypertensive({ ageYears: null, readings: [bp(135, 85, 1)] });
    expect(assessFollowUp(noAge).atTarget).toBe(true);
    const config = withConfig({ bpTargetUnder65: { systolic: 130, diastolic: 80 } });
    expect(assessFollowUp(noAge, config).atTarget).toBeNull();
    expect(assessFollowUp(noAge, config).missing).toContain('ageYears');
    expect(assessFollowUp(noAge, config).control.status).toBe('NOT_ASSESSED');
  });

  it('with diabetes, heart, stroke or kidney disease: systolic below 130 (129 yes, 130 no)', () => {
    const at = (systolic: number) =>
      assessFollowUp(treatedDiabetic({ readings: [bp(systolic, 78, 1)] })).atTarget;
    expect(at(129)).toBe(true);
    expect(at(130)).toBe(false);
  });

  it('fasting sugar 4 to 7 mmol/L inclusive (72 to 126 mg/dL) is at target', () => {
    const at = (mgDl: number) =>
      assessFollowUp(
        treatedDiabetic({ hba1c: null, glucose: { mgDl, context: 'FASTING', at: daysAgo(5) } }),
      ).atTarget;
    expect(at(71)).toBe(false);
    expect(at(72)).toBe(true);
    expect(at(126)).toBe(true);
    expect(at(127)).toBe(false);
  });

  it('a random sugar does not show whether diabetes is at target', () => {
    const result = assessFollowUp(
      treatedDiabetic({ hba1c: null, glucose: { mgDl: 110, context: 'RANDOM', at: TODAY } }),
    );
    expect(result.atTarget).toBeNull();
    expect(result.missing).toContain('recentGlucoseOrHba1c');
  });

  it('HbA1c below 7% is at target (6.9 yes, 7.0 no)', () => {
    const at = (percent: number) =>
      assessFollowUp(
        treatedDiabetic({ hba1c: { percent, at: daysAgo(10) }, frailOrElderly: false }),
      ).atTarget;
    expect(at(6.9)).toBe(true);
    expect(at(7)).toBe(false);
  });

  it('HbA1c below 8% when frail or elderly (7.9 yes, 8.0 no)', () => {
    const at = (percent: number) =>
      assessFollowUp(treatedDiabetic({ hba1c: { percent, at: daysAgo(10) }, frailOrElderly: true }))
        .atTarget;
    expect(at(7.9)).toBe(true);
    expect(at(8)).toBe(false);
  });

  it('an HbA1c of 7.5% with frailty unknown is not guessed either way', () => {
    const result = assessFollowUp(treatedDiabetic({ hba1c: { percent: 7.5, at: daysAgo(10) } }));
    expect(result.atTarget).toBeNull();
    expect(result.missing).toContain('frailOrElderly');
  });
});

/* =========================================================================== Check 3: chart */

const AGE_FOR: Record<string, number> = {
  '40-44': 42,
  '45-49': 47,
  '50-54': 52,
  '55-59': 57,
  '60-64': 62,
  '65-69': 67,
  '70-74': 72,
};
const SBP_FOR: Record<string, number> = {
  '<120': 110,
  '120-139': 130,
  '140-159': 150,
  '160-179': 170,
  '≥180': 185,
};
const BMI_FOR: Record<string, number> = {
  '<20': 18,
  '20-24': 22,
  '25-29': 27,
  '30-35': 32,
  '≥35': 37,
};
const CHOL_FOR: Record<string, number> = {
  '<4': 3.5,
  '4-4.9': 4.5,
  '5-5.9': 5.5,
  '6-6.9': 6.5,
  '≥7': 7.5,
};
const LAB = withConfig({ laboratoryChartEnabled: true });

/** Someone the chart applies to: no diagnosis, and the reading old enough not to be a danger sign. */
function chartPatient(
  sex: 'MALE' | 'FEMALE',
  smoker: boolean,
  age: string,
  sbp: string,
): FollowUpInput {
  return patient({ sex, smoker, ageYears: AGE_FOR[age], readings: [bp(SBP_FOR[sbp], 70, 10)] });
}

describe('Check 3: the WHO chart for Western Sub-Saharan Africa', () => {
  /**
   * Each cell was read by eye from the published chart (HEARTS: Risk-based CVD management, WHO
   * 2020; https://iris.who.int/handle/10665/333221) and is checked here through the whole engine.
   */
  // prettier-ignore
  const nonLab: [string, 'MALE' | 'FEMALE', boolean, string, string, string, number][] = [
    // page,  sex,      smoker, age,     SBP,       BMI,     risk
    ['p. 56', 'MALE',   false, '40-44', '<120',    '<20',    1],
    ['p. 56', 'MALE',   true,  '40-44', '≥180',    '≥35',   18],
    ['p. 56', 'FEMALE', false, '40-44', '140-159', '30-35',  2],
    ['p. 56', 'FEMALE', true,  '40-44', '160-179', '≥35',   10],
    ['p. 56', 'MALE',   false, '45-49', '≥180',    '≥35',   11],
    ['p. 56', 'MALE',   true,  '45-49', '≥180',    '≥35',   20],
    ['p. 56', 'FEMALE', true,  '45-49', '120-139', '30-35',  6],
    ['p. 56', 'FEMALE', false, '45-49', '<120',    '25-29',  2],
    ['p. 56', 'MALE',   false, '50-54', '140-159', '<20',    4],
    ['p. 56', 'MALE',   true,  '50-54', '≥180',    '30-35', 20],
    ['p. 56', 'FEMALE', true,  '50-54', '140-159', '30-35', 10],
    ['p. 56', 'FEMALE', false, '50-54', '160-179', '≥35',    6],
    ['p. 56', 'MALE',   true,  '55-59', '160-179', '25-29', 16],
    ['p. 56', 'FEMALE', false, '55-59', '≥180',    '20-24', 10],
    ['p. 56', 'FEMALE', false, '60-64', '<120',    '<20',    4],
    ['p. 56', 'FEMALE', true,  '60-64', '160-179', '≥35',   20],
    ['p. 56', 'MALE',   false, '65-69', '120-139', '<20',    9],
    ['p. 56', 'MALE',   true,  '65-69', '≥180',    '30-35', 31],
    ['p. 56', 'MALE',   false, '70-74', '≥180',    '≥35',   30],
    ['p. 56', 'MALE',   true,  '70-74', '≥180',    '≥35',   38],
    ['p. 56', 'FEMALE', false, '70-74', '<120',    '<20',    9],
    ['p. 56', 'FEMALE', true,  '70-74', '≥180',    '≥35',   33],
  ];

  it.each(nonLab)(
    'non-laboratory chart, %s: %s, smoker %s, age %s, SBP %s, BMI %s is %i%%',
    (_page, sex, smoker, age, sbp, bmi, risk) => {
      const result = assessFollowUp({ ...chartPatient(sex, smoker, age, sbp), bmi: BMI_FOR[bmi] });
      expect(result.chart).toBe('NON_LAB');
      expect(result.cvdRiskPercent).toBe(risk);
    },
  );

  // prettier-ignore
  const lab: [string, boolean, 'MALE' | 'FEMALE', boolean, string, string, string, number][] = [
    // page,          diabetes, sex,   smoker, age,     SBP,       cholesterol, risk
    ['p. 35 left',  false, 'MALE',   false, '40-44', '<120',    '<4',     1],
    ['p. 35 left',  false, 'MALE',   true,  '40-44', '≥180',    '≥7',    16],
    ['p. 35 left',  false, 'FEMALE', false, '40-44', '≥180',    '≥7',     5],
    ['p. 35 left',  false, 'FEMALE', true,  '45-49', '160-179', '6-6.9', 10],
    ['p. 35 left',  false, 'MALE',   true,  '50-54', '140-159', '6-6.9', 11],
    ['p. 35 left',  false, 'FEMALE', true,  '50-54', '<120',    '5-5.9',  5],
    ['p. 35 left',  false, 'FEMALE', false, '60-64', '<120',    '<4',     4],
    ['p. 35 left',  false, 'MALE',   true,  '65-69', '≥180',    '≥7',    35],
    ['p. 35 left',  false, 'MALE',   false, '70-74', '≥180',    '≥7',    32],
    ['p. 35 left',  false, 'FEMALE', true,  '70-74', '≥180',    '≥7',    30],
    ['p. 35 right', true,  'MALE',   false, '40-44', '<120',    '<4',     2],
    ['p. 35 right', true,  'FEMALE', true,  '40-44', '≥180',    '≥7',    28],
    ['p. 35 right', true,  'FEMALE', false, '45-49', '160-179', '≥7',    11],
    ['p. 35 right', true,  'MALE',   false, '50-54', '120-139', '6-6.9',  9],
    ['p. 35 right', true,  'FEMALE', true,  '55-59', '140-159', '5-5.9', 20],
    ['p. 35 right', true,  'MALE',   true,  '60-64', '<120',    '≥7',    20],
    ['p. 35 right', true,  'FEMALE', false, '70-74', '≥180',    '<4',    27],
    ['p. 35 right', true,  'MALE',   true,  '70-74', '≥180',    '≥7',    53],
  ];

  it.each(lab)(
    'laboratory chart, %s: diabetes %s, %s, smoker %s, age %s, SBP %s, cholesterol %s is %i%%',
    (_page, diabetes, sex, smoker, age, sbp, chol, risk) => {
      // Known diabetes is caught by Check 2, so the chart's diabetes column is reached through an
      // undiagnosed fasting sugar of 7.0 mmol/L or more, which is how WHO defines it.
      const glucose = diabetes ? { mgDl: 130, context: 'FASTING' as const, at: daysAgo(10) } : null;
      const result = assessFollowUp(
        { ...chartPatient(sex, smoker, age, sbp), totalCholesterolMmol: CHOL_FOR[chol], glucose },
        LAB,
      );
      expect(result.chart).toBe('LAB');
      expect(result.cvdRiskPercent).toBe(risk);
    },
  );

  describe('the tables were read without a shifted row or column', () => {
    const tables: [string, ChartTable][] = [
      ['non-laboratory', NON_LAB_CHART],
      ['laboratory without diabetes', LAB_CHART_WITHOUT_DIABETES],
      ['laboratory with diabetes', LAB_CHART_WITH_DIABETES],
    ];

    it.each(tables)(
      'the %s table has 7 ages x 5 SBP rows x 20 columns of whole percentages',
      (_name, table) => {
        expect(Object.keys(table).sort()).toEqual([...CHART_AGE_BANDS].sort());
        for (const rows of Object.values(table)) {
          expect(rows).toHaveLength(5);
          for (const row of rows) {
            expect(row).toHaveLength(20);
            for (const cell of row)
              expect(Number.isInteger(cell) && cell >= 1 && cell <= 60).toBe(true);
          }
        }
      },
    );

    it.each(tables)(
      'in the %s table, risk never falls as age, SBP, smoking or the column band rises',
      (_name, table) => {
        CHART_AGE_BANDS.forEach((age, a) => {
          table[age].forEach((row, r) => {
            row.forEach((cell, c) => {
              if (c % 5 < 4) expect(row[c + 1]).toBeGreaterThanOrEqual(cell);
              if (r < 4) expect(table[age][r + 1][c]).toBeLessThanOrEqual(cell);
              if (a < 6) expect(table[CHART_AGE_BANDS[a + 1]][r][c]).toBeGreaterThanOrEqual(cell);
              if (Math.floor(c / 5) % 2 === 0) expect(row[c + 5]).toBeGreaterThanOrEqual(cell);
            });
          });
        });
      },
    );

    it('diabetes never lowers the risk', () => {
      CHART_AGE_BANDS.forEach((age) =>
        LAB_CHART_WITH_DIABETES[age].forEach((row, r) =>
          row.forEach((cell, c) =>
            expect(cell).toBeGreaterThanOrEqual(LAB_CHART_WITHOUT_DIABETES[age][r][c]),
          ),
        ),
      );
    });
  });

  describe('band edges', () => {
    const risk = (overrides: Partial<FollowUpInput>, config?: FollowUpConfig) =>
      assessFollowUp(patient({ readings: [bp(130, 70, 10)], ...overrides }), config).cvdRiskPercent;

    it('ages 40 and 74 are on the chart; 39 and 75 are not', () => {
      expect(risk({ ageYears: 40 })).toBe(NON_LAB_CHART['40-44'][3][1]);
      expect(risk({ ageYears: 74 })).toBe(NON_LAB_CHART['70-74'][3][1]);
      expect(risk({ ageYears: 39 })).toBeNull();
      expect(risk({ ageYears: 75 })).toBeNull();
    });

    it('44 is in 40-44 and 45 is in 45-49', () => {
      expect(risk({ ageYears: 44, readings: [bp(185, 70, 10)], smoker: true, bmi: 37 })).toBe(18);
      expect(risk({ ageYears: 45, readings: [bp(185, 70, 10)], smoker: true, bmi: 37 })).toBe(20);
    });

    it.each([
      [119, 4],
      [120, 3],
      [139, 3],
      [140, 2],
      [159, 2],
      [160, 1],
      [179, 1],
      [180, 0],
    ])('SBP %i is in row %i (rows printed highest first)', (systolic, row) => {
      const result = risk({ ageYears: 72, readings: [bp(systolic, 70, 10)] });
      expect(result).toBe(NON_LAB_CHART['70-74'][row][1]);
    });

    it.each([
      [19.9, 0],
      [20, 1],
      [24.9, 1],
      [25, 2],
      [29.9, 2],
      [30, 3],
      [34.9, 3],
      [35, 4],
    ])('BMI %d is in column %i', (bmi, column) => {
      expect(risk({ ageYears: 72, bmi })).toBe(NON_LAB_CHART['70-74'][3][column]);
    });

    it.each([
      [3.9, 0],
      [4, 1],
      [4.9, 1],
      [5, 2],
      [6.9, 3],
      [7, 4],
    ])('cholesterol %d mmol/L is in column %i', (totalCholesterolMmol, column) => {
      expect(risk({ ageYears: 72, totalCholesterolMmol }, LAB)).toBe(
        LAB_CHART_WITHOUT_DIABETES['70-74'][3][column],
      );
    });
  });

  describe('the chart percentage gives the tier', () => {
    /** The first non-lab cell with this value, as a patient. */
    function patientWithRisk(value: number): FollowUpInput {
      for (const [a, age] of CHART_AGE_BANDS.entries()) {
        for (const [r, row] of NON_LAB_CHART[age].entries()) {
          const c = row.indexOf(value);
          if (c < 0) continue;
          const group = Math.floor(c / 5);
          return patient({
            ageYears: 40 + a * 5,
            sex: group < 2 ? 'MALE' : 'FEMALE',
            smoker: group % 2 === 1,
            bmi: [18, 22, 27, 32, 37][c % 5],
            readings: [bp([185, 170, 150, 130, 110][r], 70, 10)],
          });
        }
      }
      throw new Error(`no cell with ${value}`);
    }

    it.each([
      [20, 'HIGH'],
      [19, 'MODERATE'],
      [10, 'MODERATE'],
      [9, 'LOW_MODERATE'],
      [5, 'LOW_MODERATE'],
      [4, 'LOW'],
    ])('%i%% is %s', (value, tier) => {
      const result = assessFollowUp(patientWithRisk(value));
      expect(result.cvdRiskPercent).toBe(value);
      expect(result.tier).toBe(tier);
      expect(result.caughtBy).toBe('RISK_CHART');
      expect(result.reasons).toEqual(['CHART_RISK']);
    });
  });

  describe('which chart', () => {
    it('is the non-laboratory chart by default, even when cholesterol is recorded', () => {
      expect(assessFollowUp(patient({ totalCholesterolMmol: 5 })).chart).toBe('NON_LAB');
    });

    it('is the laboratory chart when laboratoryChartEnabled and cholesterol is recorded', () => {
      expect(assessFollowUp(patient({ totalCholesterolMmol: 5 }), LAB).chart).toBe('LAB');
    });

    it('falls back to the non-laboratory chart without a cholesterol, and says so', () => {
      const result = assessFollowUp(patient(), LAB);
      expect(result.chart).toBe('NON_LAB');
      expect(result.missing).toEqual(['totalCholesterol']);
    });

    it('the laboratory chart does not need a BMI', () => {
      expect(assessFollowUp(patient({ bmi: null, totalCholesterolMmol: 5 }), LAB).chart).toBe(
        'LAB',
      );
    });
  });
});

/* ========================================================================== Not tiered */

describe('Not yet tiered: missing data never produces a guess', () => {
  it.each([
    ['ageYears', { ageYears: null }],
    ['sex', { sex: null }],
    ['sex', { sex: 'OTHER' as const }],
    ['systolicBp', { readings: [] }],
    ['bmi', { bmi: null }],
    ['smoker', { smoker: null }],
  ] as const)('missing %s gives NOT_TIERED with it listed', (missing, overrides) => {
    const result = assessFollowUp(patient(overrides));
    expect(result.tier).toBe('NOT_TIERED');
    expect(result.caughtBy).toBeNull();
    expect(result.missing).toContain(missing);
    expect(result.actions).toEqual(['RECORD_MISSING_DATA']);
  });

  it('lists everything missing at once', () => {
    const result = assessFollowUp({ today: TODAY });
    expect(result.tier).toBe('NOT_TIERED');
    expect(result.missing).toEqual([
      'ageYears',
      'sex',
      'systolicBp',
      'bmi',
      'smoker',
      'conditions',
    ]);
  });

  it('still catches Check 2 with nothing else known', () => {
    expect(assessFollowUp({ today: TODAY, conditions: ['STROKE_OR_TIA'] }).tier).toBe('HIGH');
  });

  it('a self-reported reading cannot place someone on the chart', () => {
    const result = assessFollowUp(patient({ readings: [bp(130, 80, 3, false)] }));
    expect(result.tier).toBe('NOT_TIERED');
    expect(result.missing).toContain('systolicBp');
  });
});

/* =============================================================== Outside the chart's ages */

describe('under 40 or over 74: tiered on BP and sugar control alone (#334.13)', () => {
  it('above target is High', () => {
    const result = assessFollowUp(patient({ ageYears: 35, readings: [bp(142, 88, 2)] }));
    expect(result.tier).toBe('HIGH');
    expect(result.caughtBy).toBe('CONTROL_ONLY');
    expect(result.reasons).toEqual(['OUTSIDE_CHART_AGES_ABOVE_TARGET']);
  });

  it('no diagnosis and a normal reading is Low', () => {
    const result = assessFollowUp(patient({ ageYears: 35, readings: [bp(128, 82, 2)] }));
    expect(result.tier).toBe('LOW');
    expect(result.reasons).toEqual(['OUTSIDE_CHART_AGES_NORMAL']);
  });

  it('a raised sugar with no diagnosis is High', () => {
    const glucose = { mgDl: 210, context: 'RANDOM' as const, at: daysAgo(2) };
    expect(assessFollowUp(patient({ ageYears: 30, glucose })).tier).toBe('HIGH');
  });

  it('on treatment and at target is Stable, at 80 as at 50', () => {
    expect(assessFollowUp(treatedHypertensive({ ageYears: 80 })).tier).toBe('STABLE');
  });

  it('a normal reading 5 months ago still counts for Low; 13 months ago does not', () => {
    expect(assessFollowUp(patient({ ageYears: 35, readings: [bp(120, 78, 150)] })).tier).toBe(
      'LOW',
    );
    const stale = assessFollowUp(patient({ ageYears: 35, readings: [bp(120, 78, 400)] }));
    expect(stale.tier).toBe('NOT_TIERED');
    expect(stale.missing).toContain('recentBpReading');
  });
});

/* =========================================================================== Control */

describe('control status (HEARTS360)', () => {
  const control = (readings: FollowUpBpReading[], config?: FollowUpConfig) =>
    assessFollowUp(treatedHypertensive({ readings }), config).control;

  it('the latest measured reading in the past 3 months below target is Controlled', () => {
    expect(control([bp(138, 86, 60)])).toEqual({
      status: 'CONTROLLED',
      lostToFollowUp3m: false,
      lostToFollowUp12m: false,
      underCare: true,
    });
  });

  it('at target or above is Uncontrolled', () => {
    expect(control([bp(140, 86, 60)]).status).toBe('UNCONTROLLED');
  });

  it('nothing in 3 months is No recent reading and lost to follow-up at 3 months, but still under care', () => {
    expect(control([bp(130, 80, 100)])).toEqual({
      status: 'NO_RECENT_READING',
      lostToFollowUp3m: true,
      lostToFollowUp12m: false,
      underCare: true,
    });
  });

  it('nothing in 12 months is lost to follow-up at 12 months and not under care', () => {
    expect(control([bp(130, 80, 370)])).toMatchObject({
      lostToFollowUp12m: true,
      underCare: false,
    });
  });

  it('a reading reported by phone counts only when selfReportedCountsTowardControl is on', () => {
    const readings = [bp(128, 80, 5, false), bp(150, 95, 120)];
    expect(control(readings).status).toBe('NO_RECENT_READING');
    expect(control(readings, withConfig({ selfReportedCountsTowardControl: true })).status).toBe(
      'CONTROLLED',
    );
  });
});

/* =================================================================== Screening group */

describe('screening group', () => {
  const group = (input: FollowUpInput) => assessFollowUp(input).screeningGroup;

  it('danger signs come first', () => {
    expect(group(treatedDiabetic({ glucose: { mgDl: 400, context: 'RANDOM', at: TODAY } }))).toBe(
      'DANGER_SIGNS',
    );
  });

  it('a first raised reading with no diagnosis needs a second day to confirm', () => {
    const result = assessFollowUp(patient({ readings: [bp(146, 88)] }));
    expect(result.screeningGroup).toBe('NEW_RAISED_READING');
    expect(result.actions).toContain('CONFIRM_ON_ANOTHER_DAY');
  });

  it('140/90 is raised; 139/89 is not', () => {
    expect(group(patient({ readings: [bp(140, 80)] }))).toBe('NEW_RAISED_READING');
    expect(group(patient({ readings: [bp(130, 90)] }))).toBe('NEW_RAISED_READING');
    expect(group(patient({ ageYears: 35, readings: [bp(139, 89)] }))).toBeNull();
  });

  it('raised on a second day is confirmed: no further confirmation asked', () => {
    const result = assessFollowUp(patient({ readings: [bp(146, 88), bp(150, 92, 14)] }));
    expect(result.screeningGroup).toBe('NEW_RAISED_READING');
    expect(result.actions).not.toContain('CONFIRM_ON_ANOTHER_DAY');
  });

  it('a raised sugar with no diagnosis is a new raised reading', () => {
    expect(group(patient({ glucose: { mgDl: 126, context: 'FASTING', at: TODAY } }))).toBe(
      'NEW_RAISED_READING',
    );
  });

  it('known and not on medicine; known and on medicine', () => {
    expect(
      group(patient({ hypertensionDiagnosed: true, onTreatment: { hypertension: false } })),
    ).toBe('KNOWN_UNTREATED');
    expect(group(treatedHypertensive())).toBe('KNOWN_TREATED');
  });

  it.each([
    ['aged 40 or over', { ageYears: 40 }],
    ['a smoker', { ageYears: 30, smoker: true }],
    ['obese (BMI 30 or more)', { ageYears: 30, bmi: 30 }],
    ['with a family history', { ageYears: 30, familyHistory: true }],
    [
      'with a prediabetic fasting sugar (5.6 mmol/L = 101 mg/dL)',
      { ageYears: 30, glucose: { mgDl: 101, context: 'FASTING' as const, at: TODAY } },
    ],
  ])('normal readings, %s, is the risk-factor group', (_name, overrides) => {
    expect(group(patient(overrides))).toBe('NORMAL_WITH_RISK_FACTORS');
  });

  it('normal readings and none of those risk factors is in no group', () => {
    expect(
      group(
        patient({ ageYears: 39, bmi: 29.9, glucose: { mgDl: 100, context: 'FASTING', at: TODAY } }),
      ),
    ).toBeNull();
  });
});

/* ======================================================================= Next contact */

describe('next contact, from the schedule in #333', () => {
  const jan10 = new Date('2026-01-10T09:00:00Z');
  const day = (iso: string) => new Date(`${iso}T09:00:00Z`);
  const next = (
    tier: Parameters<typeof nextContact>[0]['tier'],
    atTarget: boolean | null,
    extra: Partial<Parameters<typeof nextContact>[0]> = {},
  ) =>
    nextContact({
      tier,
      atTarget,
      lastInPersonAt: jan10,
      lastTeleAt: null,
      today: jan10,
      ...extra,
    });

  it('High, above target: in person every 2 months, a call in the month between', () => {
    expect(next('HIGH', false)).toEqual({
      inPersonDueAt: day('2026-03-10'),
      teleDueAt: day('2026-02-10'),
    });
  });

  it('High, at target: in person every 3 months, still a call a month after each visit', () => {
    expect(next('HIGH', true)).toEqual({
      inPersonDueAt: day('2026-04-10'),
      teleDueAt: day('2026-02-10'),
    });
  });

  it('High, once this gap call is made the next is a month after the next visit', () => {
    expect(next('HIGH', false, { lastTeleAt: day('2026-02-11') }).teleDueAt).toEqual(
      day('2026-04-10'),
    );
  });

  it('Moderate: every 3 months, with a reminder call 3 days before', () => {
    expect(next('MODERATE', false)).toEqual({
      inPersonDueAt: day('2026-04-10'),
      teleDueAt: day('2026-04-07'),
    });
  });

  it('Low-moderate: every 3 months until at target, then every 6 (the shortest of 6 to 9)', () => {
    expect(next('LOW_MODERATE', false).inPersonDueAt).toEqual(day('2026-04-10'));
    expect(next('LOW_MODERATE', true).inPersonDueAt).toEqual(day('2026-07-10'));
  });

  it('Stable: every 3 months, one adherence and refill call halfway between', () => {
    const result = next('STABLE', true);
    expect(result.inPersonDueAt).toEqual(day('2026-04-10'));
    expect(result.teleDueAt).toEqual(new Date((jan10.getTime() + day('2026-04-10').getTime()) / 2));
  });

  it('Low: rescreen in 12 months, with a reminder before', () => {
    expect(next('LOW', true)).toEqual({
      inPersonDueAt: day('2027-01-10'),
      teleDueAt: day('2027-01-07'),
    });
  });

  it('Urgent: in person today and a call within 48 hours', () => {
    expect(next('URGENT', null)).toEqual({
      inPersonDueAt: jan10,
      teleDueAt: new Date(jan10.getTime() + 2 * DAY),
    });
  });

  it('Not yet tiered has no schedule', () => {
    expect(next('NOT_TIERED', null)).toEqual({ inPersonDueAt: null, teleDueAt: null });
  });

  it('a patient never seen in person is due today', () => {
    expect(
      next('MODERATE', null, { lastInPersonAt: null, today: day('2026-05-01') }).inPersonDueAt,
    ).toEqual(day('2026-05-01'));
  });

  it('never in person more often than every 2 months, whatever the schedule says', () => {
    const config = withConfig({
      schedules: {
        ...DEFAULT_FOLLOW_UP_CONFIG.schedules,
        HIGH: { ...DEFAULT_FOLLOW_UP_CONFIG.schedules.HIGH, inPersonMonths: 1 },
      },
    });
    const result = nextContact(
      { tier: 'HIGH', atTarget: false, lastInPersonAt: jan10, lastTeleAt: null, today: jan10 },
      config,
    );
    expect(result.inPersonDueAt).toEqual(day('2026-03-10'));
  });

  it('a raised reading to confirm brings the visit forward to within 14 days', () => {
    expect(
      next('LOW_MODERATE', false, { actions: ['CONFIRM_ON_ANOTHER_DAY'] }).inPersonDueAt,
    ).toEqual(day('2026-01-24'));
  });

  it('a very high reading without symptoms brings the call forward to within 7 days', () => {
    expect(
      next('HIGH', false, { actions: ['REPEAT_READING_TODAY', 'PROMPT_TELE_CONTACT'] }).teleDueAt,
    ).toEqual(day('2026-01-17'));
  });

  it('months end on the same date, or the month’s last day (31 Jan + 1 month = 28 Feb)', () => {
    expect(addMonths(new Date('2026-01-31T09:00:00Z'), 1)).toEqual(
      new Date('2026-02-28T09:00:00Z'),
    );
    expect(addMonths(new Date('2026-03-31T09:00:00Z'), -1)).toEqual(
      new Date('2026-02-28T09:00:00Z'),
    );
  });
});

/* =========================================================================== Movement */

describe('tier movement', () => {
  const at = (
    tier: Parameters<typeof movement>[1]['tier'],
    reasons: Parameters<typeof movement>[1]['reasons'] = [],
    atTarget: boolean | null = null,
  ) => ({
    tier,
    reasons,
    atTarget,
  });

  it('a first tier is New', () => {
    expect(movement(null, at('LOW'))).toEqual({ direction: 'NEW', trigger: null });
    expect(movement(at('NOT_TIERED'), at('HIGH'))).toEqual({ direction: 'NEW', trigger: null });
  });

  it('losing data is not a change in risk', () => {
    expect(movement(at('HIGH'), at('NOT_TIERED'))).toEqual({ direction: 'SAME', trigger: null });
  });

  it('the same tier is Same', () => {
    expect(
      movement(at('HIGH', ['KNOWN_DIABETES']), at('HIGH', ['KNOWN_DIABETES', 'MISSED_CONTACT'])),
    ).toEqual({
      direction: 'SAME',
      trigger: null,
    });
  });

  it.each([
    ['a danger sign', 'URGENT', 'DANGER_GLUCOSE_VERY_HIGH', 'DANGER_SIGN'],
    ['a reading above target', 'HIGH', 'ABOVE_TARGET_ON_TREATMENT', 'READING_ABOVE_TARGET'],
    ['a missed contact', 'HIGH', 'MISSED_CONTACT', 'MISSED_CONTACT'],
    ['a medication change', 'HIGH', 'MEDICATION_CHANGED_RECENTLY', 'MEDICATION_CHANGE'],
    ['new symptoms', 'HIGH', 'NEW_SYMPTOMS', 'NEW_SYMPTOMS'],
    ['a new diagnosis', 'HIGH', 'KNOWN_DIABETES', 'NEW_DIAGNOSIS'],
    ['a higher chart risk', 'MODERATE', 'CHART_RISK', 'RISK_CHANGED'],
  ] as const)('Stable moves up on %s', (_name, tier, reason, trigger) => {
    const previous = at('STABLE', ['ON_TREATMENT_AT_TARGET'], true);
    expect(movement(previous, at(tier, [reason]))).toEqual({ direction: 'UP', trigger });
  });

  it('High moves down to Stable on reaching target', () => {
    const previous = at('HIGH', ['STEP_DOWN_PENDING'], true);
    expect(movement(previous, at('STABLE', ['ON_TREATMENT_AT_TARGET'], true))).toEqual({
      direction: 'DOWN',
      trigger: 'REACHED_TARGET',
    });
  });

  it('High moves down to the chart tier when a medication change ages out', () => {
    const previous = at('HIGH', ['MEDICATION_CHANGED_RECENTLY', 'CHART_RISK'], true);
    expect(movement(previous, at('LOW_MODERATE', ['CHART_RISK'], true))).toEqual({
      direction: 'DOWN',
      trigger: 'RISK_CHANGED',
    });
  });

  it('Stable ranks below Low-moderate and above Low', () => {
    expect(movement(at('LOW'), at('STABLE', ['ON_TREATMENT_AT_TARGET'])).direction).toBe('UP');
    expect(movement(at('STABLE'), at('LOW_MODERATE', ['CHART_RISK'])).direction).toBe('UP');
  });
});
