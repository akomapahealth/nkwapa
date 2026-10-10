import { renderDiabetesNarrative } from './diabetes-narrative';
import { renderHypertensionNarrative } from './hypertension-narrative';
import { NOT_RECORDED } from './narrative-text';
import type { NarrativeInput } from './narrative-types';

function hypertensionRecord(overrides: Record<string, unknown> = {}) {
  return {
    hypertensionStatus: 'KNOWN_HYPERTENSION',
    yearDiagnosed: 2019,
    yearDiagnosedUnknown: false,
    mainConcern: 'HIGH_BP',
    mainConcernOther: null,
    usualCareFacility: 'Cape Coast Teaching Hospital',
    usualCareFacilityStatus: 'SELECTED',
    repeatSystolicBp: 142,
    repeatDiastolicBp: 88,
    homeMonitorStatus: 'HAS_ONE',
    homeCheckFrequency: 'SEVERAL_TIMES_WEEKLY',
    homeSystolicAvg: 138,
    homeDiastolicAvg: 86,
    homeReadingsUnknown: false,
    homeReadingSource: 'MONITOR_REVIEWED',
    currentSymptoms: ['SEVERE_HEADACHE'],
    contributingSubstances: ['NSAID'],
    lifestyle: null,
    relevantConditions: ['DIABETES'],
    kidneyFunctionTesting: 'COMPLETED',
    urineProteinTesting: 'NOT_COMPLETED',
    cholesterolTesting: 'PATIENT_UNSURE',
    ecgCompleted: 'NOT_COMPLETED',
    statinUse: 'TAKING',
    aspirinUse: 'NOT_TAKING',
    derivedClassification: 'STAGE2',
    classification: 'STAGE2',
    classificationOverridden: false,
    urgentReviewRequired: false,
    urgentReviewReasons: [],
    volunteerActions: { selected: ['REVIEWED_TODAYS_BP'] },
    reviewReasons: ['ROUTINE_REVIEW_ONLY'],
    ...overrides,
  };
}

function hypertensionInput(overrides: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    patientName: 'Ama Mensah',
    assessment: hypertensionRecord(),
    vitals: { systolicBp: 162, diastolicBp: 98, pulseBpm: 84 },
    medications: ['Amlodipine 10 mg once daily'],
    clinicianPlan: null,
    ...overrides,
  };
}

describe('renderHypertensionNarrative', () => {
  /*
    Determinism is the whole contract.

    The output is edited by a clinician and then signed, and a signed note is hashed. A generator
    whose text moved between renders would make an unedited note look altered.
  */
  it('renders the same text twice', () => {
    expect(renderHypertensionNarrative(hypertensionInput())).toEqual(
      renderHypertensionNarrative(hypertensionInput()),
    );
  });

  it('names the reading the classification came from', () => {
    const { assessment } = renderHypertensionNarrative(hypertensionInput());
    expect(assessment).toContain("Today's reading of 162/98 mmHg is stage 2 hypertension");
  });

  /*
    A classification on its own reads as a clinician's judgement. Naming the measurement it was
    computed from is what lets a reviewer disagree with it.
  */
  it('says so when a clinician overrode the derivation, and keeps both', () => {
    const { assessment } = renderHypertensionNarrative(
      hypertensionInput({
        assessment: hypertensionRecord({
          classification: 'ELEVATED',
          classificationOverridden: true,
        }),
      }),
    );
    expect(assessment).toContain('is stage 2 hypertension');
    expect(assessment).toContain('The supervising clinician recorded elevated instead.');
  });

  it('reports an escalation with its reasons', () => {
    const { assessment } = renderHypertensionNarrative(
      hypertensionInput({
        assessment: hypertensionRecord({
          urgentReviewRequired: true,
          urgentReviewReasons: ['URGENT_SYMPTOM_CHEST_PAIN'],
        }),
      }),
    );
    expect(assessment).toContain('flagged for immediate review: chest pain');
  });

  /*
    Omitted, not blanked.

    A volunteer's draft must not contain an empty "Supervising clinician plan" heading, which would
    tell them a plan exists that the API refuses to show them.
  */
  it('leaves out the clinician plan entirely for a reader without it', () => {
    const { plan } = renderHypertensionNarrative(hypertensionInput({ clinicianPlan: null }));
    expect(plan).not.toMatch(/supervising clinician/i);
    expect(plan).not.toMatch(/follow-up/i);
  });

  it('includes the clinician plan for a reader who has it', () => {
    const { plan } = renderHypertensionNarrative(
      hypertensionInput({
        clinicianPlan: {
          items: ['ADJUST_MEDICATION'],
          other: null,
          bpGoalSystolic: 130,
          bpGoalDiastolic: 80,
          followUpWindow: 'WITHIN_1_MONTH',
          followUpOther: null,
          followUpOwner: 'AKOMAPA_TEAM',
          comments: 'Titrate amlodipine.',
        },
      }),
    );
    expect(plan).toContain('Blood-pressure goal: 130/80 mmHg');
    expect(plan).toContain('Titrate amlodipine.');
    expect(plan).toContain('Follow-up is planned within 1 month with akomapa team.');
  });

  /*
    A note is generated from rows a newer release may have written. Discovering a version skew by
    finding "undefined" in a clinical record is the wrong way to find out.
  */
  it('renders a code it does not recognise as an absent value, not as undefined', () => {
    const rendered = renderHypertensionNarrative(
      hypertensionInput({
        assessment: hypertensionRecord({ hypertensionStatus: 'SOMETHING_NEWER' }),
      }),
    );
    expect(JSON.stringify(rendered)).not.toContain('undefined');
    expect(rendered.history).toContain(NOT_RECORDED.toLowerCase());
  });

  it('says plainly when nothing was measured', () => {
    const rendered = renderHypertensionNarrative(
      hypertensionInput({ vitals: null, medications: [] }),
    );
    expect(rendered.history).toContain(`Initial blood pressure was ${NOT_RECORDED}`);
    expect(rendered.history).toContain('No blood-pressure medications were recorded');
    expect(JSON.stringify(rendered)).not.toContain('undefined');
  });

  /* No locale formatting anywhere: a record must read the same on every machine. */
  it('contains no locale-formatted number or date', () => {
    const rendered = renderHypertensionNarrative(hypertensionInput());
    expect(JSON.stringify(rendered)).not.toMatch(/\d{1,3},\d{3}/);
    expect(rendered.history).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });
});

function diabetesRecord(overrides: Record<string, unknown> = {}) {
  return {
    diabetesStatus: 'KNOWN_DIABETES',
    diabetesType: 'TYPE_2',
    yearDiagnosed: 2015,
    yearDiagnosedUnknown: false,
    mainConcern: 'HIGH_GLUCOSE',
    mainConcernOther: null,
    glucoseMgDl: 168,
    glucoseType: 'BEFORE_MEAL',
    hba1cStatus: 'VALUE_KNOWN',
    hba1cPercent: 7.4,
    hba1cMeasuredOn: new Date('2026-05-14T00:00:00.000Z'),
    homeGlucoseMonitoring: 'YES',
    homeGlucoseLowMgDl: 90,
    homeGlucoseHighMgDl: 210,
    symptoms: ['FATIGUE'],
    urgentSymptoms: ['NONE'],
    nutrition: null,
    phq2Total: 4,
    phq2Positive: true,
    distressOverwhelmed: 'MODERATE_PROBLEM',
    distressFailing: 'SLIGHT_PROBLEM',
    distressPositive: true,
    eyeExam: 'COMPLETED',
    footExam: 'NOT_COMPLETED',
    kidneyTesting: 'PATIENT_UNSURE',
    bpCheckedToday: 'COMPLETED',
    currentFootWound: 'NO',
    derivedSuspicion: 'NOT_SUSPECTED',
    urgentReviewRequired: false,
    urgentReviewReasons: [],
    volunteerActions: { selected: ['REVIEWED_TODAYS_GLUCOSE'] },
    reviewReasons: ['POSITIVE_MENTAL_HEALTH_SCREEN'],
    ...overrides,
  };
}

function diabetesInput(overrides: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    patientName: 'Kwame Owusu',
    assessment: diabetesRecord(),
    vitals: null,
    medications: ['Metformin 1 g twice daily'],
    clinicianPlan: null,
    ...overrides,
  };
}

describe('renderDiabetesNarrative', () => {
  it('renders the same text twice', () => {
    expect(renderDiabetesNarrative(diabetesInput())).toEqual(
      renderDiabetesNarrative(diabetesInput()),
    );
  });

  it('names the reading and its timing together', () => {
    const { history } = renderDiabetesNarrative(diabetesInput());
    expect(history).toContain(
      "Today's capillary blood glucose was 168 mg/dL, measured before meal.",
    );
  });

  /*
    The two symptom lists are two sentences about two periods.

    Collapsing them would lose the distinction the record exists to keep: a foot wound last month
    and an open wound now are different facts.
  */
  it('keeps the past month and the present moment apart', () => {
    const { history } = renderDiabetesNarrative(
      diabetesInput({
        assessment: diabetesRecord({
          symptoms: ['FOOT_WOUND'],
          urgentSymptoms: ['ACTIVE_FOOT_WOUND'],
        }),
      }),
    );
    expect(history).toContain('During the past month, the patient reported foot wound.');
    expect(history).toContain('At the time of the visit: active foot wound.');
  });

  /*
    Rendering a null total as 0 would put a completed negative screen into the record for a question
    nobody finished asking.
  */
  it('describes an incomplete PHQ-2 as incomplete rather than as zero', () => {
    const { history } = renderDiabetesNarrative(
      diabetesInput({ assessment: diabetesRecord({ phq2Total: null, phq2Positive: false }) }),
    );
    expect(history).toContain('The PHQ-2 screen was not completed.');
    expect(history).not.toContain('0/6');
  });

  it('reports a completed screen with its score', () => {
    expect(renderDiabetesNarrative(diabetesInput()).history).toContain('PHQ-2 score was 4/6.');
  });

  /* An HbA1c date renders as an ISO day, not in the server's locale. */
  it('renders the HbA1c date as an ISO calendar day', () => {
    expect(renderDiabetesNarrative(diabetesInput()).history).toContain('7.4% on 2026-05-14');
  });

  it('says never checked rather than inventing a value', () => {
    const { history } = renderDiabetesNarrative(
      diabetesInput({
        assessment: diabetesRecord({ hba1cStatus: 'NEVER_CHECKED', hba1cPercent: null }),
      }),
    );
    expect(history).toContain('The most recent HbA1c was never checked.');
  });

  it('states the threshold result with the timing it depended on', () => {
    const { assessment } = renderDiabetesNarrative(diabetesInput());
    expect(assessment).toContain('is below the threshold for that timing');
  });

  it('says an unclassifiable reading cannot be classified', () => {
    const { assessment } = renderDiabetesNarrative(
      diabetesInput({
        assessment: diabetesRecord({ glucoseType: 'UNKNOWN', derivedSuspicion: 'NOT_ASSESSED' }),
      }),
    );
    expect(assessment).toContain('cannot be classified without a measurement timing');
  });

  it('leaves out the clinician plan entirely for a reader without it', () => {
    const { plan } = renderDiabetesNarrative(diabetesInput({ clinicianPlan: null }));
    expect(plan).not.toMatch(/supervising clinician/i);
  });

  it('renders nothing as undefined, even from an empty record', () => {
    const rendered = renderDiabetesNarrative({
      patientName: 'Test Patient',
      assessment: {},
      vitals: null,
    });
    expect(JSON.stringify(rendered)).not.toContain('undefined');
  });
});
