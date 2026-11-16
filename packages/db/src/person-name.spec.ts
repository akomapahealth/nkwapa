import { formatPersonName, normalizeMiddleName } from './person-name';

describe('person names (#342)', () => {
  const nana = { firstName: 'Nana', middleName: 'Kwame Agyei', lastName: 'Tuffour' };

  it('formats full and short styles', () => {
    expect(formatPersonName(nana)).toBe('Nana Kwame Agyei Tuffour');
    expect(formatPersonName(nana, 'full')).toBe('Nana Kwame Agyei Tuffour');
    expect(formatPersonName(nana, 'short')).toBe('Nana Tuffour');
  });

  it('looks exactly as before without a middle name', () => {
    expect(formatPersonName({ firstName: 'Ama', lastName: 'Mensah' })).toBe('Ama Mensah');
    expect(formatPersonName({ firstName: 'Ama', middleName: '', lastName: 'Mensah' })).toBe(
      'Ama Mensah',
    );
    expect(formatPersonName({ firstName: 'Ama', middleName: null, lastName: 'Mensah' })).toBe(
      'Ama Mensah',
    );
  });

  it('copes with missing parts and extra spaces', () => {
    expect(
      formatPersonName({ firstName: ' Ama ', middleName: '  Kukua   Adɔma ', lastName: '' }),
    ).toBe('Ama Kukua Adɔma');
    expect(formatPersonName({ lastName: 'Mensah' })).toBe('Mensah');
    expect(formatPersonName({})).toBe('');
    // A first name entered before #342 with the middle name in it is shown as stored.
    expect(formatPersonName({ firstName: 'Nana Kwame', lastName: 'Tuffour' })).toBe(
      'Nana Kwame Tuffour',
    );
  });

  it('marks a lone letter as an initial', () => {
    expect(formatPersonName({ firstName: 'Ama', middleName: 'K', lastName: 'Mensah' })).toBe(
      'Ama K. Mensah',
    );
    expect(formatPersonName({ firstName: 'Ama', middleName: 'K. Adɔma', lastName: 'Mensah' })).toBe(
      'Ama K. Adɔma Mensah',
    );
  });

  it('normalizes a middle name, blank to null', () => {
    expect(normalizeMiddleName('  Kwame   Agyei ')).toBe('Kwame Agyei');
    expect(normalizeMiddleName('   ')).toBeNull();
    expect(normalizeMiddleName(undefined)).toBeNull();
  });
});
