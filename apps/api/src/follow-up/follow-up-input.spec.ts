import { assessFollowUp } from '@nkwapa/db';
import {
  assembleFollowUpInput,
  lastMedicationChange,
  type FollowUpRecords,
} from './follow-up-input';

const TODAY = new Date('2026-11-16T12:00:00Z');
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86_400_000);

type Encounter = FollowUpRecords['encounters'][number];

const hypertension = (overrides: Partial<NonNullable<Encounter['hypertension']>> = {}) => ({
  collectedAt: daysAgo(0),
  hypertensionStatus: 'NOT_ASSESSED' as const,
  confirmed: false,
  repeatSystolicBp: null,
  repeatDiastolicBp: null,
  repeatMeasuredAt: null,
  homeSystolicAvg: null,
  homeDiastolicAvg: null,
  currentSymptoms: [],
  relevantConditions: [],
  pregnantNow: 'NOT_ASSESSED' as const,
  ...overrides,
});

const diabetes = (overrides: Partial<NonNullable<Encounter['diabetes']>> = {}) => ({
  collectedAt: daysAgo(0),
  glucoseMgDl: null,
  glucoseType: 'UNKNOWN' as const,
  hba1cPercent: null,
  hba1cMeasuredOn: null,
  diabetesStatus: 'NOT_ASSESSED' as const,
  urgentSymptoms: [],
  symptoms: [],
  ...overrides,
});

const encounter = (overrides: Partial<Encounter> = {}): Encounter => ({
  createdAt: daysAgo(0),
  vitals: null,
  tobacco: null,
  hypertension: null,
  diabetes: null,
  ...overrides,
});

const vitals = (systolicBp: number, diastolicBp: number) => ({
  systolicBp,
  diastolicBp,
  bmi: null,
  weightKg: null,
  heightCm: null,
});

function records(overrides: Partial<FollowUpRecords> = {}): FollowUpRecords {
  return {
    today: TODAY,
    timeZone: 'Africa/Accra',
    patient: { dob: new Date('1970-11-17T00:00:00Z'), sex: 'FEMALE' },
    encounters: [],
    selfReports: [],
    measurements: [],
    medications: [],
    prescriptions: [],
    medicationListReconciled: false,
    ...overrides,
  };
}

describe('assembling the follow-up input', () => {
  it('counts age in whole years, the day before a birthday included', () => {
    expect(assembleFollowUpInput(records()).ageYears).toBe(55);
    expect(
      assembleFollowUpInput(records({ patient: { dob: null, sex: 'MALE' } })).ageYears,
    ).toBeNull();
  });

  describe('follow-up contacts (#338)', () => {
    const followUp = (overrides: Partial<NonNullable<FollowUpRecords['followUp']>> = {}) => ({
      completedAt: [],
      unresolvedDueOn: [],
      reportedSymptoms: [],
      ...overrides,
    });

    it('leaves both dates unset before any contact was scheduled', () => {
      const input = assembleFollowUpInput(records({ encounters: [encounter()] }));
      expect(input.nextContactDueAt).toBeUndefined();
      expect(input.lastCompletedContactAt).toBeUndefined();
    });

    it('counts a visit and a reached call as completed; an unanswered call is not passed in', () => {
      const input = assembleFollowUpInput(
        records({
          encounters: [encounter({ createdAt: daysAgo(40) })],
          followUp: followUp({ completedAt: [daysAgo(10)] }),
        }),
      );
      expect(input.lastCompletedContactAt).toEqual(daysAgo(10));
    });

    it('keeps a missed due date until someone reaches the patient after it', () => {
      const missed = daysAgo(20);
      const later = daysAgo(-30);
      const stillMissed = assembleFollowUpInput(
        records({
          encounters: [encounter({ createdAt: daysAgo(90) })],
          followUp: followUp({ unresolvedDueOn: [later, missed] }),
        }),
      );
      expect(stillMissed.nextContactDueAt).toEqual(missed);
      const reached = assembleFollowUpInput(
        records({
          encounters: [encounter({ createdAt: daysAgo(90) })],
          followUp: followUp({ unresolvedDueOn: [later, missed], completedAt: [daysAgo(2)] }),
        }),
      );
      expect(reached.nextContactDueAt).toEqual(later);
    });

    it('adds danger symptoms reported by phone, within the window only', () => {
      const input = assembleFollowUpInput(
        records({
          followUp: followUp({
            reportedSymptoms: [
              { at: daysAgo(1), symptoms: ['CHEST_PAIN'] },
              { at: daysAgo(400), symptoms: ['FAINTING'] },
            ],
          }),
        }),
      );
      expect(input.symptoms?.hypertension).toEqual(['CHEST_PAIN']);
    });

    it('adds diabetes danger symptoms reported by phone, dropping "none"', () => {
      const input = assembleFollowUpInput(
        records({
          followUp: followUp({
            reportedSymptoms: [
              { at: daysAgo(1), symptoms: [], diabetesSymptoms: ['VOMITING', 'NONE'] },
            ],
          }),
        }),
      );
      expect(input.symptoms?.diabetes).toEqual(['VOMITING']);
    });
  });

  describe('blood pressure readings', () => {
    it('dates clinic readings by their visit and puts the repeat after the first', () => {
      const visit = daysAgo(3);
      const { readings } = assembleFollowUpInput(
        records({
          encounters: [
            encounter({
              createdAt: visit,
              vitals: vitals(170, 100),
              hypertension: hypertension({ repeatSystolicBp: 165, repeatDiastolicBp: 98 }),
            }),
          ],
        }),
      );
      expect(readings).toEqual([
        { systolic: 165, diastolic: 98, at: new Date(visit.getTime() + 1), measured: true },
        { systolic: 170, diastolic: 100, at: visit, measured: true },
      ]);
    });

    it('marks home averages and patient-entered readings as self-reported', () => {
      const { readings } = assembleFollowUpInput(
        records({
          encounters: [
            encounter({
              hypertension: hypertension({ homeSystolicAvg: 135, homeDiastolicAvg: 85 }),
            }),
          ],
          selfReports: [
            {
              type: 'HOME_BP',
              systolicBp: 150,
              diastolicBp: 95,
              glucoseMgDl: null,
              glucoseType: null,
              recordedAt: daysAgo(2),
            },
          ],
          measurements: [
            {
              type: 'BP',
              source: 'PATIENT',
              recordedAt: daysAgo(1),
              payloadJson: '{"systolic":140,"diastolic":90}',
            },
            {
              type: 'BP',
              source: 'STAFF',
              recordedAt: daysAgo(4),
              payloadJson: '{"systolic":128,"diastolic":80}',
            },
            { type: 'BP', source: 'STAFF', recordedAt: daysAgo(5), payloadJson: 'not json' },
          ],
        }),
      );
      expect(readings!.map((r) => [r.systolic, r.measured])).toEqual([
        [135, false],
        [140, false],
        [150, false],
        [128, true],
      ]);
    });
  });

  it('keeps a reported blood sugar apart from a clinic one', () => {
    const input = assembleFollowUpInput(
      records({
        encounters: [
          encounter({
            diabetes: diabetes({
              glucoseMgDl: 110,
              glucoseType: 'FASTING',
              collectedAt: daysAgo(5),
            }),
          }),
        ],
        measurements: [
          {
            type: 'GLUCOSE',
            source: 'PATIENT',
            recordedAt: daysAgo(1),
            payloadJson: '{"value":350.4,"glucoseType":"RANDOM"}',
          },
        ],
      }),
    );
    expect(input.glucose).toEqual({ mgDl: 110, context: 'FASTING', at: daysAgo(5) });
    expect(input.selfReportedGlucose).toEqual({ mgDl: 350, context: 'RANDOM', at: daysAgo(1) });
  });

  it('reads symptoms only from an assessment inside the danger-sign window', () => {
    const recent = assembleFollowUpInput(
      records({
        encounters: [
          encounter({
            hypertension: hypertension({
              currentSymptoms: ['CHEST_PAIN'],
              collectedAt: daysAgo(2),
            }),
            diabetes: diabetes({ symptoms: ['HYPOGLYCEMIA_SYMPTOMS'], collectedAt: daysAgo(2) }),
          }),
        ],
      }),
    );
    expect(recent.symptoms?.hypertension).toEqual(['CHEST_PAIN']);
    expect(recent.hypoglycaemiaSymptoms).toBe(true);

    const old = assembleFollowUpInput(
      records({
        encounters: [
          encounter({
            hypertension: hypertension({
              currentSymptoms: ['CHEST_PAIN'],
              collectedAt: daysAgo(30),
            }),
          }),
        ],
      }),
    );
    expect(old.symptoms?.hypertension).toEqual([]);
    expect(old.hypoglycaemiaSymptoms).toBeNull();
  });

  describe('conditions and diagnoses', () => {
    it('adds conditions from every assessment, and diabetes from a known-diabetes screening', () => {
      const input = assembleFollowUpInput(
        records({
          encounters: [
            encounter({ hypertension: hypertension({ relevantConditions: ['NONE_KNOWN'] }) }),
            encounter({
              hypertension: hypertension({ relevantConditions: ['STROKE_OR_TIA', 'PREGNANCY'] }),
              diabetes: diabetes({ diabetesStatus: 'KNOWN_DIABETES' }),
            }),
          ],
        }),
      );
      expect(input.conditions).toEqual(['STROKE_OR_TIA', 'DIABETES']);
    });

    it('says none known only when that was asked, and unknown when it never was', () => {
      const asked = records({
        encounters: [
          encounter({ hypertension: hypertension({ relevantConditions: ['NONE_KNOWN'] }) }),
        ],
      });
      expect(assembleFollowUpInput(asked).conditions).toEqual(['NONE_KNOWN']);
      expect(assembleFollowUpInput(records()).conditions).toBeNull();
    });

    it('treats known or confirmed hypertension as diagnosed', () => {
      const known = records({
        encounters: [
          encounter({ hypertension: hypertension({ hypertensionStatus: 'KNOWN_HYPERTENSION' }) }),
        ],
      });
      const confirmed = records({
        encounters: [encounter({ hypertension: hypertension({ confirmed: true }) })],
      });
      const notYet = records({
        encounters: [
          encounter({ hypertension: hypertension({ hypertensionStatus: 'NEWLY_ELEVATED_BP' }) }),
        ],
      });
      expect(assembleFollowUpInput(known).hypertensionDiagnosed).toBe(true);
      expect(assembleFollowUpInput(confirmed).hypertensionDiagnosed).toBe(true);
      expect(assembleFollowUpInput(notYet).hypertensionDiagnosed).toBe(false);
      expect(assembleFollowUpInput(records()).hypertensionDiagnosed).toBeNull();
    });

    it('believes a pregnancy answer for nine months', () => {
      const answer = (pregnantNow: 'YES' | 'NO', days: number) =>
        assembleFollowUpInput(
          records({
            encounters: [
              encounter({
                hypertension: hypertension({ pregnantNow, collectedAt: daysAgo(days) }),
              }),
            ],
          }),
        ).pregnant;
      expect(answer('YES', 30)).toBe(true);
      expect(answer('NO', 30)).toBe(false);
      expect(answer('YES', 300)).toBeNull();
    });
  });

  describe('treatment', () => {
    const medication = (status: 'CURRENT' | 'STOPPED') => ({
      category: 'ANTIHYPERTENSIVE' as const,
      revisions: [
        {
          revisionNumber: 1,
          status: 'CURRENT' as const,
          strength: '5 mg',
          dose: '1',
          frequency: 'daily',
          createdAt: daysAgo(90),
        },
        {
          revisionNumber: 2,
          status,
          strength: '5 mg',
          dose: '1',
          frequency: 'daily',
          createdAt: daysAgo(10),
        },
      ],
    });

    it('counts a current medicine on the list', () => {
      const input = assembleFollowUpInput(records({ medications: [medication('CURRENT')] }));
      expect(input.onTreatment).toEqual({ hypertension: true, diabetes: null });
    });

    it('says not treated only when the list was reconciled', () => {
      const stopped = records({ medications: [medication('STOPPED')] });
      expect(assembleFollowUpInput(stopped).onTreatment?.hypertension).toBeNull();
      expect(
        assembleFollowUpInput({ ...stopped, medicationListReconciled: true }).onTreatment
          ?.hypertension,
      ).toBe(false);
    });

    it('counts a prescription inside the control window', () => {
      const prescription = (days: number) => ({
        drugId: 'metformin',
        category: 'ANTIDIABETIC' as const,
        dosage: '500 mg',
        frequency: 'twice daily',
        createdAt: daysAgo(days),
      });
      expect(
        assembleFollowUpInput(records({ prescriptions: [prescription(20)] })).onTreatment?.diabetes,
      ).toBe(true);
      expect(
        assembleFollowUpInput(records({ prescriptions: [prescription(200)] })).onTreatment
          ?.diabetes,
      ).toBeNull();
    });
  });

  describe('when medicines last changed', () => {
    const prescription = (drugId: string, dosage: string, days: number) => ({
      drugId,
      category: 'ANTIHYPERTENSIVE' as const,
      dosage,
      frequency: 'daily',
      createdAt: daysAgo(days),
    });

    it('ignores the same prescription written again', () => {
      expect(
        lastMedicationChange({
          medications: [],
          prescriptions: [prescription('amlo', '5 mg', 60), prescription('amlo', '5 MG ', 10)],
        }),
      ).toEqual(daysAgo(60));
    });

    it('counts a new dose and a new drug', () => {
      expect(
        lastMedicationChange({
          medications: [],
          prescriptions: [prescription('amlo', '5 mg', 60), prescription('amlo', '10 mg', 10)],
        }),
      ).toEqual(daysAgo(10));
      expect(
        lastMedicationChange({
          medications: [],
          prescriptions: [prescription('amlo', '5 mg', 60), prescription('hctz', '25 mg', 5)],
        }),
      ).toEqual(daysAgo(5));
    });

    it('ignores a list revision that changes nothing clinical', () => {
      const revision = (revisionNumber: number, dose: string, days: number) => ({
        revisionNumber,
        status: 'CURRENT' as const,
        strength: null,
        dose,
        frequency: 'daily',
        createdAt: daysAgo(days),
      });
      expect(
        lastMedicationChange({
          medications: [
            {
              category: 'ANTIHYPERTENSIVE',
              revisions: [revision(2, '1', 5), revision(1, '1', 80)],
            },
          ],
          prescriptions: [],
        }),
      ).toEqual(daysAgo(80));
    });
  });

  it('takes BMI and smoking from the latest visit that recorded them', () => {
    const input = assembleFollowUpInput(
      records({
        encounters: [
          encounter({ tobacco: { smokingStatus: 'NOT_ASSESSED' } }),
          encounter({
            vitals: { systolicBp: null, diastolicBp: null, bmi: null, weightKg: 81, heightCm: 180 },
            tobacco: { smokingStatus: 'CURRENT_DAILY' },
          }),
        ],
      }),
    );
    expect(input.bmi).toBe(25);
    expect(input.smoker).toBe(true);
  });

  it('feeds the engine: a crisis reading with chest pain today is urgent', () => {
    const input = assembleFollowUpInput(
      records({
        encounters: [
          encounter({
            vitals: vitals(186, 114),
            hypertension: hypertension({ currentSymptoms: ['CHEST_PAIN'] }),
          }),
        ],
      }),
    );
    expect(assessFollowUp(input).tier).toBe('URGENT');
  });
});
