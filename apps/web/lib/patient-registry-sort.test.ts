import { registrySortQuery, registrySortingFromQuery } from './patient-registry-sort';

describe('registrySortQuery', () => {
  it('sends nothing for an unsorted table, so the API keeps its default order', () => {
    expect(registrySortQuery([])).toEqual({});
  });

  it('maps a column sort to sortBy and sortDir', () => {
    expect(registrySortQuery([{ id: 'name', desc: false }])).toEqual({
      sortBy: 'name',
      sortDir: 'asc',
    });
    expect(registrySortQuery([{ id: 'patientCode', desc: true }])).toEqual({
      sortBy: 'patientCode',
      sortDir: 'desc',
    });
  });

  it('drops a column the API cannot sort by rather than sending it to be refused', () => {
    expect(registrySortQuery([{ id: 'phoneE164', desc: false }])).toEqual({});
  });
});

describe('registrySortingFromQuery', () => {
  it('maps the API sort back to its column, including the screened column', () => {
    expect(registrySortingFromQuery('lastScreenedAt', 'desc')).toEqual([
      { id: 'screened', desc: true },
    ]);
    expect(registrySortingFromQuery('name', null)).toEqual([{ id: 'name', desc: false }]);
  });

  it('ignores a sort the registry does not offer', () => {
    expect(registrySortingFromQuery('updatedAt', 'desc')).toEqual([]);
    expect(registrySortingFromQuery(null, null)).toEqual([]);
  });
});
