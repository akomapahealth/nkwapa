import { clinicLocalToIso, formatEventWhen, isoToClinicLocal } from './volunteers';

describe('clinic-time conversion', () => {
  it('reads a typed time in the clinic zone, not the browser one', () => {
    expect(clinicLocalToIso('2026-11-07T08:00', 'Africa/Accra')).toBe('2026-11-07T08:00:00.000Z');
    expect(clinicLocalToIso('2026-11-07T08:00', 'Africa/Lagos')).toBe('2026-11-07T07:00:00.000Z');
    expect(clinicLocalToIso('', 'Africa/Accra')).toBeNull();
  });

  it('round-trips an instant through the form value', () => {
    const iso = '2026-11-07T07:30:00.000Z';
    expect(isoToClinicLocal(iso, 'Africa/Lagos')).toBe('2026-11-07T08:30');
    expect(clinicLocalToIso(isoToClinicLocal(iso, 'Africa/Lagos'), 'Africa/Lagos')).toBe(iso);
  });

  it('formats the range with the zone', () => {
    expect(
      formatEventWhen(
        { startsAt: '2026-11-07T08:00:00.000Z', endsAt: '2026-11-07T13:00:00.000Z' },
        'Africa/Accra',
      ),
    ).toBe('Sat, 7 Nov 2026, 08:00–13:00 GMT');
  });
});
