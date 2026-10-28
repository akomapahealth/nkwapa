import type { SortingState } from '@tanstack/react-table';

/**
 * Registry columns the API can sort by, keyed by the table's column id. `screened` only exists
 * while the screened date filter is on, which the API requires for `lastScreenedAt`.
 */
const SORTABLE = { patientCode: 'patientCode', name: 'name', screened: 'lastScreenedAt' } as const;

/**
 * The table's sort as the registry API's `sortBy` / `sortDir`. Nothing set means the API's own
 * default (most recently updated first), so an unsorted table matches what the registry always
 * showed. A column the API cannot sort by is dropped rather than sent and refused.
 */
export function registrySortQuery(sorting: SortingState): Record<string, string> {
  const [first] = sorting;
  if (!first || !(first.id in SORTABLE)) return {};
  return {
    sortBy: SORTABLE[first.id as keyof typeof SORTABLE],
    sortDir: first.desc ? 'desc' : 'asc',
  };
}

/** The inverse of `registrySortQuery`, for a sort read back out of the page URL. */
export function registrySortingFromQuery(
  sortBy: string | null,
  sortDir: string | null,
): SortingState {
  const entry = Object.entries(SORTABLE).find(([, apiField]) => apiField === sortBy);
  return entry ? [{ id: entry[0], desc: sortDir === 'desc' }] : [];
}
