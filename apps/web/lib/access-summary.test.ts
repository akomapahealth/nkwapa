import { accessPoints } from './access-summary';

const labels = (permissions: string[], stationWorkflow = false) =>
  accessPoints(permissions, { stationWorkflow }).map((point) => point.label);

describe('accessPoints', () => {
  it('lists only what the permissions open', () => {
    expect(labels(['PATIENT.SEARCH', 'PATIENT.CREATE'])).toEqual([
      'Find a patient',
      'Register someone new',
    ]);
    expect(labels([])).toEqual([]);
  });

  it('adds review work for a role that can review or co-sign', () => {
    expect(labels(['PATIENT.SEARCH'])).not.toContain('Review visits and co-sign notes');
    expect(labels(['PATIENT.SEARCH', 'CLINICAL_NOTE.COSIGN'])[0]).toBe(
      'Review visits and co-sign notes',
    );
  });

  it('mentions stations only where the station line is on', () => {
    expect(labels(['OPS.STATION.WORK'])).toEqual([]);
    expect(labels(['OPS.STATION.WORK'], true)).toEqual(['Record what your station measures']);
  });

  it('is not capped, unlike the tour: a system admin sees everything', () => {
    expect(labels(['*'], true).length).toBeGreaterThan(4);
  });
});
