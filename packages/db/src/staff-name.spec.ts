import {
  formatStaffDisplayName,
  middleInitialError,
  normalizeMiddleInitial,
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
    ['k.', 'K'],
    [' K ', 'K'],
    ['ɔ', 'Ɔ'],
    ['', null],
    [null, null],
  ])('normalizes middle initial %j to %j', (input, expected) => {
    expect(normalizeMiddleInitial(input)).toBe(expected);
    expect(middleInitialError(expected)).toBeNull();
  });

  it.each(['KM', '1'])('rejects middle initial %s', (input) => {
    expect(middleInitialError(normalizeMiddleInitial(input))).toBe('INVALID_CHARACTERS');
  });

  it('formats the display name with and without an initial', () => {
    expect(
      formatStaffDisplayName({ firstName: 'Ama', middleInitial: 'K', lastName: 'Mensah' }),
    ).toBe('Ama K. Mensah');
    expect(
      formatStaffDisplayName({ firstName: 'Ama', middleInitial: null, lastName: 'Mensah' }),
    ).toBe('Ama Mensah');
  });
});
