import {
  UNZONED_FILTER_VALUE,
  UNZONED_LABEL,
  listZoneCodes,
  parseZoneFilter,
  summarizeZones,
  zoneFilterMatches,
  zoneLabel,
  zoneSummaryFilterValue,
  type ZoneFilter,
  type ZoneSummary,
} from '@nkwapa/db/clinic-zones';

export {
  UNZONED_FILTER_VALUE,
  UNZONED_LABEL,
  listZoneCodes,
  parseZoneFilter,
  summarizeZones,
  zoneFilterMatches,
  zoneLabel,
  zoneSummaryFilterValue,
};
export type { ZoneFilter, ZoneSummary };

/**
 * The web side of the zone contract.
 *
 * Every rule comes from `@nkwapa/db/clinic-zones`, the module the API filters with, so a count
 * shown beside a picker option and the rows that come back from choosing it are decided by one
 * implementation. What is added here is presentation.
 *
 * The subpath import matters, for the same reason it does in `clinic-metadata.ts`: the package
 * root re-exports PrismaClient and this is pulled into a client component.
 *
 * Zone is a reporting filter and never a permission. Nothing here decides what a user may see;
 * it decides what a user is currently looking at. `docs/specs/03_AUTH_AND_RBAC.md` is the
 * statement of record.
 */

/** The value a `Select` uses for "every zone". Radix forbids an empty string as an item value. */
export const ALL_ZONES_VALUE = '__all__';

export interface ZoneOption {
  /** What the `Select` stores, including the two sentinels. */
  value: string;
  label: string;
  /** Clinic count, shown so an operator can see where a filter will land before choosing it. */
  clinicCount: number | null;
}

/**
 * Picker options: "All zones" first, then each zone, then the unzoned bucket.
 *
 * The counts come along because a zone filter's whole job is narrowing, and a filter that does
 * not say how far it narrows makes an operator choose it just to find out.
 */
export function zoneFilterOptions(zones: ZoneSummary[]): ZoneOption[] {
  return [
    { value: ALL_ZONES_VALUE, label: 'All zones', clinicCount: null },
    ...zones.map((zone) => ({
      value: zoneSummaryFilterValue(zone),
      label: zoneLabel(zone.zoneCode),
      clinicCount: zone.clinicCount,
    })),
  ];
}

/** Reads a `Select` value back into a filter. The "all" sentinel is the absence of one. */
export function zoneFilterFromSelect(value: string): ZoneFilter {
  if (value === ALL_ZONES_VALUE) return null;
  return parseZoneFilter(value);
}

/** The `Select` value for a filter, so the control can be driven from state. */
export function zoneFilterToSelect(filter: ZoneFilter): string {
  return filter ?? ALL_ZONES_VALUE;
}

/** The chip text for `ActiveFilterSummary`, or `null` when no zone filter is applied. */
export function zoneFilterLabel(filter: ZoneFilter): string | null {
  if (filter === null) return null;
  if (filter === UNZONED_FILTER_VALUE) return UNZONED_LABEL;
  return filter;
}

/**
 * The query string for a server-side zone filter, and the cache key that goes with it.
 *
 * Both come from here because `useAsyncResource` refetches on `resourceKey` alone: a request
 * whose URL and whose key were derived separately could disagree, and the symptom would be a
 * table that silently keeps showing the previous zone's rows.
 */
export function zoneQueryString(filter: ZoneFilter): string {
  if (filter === null) return '';
  return `?zoneCode=${encodeURIComponent(filter)}`;
}

export function zoneResourceKey(base: string, filter: ZoneFilter): string {
  return `${base}:${filter ?? 'all'}`;
}

/**
 * Does a person belong to a zone, by way of the clinics they hold a role at?
 *
 * A person is not in a zone; their clinics are. So this asks whether any clinic they hold a
 * seat at is in the zone being filtered for. Someone with seats in two zones matches both,
 * which is right: they really do work in both.
 *
 * The unzoned case reads "has no seat in any zone", so it covers both the person whose clinics
 * simply have no zone code and the global administrator who holds no clinic seat at all. The
 * alternative -- matching only the first -- would make a global admin invisible under every
 * option including this one, and a roster that hides a row under all filters is worse than one
 * that files it under the residue.
 *
 * This never decides what anyone may see. The roster it filters was already scoped by the API.
 */
export function memberMatchesZone(
  memberships: { clinicId: string }[],
  zoneByClinicId: Map<string, string | null>,
  filter: ZoneFilter,
): boolean {
  if (filter === null) return true;

  const zones = memberships.map((membership) => zoneByClinicId.get(membership.clinicId) ?? null);
  if (filter === UNZONED_FILTER_VALUE) {
    return zones.every((zone) => zone === null);
  }
  return zones.some((zone) => zoneFilterMatches(zone, filter));
}

/** Clinic id to zone code, for `memberMatchesZone`. */
export function zoneByClinicId(
  clinics: { id: string; zoneCode?: string | null }[],
): Map<string, string | null> {
  return new Map(clinics.map((clinic) => [clinic.id, clinic.zoneCode ?? null]));
}
