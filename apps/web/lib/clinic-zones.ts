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
