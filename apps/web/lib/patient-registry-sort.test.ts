import { registrySortQuery } from './patient-registry-sort';

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
