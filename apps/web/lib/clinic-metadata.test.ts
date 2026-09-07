import {
  CLINIC_METADATA_ISSUE_LABELS,
  clinicFormFromRow,
  clinicFormToPayload,
  clinicMetadataErrors,
  clinicNeedsAttention,
  emptyClinicForm,
  filterClinics,
  matchesTimeZoneQuery,
  timeZoneOptions,
  validateClinicForm,
  type ClinicFormValues,
  type ClinicRow,
} from './clinic-metadata';

const organization = {
  id: 'org-1',
  name: 'Nkwapa Health',
  slug: 'default',
  timezone: 'Africa/Accra',
  clinicCount: 2,
};

const validForm: ClinicFormValues = {
  name: 'Ridge Clinic',
  region: 'Greater Accra',
  organizationId: 'org-1',
  timezone: 'Africa/Accra',
  locationCode: 'ridge-clinic',
  zoneCode: 'greater-accra',
  countryCode: 'GH',
  isActive: true,
};

function clinic(overrides: Partial<ClinicRow> = {}): ClinicRow {
  return {
    id: 'clinic-1',
    name: 'Ridge Clinic',
    region: 'Greater Accra',
    countryCode: 'GH',
    timezone: 'Africa/Accra',
    locationCode: 'ridge-clinic',
    zoneCode: 'greater-accra',
    organizationId: 'org-1',
    isActive: true,
    organization,
    metadataIssues: [],
    ...overrides,
  };
}

const issue = (code: string, severity: 'error' | 'warning' | 'info') =>
  ({ code, severity, field: 'locationCode', message: 'x' }) as ClinicRow['metadataIssues'][number];

describe('validateClinicForm', () => {
  it('accepts a fully valid form', () => {
    expect(validateClinicForm(validForm)).toEqual({});
  });

  it('requires a name', () => {
    expect(validateClinicForm({ ...validForm, name: '   ' })).toHaveProperty('name');
  });

  it('requires a location code, which is what the API refuses on create', () => {
    expect(validateClinicForm({ ...validForm, locationCode: '' })).toHaveProperty('locationCode');
  });

  it('rejects a location code that is not slug-shaped', () => {
    expect(validateClinicForm({ ...validForm, locationCode: 'Ridge Clinic' })).toHaveProperty(
      'locationCode',
    );
    expect(validateClinicForm({ ...validForm, locationCode: '-ridge' })).toHaveProperty(
      'locationCode',
    );
  });

  it('rejects a location code wider than the column', () => {
    expect(validateClinicForm({ ...validForm, locationCode: 'a'.repeat(65) })).toHaveProperty(
      'locationCode',
    );
  });

  it('rejects an invalid time zone before a round trip', () => {
    expect(validateClinicForm({ ...validForm, timezone: 'Africa/Akra' })).toHaveProperty(
      'timezone',
    );
    expect(validateClinicForm({ ...validForm, timezone: '' })).toHaveProperty('timezone');
  });

  it('rejects a fixed offset, matching the server', () => {
    expect(validateClinicForm({ ...validForm, timezone: '+05:00' })).toHaveProperty('timezone');
  });

  it('treats an empty zone code as valid, since the field is optional', () => {
    expect(validateClinicForm({ ...validForm, zoneCode: '' })).toEqual({});
  });

  it('shape-checks a zone code that was filled in', () => {
    expect(validateClinicForm({ ...validForm, zoneCode: 'Greater Accra' })).toHaveProperty(
      'zoneCode',
    );
  });

  it('requires a two-letter country code', () => {
    expect(validateClinicForm({ ...validForm, countryCode: 'ghana' })).toHaveProperty(
      'countryCode',
    );
    expect(validateClinicForm({ ...validForm, countryCode: 'gh' })).toEqual({});
  });

  it('reports every bad field at once, so one pass fixes the form', () => {
    expect(
      Object.keys(
        validateClinicForm({
          ...validForm,
          name: '',
          locationCode: '',
          timezone: 'nope',
          countryCode: '',
        }),
      ).sort(),
    ).toEqual(['countryCode', 'locationCode', 'name', 'timezone']);
  });
});

describe('clinicFormToPayload', () => {
  it('normalizes what it sends', () => {
    expect(
      clinicFormToPayload({
        ...validForm,
        region: '  Greater Accra  ',
        locationCode: '  Ridge-Clinic ',
        zoneCode: ' Greater-Accra ',
        countryCode: 'gh',
      }),
    ).toEqual({
      name: 'Ridge Clinic',
      region: 'Greater Accra',
      timezone: 'Africa/Accra',
      locationCode: 'ridge-clinic',
      zoneCode: 'greater-accra',
      countryCode: 'GH',
      organizationId: 'org-1',
    });
  });

  it('sends a cleared zone code as null rather than an empty string', () => {
    expect(clinicFormToPayload({ ...validForm, zoneCode: '   ' }).zoneCode).toBeNull();
  });

  it('omits an empty region rather than sending a blank one', () => {
    expect(clinicFormToPayload({ ...validForm, region: '  ' }).region).toBeUndefined();
  });

  it('omits organizationId when none was chosen, letting the server default it', () => {
    expect(clinicFormToPayload({ ...validForm, organizationId: '' })).not.toHaveProperty(
      'organizationId',
    );
  });
});

describe('form seeding', () => {
  it('starts a new clinic in its organization time zone', () => {
    expect(emptyClinicForm({ ...organization, timezone: 'Europe/London' })).toMatchObject({
      organizationId: 'org-1',
      timezone: 'Europe/London',
      countryCode: 'GH',
      isActive: true,
    });
  });

  it('falls back to the default zone with no organization', () => {
    expect(emptyClinicForm(null).timezone).toBe('Africa/Accra');
  });

  it('round-trips an existing clinic', () => {
    expect(clinicFormToPayload(clinicFormFromRow(clinic()))).toMatchObject({
      name: 'Ridge Clinic',
      locationCode: 'ridge-clinic',
      zoneCode: 'greater-accra',
    });
  });

  it('turns a null zone code into an empty field, not the string "null"', () => {
    expect(clinicFormFromRow(clinic({ zoneCode: null })).zoneCode).toBe('');
  });
});

describe('metadata triage', () => {
  it('counts only errors as needing attention', () => {
    expect(
      clinicNeedsAttention(clinic({ metadataIssues: [issue('ZONE_CODE_MISSING', 'warning')] })),
    ).toBe(false);
    expect(
      clinicNeedsAttention(clinic({ metadataIssues: [issue('LOCATION_CODE_MISSING', 'error')] })),
    ).toBe(true);
  });

  it('does not treat an inactive clinic as a fault', () => {
    expect(
      clinicNeedsAttention(clinic({ metadataIssues: [issue('CLINIC_INACTIVE', 'info')] })),
    ).toBe(false);
  });

  it('picks out the blocking issues', () => {
    const rows = clinicMetadataErrors(
      clinic({
        metadataIssues: [
          issue('LOCATION_CODE_MISSING', 'error'),
          issue('ZONE_CODE_MISSING', 'warning'),
        ],
      }),
    );
    expect(rows.map((entry) => entry.code)).toEqual(['LOCATION_CODE_MISSING']);
  });

  it('has a label for every issue code the shared module can raise', () => {
    for (const label of Object.values(CLINIC_METADATA_ISSUE_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('filterClinics', () => {
  const healthy = clinic({ id: 'a' });
  const broken = clinic({ id: 'b', metadataIssues: [issue('TIMEZONE_UNKNOWN', 'error')] });
  const inactive = clinic({ id: 'c', isActive: false });
  const all = [healthy, broken, inactive];

  it('returns everything by default', () => {
    expect(filterClinics(all, 'all')).toHaveLength(3);
  });

  it('narrows to clinics with blocking problems', () => {
    expect(filterClinics(all, 'needs-attention').map((c) => c.id)).toEqual(['b']);
  });

  it('narrows to inactive clinics', () => {
    expect(filterClinics(all, 'inactive').map((c) => c.id)).toEqual(['c']);
  });
});

describe('timeZoneOptions', () => {
  it('pins the organization zone first and marks it', () => {
    const [first] = timeZoneOptions('Europe/London');
    expect(first).toEqual({ value: 'Europe/London', group: 'Common', note: "organization's zone" });
  });

  it('never repeats a pinned zone in the full list', () => {
    const options = timeZoneOptions('Africa/Accra');
    expect(options.filter((option) => option.value === 'Africa/Accra')).toHaveLength(1);
  });

  it('offers the full IANA list after the pinned group', () => {
    const options = timeZoneOptions('Africa/Accra');
    expect(options.length).toBeGreaterThan(100);
    expect(options.some((option) => option.group === 'All time zones')).toBe(true);
  });
});

describe('matchesTimeZoneQuery', () => {
  it('matches case-insensitively on any part of the name', () => {
    expect(matchesTimeZoneQuery('Africa/Accra', 'accra')).toBe(true);
    expect(matchesTimeZoneQuery('Africa/Accra', 'AFRICA')).toBe(true);
    expect(matchesTimeZoneQuery('Africa/Accra', 'lond')).toBe(false);
  });

  it('treats underscores as spaces, so "new york" finds America/New_York', () => {
    expect(matchesTimeZoneQuery('America/New_York', 'new york')).toBe(true);
    expect(matchesTimeZoneQuery('America/New_York', 'new_york')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesTimeZoneQuery('Africa/Accra', '   ')).toBe(true);
  });
});
