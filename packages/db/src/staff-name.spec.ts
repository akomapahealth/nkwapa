import {
  formatStaffDisplayName,
  middleNameError,
  normalizeMiddleName,
  normalizeStaffNamePart,
  staffNamePartError,
  STAFF_NAME_MAX_LENGTH,
} from './staff-name';

describe('staff name rules', () => {
  it.each(['Abena Adɔma', "O'Neil", 'O’Neil', 'Kwame-Mensah', 'St. John', 'Zoë', 'José'])(
    'accepts %s',
    (name) => expect(staffNamePartError(normalizeStaffNamePart(name))).toBeNull(),
  );

  it.each([
    ['', 'REQUIRED'],
    ['   ', 'REQUIRED'],
    ['123', 'INVALID_CHARACTERS'],
    ['Ama2', 'INVALID_CHARACTERS'],
    ['ama@clinic.org', 'INVALID_CHARACTERS'],
    ['-Ama', 'INVALID_CHARACTERS'],
    ['a'.repeat(STAFF_NAME_MAX_LENGTH + 1), 'TOO_LONG'],
  ])('rejects %j as %s', (name, error) => {
    expect(staffNamePartError(normalizeStaffNamePart(name))).toBe(error);
  });

  it('rejects a name equal to the email, ignoring case', () => {
    expect(staffNamePartError('Mensah', 'MENSAH')).toBe('EQUALS_EMAIL');
  });

  it('trims, collapses whitespace and composes diacritics', () => {
    expect(normalizeStaffNamePart('  Abena   Adóma ')).toBe('Abena Adóma');
  });

  it.each([
    ['  Kwame   Agyei ', 'Kwame Agyei'],
    ['K', 'K'],
    ['', null],
    ['   ', null],
    [null, null],
  ])('normalizes middle name %j to %j', (input, expected) => {
    expect(normalizeMiddleName(input)).toBe(expected);
    expect(middleNameError(expected)).toBeNull();
  });

  it.each(["Kwame Agyei-Boateng O'Neil", 'K', 'Adɔma'])('accepts middle name %s', (value) =>
    expect(middleNameError(value)).toBeNull(),
  );

  it('rejects a middle name with digits or over the limit', () => {
    expect(middleNameError('Kwame 2')).toBe('INVALID_CHARACTERS');
    expect(middleNameError('A'.repeat(STAFF_NAME_MAX_LENGTH + 1))).toBe('TOO_LONG');
  });

  it('formats the display name with full middle names, a kept initial, or none', () => {
    expect(
      formatStaffDisplayName({ firstName: 'Nana', middleName: 'Kwame Agyei', lastName: 'Tuffour' }),
    ).toBe('Nana Kwame Agyei Tuffour');
    expect(formatStaffDisplayName({ firstName: 'Ama', middleName: 'K', lastName: 'Mensah' })).toBe(
      'Ama K. Mensah',
    );
    expect(formatStaffDisplayName({ firstName: 'Ama', middleName: null, lastName: 'Mensah' })).toBe(
      'Ama Mensah',
    );
  });
});
