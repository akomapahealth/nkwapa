import { busiestHour, daySummaryCsvRows, daySummaryRows, daySummaryText } from './day-summary';
import type { ClinicDaySummary } from './stations';

const summary: ClinicDaySummary = {
  metrics: {
    date: '2026-11-20',
    timezone: 'Africa/Accra',
    live: false,
    lowVolume: false,
    checkIns: { total: 12, completed: 9, leftEarly: 1, closedAtDayEnd: 2, inClinicNow: 0 },
    timeInClinic: { n: 9, medianMinutes: 75, p90Minutes: 110 },
    stations: [
      {
        stationId: 's1',
        name: 'Blood pressure',
        kind: 'BLOOD_PRESSURE',
        active: true,
        seen: 11,
        skipped: 1,
        wait: { n: 11, medianMinutes: 8, p90Minutes: 21 },
        service: { n: 11, medianMinutes: 4, p90Minutes: 7 },
        releases: 0,
        heldEmpty: 1,
        longestHeldMinutes: 32,
        waitingNow: null,
        longestCurrentWaitMinutes: null,
        staffNow: null,
      },
    ],
    bottleneckStationId: null,
    bottleneckConstraint: null,
    hourly: [
      { hour: '08:00', checkedIn: 3, completed: 0 },
      { hour: '09:00', checkedIn: 6, completed: 2 },
      { hour: '10:00', checkedIn: 3, completed: 7 },
    ],
    staffing: { onShiftNow: null },
  },
  demoCheckIns: 4,
  patients: { new: 7, returning: 5 },
  clinical: {
    referrals: { urgent: 1, soon: 2, routine: 1, unspecified: 1 },
    bpReferToday: 1,
    bpRecheck: 3,
    glucoseReferToday: 0,
    glucoseRaised: 2,
  },
  openWork: { drafts: 2, inReview: 3, notesToCosignAnyDay: 5 },
  staff: { volunteers: 8, doctors: 2, managers: 1 },
};

describe('clinic day summary figures (#421)', () => {
  it('finds the busiest hour by check-ins, and none on an empty day', () => {
    expect(busiestHour(summary)).toBe('09:00');
    expect(busiestHour({ ...summary, metrics: { ...summary.metrics, hourly: [] } })).toBeNull();
  });

  it('folds referrals without an urgency into routine', () => {
    const row = daySummaryRows(summary).find((r) => r.label === 'Referrals: routine');
    expect(row?.value).toBe('2');
  });

  it('gives each station its wait, patients taken, empty hand-ons and longest hold', () => {
    const labels = daySummaryRows(summary)
      .filter((r) => r.label.startsWith('Blood pressure'))
      .map((r) => `${r.label} = ${r.value}`);
    expect(labels).toEqual([
      'Blood pressure: wait, median / 90th = 8 min / 21 min',
      'Blood pressure: patients taken = 11',
      'Blood pressure: handed on with nothing recorded = 1',
      'Blood pressure: longest with one patient = 32 min',
    ]);
  });

  it('copies sectioned text with the demo count set apart', () => {
    const text = daySummaryText(summary, 'Akwatia');
    expect(text.split('\n')[0]).toBe('Akwatia: clinic day 2026-11-20');
    expect(text).toContain('\nOpen work\n- Draft encounters: 2');
    expect(text.trim().endsWith('Not counted above: 4 practice (demo) check-ins.')).toBe(true);
  });

  it('writes one CSV row per figure with the date on each', () => {
    const rows = daySummaryCsvRows(summary);
    expect(rows[0]).toEqual(['date', 'section', 'metric', 'value']);
    expect(rows).toHaveLength(daySummaryRows(summary).length + 2);
    expect(rows.slice(1).every((row) => row[0] === '2026-11-20' && row.length === 4)).toBe(true);
  });
});
