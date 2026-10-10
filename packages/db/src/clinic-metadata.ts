/**
 * Shared rules for clinic location and zone metadata.
 *
 * This is the single source of truth consumed by the API (DTO validation + service
 * normalization), the web admin UI, the seed, and the repair CLI, so no two layers can
 * disagree about what a valid `locationCode`, `timezone`, `zoneCode`, or `countryCode` is.
 * It follows the same split as `ghana-locations.ts`: the domain rules live here, and each
 * consumer wraps them in whatever validator shape it needs.
 *
 * The lengths below mirror `schema.prisma` exactly. They are not style preferences -- a value
 * longer than the column truncates or throws at the database, which is how a clinic name of
 * more than 64 characters used to turn a create into a 500.
 */

/** `Clinic.timezone` / `Organization.timezone` default (`@default("Africa/Accra")`). */
export const CLINIC_DEFAULT_TIMEZONE = 'Africa/Accra';
/** `Clinic.countryCode` default (`@default("GH")`). */
export const CLINIC_DEFAULT_COUNTRY_CODE = 'GH';
/** The organization the seed creates, and the one the API falls back to. */
export const CLINIC_DEFAULT_ORGANIZATION_NAME = 'Nkwapa Health';
export const CLINIC_DEFAULT_ORGANIZATION_SLUG = 'default';

/** `@db.VarChar(64)` on `Clinic.locationCode`. */
export const LOCATION_CODE_MAX_LENGTH = 64;
/** `@db.VarChar(64)` on `Clinic.zoneCode`. */
export const ZONE_CODE_MAX_LENGTH = 64;
/** `@db.VarChar(64)` on `Clinic.timezone`. */
export const TIMEZONE_MAX_LENGTH = 64;
/** `@db.VarChar(2)` on `Clinic.countryCode` -- ISO-3166 alpha-2. */
export const COUNTRY_CODE_LENGTH = 2;

/**
 * Codes are lowercase, hyphen-separated, and never start or end with a hyphen.
 *
 * They end up in report headers, export filenames, and eventually zone routing, so they are
 * deliberately narrower than "any string the database would accept".
 */
export const LOCATION_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A zone code is shaped like a location code. It is optional, but not free text. */
export const ZONE_CODE_PATTERN = LOCATION_CODE_PATTERN;
/** ISO-3166 alpha-2, uppercase. */
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
/**
 * The shape of a named IANA zone: `UTC`, `Africa/Accra`, `America/Argentina/Buenos_Aires`.
 *
 * This exists to reject a numeric offset. `Intl.DateTimeFormat` happily resolves `"+05:00"`,
 * but a fixed offset carries no daylight-saving rules, so a clinic pinned to one would drift
 * an hour twice a year in any region that observes DST. Reminders and day-boundary reporting
 * both read this field, so the fix has to be to refuse the value, not to cope with it.
 */
export const TIME_ZONE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/** Zones offered above the full list. `Intl.supportedValuesOf` omits `UTC`, so it is added. */
const ALWAYS_OFFERED_TIME_ZONES = [CLINIC_DEFAULT_TIMEZONE, 'UTC'];

/**
 * Derives a location code from free text, clamped to the column width.
 *
 * The clamp trims back to a hyphen boundary so a truncated code never ends in `-`, which
 * would fail `LOCATION_CODE_PATTERN` and make the derived value itself invalid.
 */
export function toLocationCode(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (normalized.length <= LOCATION_CODE_MAX_LENGTH) {
    return normalized || 'clinic';
  }

  return normalized.slice(0, LOCATION_CODE_MAX_LENGTH).replace(/-+$/, '') || 'clinic';
}

/** Trims and lowercases without reshaping, so validation can report what was actually given. */
export function normalizeLocationCode(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isLocationCode(value: string | null | undefined): boolean {
  const normalized = normalizeLocationCode(value);
  return normalized.length <= LOCATION_CODE_MAX_LENGTH && LOCATION_CODE_PATTERN.test(normalized);
}

/** An absent zone code is `null`, never `''` -- the column is nullable and the field optional. */
export function normalizeZoneCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function isZoneCode(value: string | null | undefined): boolean {
  const normalized = normalizeZoneCode(value);
  if (normalized === null) return true; // optional
  return normalized.length <= ZONE_CODE_MAX_LENGTH && ZONE_CODE_PATTERN.test(normalized);
}

export function normalizeCountryCode(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isCountryCode(value: string | null | undefined): boolean {
  return COUNTRY_CODE_PATTERN.test(normalizeCountryCode(value));
}

export type TimeZoneResolution = { ok: true; canonical: string } | { ok: false };

/**
 * Resolves a timezone to its canonical IANA name, or reports that it is not a zone at all.
 *
 * This is the inverse of the defensive `try/catch` in the notification templates, which
 * silently falls back to Accra when a zone will not format. That fallback is right at send
 * time -- an unknown zone must not cost a patient their reminder -- but it means a typo like
 * `Africa/Akra` is invisible forever. Catching it on the way in is the point of this module.
 *
 * Resolution also canonicalises, so `africa/accra` and the deprecated `US/Eastern` are
 * accepted and reported with the name they really mean (`Africa/Accra`, `America/New_York`).
 */
export function resolveTimeZone(value: string | null | undefined): TimeZoneResolution {
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > TIMEZONE_MAX_LENGTH) return { ok: false };
  if (!TIME_ZONE_NAME_PATTERN.test(trimmed)) return { ok: false };

  try {
    const canonical = new Intl.DateTimeFormat('en-GB', {
      timeZone: trimmed,
    }).resolvedOptions().timeZone;
    // A resolved value that is not itself a named zone (a bare offset) is not usable here.
    if (!canonical || !TIME_ZONE_NAME_PATTERN.test(canonical)) return { ok: false };
    if (canonical.length > TIMEZONE_MAX_LENGTH) return { ok: false };
    return { ok: true, canonical };
  } catch {
    return { ok: false };
  }
}

export function isTimeZone(value: string | null | undefined): boolean {
  return resolveTimeZone(value).ok;
}

/**
 * Every named zone this runtime knows, sorted, with `UTC` folded in.
 *
 * `Intl.supportedValuesOf` is guarded rather than assumed: it is unavailable on older Safari,
 * and a picker that throws is worse than one that offers only the defaults.
 */
export function listTimeZones(): string[] {
  let zones: string[] = [];
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      zones = Intl.supportedValuesOf('timeZone');
    }
  } catch {
    zones = [];
  }

  const unique = new Set([...zones, ...ALWAYS_OFFERED_TIME_ZONES]);
  return [...unique].sort((a, b) => a.localeCompare(b));
}

/** The handful of zones worth pinning above the full list, most specific first, deduped. */
export function commonTimeZones(organizationTimezone?: string | null): string[] {
  const preferred = [
    resolveTimeZone(organizationTimezone).ok ? (organizationTimezone as string) : null,
    ...ALWAYS_OFFERED_TIME_ZONES,
  ].filter((zone): zone is string => Boolean(zone));

  return [...new Set(preferred)];
}

export type ClinicMetadataSeverity = 'error' | 'warning' | 'info';

export type ClinicMetadataField =
  | 'organizationId'
  | 'timezone'
  | 'locationCode'
  | 'zoneCode'
  | 'countryCode'
  | 'isActive';

export type ClinicMetadataIssueCode =
  | 'ORGANIZATION_MISSING'
  | 'LOCATION_CODE_MISSING'
  | 'LOCATION_CODE_MALFORMED'
  | 'LOCATION_CODE_TOO_LONG'
  | 'TIMEZONE_MISSING'
  | 'TIMEZONE_UNKNOWN'
  | 'TIMEZONE_NOT_CANONICAL'
  | 'TIMEZONE_DIFFERS_FROM_ORGANIZATION'
  | 'COUNTRY_CODE_MALFORMED'
  | 'ZONE_CODE_MALFORMED'
  | 'ZONE_CODE_MISSING'
  | 'CLINIC_INACTIVE';

/**
 * Severity decides behaviour, not just colour.
 *
 * `error` blocks a write and counts toward "needs attention"; `warning` and `info` are shown
 * but never gate a save or fail the audit. `ZONE_CODE_MISSING` is the one to keep honest --
 * `zoneCode` is optional by design -- zone is a reporting filter rather than a
 * permission scope -- so a clinic without one is worth listing and never worth refusing.
 */
export const CLINIC_METADATA_ISSUE_SEVERITY: Record<
  ClinicMetadataIssueCode,
  ClinicMetadataSeverity
> = {
  ORGANIZATION_MISSING: 'error',
  LOCATION_CODE_MISSING: 'error',
  LOCATION_CODE_MALFORMED: 'error',
  LOCATION_CODE_TOO_LONG: 'error',
  TIMEZONE_MISSING: 'error',
  TIMEZONE_UNKNOWN: 'error',
  // Warning, not error, partly because which spelling counts as canonical is an ICU-build
  // detail: `Asia/Kolkata` and `Asia/Calcutta` swap places between runtimes. Both resolve to
  // the same offsets, so the stored name is cosmetic and must never block a save.
  TIMEZONE_NOT_CANONICAL: 'warning',
  TIMEZONE_DIFFERS_FROM_ORGANIZATION: 'warning',
  COUNTRY_CODE_MALFORMED: 'error',
  ZONE_CODE_MALFORMED: 'warning',
  ZONE_CODE_MISSING: 'warning',
  CLINIC_INACTIVE: 'info',
};

export const CLINIC_METADATA_SEVERITY_RANK: Record<ClinicMetadataSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

export interface ClinicMetadataIssue {
  code: ClinicMetadataIssueCode;
  severity: ClinicMetadataSeverity;
  field: ClinicMetadataField;
  message: string;
  /** The value a repair should write. Present only when it can be derived unambiguously. */
  suggestion?: string;
}

export interface ClinicMetadataInput {
  name?: string | null;
  organizationId?: string | null;
  organizationTimezone?: string | null;
  timezone?: string | null;
  locationCode?: string | null;
  zoneCode?: string | null;
  countryCode?: string | null;
  isActive?: boolean;
}

function issue(
  code: ClinicMetadataIssueCode,
  field: ClinicMetadataField,
  message: string,
  suggestion?: string,
): ClinicMetadataIssue {
  return {
    code,
    severity: CLINIC_METADATA_ISSUE_SEVERITY[code],
    field,
    message,
    ...(suggestion !== undefined ? { suggestion } : {}),
  };
}

/**
 * Reports everything wrong or noteworthy about one clinic's metadata.
 *
 * The admin list, the create/update path, and the repair CLI all call this, so an operator
 * reading a badge in the UI and an operator reading the CLI output are being told the same
 * thing by the same code.
 */
export function evaluateClinicMetadata(input: ClinicMetadataInput): ClinicMetadataIssue[] {
  const issues: ClinicMetadataIssue[] = [];

  if (!input.organizationId || !String(input.organizationId).trim()) {
    issues.push(
      issue(
        'ORGANIZATION_MISSING',
        'organizationId',
        'This clinic is not linked to an organization.',
      ),
    );
  }

  const rawLocationCode = typeof input.locationCode === 'string' ? input.locationCode.trim() : '';
  const derivedFromName = input.name ? toLocationCode(input.name) : undefined;
  if (!rawLocationCode) {
    issues.push(
      issue(
        'LOCATION_CODE_MISSING',
        'locationCode',
        'This clinic has no location code, so it cannot be identified in organization reporting.',
        derivedFromName,
      ),
    );
  } else if (normalizeLocationCode(rawLocationCode).length > LOCATION_CODE_MAX_LENGTH) {
    issues.push(
      issue(
        'LOCATION_CODE_TOO_LONG',
        'locationCode',
        `The location code is longer than ${LOCATION_CODE_MAX_LENGTH} characters.`,
        toLocationCode(rawLocationCode),
      ),
    );
  } else if (!isLocationCode(rawLocationCode)) {
    issues.push(
      issue(
        'LOCATION_CODE_MALFORMED',
        'locationCode',
        'The location code must be lowercase letters, digits, and single hyphens.',
        toLocationCode(rawLocationCode),
      ),
    );
  }

  const rawTimezone = typeof input.timezone === 'string' ? input.timezone.trim() : '';
  if (!rawTimezone) {
    issues.push(
      issue(
        'TIMEZONE_MISSING',
        'timezone',
        'This clinic has no timezone, so appointment times and reminders cannot be trusted.',
        input.organizationTimezone ?? CLINIC_DEFAULT_TIMEZONE,
      ),
    );
  } else {
    const resolved = resolveTimeZone(rawTimezone);
    if (!resolved.ok) {
      issues.push(
        issue(
          'TIMEZONE_UNKNOWN',
          'timezone',
          `"${rawTimezone}" is not a known IANA time zone.`,
          input.organizationTimezone ?? CLINIC_DEFAULT_TIMEZONE,
        ),
      );
    } else {
      if (resolved.canonical !== rawTimezone) {
        issues.push(
          issue(
            'TIMEZONE_NOT_CANONICAL',
            'timezone',
            `"${rawTimezone}" is stored under an older name for ${resolved.canonical}.`,
            resolved.canonical,
          ),
        );
      }
      const organizationTimezone = input.organizationTimezone?.trim();
      if (organizationTimezone && resolveTimeZone(organizationTimezone).ok) {
        const organizationCanonical = resolveTimeZone(organizationTimezone);
        if (organizationCanonical.ok && organizationCanonical.canonical !== resolved.canonical) {
          issues.push(
            issue(
              'TIMEZONE_DIFFERS_FROM_ORGANIZATION',
              'timezone',
              `This clinic runs on ${resolved.canonical}, while its organization runs on ${organizationCanonical.canonical}.`,
            ),
          );
        }
      }
    }
  }

  const rawCountryCode = typeof input.countryCode === 'string' ? input.countryCode.trim() : '';
  if (!isCountryCode(rawCountryCode)) {
    // No suggestion on purpose. `isCountryCode` already normalizes case, so a value that fails
    // it is not a casing problem -- it is a wrong or truncated code, and only a human knows
    // which country was meant.
    issues.push(
      issue(
        'COUNTRY_CODE_MALFORMED',
        'countryCode',
        'The country code must be a two-letter ISO-3166 code, such as GH.',
      ),
    );
  }

  const rawZoneCode = typeof input.zoneCode === 'string' ? input.zoneCode.trim() : '';
  if (!rawZoneCode) {
    issues.push(
      issue(
        'ZONE_CODE_MISSING',
        'zoneCode',
        'No zone code is set. This clinic reports under "No zone" rather than with a group.',
      ),
    );
  } else if (!isZoneCode(rawZoneCode)) {
    issues.push(
      issue(
        'ZONE_CODE_MALFORMED',
        'zoneCode',
        'The zone code must be lowercase letters, digits, and single hyphens.',
        toLocationCode(rawZoneCode),
      ),
    );
  }

  if (input.isActive === false) {
    issues.push(
      issue(
        'CLINIC_INACTIVE',
        'isActive',
        'This clinic is inactive and is excluded from daily operations.',
      ),
    );
  }

  return issues;
}

export interface ClinicMetadataSummary {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** The worst severity present, or `null` when the metadata is clean. */
  severity: ClinicMetadataSeverity | null;
}

export function summarizeClinicMetadata(issues: ClinicMetadataIssue[]): ClinicMetadataSummary {
  const errorCount = issues.filter((entry) => entry.severity === 'error').length;
  const warningCount = issues.filter((entry) => entry.severity === 'warning').length;
  const infoCount = issues.filter((entry) => entry.severity === 'info').length;

  let severity: ClinicMetadataSeverity | null = null;
  for (const entry of issues) {
    if (
      severity === null ||
      CLINIC_METADATA_SEVERITY_RANK[entry.severity] > CLINIC_METADATA_SEVERITY_RANK[severity]
    ) {
      severity = entry.severity;
    }
  }

  return { errorCount, warningCount, infoCount, severity };
}
