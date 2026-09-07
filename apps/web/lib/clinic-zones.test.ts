import {
  ALL_ZONES_VALUE,
  UNZONED_FILTER_VALUE,
  UNZONED_LABEL,
  zoneFilterFromSelect,
  zoneFilterLabel,
  zoneFilterOptions,
  zoneFilterToSelect,
  memberMatchesZone,
  zoneByClinicId,
  zoneQueryString,
  zoneResourceKey,
  type ZoneSummary,
} from './clinic-zones';

const zones: ZoneSummary[] = [
  { zoneCode: 'north', clinicCount: 3, activeClinicCount: 3 },
  { zoneCode: 'south', clinicCount: 1, activeClinicCount: 0 },
  { zoneCode: null, clinicCount: 2, activeClinicCount: 2 },
];

describe('zoneFilterOptions', () => {
  it('offers every zone with "All zones" first', () => {
    expect(zoneFilterOptions(zones).map((option) => option.label)).toEqual([
      'All zones',
      'north',
      'south',
      UNZONED_LABEL,
    ]);
  });

  it('carries the clinic count, so a filter says where it will land', () => {
    const options = zoneFilterOptions(zones);
    expect(options[0].clinicCount).toBeNull();
    expect(options[1]).toMatchObject({ value: 'north', clinicCount: 3 });
    expect(options[3]).toMatchObject({ value: UNZONED_FILTER_VALUE, clinicCount: 2 });
  });

  it('still offers "All zones" when nothing is zoned', () => {
    expect(zoneFilterOptions([])).toEqual([
      { value: ALL_ZONES_VALUE, label: 'All zones', clinicCount: null },
    ]);
  });

  it('gives every option a non-empty value', () => {
    // Radix `Select` treats an empty string as "no selection" and throws on an item that uses
    // one, which is the whole reason ALL_ZONES_VALUE is a sentinel rather than ''.
    for (const option of zoneFilterOptions(zones)) {
      expect(option.value).not.toBe('');
    }
  });
});

describe('the Select round trip', () => {
  it('maps every option back to the filter it represents', () => {
    expect(zoneFilterFromSelect(ALL_ZONES_VALUE)).toBeNull();
    expect(zoneFilterFromSelect('north')).toBe('north');
    expect(zoneFilterFromSelect(UNZONED_FILTER_VALUE)).toBe(UNZONED_FILTER_VALUE);
  });

  it('round-trips a filter through the control and back', () => {
    for (const filter of [null, 'north', UNZONED_FILTER_VALUE]) {
      expect(zoneFilterFromSelect(zoneFilterToSelect(filter))).toEqual(filter);
    }
  });

  it('drives the control from state without an empty value', () => {
    expect(zoneFilterToSelect(null)).toBe(ALL_ZONES_VALUE);
    expect(zoneFilterToSelect('north')).toBe('north');
  });
});

describe('zoneFilterLabel', () => {
  it('says nothing when no zone is applied, so no chip is rendered', () => {
    // ActiveFilterSummary drops null values, which is how the chip disappears.
    expect(zoneFilterLabel(null)).toBeNull();
  });

  it('names the zone, and names the absence of one', () => {
    expect(zoneFilterLabel('north')).toBe('north');
    expect(zoneFilterLabel(UNZONED_FILTER_VALUE)).toBe(UNZONED_LABEL);
  });
});

describe('the request and its cache key', () => {
  it('sends no query when no zone is applied', () => {
    expect(zoneQueryString(null)).toBe('');
  });

  it('sends the zone, encoded', () => {
    expect(zoneQueryString('north')).toBe('?zoneCode=north');
    expect(zoneQueryString(UNZONED_FILTER_VALUE)).toBe('?zoneCode=__unzoned__');
  });

  it('gives each filter its own resource key', () => {
    // useAsyncResource refetches on the key alone. Two filters sharing a key would leave the
    // table showing the previous zone's rows, which is why both come from one module.
    const keys = [null, 'north', 'south', UNZONED_FILTER_VALUE].map((filter) =>
      zoneResourceKey('admin-clinics', filter),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(zoneResourceKey('admin-clinics', null)).toBe('admin-clinics:all');
  });
});

describe('memberMatchesZone', () => {
  const zones = zoneByClinicId([
    { id: 'c-north', zoneCode: 'north' },
    { id: 'c-south', zoneCode: 'south' },
    { id: 'c-none', zoneCode: null },
  ]);
  const at = (...clinicIds: string[]) => clinicIds.map((clinicId) => ({ clinicId }));

  it('keeps everyone when no zone is applied', () => {
    expect(memberMatchesZone(at('c-north'), zones, null)).toBe(true);
    expect(memberMatchesZone([], zones, null)).toBe(true);
  });

  it('matches on any seat, not only the first', () => {
    // Someone working in two zones really is in both; picking one would hide them from the other.
    expect(memberMatchesZone(at('c-north', 'c-south'), zones, 'north')).toBe(true);
    expect(memberMatchesZone(at('c-north', 'c-south'), zones, 'south')).toBe(true);
  });

  it('excludes someone with no seat in that zone', () => {
    expect(memberMatchesZone(at('c-south'), zones, 'north')).toBe(false);
  });

  it('reads unzoned as having no seat in any zone', () => {
    expect(memberMatchesZone(at('c-none'), zones, '__unzoned__')).toBe(true);
    expect(memberMatchesZone(at('c-none', 'c-north'), zones, '__unzoned__')).toBe(false);
  });

  it('files someone with no clinic seat at all under unzoned', () => {
    // A global administrator holds no clinic seat. Excluding them from every option would make
    // the row unreachable under any filter, which is worse than filing it under the residue.
    expect(memberMatchesZone([], zones, '__unzoned__')).toBe(true);
    expect(memberMatchesZone([], zones, 'north')).toBe(false);
  });

  it('treats a clinic it has never heard of as unzoned', () => {
    // The roster and the clinic list are two reads; one can be a moment behind the other.
    expect(memberMatchesZone(at('c-unknown'), zones, '__unzoned__')).toBe(true);
    expect(memberMatchesZone(at('c-unknown'), zones, 'north')).toBe(false);
  });
});
