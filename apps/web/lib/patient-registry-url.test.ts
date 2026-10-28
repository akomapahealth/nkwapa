import { parseRegistryView, registryViewQuery } from './patient-registry-url';

describe('registry view in the URL', () => {
  it('reads an empty URL as the default registry and writes it back as nothing', () => {
    const view = parseRegistryView(new URLSearchParams());
    expect(view).toEqual({
      q: '',
      location: { region: '', district: '', community: '', status: '' },
      screenedFrom: '',
      screenedTo: '',
      page: 0,
      pageSize: 10,
      sorting: [],
    });
    expect(registryViewQuery(view).toString()).toBe('');
  });

  it('round-trips every filter, the page and the sort', () => {
    const url =
      'q=Ama&residentialRegion=VOLTA&residentialDistrict=Ho&residentialCommunity=Bankoe' +
      '&residentialLocationStatus=RECORDED&screenedFrom=2026-10-01&screenedTo=2026-10-15' +
      '&page=3&pageSize=25&sortBy=lastScreenedAt&sortDir=desc';
    const view = parseRegistryView(new URLSearchParams(url));

    expect(view.page).toBe(2);
    expect(view.sorting).toEqual([{ id: 'screened', desc: true }]);
    expect(registryViewQuery(view).toString()).toBe(url);
  });

  it('drops values it does not recognise rather than sending them to be refused', () => {
    const view = parseRegistryView(
      new URLSearchParams(
        'residentialRegion=ATLANTIS&residentialLocationStatus=x&screenedFrom=10/10/2026' +
          '&page=-4&pageSize=1000&sortBy=dob',
      ),
    );
    expect(view.location.region).toBe('');
    expect(view.location.status).toBe('');
    expect(view.screenedFrom).toBe('');
    expect(view.page).toBe(0);
    expect(view.pageSize).toBe(10);
    expect(view.sorting).toEqual([]);
  });

  it('always sends paging to the API', () => {
    const view = parseRegistryView(new URLSearchParams());
    expect(registryViewQuery(view, { forApi: true }).toString()).toBe('page=1&pageSize=10');
  });
});
