import {
  CLINIC_DEFAULT_COUNTRY_CODE,
  CLINIC_DEFAULT_TIMEZONE,
  LOCATION_CODE_MAX_LENGTH,
  ZONE_CODE_MAX_LENGTH,
  commonTimeZones,
  evaluateClinicMetadata,
  isCountryCode,
  isLocationCode,
  isTimeZone,
  isZoneCode,
  listTimeZones,
  normalizeCountryCode,
  normalizeLocationCode,
  normalizeZoneCode,
  resolveTimeZone,
  summarizeClinicMetadata,
  toLocationCode,
  type ClinicMetadataIssue,
  type ClinicMetadataSeverity,
} from '@nkwapa/db/clinic-metadata';

export {
  CLINIC_DEFAULT_COUNTRY_CODE,
  CLINIC_DEFAULT_TIMEZONE,
  LOCATION_CODE_MAX_LENGTH,
  ZONE_CODE_MAX_LENGTH,
  commonTimeZones,
  evaluateClinicMetadata,
  listTimeZones,
  normalizeCountryCode,
  normalizeLocationCode,
  normalizeZoneCode,
  summarizeClinicMetadata,
  toLocationCode,
};
export type { ClinicMetadataIssue, ClinicMetadataSeverity };

/**
 * The web side of the clinic metadata contract.
 *
 * Every rule comes from `@nkwapa/db/clinic-metadata`, the same module the API validates with,
 * so the dialog can refuse a value before a round trip and never disagree with the server about
 * why. What is added here is presentation: the wording an operator reads, and the option list a
 * picker renders.
 *
 * The subpath import matters. The package root re-exports PrismaClient, and this module is
 * pulled into a client component.
 */

/** An organization, as the clinic admin surface reads it. Read-only: never created here. */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  clinicCount: number;
}

/** A clinic row from `GET /admin/clinics`, including the metadata the list used to discard. */
export interface ClinicRow {
  id: string;
  name: string;
  region: string | null;
  countryCode: string;
  timezone: string;
  locationCode: string;
  zoneCode: string | null;
  organizationId: string;
  isActive: boolean;
  organization: OrganizationSummary | null;
  metadataIssues: ClinicMetadataIssue[];
}

/** Editable clinic metadata, as the dialog holds it. Strings throughout: this is form state. */
export interface ClinicFormValues {
  name: string;
  region: string;
  organizationId: string;
  timezone: string;
  locationCode: string;
  zoneCode: string;
  countryCode: string;
  isActive: boolean;
}

export type ClinicFormField = keyof ClinicFormValues;

/**
 * Field order for `focusFirstInvalid`.
 *
 * Object key order is whichever order the checks happened to run, not the order the operator
 * reads the form, so it is stated explicitly.
 */
export const CLINIC_FORM_FIELD_ORDER: ClinicFormField[] = [
  'name',
  'organizationId',
  'locationCode',
  'timezone',
  'zoneCode',
  'countryCode',
  'region',
];

export function emptyClinicForm(organization?: OrganizationSummary | null): ClinicFormValues {
  return {
    name: '',
    region: '',
    organizationId: organization?.id ?? '',
    timezone: organization?.timezone ?? CLINIC_DEFAULT_TIMEZONE,
    locationCode: '',
    zoneCode: '',
    countryCode: CLINIC_DEFAULT_COUNTRY_CODE,
    isActive: true,
  };
}

export function clinicFormFromRow(clinic: ClinicRow): ClinicFormValues {
  return {
    name: clinic.name,
    region: clinic.region ?? '',
    organizationId: clinic.organizationId,
    timezone: clinic.timezone,
    locationCode: clinic.locationCode,
    zoneCode: clinic.zoneCode ?? '',
    countryCode: clinic.countryCode,
    isActive: clinic.isActive,
  };
}

export type ClinicFormErrors = Partial<Record<ClinicFormField, string>>;

/**
 * Validates the dialog before it is submitted.
 *
 * Deliberately the same rules the API enforces, phrased for someone looking at the field
 * rather than at a request body. A round trip that fails validation is still handled -- the
 * server's `fieldErrors` land on the same fields -- but it should be rare.
 */
export function validateClinicForm(values: ClinicFormValues): ClinicFormErrors {
  const errors: ClinicFormErrors = {};

  if (!values.name.trim()) {
    errors.name = 'Give the clinic a name.';
  }

  const locationCode = normalizeLocationCode(values.locationCode);
  if (!locationCode) {
    errors.locationCode = 'Give the clinic a location code so reporting can identify it.';
  } else if (locationCode.length > LOCATION_CODE_MAX_LENGTH) {
    errors.locationCode = `Use ${LOCATION_CODE_MAX_LENGTH} characters or fewer.`;
  } else if (!isLocationCode(locationCode)) {
    errors.locationCode =
      'Use lowercase letters, digits and single hyphens, with no hyphen at either end.';
  }

  if (!values.timezone.trim()) {
    errors.timezone = 'Choose the time zone this clinic runs on.';
  } else if (!isTimeZone(values.timezone)) {
    errors.timezone = 'Choose a time zone from the list.';
  }

  if (values.zoneCode.trim() && !isZoneCode(values.zoneCode)) {
    errors.zoneCode = 'Use lowercase letters, digits and single hyphens, or leave this empty.';
  }

  if (!isCountryCode(values.countryCode)) {
    errors.countryCode = 'Use a two-letter country code, such as GH.';
  }

  return errors;
}

/** The request body for a create or update, with the shapes the API expects. */
export function clinicFormToPayload(values: ClinicFormValues) {
  return {
    name: values.name.trim(),
    region: values.region.trim() || undefined,
    timezone: values.timezone.trim(),
    locationCode: normalizeLocationCode(values.locationCode),
    zoneCode: normalizeZoneCode(values.zoneCode),
    countryCode: normalizeCountryCode(values.countryCode),
    ...(values.organizationId ? { organizationId: values.organizationId } : {}),
  };
}

/** Short labels for the issue badges, so a table cell does not carry a whole sentence. */
export const CLINIC_METADATA_ISSUE_LABELS: Record<ClinicMetadataIssue['code'], string> = {
  ORGANIZATION_MISSING: 'No organization',
  LOCATION_CODE_MISSING: 'No location code',
  LOCATION_CODE_MALFORMED: 'Bad location code',
  LOCATION_CODE_TOO_LONG: 'Location code too long',
  TIMEZONE_MISSING: 'No time zone',
  TIMEZONE_UNKNOWN: 'Unknown time zone',
  TIMEZONE_NOT_CANONICAL: 'Old time zone name',
  TIMEZONE_DIFFERS_FROM_ORGANIZATION: 'Differs from organization',
  COUNTRY_CODE_MALFORMED: 'Bad country code',
  ZONE_CODE_MALFORMED: 'Bad zone code',
  ZONE_CODE_MISSING: 'No zone code',
  CLINIC_INACTIVE: 'Inactive',
};

/**
 * Badge variants for each severity.
 *
 * `destructive` for an error, `warning` for a warning, and the neutral `draft` for information.
 * An inactive clinic is a deliberate state, not a fault, so it must not read as one.
 */
export const CLINIC_METADATA_SEVERITY_VARIANT: Record<
  ClinicMetadataSeverity,
  'destructive' | 'warning' | 'draft'
> = {
  error: 'destructive',
  warning: 'warning',
  info: 'draft',
};

/**
 * Normalizes one row from the API.
 *
 * `metadataIssues` is defaulted rather than assumed. During a rolling deploy the web app can
 * be newer than the API for a few minutes, and a list endpoint that has not learned to send
 * the field yet must render as "no issues", not take the whole screen down.
 */
export function normalizeClinicRow(clinic: ClinicRow): ClinicRow {
  return { ...clinic, metadataIssues: clinic.metadataIssues ?? [] };
}

export function clinicMetadataErrors(clinic: ClinicRow): ClinicMetadataIssue[] {
  return (clinic.metadataIssues ?? []).filter((issue) => issue.severity === 'error');
}

/** True when a clinic has at least one problem that blocks a save. Drives "needs attention". */
export function clinicNeedsAttention(clinic: ClinicRow): boolean {
  return clinicMetadataErrors(clinic).length > 0;
}

export type ClinicListFilter = 'all' | 'needs-attention' | 'inactive';

export function filterClinics(clinics: ClinicRow[], filter: ClinicListFilter): ClinicRow[] {
  if (filter === 'needs-attention') return clinics.filter(clinicNeedsAttention);
  if (filter === 'inactive') return clinics.filter((clinic) => !clinic.isActive);
  return clinics;
}

export interface TimeZoneOption {
  value: string;
  /** The group heading this option sits under. */
  group: string;
  /** Extra context shown after the name, e.g. that it is the organization's own zone. */
  note?: string;
}

/**
 * Time zone options, with the few that matter pinned above the full IANA list.
 *
 * The full list is ~420 entries, which is why the control that renders this filters rather
 * than scrolls. Pinning the organization's own zone first means the common case -- a clinic in
 * the same zone as the rest of its organization -- is the first thing on screen.
 */
export function timeZoneOptions(organizationTimezone?: string | null): TimeZoneOption[] {
  const common = commonTimeZones(organizationTimezone);
  const organizationCanonical = resolveTimeZone(organizationTimezone);

  const pinned: TimeZoneOption[] = common.map((value) => ({
    value,
    group: 'Common',
    ...(organizationCanonical.ok && organizationCanonical.canonical === value
      ? { note: "organization's zone" }
      : {}),
  }));

  const rest: TimeZoneOption[] = listTimeZones()
    .filter((value) => !common.includes(value))
    .map((value) => ({ value, group: 'All time zones' }));

  return [...pinned, ...rest];
}

/** Case-insensitive substring match, so "accra" finds "Africa/Accra". */
export function matchesTimeZoneQuery(value: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return value.toLowerCase().replace(/_/g, ' ').includes(trimmed.replace(/_/g, ' '));
}
