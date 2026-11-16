import { glanceLines } from './patient-chart-glance';
import type { ChartGlance } from './patient-chart';

const MG = { glucoseUnit: 'MG_DL', hba1cUnit: 'PERCENT' } as const;
const MMOL = { glucoseUnit: 'MMOL_L', hba1cUnit: 'PERCENT' } as const;
const all = () => true;
const at = (day: string) => `${day}T09:00:00.000Z`;

const empty: ChartGlance = {
  generatedAt: at('2026-11-15'),
  conditions: {
    history: [],
    screening: { hypertension: null, diabetes: null, diabetesType: null },
  },
  bloodPressure: { latest: null, previous: [], direction: 'NOT_ENOUGH_DATA' },
  glucose: { latest: null, previous: [], direction: 'NOT_ENOUGH_DATA', hba1c: null },
  medications: {
    currentCount: 0,
    noKnownCurrentMedications: false,
    lastReconciledAt: null,
    adherence: null,
  },
  risks: {
    allergies: { state: 'NOT_RECORDED', activeAllergies: [], updatedAt: null },
    familyHistory: [],
    screening: { tobacco: null, pregnantRecordedAt: null },
  },
  screenings: [
    { kind: 'VITALS', lastAt: null },
    { kind: 'COUNSELLING', lastAt: null },
  ],
  care: { visits: 0, lastVisitAt: null, followUp: null },
};

const text = (glance: ChartGlance, units: typeof MG | typeof MMOL = MG) =>
  Object.fromEntries(glanceLines(glance, units, all).map((line) => [line.id, line.text]));

describe('at a glance lines (#341)', () => {
  it('reads like the issue example for a patient with history', () => {
    const lines = text(
      {
        ...empty,
        conditions: {
          history: ['Asthma'],
          screening: {
            hypertension: 'KNOWN_HYPERTENSION',
            diabetes: 'KNOWN_DIABETES',
            diabetesType: 'TYPE_2',
          },
        },
        bloodPressure: {
          latest: { systolic: 152, diastolic: 94, recordedAt: at('2026-11-03'), repeat: false },
          previous: [],
          direction: 'RISING',
        },
        glucose: {
          latest: { mgDl: 164, type: 'FASTING', recordedAt: at('2026-11-03') },
          previous: [],
          direction: 'STEADY',
          hba1c: null,
        },
        medications: {
          currentCount: 3,
          noKnownCurrentMedications: false,
          lastReconciledAt: at('2026-11-03'),
          adherence: { level: 'SOMETIMES', recordedAt: at('2026-11-03') },
        },
        risks: {
          allergies: {
            state: 'ACTIVE_ALLERGIES',
            activeAllergies: [{ recordId: 'a', substance: 'Penicillin' }],
            updatedAt: null,
          },
          familyHistory: [{ relationship: 'Father', condition: 'Stroke' }],
          screening: {
            tobacco: { smoking: 'CURRENT_DAILY', smokeless: 'NEVER', recordedAt: at('2026-11-03') },
            pregnantRecordedAt: null,
          },
        },
        screenings: [
          { kind: 'VITALS', lastAt: at('2026-11-03') },
          { kind: 'DIABETES', lastAt: at('2026-10-03') },
          { kind: 'COUNSELLING', lastAt: null },
        ],
        care: {
          visits: 4,
          lastVisitAt: at('2026-11-03'),
          followUp: { dueOn: '2026-12-03', state: 'UPCOMING' },
        },
      },
      MMOL,
    );
    expect(lines).toEqual({
      conditions: 'Hypertension, Type 2 diabetes, Asthma',
      bp: '152/94 mmHg on Nov 3, 2026, rising over the last 3 readings',
      glucose:
        '9.1 mmol/L fasting on Nov 3, 2026, steady over the last 3 fasting readings. HbA1c not recorded',
      medications: '3 current, missing some doses, reconciled Nov 3, 2026',
      risks: 'Penicillin allergy, smokes, father had stroke',
      screened: 'Vitals and diabetes (latest Nov 3, 2026). Not yet: counselling',
      care: '4 visits, last Nov 3, 2026, follow-up due Dec 3, 2026',
    });
  });

  it('gives a new patient muted "not recorded" lines, not an empty box', () => {
    const lines = glanceLines(empty, MG, all);
    expect(lines.map((line) => [line.id, line.text, line.empty])).toEqual([
      ['conditions', 'No conditions recorded', true],
      ['bp', 'No blood pressure recorded', true],
      ['glucose', 'No glucose or HbA1c recorded', true],
      ['medications', 'Not reconciled yet', true],
      ['risks', 'Allergy status not recorded', false],
      ['screened', 'Nothing screened yet', true],
      ['care', 'No visits yet', true],
    ]);
  });

  it('leaves out a line the role cannot read and links conditions where it can', () => {
    const lines = glanceLines(
      { ...empty, bloodPressure: null, glucose: null, medications: null },
      MG,
      (section) => section !== 'medical-history',
    );
    expect(lines.map((line) => line.id)).toEqual(['conditions', 'risks', 'screened', 'care']);
    expect(lines.find((line) => line.id === 'conditions')?.section).toBe('hypertension');
  });

  it('says when a follow-up is overdue', () => {
    expect(
      text({
        ...empty,
        care: {
          visits: 2,
          lastVisitAt: at('2026-10-01'),
          followUp: { dueOn: '2026-11-01', state: 'OVERDUE' },
        },
      }).care,
    ).toBe('2 visits, last Oct 1, 2026, follow-up overdue since Nov 1, 2026');
  });
});
