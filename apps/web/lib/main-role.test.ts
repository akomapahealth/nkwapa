import { pickMainRole } from './main-role';

describe('pickMainRole', () => {
  it.each([
    ['SYSTEM_ADMIN', 'SYSTEM_ADMIN'],
    ['DIRECTOR', 'DIRECTOR'],
    ['MANAGER', 'MANAGER'],
    ['DOCTOR', 'DOCTOR'],
    ['VOLUNTEER', 'VOLUNTEER'],
  ])('a person holding only %s gets that home', (role, expected) => {
    expect(pickMainRole([role])).toBe(expected);
  });

  it('takes the most responsible role, whatever the order', () => {
    expect(pickMainRole(['VOLUNTEER', 'DOCTOR'])).toBe('DOCTOR');
    expect(pickMainRole(['DOCTOR', 'MANAGER'])).toBe('MANAGER');
    expect(pickMainRole(['MANAGER', 'DIRECTOR', 'VOLUNTEER'])).toBe('DIRECTOR');
    expect(pickMainRole(['DOCTOR', 'SYSTEM_ADMIN', 'DIRECTOR'])).toBe('SYSTEM_ADMIN');
  });

  it('ignores roles that have no staff home', () => {
    expect(pickMainRole(['PATIENT'])).toBeNull();
    expect(pickMainRole(['PATIENT', 'VOLUNTEER'])).toBe('VOLUNTEER');
  });

  it('falls back to the dashboard data keys when there are no roles', () => {
    expect(pickMainRole([], { systemAdmin: {}, doctor: {} })).toBe('SYSTEM_ADMIN');
    expect(pickMainRole([], { director: {}, volunteer: {} })).toBe('DIRECTOR');
    expect(pickMainRole([], { review: {} })).toBe('DOCTOR');
    expect(pickMainRole([], { volunteer: {} })).toBe('VOLUNTEER');
  });

  it('has no main role with no roles and no data', () => {
    expect(pickMainRole([])).toBeNull();
    expect(pickMainRole([], null)).toBeNull();
    expect(pickMainRole([], {})).toBeNull();
  });
});
