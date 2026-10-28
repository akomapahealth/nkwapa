import type { SortingState } from '@tanstack/react-table';
import { registrySortQuery, registrySortingFromQuery } from '@/lib/patient-registry-sort';
import {
  GHANA_REGIONS,
  PATIENT_LOCATION_STATUS_OPTIONS,
  type GhanaRegion,
  type PatientLocationStatus,
} from '@/lib/residential-location';
import type { ResidentialLocationFilterValue } from '@/components/patients/ResidentialLocationFilters';

export const REGISTRY_PAGE_SIZES = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything that decides which registry page is on screen. `page` is 0-based, as in the table. */
export interface RegistryView {
  q: string;
  location: ResidentialLocationFilterValue;
  screenedFrom: string;
  screenedTo: string;
  page: number;
  pageSize: number;
  sorting: SortingState;
}

/**
 * Reads a registry view from the page URL. The URL uses the API's own parameter names, so a
 * shared link reads the same either way. Anything unrecognised is dropped, not trusted.
 */
export function parseRegistryView(params: URLSearchParams): RegistryView {
  const region = params.get('residentialRegion') ?? '';
  const status = params.get('residentialLocationStatus') ?? '';
  const date = (key: string) => {
    const value = params.get(key) ?? '';
    return ISO_DATE.test(value) ? value : '';
  };
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  return {
    q: params.get('q') ?? '',
    location: {
      region: (GHANA_REGIONS as readonly string[]).includes(region) ? (region as GhanaRegion) : '',
      district: params.get('residentialDistrict') ?? '',
      community: params.get('residentialCommunity') ?? '',
      status: (PATIENT_LOCATION_STATUS_OPTIONS as string[]).includes(status)
        ? (status as PatientLocationStatus)
        : '',
    },
    screenedFrom: date('screenedFrom'),
    screenedTo: date('screenedTo'),
    page: Number.isInteger(page) && page > 1 ? page - 1 : 0,
    pageSize: (REGISTRY_PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
    sorting: registrySortingFromQuery(params.get('sortBy'), params.get('sortDir')),
  };
}

/**
 * The view as query parameters. `forApi` always sends paging; the URL leaves out defaults so a
 * plain registry link stays `/patients`.
 */
export function registryViewQuery(
  view: RegistryView,
  { forApi = false }: { forApi?: boolean } = {},
): URLSearchParams {
  const query = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value) query.set(key, value);
  };
  set('q', view.q.trim());
  set('residentialRegion', view.location.region);
  set('residentialDistrict', view.location.district);
  set('residentialCommunity', view.location.community.trim());
  set('residentialLocationStatus', view.location.status);
  set('screenedFrom', view.screenedFrom);
  set('screenedTo', view.screenedTo);
  if (forApi || view.page > 0) query.set('page', String(view.page + 1));
  if (forApi || view.pageSize !== DEFAULT_PAGE_SIZE) query.set('pageSize', String(view.pageSize));
  for (const [key, value] of Object.entries(registrySortQuery(view.sorting))) {
    query.set(key, value);
  }
  return query;
}
