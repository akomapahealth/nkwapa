/**
 * Shared rules for grouping and filtering clinics by zone.
 *
 * Deliberately separate from `clinic-metadata.ts`, on the same split as `clinic-day.ts`: that
 * module decides whether a `zoneCode` is *valid*, this one decides what a zone *means* to a
 * report. The validators stay there; the filter vocabulary lives here.
 *
 * The V1 policy this encodes, stated in full in `docs/specs/03_AUTH_AND_RBAC.md`:
 *
 *   Zone is a filter wherever a view spans more than one clinic, and context wherever a view
 *   is one clinic. It is never a grant.
 *
 * Nothing in this file consults a role, and nothing it returns widens a query. `zoneFilterWhere`
 * produces a clause a caller ANDs onto an already-authorized set of clinics; a caller that used
 * it as the *only* clause would be reading across tenants, which is why the API resolves the
 * actor's clinics first and applies this second.
 */
import { ZONE_CODE_MAX_LENGTH, ZONE_CODE_PATTERN, normalizeZoneCode } from './clinic-metadata';

/**
 * The one spelling of "clinics that have no zone code".
 *
 * A zone filter has three states, and an absent value cannot express the middle one: no filter,
 * a named zone, and explicitly unzoned. `zoneCode=` (empty) already means "no filter" to every
 * HTTP client and to `normalizeZoneCode`, so the third state needs a token of its own. It is
 * deliberately not a legal zone code -- `ZONE_CODE_PATTERN` rejects underscores -- so a real
 * zone can never collide with it.
 */
export const UNZONED_FILTER_VALUE = '__unzoned__';

/** What the UI calls a clinic with no zone code. */
export const UNZONED_LABEL = 'No zone';

/**
 * A resolved zone filter: `null` applies no filter at all, `UNZONED_FILTER_VALUE` matches only
 * clinics without a zone, and any other value matches that zone code exactly.
 */
export type ZoneFilter = string | null;

/** True for a value a zone filter accepts: a well-formed zone code, or the unzoned sentinel. */
export function isZoneFilterValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.trim() === UNZONED_FILTER_VALUE) return true;
  const normalized = normalizeZoneCode(value);
  return normalized !== null && isZoneCodeShaped(normalized);
}

/**
 * Reads a zone filter off a query string or a form control.
 *
 * Absent, blank and unrecognised all collapse to `null` -- no filter. A filter is a view, not a
 * write, so a stale link to a zone that has since been renamed should show the unfiltered list
 * rather than fail. The DTO validator rejects a malformed value before this runs, so the
 * permissive branch here is for internal callers rather than for the wire.
 */
export function parseZoneFilter(value: unknown): ZoneFilter {
  if (typeof value !== 'string') return null;
  if (value.trim() === UNZONED_FILTER_VALUE) return UNZONED_FILTER_VALUE;
  const normalized = normalizeZoneCode(value);
  if (normalized === null || !isZoneCodeShaped(normalized)) return null;
  return normalized;
}

/** Does one clinic's zone code satisfy this filter? The predicate the web filters rows with. */
export function zoneFilterMatches(
  zoneCode: string | null | undefined,
  filter: ZoneFilter,
): boolean {
  if (filter === null) return true;
  const normalized = normalizeZoneCode(zoneCode);
  if (filter === UNZONED_FILTER_VALUE) return normalized === null;
  return normalized === filter;
}

/**
 * The same predicate as a Prisma `where` fragment, for the API to AND onto a scoped query.
 *
 * Typed as a plain object rather than `Prisma.ClinicWhereInput` on purpose: this module is also
 * imported by the browser through the `./clinic-zones` subpath, and pulling in the Prisma
 * namespace would drag the client into the web bundle. The shape is structurally compatible.
 */
export function zoneFilterWhere(filter: ZoneFilter): { zoneCode?: string | null } {
  if (filter === null) return {};
  if (filter === UNZONED_FILTER_VALUE) return { zoneCode: null };
  return { zoneCode: filter };
}

/** How a zone reads in a table cell or a filter chip. */
export function zoneLabel(zoneCode: string | null | undefined): string {
  return normalizeZoneCode(zoneCode) ?? UNZONED_LABEL;
}

/** One row of the zone rollup: how many clinics sit in a zone, and how many are live. */
export interface ZoneSummary {
  /** `null` is the unzoned bucket, not a missing row. */
  zoneCode: string | null;
  clinicCount: number;
  activeClinicCount: number;
}

/** The filter value that selects a summary's bucket. */
export function zoneSummaryFilterValue(summary: ZoneSummary): string {
  return summary.zoneCode ?? UNZONED_FILTER_VALUE;
}

/**
 * Groups clinics into zones, for a picker's options and for a report's rollup.
 *
 * Named zones sort alphabetically and the unzoned bucket sorts last, because it is the residue
 * rather than a zone -- putting it in alphabetical position would hide it in the middle of the
 * list. The bucket is only emitted when something is actually in it, so an organization that
 * has zoned every clinic is not told about an empty "No zone".
 */
export function summarizeZones(
  clinics: { zoneCode?: string | null; isActive?: boolean }[],
): ZoneSummary[] {
  const buckets = new Map<string | null, ZoneSummary>();

  for (const clinic of clinics) {
    const zoneCode = normalizeZoneCode(clinic.zoneCode);
    let bucket = buckets.get(zoneCode);
    if (!bucket) {
      bucket = { zoneCode, clinicCount: 0, activeClinicCount: 0 };
      buckets.set(zoneCode, bucket);
    }
    bucket.clinicCount += 1;
    if (clinic.isActive !== false) bucket.activeClinicCount += 1;
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.zoneCode === null) return 1;
    if (b.zoneCode === null) return -1;
    return a.zoneCode.localeCompare(b.zoneCode);
  });
}

/** The zone codes in use, without the unzoned bucket. Backs the dialog's suggestion chips. */
export function listZoneCodes(clinics: { zoneCode?: string | null }[]): string[] {
  return summarizeZones(clinics)
    .map((summary) => summary.zoneCode)
    .filter((zoneCode): zoneCode is string => zoneCode !== null);
}

/**
 * Local shape check.
 *
 * `isZoneCode` from `clinic-metadata.ts` treats `null` as valid, because an absent zone code is
 * a legal clinic. A filter value is a different question -- there `null` means "no filter" and
 * has already been handled by the caller -- so the pattern is applied directly rather than
 * through a helper whose `null` answer is the opposite of the one wanted here.
 */
function isZoneCodeShaped(value: string): boolean {
  return value.length <= ZONE_CODE_MAX_LENGTH && ZONE_CODE_PATTERN.test(value);
}
