import {
  CLINIC_DEFAULT_TIMEZONE,
  LOCATION_CODE_MAX_LENGTH,
  commonTimeZones,
  evaluateClinicMetadata,
  isCountryCode,
  isLocationCode,
  isTimeZone,
  isZoneCode,
  listTimeZones,
  normalizeCountryCode,
  normalizeZoneCode,
  resolveTimeZone,
  summarizeClinicMetadata,
  toLocationCode,
} from './clinic-metadata';

/** A clinic whose metadata is entirely valid, so each test can spoil exactly one field. */
const healthyClinic = {
  name: 'Nkwapa Clinic - Demo',
  organizationId: '11111111-1111-1111-1111-111111111111',
  organizationTimezone: CLINIC_DEFAULT_TIMEZONE,
  timezone: CLINIC_DEFAULT_TIMEZONE,
  locationCode: 'nkwapa-clinic-demo',
  zoneCode: 'greater-accra',
  countryCode: 'GH',
  isActive: true,
};

const codesOf = (input: Parameters<typeof evaluateClinicMetadata>[0]) =>
  evaluateClinicMetadata(input).map((issue) => issue.code);

describe('toLocationCode', () => {
  it('slugs free text the way the seed and the API both expect', () => {
    expect(toLocationCode('Nkwapa Clinic - Demo')).toBe('nkwapa-clinic-demo');
    expect(toLocationCode('  Ridge   Clinic  ')).toBe('ridge-clinic');
    expect(toLocationCode('Tema Annex #2')).toBe('tema-annex-2');
  });

  it('falls back rather than returning an empty code', () => {
    expect(toLocationCode('')).toBe('clinic');
    expect(toLocationCode('---')).toBe('clinic');
    expect(toLocationCode('!!!')).toBe('clinic');
  });

  it('clamps to the column width without leaving a trailing hyphen', () => {
    // A name long enough that the naive slug would overflow VarChar(64) and 500 at the database.
    const derived = toLocationCode(`${'Kumasi Regional Teaching '.repeat(5)}Annex`);
    expect(derived.length).toBeLessThanOrEqual(LOCATION_CODE_MAX_LENGTH);
    expect(derived.endsWith('-')).toBe(false);
    expect(isLocationCode(derived)).toBe(true);
  });

  it('always produces a code that passes its own validator', () => {
    for (const name of ['Ridge Clinic', 'A', '2026 Annex', 'Ho -- Teaching Hospital']) {
      expect(isLocationCode(toLocationCode(name))).toBe(true);
    }
  });
});

describe('isLocationCode', () => {
  it('accepts lowercase hyphenated codes', () => {
    expect(isLocationCode('accra')).toBe(true);
    expect(isLocationCode('nkwapa-clinic-demo')).toBe(true);
    expect(isLocationCode('gate-a1')).toBe(true);
  });

  it('rejects codes that would confuse a report header', () => {
    expect(isLocationCode('')).toBe(false);
    expect(isLocationCode('   ')).toBe(false);
    expect(isLocationCode('Ridge Clinic')).toBe(false);
    expect(isLocationCode('-accra')).toBe(false);
    expect(isLocationCode('accra-')).toBe(false);
    expect(isLocationCode('accra--ridge')).toBe(false);
    expect(isLocationCode('accra_ridge')).toBe(false);
    expect(isLocationCode('a'.repeat(LOCATION_CODE_MAX_LENGTH + 1))).toBe(false);
  });

  it('accepts a code that only differs by case, since storage lowercases it', () => {
    expect(isLocationCode('ACCRA')).toBe(true);
  });
});

describe('zone codes', () => {
  it('treats an absent zone code as null rather than an empty string', () => {
    expect(normalizeZoneCode(undefined)).toBeNull();
    expect(normalizeZoneCode(null)).toBeNull();
    expect(normalizeZoneCode('   ')).toBeNull();
    expect(normalizeZoneCode(' Greater-Accra ')).toBe('greater-accra');
  });

  it('is optional, so an absent value is valid', () => {
    expect(isZoneCode(null)).toBe(true);
    expect(isZoneCode('')).toBe(true);
  });

  it('is still shape-checked when present', () => {
    expect(isZoneCode('greater-accra')).toBe(true);
    expect(isZoneCode('Greater Accra')).toBe(false);
    expect(isZoneCode('zone_1')).toBe(false);
  });
});

describe('country codes', () => {
  it('uppercases before checking', () => {
    expect(normalizeCountryCode(' gh ')).toBe('GH');
    expect(isCountryCode('gh')).toBe(true);
  });

  it('rejects anything that is not exactly two letters', () => {
    expect(isCountryCode('G')).toBe(false);
    expect(isCountryCode('GHA')).toBe(false);
    expect(isCountryCode('G1')).toBe(false);
    expect(isCountryCode('')).toBe(false);
  });
});

describe('resolveTimeZone', () => {
  it('accepts named IANA zones', () => {
    expect(resolveTimeZone('Africa/Accra')).toEqual({ ok: true, canonical: 'Africa/Accra' });
    expect(resolveTimeZone('UTC')).toEqual({ ok: true, canonical: 'UTC' });
    expect(resolveTimeZone('America/Argentina/Buenos_Aires').ok).toBe(true);
  });

  it('canonicalises casing and deprecated names', () => {
    expect(resolveTimeZone('africa/accra')).toEqual({ ok: true, canonical: 'Africa/Accra' });
    // The typo that motivated this module: one letter away from a real zone.
    expect(resolveTimeZone('Africa/Akra')).toEqual({ ok: false });
  });

  it('rejects a bare offset, which carries no daylight-saving rules', () => {
    expect(resolveTimeZone('+05:00')).toEqual({ ok: false });
    expect(resolveTimeZone('-0500')).toEqual({ ok: false });
  });

  it('rejects empty and non-string input', () => {
    expect(resolveTimeZone('')).toEqual({ ok: false });
    expect(resolveTimeZone('   ')).toEqual({ ok: false });
    expect(resolveTimeZone(null)).toEqual({ ok: false });
    expect(resolveTimeZone(undefined)).toEqual({ ok: false });
  });

  it('rejects a zone longer than the column', () => {
    expect(isTimeZone(`Africa/${'A'.repeat(80)}`)).toBe(false);
  });
});

describe('time zone options', () => {
  it('offers the full list with UTC folded in, since Intl omits it', () => {
    const zones = listTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('Africa/Accra');
    expect(zones.length).toBeGreaterThan(100);
    expect([...zones]).toEqual([...zones].sort((a, b) => a.localeCompare(b)));
  });

  it('pins the organization zone first, without repeating it', () => {
    expect(commonTimeZones('Europe/London')).toEqual(['Europe/London', 'Africa/Accra', 'UTC']);
    expect(commonTimeZones('Africa/Accra')).toEqual(['Africa/Accra', 'UTC']);
  });

  it('ignores an unusable organization zone rather than offering it', () => {
    expect(commonTimeZones('Africa/Akra')).toEqual(['Africa/Accra', 'UTC']);
    expect(commonTimeZones(null)).toEqual(['Africa/Accra', 'UTC']);
  });
});

describe('evaluateClinicMetadata', () => {
  it('reports nothing for a clinic that is fully configured', () => {
    expect(evaluateClinicMetadata(healthyClinic)).toEqual([]);
  });

  it('flags a missing organization link', () => {
    expect(codesOf({ ...healthyClinic, organizationId: null })).toContain('ORGANIZATION_MISSING');
  });

  it('flags a missing location code and suggests one derived from the name', () => {
    const issues = evaluateClinicMetadata({ ...healthyClinic, locationCode: '' });
    const missing = issues.find((entry) => entry.code === 'LOCATION_CODE_MISSING');
    expect(missing?.severity).toBe('error');
    expect(missing?.field).toBe('locationCode');
    expect(missing?.suggestion).toBe('nkwapa-clinic-demo');
  });

  it('flags a malformed location code and suggests its slugged form', () => {
    const issues = evaluateClinicMetadata({ ...healthyClinic, locationCode: 'Ridge Clinic' });
    const malformed = issues.find((entry) => entry.code === 'LOCATION_CODE_MALFORMED');
    expect(malformed?.severity).toBe('error');
    expect(malformed?.suggestion).toBe('ridge-clinic');
  });

  it('flags an unknown timezone and suggests the organization zone', () => {
    const issues = evaluateClinicMetadata({ ...healthyClinic, timezone: 'Africa/Akra' });
    const unknown = issues.find((entry) => entry.code === 'TIMEZONE_UNKNOWN');
    expect(unknown?.severity).toBe('error');
    expect(unknown?.message).toContain('Africa/Akra');
    expect(unknown?.suggestion).toBe('Africa/Accra');
  });

  it('warns rather than errors when a timezone is merely an older name', () => {
    const issues = evaluateClinicMetadata({ ...healthyClinic, timezone: 'africa/accra' });
    const stale = issues.find((entry) => entry.code === 'TIMEZONE_NOT_CANONICAL');
    expect(stale?.severity).toBe('warning');
    expect(stale?.suggestion).toBe('Africa/Accra');
    expect(codesOf({ ...healthyClinic, timezone: 'africa/accra' })).not.toContain(
      'TIMEZONE_UNKNOWN',
    );
  });

  it('warns when a clinic runs on a different zone from its organization', () => {
    const codes = codesOf({ ...healthyClinic, timezone: 'Europe/London' });
    expect(codes).toContain('TIMEZONE_DIFFERS_FROM_ORGANIZATION');
    // Running on a different zone is legitimate, so it must never block a save.
    expect(evaluateClinicMetadata({ ...healthyClinic, timezone: 'Europe/London' })).toEqual([
      expect.objectContaining({ severity: 'warning' }),
    ]);
  });

  it('does not compare against an organization zone it cannot resolve', () => {
    const codes = codesOf({ ...healthyClinic, organizationTimezone: 'Africa/Akra' });
    expect(codes).not.toContain('TIMEZONE_DIFFERS_FROM_ORGANIZATION');
  });

  it('flags a malformed country code', () => {
    expect(codesOf({ ...healthyClinic, countryCode: 'g' })).toContain('COUNTRY_CODE_MALFORMED');
    expect(codesOf({ ...healthyClinic, countryCode: 'gh' })).not.toContain(
      'COUNTRY_CODE_MALFORMED',
    );
  });

  it('reports a missing zone code without ever making it an error', () => {
    const issues = evaluateClinicMetadata({ ...healthyClinic, zoneCode: null });
    const missing = issues.find((entry) => entry.code === 'ZONE_CODE_MISSING');
    expect(missing?.severity).toBe('warning');
    expect(summarizeClinicMetadata(issues).errorCount).toBe(0);
  });

  it('reports an inactive clinic as information, not a fault', () => {
    const issues = evaluateClinicMetadata({ ...healthyClinic, isActive: false });
    expect(issues).toEqual([
      expect.objectContaining({ code: 'CLINIC_INACTIVE', severity: 'info' }),
    ]);
  });

  it('reports every independent problem at once, so one repair pass can fix them all', () => {
    const codes = codesOf({
      name: 'Ridge Clinic',
      organizationId: null,
      timezone: 'Africa/Akra',
      locationCode: '',
      zoneCode: 'Zone One',
      countryCode: 'ghana',
      isActive: false,
    });
    expect(codes).toEqual(
      expect.arrayContaining([
        'ORGANIZATION_MISSING',
        'LOCATION_CODE_MISSING',
        'TIMEZONE_UNKNOWN',
        'COUNTRY_CODE_MALFORMED',
        'ZONE_CODE_MALFORMED',
        'CLINIC_INACTIVE',
      ]),
    );
  });
});

describe('summarizeClinicMetadata', () => {
  it('is clean for a healthy clinic', () => {
    expect(summarizeClinicMetadata([])).toEqual({
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      severity: null,
    });
  });

  it('reports the worst severity present', () => {
    const issues = evaluateClinicMetadata({
      ...healthyClinic,
      locationCode: '',
      zoneCode: null,
      isActive: false,
    });
    const summary = summarizeClinicMetadata(issues);
    expect(summary.severity).toBe('error');
    expect(summary.errorCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.infoCount).toBe(1);
  });

  it('does not promote a warning-only clinic to error', () => {
    expect(
      summarizeClinicMetadata(evaluateClinicMetadata({ ...healthyClinic, zoneCode: null }))
        .severity,
    ).toBe('warning');
  });
});
