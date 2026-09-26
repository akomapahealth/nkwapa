import type { OrganizationSummary } from './clinic-metadata';
import type { ZoneFilter } from './clinic-zones';

/**
 * Filtering the admin views by organization (#12).
 *
 * An organization id, or null for "every organization this actor can see". Applied server-side:
 * the API ANDs it onto the actor's own scope, so naming an organization the actor does not
 * administer returns nothing rather than reaching across a tenant.
 */
export type OrganizationFilter = string | null;

/** The Select control's value for "no filter". Select items cannot carry an empty string. */
export const ALL_ORGANIZATIONS_VALUE = '__all__';

/**
 * Offered only when there is a choice to make. With one organization the filter could only say
 * "that one" or "all", which is the same thing, and a control that changes nothing is noise.
 */
export function shouldOfferOrganizationFilter(organizations: OrganizationSummary[]): boolean {
  return organizations.length > 1;
}

export function organizationFilterOptions(
  organizations: OrganizationSummary[],
): Array<{ value: string; label: string }> {
  return [
    { value: ALL_ORGANIZATIONS_VALUE, label: 'All organizations' },
    ...organizations.map((organization) => ({
      value: organization.id,
      label: `${organization.name} (${organization.clinicCount})`,
    })),
  ];
}

export function organizationFilterFromSelect(value: string): OrganizationFilter {
  return value === ALL_ORGANIZATIONS_VALUE ? null : value;
}

export function organizationFilterToSelect(filter: OrganizationFilter): string {
  return filter ?? ALL_ORGANIZATIONS_VALUE;
}

/** The name for the active-filter summary, or null when nothing is filtered. */
export function organizationFilterLabel(
  organizations: OrganizationSummary[],
  filter: OrganizationFilter,
): string | null {
  if (filter === null) return null;
  return organizations.find((organization) => organization.id === filter)?.name ?? 'Unknown';
}

/**
 * The query string for `GET /admin/clinics`, and the cache key that must change with it.
 *
 * One function for both, so the URL fetched and the key it is cached under cannot disagree
 * about which filters are applied.
 */
export function adminClinicsQuery(zone: ZoneFilter, organization: OrganizationFilter) {
  const params = new URLSearchParams();
  if (zone !== null) params.set('zoneCode', zone);
  if (organization !== null) params.set('organizationId', organization);
  const query = params.toString();
  return {
    path: `/admin/clinics${query ? `?${query}` : ''}`,
    resourceKey: `admin-clinics:${zone ?? 'all'}:${organization ?? 'all'}`,
  };
}

/** The query string for `GET /admin/users`. */
export function adminUsersPath(status: string, organization: OrganizationFilter): string {
  const params = new URLSearchParams({ status });
  if (organization !== null) params.set('organizationId', organization);
  return `/admin/users?${params.toString()}`;
}
