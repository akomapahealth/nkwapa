import {
  GHANA_DISTRICTS_BY_REGION,
  GHANA_REGIONS,
  GHANA_REGION_LABELS,
  isDistrictInRegion,
  isGhanaRegion,
  normalizeDistrict,
} from './ghana-locations';

describe('ghana-locations reference data', () => {
  it('covers all 16 regions with labels and district lists', () => {
    expect(GHANA_REGIONS).toHaveLength(16);
    for (const region of GHANA_REGIONS) {
      expect(GHANA_REGION_LABELS[region]).toBeTruthy();
      expect(GHANA_DISTRICTS_BY_REGION[region].length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate districts within a region', () => {
    for (const region of GHANA_REGIONS) {
      const districts = GHANA_DISTRICTS_BY_REGION[region];
      expect(new Set(districts).size).toBe(districts.length);
    }
  });

  it('validates region enum membership', () => {
    expect(isGhanaRegion('GREATER_ACCRA')).toBe(true);
    expect(isGhanaRegion('ATLANTIS')).toBe(false);
    expect(isGhanaRegion(undefined)).toBe(false);
  });

  it('normalizes a district case-insensitively to its canonical spelling', () => {
    expect(normalizeDistrict('GREATER_ACCRA', 'accra metropolitan')).toBe('Accra Metropolitan');
    expect(normalizeDistrict('ASHANTI', '  Kumasi Metropolitan  ')).toBe('Kumasi Metropolitan');
  });

  it('rejects a district that does not belong to the region', () => {
    expect(isDistrictInRegion('GREATER_ACCRA', 'Kumasi Metropolitan')).toBe(false);
    expect(normalizeDistrict('GREATER_ACCRA', 'Kumasi Metropolitan')).toBeNull();
  });

  it('treats empty/absent input as no district', () => {
    expect(normalizeDistrict('ASHANTI', '')).toBeNull();
    expect(normalizeDistrict(null, 'Bekwai')).toBeNull();
    expect(isDistrictInRegion('ASHANTI', undefined)).toBe(false);
  });
});
