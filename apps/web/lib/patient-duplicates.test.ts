import { mergeFinding } from '@nkwapa/db';
import {
  buildComparisonRows,
  buildDuplicateQuery,
  burdenTableRows,
  clinicPairLabel,
  DEFAULT_DUPLICATE_FILTERS,
  describeMergeAvailability,
  duplicateFiltersAreDefault,
  type CrossClinicBurden,
  candidateStatus,
  confidenceBadgeVariant,
  describeMatchPrecision,
  DUPLICATE_CONFIDENCE_LABELS,
  DUPLICATE_REVIEW_STATUS_LABELS,
  formatDateOfBirth,
  formatReasons,
  nationalIdTypeLabel,
  patientChartHref,
  patientDisplayName,
  reviewStatusBadgeVariant,
  sexLabel,
  type DuplicateCandidate,
  type DuplicateCandidatePatient,
} from './patient-duplicates';

function patient(overrides: Partial<DuplicateCandidatePatient> = {}): DuplicateCandidatePatient {
  return {
    id: 'patient-1',
    patientCode: 'NKP-2026-000001',
    firstName: 'Ama',
    lastName: 'Mensah',
    dob: '1990-05-15T00:00:00.000Z',
    sex: 'FEMALE',
    phoneE164: '+233201234567',
    email: null,
    nationalIdType: 'NATIONAL_ID',
    nationalIdLast4: '6789',
    portalLinked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    clinic: {
      id: 'clinic-1',
      name: 'Nkwapa Clinic - Demo',
      organizationId: 'org-1',
      organizationName: 'Nkwapa Health',
    },
    ...overrides,
  };
}

describe('confidenceBadgeVariant', () => {
  it('reuses the existing status family rather than inventing one', () => {
    expect(confidenceBadgeVariant('HIGH')).toBe('warning');
    expect(confidenceBadgeVariant('MEDIUM')).toBe('review');
    expect(confidenceBadgeVariant('LOW')).toBe('draft');
  });

  it('never reaches for the destructive treatment, which belongs to the merge', () => {
    for (const confidence of ['HIGH', 'MEDIUM', 'LOW'] as const) {
      expect(confidenceBadgeVariant(confidence)).not.toBe('destructive');
    }
  });
});

describe('labels', () => {
  it('speaks plainly and never leaks an enum value on screen', () => {
    for (const label of Object.values(DUPLICATE_CONFIDENCE_LABELS)) {
      expect(label).not.toMatch(/_|[A-Z]{3,}/);
    }
    for (const label of Object.values(DUPLICATE_REVIEW_STATUS_LABELS)) {
      expect(label).not.toMatch(/_|[A-Z]{3,}/);
    }
  });

  it('joins reasons into one readable line', () => {
    expect(formatReasons(['PHONE', 'NAME_AND_DOB'])).toBe(
      'Same phone number · Same name and date of birth',
    );
    expect(formatReasons([])).toBe('');
  });
});

describe('reviewStatusBadgeVariant and candidateStatus', () => {
  it('treats a pair nobody has looked at as open', () => {
    const candidate = { review: null } as DuplicateCandidate;
    expect(candidateStatus(candidate)).toBe('OPEN');
  });

  it('reads the recorded decision when there is one', () => {
    const candidate = {
      review: { status: 'DISMISSED', note: null, reviewedAt: '', reviewedBy: null },
    } as DuplicateCandidate;
    expect(candidateStatus(candidate)).toBe('DISMISSED');
    expect(reviewStatusBadgeVariant('DISMISSED')).toBe('finalized');
    expect(reviewStatusBadgeVariant('CONFIRMED')).toBe('warning');
    expect(reviewStatusBadgeVariant('OPEN')).toBe('draft');
  });
});

describe('patient display helpers', () => {
  it('builds a name and a chart link that reaches the canonical route', () => {
    expect(patientDisplayName(patient())).toBe('Ama Mensah');
    expect(patientChartHref(patient())).toBe('/clinics/clinic-1/patients/patient-1');
  });

  it('encodes ids rather than interpolating them raw', () => {
    const href = patientChartHref(
      patient({ id: 'a/b', clinic: { ...patient().clinic, id: 'c d' } }),
    );
    expect(href).toBe('/clinics/c%20d/patients/a%2Fb');
  });

  it('formats a date of birth as a plain date and says so when there is none', () => {
    expect(formatDateOfBirth('1990-05-15T11:30:00.000Z')).toBe('1990-05-15');
    expect(formatDateOfBirth(null)).toBe('Not recorded');
    expect(formatDateOfBirth('not a date')).toBe('Not recorded');
  });
});

describe('enum labels', () => {
  it('never shows a raw enum value on screen', () => {
    expect(nationalIdTypeLabel('NATIONAL_ID')).toBe('National ID');
    expect(nationalIdTypeLabel('VOTER_ID')).toBe('Voter ID');
    expect(nationalIdTypeLabel('PASSPORT')).toBe('Passport');
    expect(sexLabel('FEMALE')).toBe('Female');
    expect(sexLabel('MALE')).toBe('Male');
    expect(sexLabel('UNKNOWN')).toBe('Not recorded');
  });

  it('passes an unrecognised value through rather than hiding it', () => {
    // A value the labels do not know about is still information about the chart. Blanking it
    // would be worse than showing it unformatted.
    expect(nationalIdTypeLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(sexLabel(null)).toBeNull();
  });
});

describe('buildComparisonRows', () => {
  it('marks the fields that agree', () => {
    const rows = buildComparisonRows(patient(), patient({ id: 'patient-2' }));
    const byLabel = new Map(rows.map((row) => [row.label, row]));

    expect(byLabel.get('First name')?.matches).toBe(true);
    expect(byLabel.get('Phone')?.matches).toBe(true);
    expect(byLabel.get('Date of birth')?.matches).toBe(true);
  });

  it('marks the fields that differ', () => {
    const rows = buildComparisonRows(
      patient(),
      patient({ id: 'patient-2', firstName: 'Akosua', phoneE164: '+233209999999' }),
    );
    const byLabel = new Map(rows.map((row) => [row.label, row]));

    expect(byLabel.get('First name')?.matches).toBe(false);
    expect(byLabel.get('First name')?.valueB).toBe('Akosua');
    expect(byLabel.get('Phone')?.matches).toBe(false);
  });

  it('does not call two absent values a match', () => {
    // Two charts that each lack a phone number agree about nothing. Calling that a match would
    // inflate confidence in exactly the case where the record is thinnest.
    const rows = buildComparisonRows(
      patient({ phoneE164: null, email: null }),
      patient({ id: 'patient-2', phoneE164: null, email: null }),
    );
    const byLabel = new Map(rows.map((row) => [row.label, row]));

    expect(byLabel.get('Phone')?.matches).toBe(false);
    expect(byLabel.get('Phone')?.valueA).toBe('Not recorded');
    expect(byLabel.get('Email')?.matches).toBe(false);
  });

  it('treats whitespace as absent rather than as a value', () => {
    const rows = buildComparisonRows(
      patient({ email: '   ' }),
      patient({ id: 'patient-2', email: '   ' }),
    );
    const email = rows.find((row) => row.label === 'Email');

    expect(email?.valueA).toBe('Not recorded');
    expect(email?.matches).toBe(false);
  });

  it('carries the clinic and organisation so cross-clinic pairs are legible', () => {
    const rows = buildComparisonRows(
      patient(),
      patient({
        id: 'patient-2',
        clinic: {
          id: 'clinic-2',
          name: 'Nkwapa Clinic - Kumasi',
          organizationId: 'org-1',
          organizationName: 'Nkwapa Health',
        },
      }),
    );
    const byLabel = new Map(rows.map((row) => [row.label, row]));

    expect(byLabel.get('Clinic')?.matches).toBe(false);
    expect(byLabel.get('Clinic')?.valueB).toBe('Nkwapa Clinic - Kumasi');
    expect(byLabel.get('Organisation')?.matches).toBe(true);
  });

  it('renders the plain-language label for an enum column', () => {
    const rows = buildComparisonRows(patient(), patient({ id: 'patient-2', sex: 'MALE' }));
    const byLabel = new Map(rows.map((row) => [row.label, row]));

    expect(byLabel.get('ID type')?.valueA).toBe('National ID');
    expect(byLabel.get('Sex')?.valueA).toBe('Female');
    expect(byLabel.get('Sex')?.valueB).toBe('Male');
    expect(byLabel.get('Sex')?.matches).toBe(false);
  });

  it('does not repeat the chart codes the table header already carries', () => {
    const rows = buildComparisonRows(patient(), patient({ id: 'patient-2' }));
    expect(rows.map((row) => row.label)).not.toContain('Chart code');
  });

  it('always compares the same fields in the same order', () => {
    const rows = buildComparisonRows(patient(), patient({ id: 'patient-2' }));
    expect(rows.map((row) => row.label)).toEqual([
      'First name',
      'Last name',
      'Date of birth',
      'Sex',
      'Phone',
      'Email',
      'ID type',
      'ID last 4',
      'Clinic',
      'Organisation',
      'Portal access',
    ]);
  });
});

/*
  An approximate match and an exact one look identical in the reason list, and this screen exists
  to decide whether two records are one person. The names being spelt differently is precisely
  what an operator should go and look at before merging anything.
*/
describe('describeMatchPrecision', () => {
  it('warns when a pair was matched partly on a resemblance', () => {
    expect(describeMatchPrecision(['NAME_SIMILAR_AND_DOB'])).toMatch(/not spelt the same/i);
  });

  it('says nothing when every rule matched an exact value', () => {
    expect(describeMatchPrecision(['NATIONAL_ID_HASH', 'PHONE', 'EMAIL'])).toBeNull();
  });

  it('warns even when an exact rule matched alongside the approximate one', () => {
    expect(describeMatchPrecision(['PHONE', 'NAME_SIMILAR_AND_DOB'])).not.toBeNull();
  });

  it('says nothing about a pair with no reasons at all', () => {
    expect(describeMatchPrecision([])).toBeNull();
  });
});

function candidate(overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
  return {
    pairKey: 'patient-1:patient-2',
    score: 85,
    confidence: 'HIGH',
    reasons: ['NAME_AND_DOB', 'PHONE'],
    crossClinic: false,
    mergeEligible: true,
    mergeBlockers: [],
    lastUpdatedAt: '2026-02-01T00:00:00.000Z',
    review: null,
    patients: [patient(), patient({ id: 'patient-2', patientCode: 'NKP-2026-000002' })],
    ...overrides,
  };
}

describe('buildDuplicateQuery', () => {
  it('always sends the decision, since leaving it out means open only', () => {
    const params = new URLSearchParams(buildDuplicateQuery(DEFAULT_DUPLICATE_FILTERS, 0, 10));
    expect(params.get('status')).toBe('OPEN');
    expect(params.has('confidence')).toBe(false);
    expect(params.has('reason')).toBe(false);
    expect(params.has('q')).toBe(false);
  });

  it('turns the zero-based grid page into the one-based API page', () => {
    const params = new URLSearchParams(buildDuplicateQuery(DEFAULT_DUPLICATE_FILTERS, 2, 25));
    expect(params.get('page')).toBe('3');
    expect(params.get('pageSize')).toBe('25');
  });

  it('sends a filter only when it narrows, and trims the search', () => {
    const params = new URLSearchParams(
      buildDuplicateQuery(
        { status: 'ALL', confidence: 'HIGH', reason: 'PHONE', q: '  Mensah ' },
        0,
        10,
        { clinicPair: 'a:b', unused: null },
      ),
    );
    expect(Object.fromEntries(params)).toEqual({
      status: 'ALL',
      confidence: 'HIGH',
      reason: 'PHONE',
      q: 'Mensah',
      clinicPair: 'a:b',
      page: '1',
      pageSize: '10',
    });
  });

  it('treats a whitespace-only search as no search', () => {
    expect(duplicateFiltersAreDefault({ ...DEFAULT_DUPLICATE_FILTERS, q: '   ' })).toBe(true);
    expect(duplicateFiltersAreDefault({ ...DEFAULT_DUPLICATE_FILTERS, status: 'ALL' })).toBe(false);
  });
});

describe('describeMergeAvailability', () => {
  it('says nothing is in the way of a mergeable pair', () => {
    expect(describeMergeAvailability(candidate())).toEqual({
      available: true,
      label: 'Can be merged',
      reason: null,
      recovery: null,
    });
  });

  it('names the refusal and its detail, from the merge rule itself', () => {
    const availability = describeMergeAvailability(
      candidate({
        crossClinic: true,
        mergeEligible: false,
        mergeBlockers: [mergeFinding('CROSS_CLINIC', 'Accra and Kumasi')],
      }),
    );
    expect(availability.available).toBe(false);
    expect(availability.reason).toBe('These charts belong to different clinics: Accra and Kumasi.');
    expect(availability.recovery).toMatch(/only be merged inside one clinic/i);
  });

  it('explains an inactive clinic, which the old cross-clinic flag could not', () => {
    const availability = describeMergeAvailability(
      candidate({
        mergeEligible: false,
        mergeBlockers: [mergeFinding('CLINIC_INACTIVE', 'Tamale')],
      }),
    );
    expect(availability.reason).toMatch(/no longer active: Tamale/);
  });

  it('still explains a cross-clinic pair from an API that sends no blockers', () => {
    const availability = describeMergeAvailability(
      candidate({ crossClinic: true, mergeEligible: false, mergeBlockers: undefined }),
    );
    expect(availability.reason).toBe('These charts belong to different clinics.');
  });
});

describe('the cross-clinic burden', () => {
  const clinic = (id: string, name: string) => ({
    id,
    name,
    organizationId: 'org-1',
    organizationName: 'Nkwapa Health',
  });
  const burden: CrossClinicBurden = {
    totalPairs: 3,
    openPairs: 2,
    highConfidencePairs: 1,
    clinicsAffected: 2,
    organizationsAffected: 1,
    crossOrganizationPairs: 0,
    reasons: [{ reason: 'NAME_AND_DOB', count: 3 }],
    clinicPairs: [
      {
        key: 'a:b',
        clinics: [clinic('a', 'Accra'), clinic('b', '=Kumasi')],
        sameOrganization: true,
        total: 3,
        open: 2,
        confirmed: 0,
        dismissed: 1,
        high: 1,
        medium: 2,
        low: 0,
      },
    ],
  };

  it('names a clinic pair in the order the API sorted it', () => {
    expect(clinicPairLabel(burden.clinicPairs[0])).toBe('Accra and =Kumasi');
  });

  it('exports counts and clinic names only, one row per clinic pair', () => {
    const rows = burdenTableRows(burden);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Needs review');
    expect(rows[1]).toEqual(['Accra', '=Kumasi', 'Yes', 3, 2, 0, 1, 1, 2, 0]);
  });
});
