import { readinessRows, readinessText } from './readiness';
import type { ClinicReadiness } from './stations';

const notReady: ClinicReadiness = {
  date: '2026-11-28',
  checkInsToday: 0,
  syncMinutes: 10,
  checks: {
    stations: { state: 'WARN', activeCount: 4, reviewCount: 0, kindsClosed: ['EYE', 'REVIEW'] },
    staffed: {
      state: 'WARN',
      stations: [
        { id: 's1', name: 'Blood pressure' },
        { id: 's2', name: 'Glucose' },
      ],
    },
    doctorAtReview: { state: 'NA' },
    synced: { state: 'WARN', people: ['Ama Mensah'] },
    offline: { state: 'NA', people: [] },
    yesterdayClosed: { state: 'WARN', openCheckIns: 2 },
  },
};

describe('ready to open (#411)', () => {
  it('names what is missing and links to where it is fixed', () => {
    const rows = readinessRows(notReady);
    expect(rows.map((row) => row.state)).toEqual(['WARN', 'WARN', 'NA', 'WARN', 'NA', 'WARN']);
    expect(rows[0].detail).toBe('No open Eye station. No review station is open.');
    expect(rows[0].link?.href).toBe('/stations/setup');
    expect(rows[1].detail).toBe('Nobody at Blood pressure and Glucose.');
    expect(rows[1].link?.href).toBe('#on-shift');
    expect(rows[3].detail).toContain('Ama Mensah');
    expect(rows[5].detail).toContain('2 patients are still open');
  });

  it('copies one line per check, counting only the checks that apply', () => {
    const text = readinessText(notReady, 'Akwatia').split('\n');
    expect(text[0]).toBe('Akwatia: ready to open, 2026-11-28 (0 of 4 checks pass)');
    expect(text).toHaveLength(7);
    expect(text[3]).toBe('[n/a] Doctor at review: No review station is open.');
  });
});
