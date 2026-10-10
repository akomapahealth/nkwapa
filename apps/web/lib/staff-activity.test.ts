import { describeRecord, formatRoles, lastSevenDays, staffActivityPath } from './staff-activity';

describe('staff activity helpers (#33)', () => {
  it('names roles plainly, and a person with no seat here', () => {
    expect(formatRoles(['DOCTOR', 'MANAGER'])).toBe('Doctor, Manager');
    expect(formatRoles([])).toBe('No seat here');
  });

  it('describes a record by what it is, never by whose it is', () => {
    expect(describeRecord('Encounter')).toBe('Visit');
    expect(describeRecord('PatientStationVisit')).toBe('Station visit');
    expect(describeRecord('HypertensionAssessment')).toBe('Hypertension Assessment');
  });

  it('defaults to the seven days ending today, across a month boundary', () => {
    expect(lastSevenDays('2026-10-03')).toEqual({ from: '2026-09-27', to: '2026-10-03' });
  });

  it('builds the overview and one person’s path', () => {
    const range = { from: '2026-10-01', to: '2026-10-07' };
    expect(staffActivityPath('c1', range)).toBe(
      '/clinics/c1/staff-activity?from=2026-10-01&to=2026-10-07',
    );
    expect(staffActivityPath('c1', range, 'u1')).toBe(
      '/clinics/c1/staff-activity/u1?from=2026-10-01&to=2026-10-07',
    );
  });
});
