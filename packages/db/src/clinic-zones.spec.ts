import {
  UNZONED_FILTER_VALUE,
  UNZONED_LABEL,
  isZoneFilterValue,
  listZoneCodes,
  parseZoneFilter,
  summarizeZones,
  zoneFilterMatches,
  zoneFilterWhere,
  zoneLabel,
  zoneSummaryFilterValue,
} from './clinic-zones';
import { ZONE_CODE_PATTERN } from './clinic-metadata';

const clinic = (zoneCode: string | null, isActive = true) => ({ zoneCode, isActive });

describe('the unzoned sentinel', () => {
  it('is not itself a legal zone code', () => {
    // If it were, a tenant could create a zone that shadows the "no zone" bucket and make the
    // filter ambiguous. The underscore is what keeps the two vocabularies apart.
    expect(ZONE_CODE_PATTERN.test(UNZONED_FILTER_VALUE)).toBe(false);
  });
});

describe('isZoneFilterValue', () => {
  it('accepts a well-formed zone code', () => {
    expect(isZoneFilterValue('north')).toBe(true);
    expect(isZoneFilterValue('greater-accra-1')).toBe(true);
  });

  it('accepts the unzoned sentinel', () => {
    expect(isZoneFilterValue(UNZONED_FILTER_VALUE)).toBe(true);
  });

  it('accepts a code that only needs normalizing', () => {
    expect(isZoneFilterValue('  NORTH  ')).toBe(true);
  });

  it('rejects a malformed code', () => {
    expect(isZoneFilterValue('North Zone')).toBe(false);
    expect(isZoneFilterValue('-north')).toBe(false);
    expect(isZoneFilterValue('north--east')).toBe(false);
    expect(isZoneFilterValue('a'.repeat(65))).toBe(false);
  });

  it('rejects blank and non-string values', () => {
    // Blank is "no filter", which is the absence of a value rather than a value.
    expect(isZoneFilterValue('')).toBe(false);
    expect(isZoneFilterValue('   ')).toBe(false);
    expect(isZoneFilterValue(null)).toBe(false);
    expect(isZoneFilterValue(undefined)).toBe(false);
    expect(isZoneFilterValue(7)).toBe(false);
  });
});

describe('parseZoneFilter', () => {
  it('normalizes a zone code the way the column stores it', () => {
    expect(parseZoneFilter('  NORTH ')).toBe('north');
  });

  it('keeps the unzoned sentinel intact', () => {
    expect(parseZoneFilter(UNZONED_FILTER_VALUE)).toBe(UNZONED_FILTER_VALUE);
  });

  it('reads absent, blank and malformed as no filter', () => {
    expect(parseZoneFilter(undefined)).toBeNull();
    expect(parseZoneFilter('')).toBeNull();
    expect(parseZoneFilter('   ')).toBeNull();
    expect(parseZoneFilter('not a zone')).toBeNull();
    expect(parseZoneFilter(42)).toBeNull();
  });
});

describe('zoneFilterMatches', () => {
  it('lets everything through when no filter is applied', () => {
    expect(zoneFilterMatches('north', null)).toBe(true);
    expect(zoneFilterMatches(null, null)).toBe(true);
  });

  it('matches a named zone exactly', () => {
    expect(zoneFilterMatches('north', 'north')).toBe(true);
    expect(zoneFilterMatches('south', 'north')).toBe(false);
    expect(zoneFilterMatches(null, 'north')).toBe(false);
  });

  it('normalizes the stored value before comparing', () => {
    expect(zoneFilterMatches('  NORTH ', 'north')).toBe(true);
  });

  it('matches only zoneless clinics under the unzoned sentinel', () => {
    expect(zoneFilterMatches(null, UNZONED_FILTER_VALUE)).toBe(true);
    expect(zoneFilterMatches(undefined, UNZONED_FILTER_VALUE)).toBe(true);
    // An empty string in the column is the same absence as null, per normalizeZoneCode.
    expect(zoneFilterMatches('', UNZONED_FILTER_VALUE)).toBe(true);
    expect(zoneFilterMatches('north', UNZONED_FILTER_VALUE)).toBe(false);
  });
});

describe('zoneFilterWhere', () => {
  it('adds no clause when no filter is applied', () => {
    // An empty object is what makes this safe to spread onto an already-scoped where.
    expect(zoneFilterWhere(null)).toEqual({});
  });

  it('asks for a null column under the unzoned sentinel', () => {
    expect(zoneFilterWhere(UNZONED_FILTER_VALUE)).toEqual({ zoneCode: null });
  });

  it('asks for the exact code otherwise', () => {
    expect(zoneFilterWhere('north')).toEqual({ zoneCode: 'north' });
  });

  it('never produces a clause that could widen a query', () => {
    // Every branch either constrains zoneCode or says nothing. None of them mentions a clinic
    // id, an organization, or an OR -- which is why ANDing this onto a scoped where is safe.
    for (const filter of [null, UNZONED_FILTER_VALUE, 'north']) {
      const where = zoneFilterWhere(filter);
      expect(Object.keys(where).every((key) => key === 'zoneCode')).toBe(true);
    }
  });
});

describe('zoneLabel', () => {
  it('shows the code for a zoned clinic', () => {
    expect(zoneLabel('north')).toBe('north');
  });

  it('names the absence for a zoneless one', () => {
    expect(zoneLabel(null)).toBe(UNZONED_LABEL);
    expect(zoneLabel('')).toBe(UNZONED_LABEL);
    expect(zoneLabel(undefined)).toBe(UNZONED_LABEL);
  });
});

describe('summarizeZones', () => {
  it('counts clinics and active clinics per zone', () => {
    expect(summarizeZones([clinic('north'), clinic('north', false), clinic('south')])).toEqual([
      { zoneCode: 'north', clinicCount: 2, activeClinicCount: 1 },
      { zoneCode: 'south', clinicCount: 1, activeClinicCount: 1 },
    ]);
  });

  it('sorts named zones alphabetically and the unzoned bucket last', () => {
    const summaries = summarizeZones([clinic(null), clinic('south'), clinic('north')]);
    expect(summaries.map((s) => s.zoneCode)).toEqual(['north', 'south', null]);
  });

  it('omits the unzoned bucket when every clinic has a zone', () => {
    const summaries = summarizeZones([clinic('north'), clinic('south')]);
    expect(summaries.some((s) => s.zoneCode === null)).toBe(false);
  });

  it('folds differently-cased spellings of one zone into a single bucket', () => {
    // Two clinics whose codes differ only by case are in one zone, not two. A report that
    // split them would be quietly wrong rather than visibly broken.
    const summaries = summarizeZones([clinic('north'), clinic(' NORTH ')]);
    expect(summaries).toEqual([{ zoneCode: 'north', clinicCount: 2, activeClinicCount: 2 }]);
  });

  it('treats a blank code as unzoned rather than as its own zone', () => {
    expect(summarizeZones([clinic('')])).toEqual([
      { zoneCode: null, clinicCount: 1, activeClinicCount: 1 },
    ]);
  });

  it('counts a clinic whose active flag is absent as active', () => {
    expect(summarizeZones([{ zoneCode: 'north' }])).toEqual([
      { zoneCode: 'north', clinicCount: 1, activeClinicCount: 1 },
    ]);
  });

  it('returns nothing for no clinics', () => {
    expect(summarizeZones([])).toEqual([]);
  });
});

describe('zoneSummaryFilterValue', () => {
  it('round-trips a summary back through the filter it selects', () => {
    const clinics = [clinic('north'), clinic('south'), clinic(null)];
    for (const summary of summarizeZones(clinics)) {
      const filter = parseZoneFilter(zoneSummaryFilterValue(summary));
      const matched = clinics.filter((c) => zoneFilterMatches(c.zoneCode, filter));
      expect(matched).toHaveLength(summary.clinicCount);
    }
  });
});

describe('listZoneCodes', () => {
  it('lists the zones in use, sorted, without the unzoned bucket', () => {
    expect(
      listZoneCodes([clinic('south'), clinic(null), clinic('north'), clinic('south')]),
    ).toEqual(['north', 'south']);
  });

  it('returns nothing when no clinic has a zone', () => {
    expect(listZoneCodes([clinic(null), clinic('')])).toEqual([]);
  });
});
