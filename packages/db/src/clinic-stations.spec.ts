import { DEFAULT_CLINIC_STATIONS, nextStationId } from './clinic-stations';

const stations = DEFAULT_CLINIC_STATIONS.map((station) => ({
  ...station,
  id: station.kind.toLowerCase(),
  active: true,
}));

describe('nextStationId', () => {
  it('follows the station order', () => {
    expect(nextStationId(stations, 'intake')).toBe('blood_pressure');
    expect(nextStationId(stations, 'anthropometry')).toBe('review');
  });

  it('ends the session after the review station', () => {
    expect(nextStationId(stations, 'review')).toBeNull();
  });

  it('passes over skipped and inactive stations', () => {
    expect(nextStationId(stations, 'blood_pressure', new Set(['glucose']))).toBe('anthropometry');
    const noGlucose = stations.map((s) => (s.id === 'glucose' ? { ...s, active: false } : s));
    expect(nextStationId(noGlucose, 'blood_pressure')).toBe('anthropometry');
  });

  it('sends a patient to review even when review is not last in the order', () => {
    const reordered = stations.map((s) => (s.kind === 'REVIEW' ? { ...s, sortOrder: 0 } : s));
    expect(nextStationId(reordered, 'anthropometry')).toBe('review');
  });

  it('returns null for a station it does not know', () => {
    expect(nextStationId(stations, 'missing')).toBeNull();
  });
});
