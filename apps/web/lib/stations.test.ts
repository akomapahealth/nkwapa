import {
  minutesSince,
  stationsPassedOver,
  suggestedNextStation,
  type ClinicStation,
} from './stations';

const stations: ClinicStation[] = [
  { id: 'intake', kind: 'INTAKE', name: 'Intake', sortOrder: 1, active: true },
  { id: 'bp', kind: 'BLOOD_PRESSURE', name: 'BP', sortOrder: 2, active: true },
  { id: 'glucose', kind: 'GLUCOSE', name: 'Glucose', sortOrder: 3, active: true },
  { id: 'anthro', kind: 'ANTHROPOMETRY', name: 'Anthropometry', sortOrder: 4, active: true },
  { id: 'review', kind: 'REVIEW', name: 'Review', sortOrder: 5, active: true },
];

describe('station hand-off helpers', () => {
  it('suggests the next station in order and nothing after review', () => {
    expect(suggestedNextStation(stations, 'bp')?.id).toBe('glucose');
    expect(suggestedNextStation(stations, 'review')).toBeNull();
  });

  it('passes over closed stations', () => {
    const glucoseClosed = stations.map((s) => (s.id === 'glucose' ? { ...s, active: false } : s));
    expect(suggestedNextStation(glucoseClosed, 'bp')?.id).toBe('anthro');
  });

  it('lists the stations a jump forward skips, never the review station', () => {
    expect(stationsPassedOver(stations, 'intake', 'anthro').map((s) => s.id)).toEqual([
      'bp',
      'glucose',
    ]);
    expect(stationsPassedOver(stations, 'bp', 'review').map((s) => s.id)).toEqual([
      'glucose',
      'anthro',
    ]);
  });

  it('skips nothing when sending a patient back to an earlier station', () => {
    expect(stationsPassedOver(stations, 'anthro', 'bp')).toEqual([]);
  });

  it('counts whole minutes waited', () => {
    const now = new Date('2026-10-07T10:30:00Z');
    expect(minutesSince('2026-10-07T10:17:40Z', now)).toBe(12);
    expect(minutesSince('2026-10-07T10:31:00Z', now)).toBe(0);
  });
});
