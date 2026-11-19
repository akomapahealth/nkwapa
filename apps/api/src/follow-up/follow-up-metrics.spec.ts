import { DEFAULT_FOLLOW_UP_CONFIG, addMonths, type FollowUpBpReading } from '@nkwapa/db';
import {
  computeFollowUpMetrics,
  contactPatientSets,
  contactRowsIn,
  deceasedOn,
  monthRange,
  type FollowUpMetricsInput,
  type MetricsAssessment,
  type MetricsPatient,
} from './follow-up-metrics';

/*
  A hand-counted dataset for October 2026 (#339), built to hit every boundary. Figures are taken at
  the month's last instant, 2026-10-31T23:59:59.999Z; the control window opens 3 months earlier.
*/
const NOW = new Date('2026-11-16T12:00:00Z');
const MONTH = '2026-10';
const CUT = monthRange(MONTH, NOW).cut;
const CONTROL_SINCE = addMonths(CUT, -3);

const assessed = (over: Partial<MetricsAssessment> = {}): MetricsAssessment => ({
  computedAt: new Date('2026-06-01T09:00:00Z'),
  tier: 'MODERATE',
  hypertensionDiagnosed: true,
  onHypertensionTreatment: true,
  conditions: [],
  timeZone: 'Africa/Accra',
  ...over,
});

const reading = (
  at: Date,
  systolic: number,
  diastolic = 75,
  measured = true,
): FollowUpBpReading => ({
  systolic,
  diastolic,
  at,
  measured,
});

function patient(id: string, over: Partial<MetricsPatient> = {}): MetricsPatient {
  return {
    id,
    dob: new Date('1970-01-01'),
    assessments: [assessed()],
    readings: [],
    deceasedReportedAt: [],
    visitAt: [],
    ...over,
  };
}

const SEPT = new Date('2026-09-15T10:00:00Z');

const patients: MetricsPatient[] = [
  // Controlled: 128/75 in September.
  patient('controlled', { readings: [reading(SEPT, 128)] }),
  // Exactly 3 months old counts: the window is inclusive at its start.
  patient('edge-in', { readings: [reading(CONTROL_SINCE, 132)] }),
  // Uncontrolled: 150/95, and the target is "below", so 140 itself is not controlled.
  patient('uncontrolled', { readings: [reading(SEPT, 150, 95)] }),
  patient('at-target-line', { readings: [reading(SEPT, 140, 85)] }),
  // One millisecond past 3 months: lost at 3 months, still under care.
  patient('edge-out', {
    readings: [reading(new Date(CONTROL_SINCE.getTime() - 1), 120)],
  }),
  // Only a self-reported reading this quarter: does not count while #334.4 says false.
  patient('self-reported', {
    readings: [reading(SEPT, 120, 75, false), reading(new Date('2026-03-01T10:00:00Z'), 150)],
  }),
  // No reading for over a year: lost at 3 and 12 months.
  patient('lost-12', { readings: [reading(new Date('2025-09-01T10:00:00Z'), 130)] }),
  // Deceased in October: off the register entirely.
  patient('deceased', {
    readings: [reading(SEPT, 150)],
    deceasedReportedAt: [new Date('2026-10-05T10:00:00Z')],
  }),
  // Reported deceased, then seen in person: the report was wrong, so counted (controlled).
  patient('not-deceased', {
    readings: [reading(new Date('2026-10-20T10:00:00Z'), 125)],
    deceasedReportedAt: [new Date('2026-10-05T10:00:00Z')],
    visitAt: [new Date('2026-10-20T10:00:00Z')],
  }),
  // Diagnosed, not on treatment: untreated, uncontrolled.
  patient('untreated', {
    assessments: [assessed({ onHypertensionTreatment: false })],
    readings: [reading(SEPT, 160, 100)],
  }),
  // Started treatment in October: untreated at September's end, treated at October's.
  patient('started', {
    assessments: [
      assessed({ onHypertensionTreatment: false }),
      assessed({ computedAt: new Date('2026-10-10T09:00:00Z'), onHypertensionTreatment: true }),
    ],
    readings: [reading(new Date('2026-10-10T09:00:00Z'), 135)],
  }),
  // No hypertension: tiered, never on the register.
  patient('no-htn', {
    assessments: [assessed({ hypertensionDiagnosed: false, tier: 'LOW' })],
    readings: [reading(SEPT, 118)],
  }),
  // Assessed only after the month: not in October's figures at all.
  patient('later', { assessments: [assessed({ computedAt: new Date('2026-11-02T09:00:00Z') })] }),
];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const input: FollowUpMetricsInput = {
  month: MONTH,
  now: NOW,
  patients,
  contacts: [
    {
      patientId: 'p-phone',
      mode: 'PHONE',
      status: 'DONE',
      dueOn: day('2026-10-03'),
      completedAt: day('2026-10-04'),
      missedAt: null,
    },
    {
      patientId: 'p-in_person',
      mode: 'IN_PERSON',
      status: 'DONE',
      dueOn: day('2026-10-10'),
      completedAt: day('2026-10-10'),
      missedAt: null,
    },
    // Missed, then done late: still one missed and one completed.
    {
      patientId: 'p-phone',
      mode: 'PHONE',
      status: 'DONE',
      dueOn: day('2026-09-20'),
      completedAt: day('2026-10-12'),
      missedAt: day('2026-09-28'),
    },
    {
      patientId: 'p-home_visit',
      mode: 'HOME_VISIT',
      status: 'MISSED',
      dueOn: day('2026-10-01'),
      completedAt: null,
      missedAt: day('2026-10-09'),
    },
    {
      patientId: 'p-phone',
      mode: 'PHONE',
      status: 'DUE',
      dueOn: day('2026-10-30'),
      completedAt: null,
      missedAt: null,
    },
    {
      patientId: 'p-phone',
      mode: 'PHONE',
      status: 'CANCELLED',
      dueOn: day('2026-10-15'),
      completedAt: null,
      missedAt: null,
    },
  ],
  attempts: [
    { patientId: 'p-phone', mode: 'PHONE', outcome: 'ATTEMPTED', at: day('2026-10-03') },
    { patientId: 'p-phone', mode: 'PHONE', outcome: 'ATTEMPTED', at: day('2026-10-03') },
    { patientId: 'p-phone', mode: 'PHONE', outcome: 'REACHED', at: day('2026-10-04') },
    { patientId: 'p-in_person', mode: 'IN_PERSON', outcome: 'RETURNED', at: day('2026-10-10') },
    { patientId: 'p-phone', mode: 'PHONE', outcome: 'ATTEMPTED', at: day('2026-09-30') },
  ],
  urgentFlags: [
    {
      raisedAt: new Date('2026-10-02T08:00:00Z'),
      acknowledgedAt: new Date('2026-10-02T08:10:00Z'),
      confirmationCallAt: new Date('2026-10-03T08:00:00Z'),
    },
    {
      raisedAt: new Date('2026-10-06T08:00:00Z'),
      acknowledgedAt: new Date('2026-10-06T08:30:00Z'),
      confirmationCallAt: null,
    },
  ],
};

describe('computeFollowUpMetrics (#339)', () => {
  const report = computeFollowUpMetrics(input);

  it('matches the hand count on the boundary dataset', () => {
    // Register: everyone with hypertension assessed by October's end, the deceased one excluded.
    expect(report.register).toBe(10);
    expect(report.controlled).toEqual({ count: 4, of: 10 }); // controlled, edge-in, not-deceased, started
    expect(report.uncontrolled).toEqual({ count: 3, of: 10 }); // uncontrolled, at-target-line, untreated
    expect(report.lost3m).toEqual({ count: 3, of: 10 }); // edge-out, self-reported, lost-12
    expect(report.notAssessed).toEqual({ count: 0, of: 10 });
    expect(report.underCare).toEqual({ count: 9, of: 10 });
    expect(report.lost12m).toEqual({ count: 1, of: 10 });
    expect(report.untreated).toEqual({ count: 1, of: 10 });
    expect(report.startedTreatment).toBe(1);
  });

  it('adds up: controlled + uncontrolled + not assessed + 3-month lost = under care + 12-month lost = register', () => {
    const { controlled, uncontrolled, notAssessed, lost3m, underCare, lost12m, register } = report;
    // 4 + 3 + 0 + 3 = 10, and 9 + 1 = 10.
    expect(controlled.count + uncontrolled.count + notAssessed.count + lost3m.count).toBe(register);
    expect(underCare.count + lost12m.count).toBe(register);
  });

  it('counts tiers for everyone assessed and alive, register or not', () => {
    expect(report.tiers.MODERATE).toBe(10);
    expect(report.tiers.LOW).toBe(1);
    expect(Object.values(report.tiers).reduce((a, b) => a + b, 0)).toBe(11);
  });

  it('never counts an attempt as a completed follow-up', () => {
    expect(report.contacts.completed).toEqual({ inPerson: 1, tele: 2, total: 3 });
    expect(report.contacts.attempts).toEqual({ inPerson: 0, tele: 2, total: 2 });
    expect(report.contacts.attemptsPerCompleted).toEqual({ count: 2, of: 3 });
    expect(report.outcomes).toEqual({
      ATTEMPTED: 2,
      REACHED: 1,
      DECLINED: 0,
      AGREED_TO_RETURN: 0,
      RETURNED: 1,
      REFERRED: 0,
      REFERRAL_CONFIRMED: 0,
    });
  });

  it('counts due without cancelled, and missed by the date it was missed', () => {
    expect(report.contacts.due).toEqual({ inPerson: 2, tele: 2, total: 4 });
    expect(report.contacts.missed).toEqual({ inPerson: 1, tele: 0, total: 1 });
  });

  it('times urgent flags against their limits', () => {
    expect(report.urgent.flags).toBe(2);
    expect(report.urgent.acknowledged).toEqual({
      judged: 2,
      withinLimit: 1,
      medianMinutes: 20,
      limitMinutes: 15,
    });
    expect(report.urgent.confirmationCall).toEqual({
      judged: 2,
      withinLimit: 1,
      medianMinutes: 24 * 60,
      limitMinutes: 48 * 60,
    });
  });

  it('changing the BP target changes the controlled figure and nothing else', () => {
    const stricter = computeFollowUpMetrics({
      ...input,
      config: {
        ...DEFAULT_FOLLOW_UP_CONFIG,
        bpTargetUnder65: { systolic: 130, diastolic: 80 },
        bpTarget: { systolic: 130, diastolic: 80 },
      },
    });
    // edge-in (132) and started (135) move from controlled to uncontrolled.
    expect(stricter.controlled.count).toBe(2);
    expect(stricter.uncontrolled.count).toBe(5);
    // Everything but the controlled/uncontrolled split (and the settings that caused it).
    const rest = (r: typeof report) => ({
      ...r,
      controlled: null,
      uncontrolled: null,
      settings: null,
      trend: r.trend.map((point) => ({ ...point, controlled: null })),
    });
    expect(rest(stricter)).toEqual(rest(report));
  });

  it('counts a self-reported reading only when the setting allows it', () => {
    const allowed = computeFollowUpMetrics({
      ...input,
      config: { ...DEFAULT_FOLLOW_UP_CONFIG, selfReportedCountsTowardControl: true },
    });
    expect(allowed.controlled.count).toBe(5);
    expect(allowed.lost3m.count).toBe(2);
  });

  it('gives six months of trend ending at the month', () => {
    expect(report.trend.map((point) => point.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(report.trend[5]).toEqual({
      month: '2026-10',
      register: 10,
      underCare: 9,
      controlled: 4,
      missed: 1,
    });
    expect(report.trend[4]!.missed).toBe(1);
    // In May nobody had been assessed yet.
    expect(report.trend[0]!.register).toBe(0);
  });

  it('caps the current month at now', () => {
    const current = computeFollowUpMetrics({ ...input, month: '2026-11' });
    expect(current.asOf).toBe(NOW.toISOString());
  });
});

describe('deceasedOn', () => {
  const p = patient('p', {
    deceasedReportedAt: [new Date('2026-10-05T00:00:00Z')],
    visitAt: [new Date('2026-10-20T00:00:00Z')],
  });
  it('is not deceased before the report, deceased after it, and not once seen again', () => {
    expect(deceasedOn(p, new Date('2026-10-01T00:00:00Z'))).toBe(false);
    expect(deceasedOn(p, new Date('2026-10-10T00:00:00Z'))).toBe(true);
    expect(deceasedOn(p, new Date('2026-10-25T00:00:00Z'))).toBe(false);
  });
});

describe('months in the clinic zone', () => {
  it('starts a month at local midnight on the 1st', () => {
    const accra = monthRange('2026-10', NOW, 'Africa/Accra');
    expect(accra.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    // New York is UTC-4 on 1 October and UTC-5 by 1 November.
    const newYork = monthRange('2026-10', NOW, 'America/New_York');
    expect(newYork.start.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(newYork.end.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('puts an attempt in the month it happened locally', () => {
    // 02:00 UTC on 1 November is still 31 October in New York.
    const late = {
      ...input,
      attempts: [
        {
          patientId: 'p',
          mode: 'PHONE' as const,
          outcome: 'ATTEMPTED' as const,
          at: new Date('2026-11-01T02:00:00Z'),
        },
      ],
    };
    expect(
      computeFollowUpMetrics({ ...late, timeZone: 'America/New_York' }).contacts.attempts.total,
    ).toBe(1);
    expect(
      computeFollowUpMetrics({ ...late, timeZone: 'Africa/Accra' }).contacts.attempts.total,
    ).toBe(0);
  });
});

describe('contact drill-down', () => {
  it('lists each patient once per contact figure, and never an attempt as completed', () => {
    const range = monthRange(MONTH, NOW);
    const sets = contactPatientSets(contactRowsIn(input.contacts, input.attempts, MONTH, range));
    expect(sets['contacts:completed'].sort()).toEqual(['p-in_person', 'p-phone']);
    expect(sets['contacts:attempts']).toEqual(['p-phone']);
    expect(sets['contacts:missed']).toEqual(['p-home_visit']);
    expect(sets['contacts:due'].sort()).toEqual(['p-home_visit', 'p-in_person', 'p-phone']);
  });
});
