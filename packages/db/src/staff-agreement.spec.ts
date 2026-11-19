import { STAFF_AGREEMENT, requiresStaffAgreement, signatureMatchesName } from './staff-agreement';

describe('requiresStaffAgreement', () => {
  it('asks an unsigned volunteer, at whichever clinic the role is held', () => {
    expect(requiresStaffAgreement(['DOCTOR', 'VOLUNTEER'], null)).toBe(true);
  });
  it('asks again when the text has moved on', () => {
    expect(requiresStaffAgreement(['VOLUNTEER'], STAFF_AGREEMENT.version - 1)).toBe(true);
    expect(requiresStaffAgreement(['VOLUNTEER'], STAFF_AGREEMENT.version)).toBe(false);
  });
  it('does not ask roles outside the list', () => {
    expect(requiresStaffAgreement(['DOCTOR', 'MANAGER', 'PATIENT'], null)).toBe(false);
    expect(requiresStaffAgreement([], null)).toBe(false);
  });
});

describe('signatureMatchesName', () => {
  const name = { firstName: 'Ama', middleName: 'K', lastName: 'Mensah' };
  it.each(['Ama Mensah', '  ama   MENSAH ', 'Ama K. Mensah', 'ama k mensah'])(
    'accepts %p',
    (typed) => expect(signatureMatchesName(typed, name)).toBe(true),
  );
  it.each(['Ama', 'Mensah Ama', 'Ama J. Mensah', 'Kofi Mensah', ''])('refuses %p', (typed) =>
    expect(signatureMatchesName(typed, name)).toBe(false),
  );
  it.each(['Nana Tuffour', 'Nana Kwame Agyei Tuffour', 'nana  kwame agyei  TUFFOUR'])(
    'accepts %p for a name with several middle names',
    (typed) =>
      expect(
        signatureMatchesName(typed, {
          firstName: 'Nana',
          middleName: 'Kwame Agyei',
          lastName: 'Tuffour',
        }),
      ).toBe(true),
  );
  it('refuses part of the middle names', () =>
    expect(
      signatureMatchesName('Nana Kwame Tuffour', {
        firstName: 'Nana',
        middleName: 'Kwame Agyei',
        lastName: 'Tuffour',
      }),
    ).toBe(false));
  it('refuses everything while the account has no name', () => {
    expect(signatureMatchesName(' ', { firstName: null, lastName: null })).toBe(false);
  });
});
