'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, UserPlus, Users } from 'lucide-react';
import { apiFetch, readApiError as readApiErrorDetail } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  parseRegistryView,
  registryViewQuery,
  type RegistryView,
} from '@/lib/patient-registry-url';
import {
  OPS_DEFAULT_TIMEZONE,
  formatOpsDay,
  getTodayInTimeZone,
  hasPermission,
  readApiError,
} from '@/lib/ops';
import {
  describeScreenedRange,
  formatScreenedDay,
  screenedCountLine,
  screenedRangeError,
  type MatchingScreening,
} from '@/lib/patient-registry-screened';
import {
  GHANA_REGION_LABELS,
  PATIENT_LOCATION_STATUS_LABELS,
  describeResidentialLocation,
} from '@/lib/residential-location';
import { useAsyncResource } from '@/lib/use-async-resource';
import { usePatientCheckIn } from '@/lib/use-patient-check-in';
import { ListFilters, ListSearch } from '@/components/app-shell/ListToolbar';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
import { OpsFeedbackNotice } from '@/components/ops/OpsShared';
import {
  EMPTY_LOCATION_FILTER,
  ResidentialLocationFilters,
} from '@/components/patients/ResidentialLocationFilters';
import { ScreenedDateFilter, ScreenedDates } from '@/components/patients/ScreenedDateFilter';
import {
  PatientIdentity,
  PatientRegistryCard,
  maskPhone,
} from '@/components/patients/PatientRegistryCard';
import { Button } from '@/components/ui/button';
import { DataTable, DataTableActions, type DataTableColumn } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  nationalIdLast4?: string | null;
  residentialLocationStatus?: string | null;
  residentialRegion?: string | null;
  residentialDistrict?: string | null;
  residentialCommunity?: string | null;
  /** The latest encounter at this clinic, as on the chart; null when never seen here. */
  lastVisitAt?: string | null;
  /** Only while the screened filter is on. */
  matchingScreenings?: MatchingScreening[];
}

interface PatientRegistryResponse {
  items: PatientSummary[];
  total: number;
  page: number;
  pageSize: number;
  /** The clinic timezone screened dates were read in; only while the screened filter is on. */
  timezone?: string;
  /** Set locally when the screened range was refused, so nothing is shown as a result. */
  rejected?: boolean;
}

type ScreenedError = { field: 'from' | 'to'; message: string };

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The patient registry, for both `/patients` and `/clinics/:clinicId/patients`.
 *
 * The two routes differ only in where the clinic id comes from — the active clinic, or the URL —
 * so they render the same screen the way both `new` routes render `RegisterPatientScreen`. They
 * were near-copies that had drifted apart on about a dozen axes (two error treatments, only one
 * loading treatment, two grid configurations, two greens), which is how a fix applied to one of
 * them kept missing the other.
 */
export function PatientRegistryScreen({ clinicId }: { clinicId: string }) {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canCreatePatient = hasPermission(perms, 'PATIENT.CREATE');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customScreened, setCustomScreened] = useState(false);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== '/' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.defaultPrevented ||
        target?.closest(
          'input, textarea, select, [contenteditable], [role=dialog], [role=combobox], [role=listbox]',
        )
      )
        return;
      if (document.querySelector('[role=dialog][data-state=open]')) return;
      event.preventDefault();
      document.getElementById('patient-search')?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  const canCreateOpsCheckIn = hasPermission(perms, 'OPS.CHECKIN.CREATE');

  /*
    Every filter, the page and the sort live in one view, seeded from the URL so a follow-up
    lead can share "patients screened 10 Oct" as a link. Any filter change goes back to page 1.
  */
  const searchParams = useSearchParams();
  const [view, setView] = useState<RegistryView>(() =>
    parseRegistryView(new URLSearchParams(searchParams.toString())),
  );
  const { q, location: locationFilter, page, pageSize, sorting } = view;
  const updateView = (patch: Partial<RegistryView>) =>
    setView((current) => ({ ...current, page: 0, ...patch }));

  /*
    Only the free-text inputs are debounced. Typing a name should not fire a request per
    keystroke, but choosing a region is a single deliberate act and has to answer immediately.
    The committed values are what identify the read, so they drive `resourceKey` below.
  */
  const [committed, setCommitted] = useState(() => ({
    q: view.q.trim(),
    community: view.location.community.trim(),
  }));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = q.trim();
      const nextCommunity = locationFilter.community.trim();
      setCommitted((current) =>
        current.q === nextQ && current.community === nextCommunity
          ? current
          : { q: nextQ, community: nextCommunity },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [q, locationFilter.community]);

  const { region, district, status } = locationFilter;
  const { screenedFrom, screenedTo } = view;
  const screenedActive = Boolean(screenedFrom || screenedTo);

  /*
    The clinic's timezone arrives with the first filtered page; until then the default zone
    (every clinic today) decides what "Today" means. Bootstrap does not carry it.
  */
  const [timeZone, setTimeZone] = useState(OPS_DEFAULT_TIMEZONE);
  const today = getTodayInTimeZone(timeZone);

  // A range the API would refuse is explained beside the dates and never sent. A refusal the
  // client did not foresee lands in the same place, not as a page-level error.
  const clientScreenedError = screenedRangeError(screenedFrom, screenedTo);
  const [serverScreenedError, setServerScreenedError] = useState<ScreenedError | null>(null);
  const screenedError = clientScreenedError ?? serverScreenedError;

  const committedView: RegistryView = {
    ...view,
    q: committed.q,
    location: { ...locationFilter, community: committed.community },
  };
  const apiQuery = registryViewQuery(committedView, { forApi: true }).toString();
  const urlQuery = registryViewQuery(committedView).toString();

  /*
    history.replaceState, not router.replace: a Next navigation refetches the route's RSC payload,
    which fails offline (see use-chart-tabs). Written from the committed view, so the address bar
    follows the debounced search rather than every keystroke.
  */
  useEffect(() => {
    if (window.location.search.replace(/^\?/, '') === urlQuery) return;
    const next = urlQuery ? `${window.location.pathname}?${urlQuery}` : window.location.pathname;
    window.history.replaceState(window.history.state, '', next);
  }, [urlQuery]);

  const registry = useAsyncResource<PatientRegistryResponse>({
    requiresOnline: true,
    resourceKey: `${clinicId}|${apiQuery}`,
    errorMessage: 'The patient registry could not be loaded.',
    fetcher: async (token, signal) => {
      const rejected = { items: [], total: 0, page: 1, pageSize, rejected: true };
      if (clientScreenedError) return rejected;

      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients?${apiQuery}`,
        { getToken: token, activeClinicId: clinicId, signal },
      );
      if (response.status === 400) {
        const detail = await readApiErrorDetail(response.clone());
        const field = detail.fieldErrors.find((entry) => entry.field.startsWith('screened'));
        if (field) {
          setServerScreenedError({
            field: field.field === 'screenedFrom' ? 'from' : 'to',
            message: field.message,
          });
          return rejected;
        }
      }
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setServerScreenedError(null);
      const data = (await response.json()) as PatientRegistryResponse;
      if (data.timezone) setTimeZone(data.timezone);
      return data;
    },
  });

  /*
    Check-in is a mutation, not the registry read, so it keeps its own state. Sharing one `error`
    with the search made a failed check-in render as "we couldn't load this view" with a
    "Reload patients" retry, which is the wrong offer for the thing that actually failed.
  */
  const checkIn = usePatientCheckIn(clinicId);
  const checkInFlight = useRef(false);
  const submitCheckIn = async (patient: PatientSummary) => {
    if (checkInFlight.current || !canCreateOpsCheckIn || !checkIn.canSubmit) return;
    checkInFlight.current = true;
    try {
      await checkIn.checkIn(patient);
    } finally {
      checkInFlight.current = false;
    }
  };

  const patientHref = (patientId: string) => `/clinics/${clinicId}/patients/${patientId}`;

  const columns: DataTableColumn<PatientSummary>[] = [
    {
      // Name over code, as in the pilot: one identity per row, read in one glance.
      id: 'name',
      accessorFn: (row) => `${row.firstName} ${row.lastName}`.trim(),
      header: 'Patient',
      meta: { className: 'min-w-56 max-w-80 whitespace-normal' },
      cell: ({ row }) => (
        <PatientIdentity
          name={`${row.original.firstName} ${row.original.lastName}`.trim()}
          code={row.original.patientCode}
          idLast4={row.original.nationalIdLast4}
        />
      ),
    },
    ...(screenedActive
      ? [
          {
            id: 'screened',
            accessorFn: (row: PatientSummary) => row.matchingScreenings?.[0]?.date ?? '',
            header: 'Screened',
            meta: { className: 'min-w-44' },
            cell: ({ row }: { row: { original: PatientSummary } }) => (
              <ScreenedDates
                screenings={row.original.matchingScreenings ?? []}
                timeZone={timeZone}
              />
            ),
          } satisfies DataTableColumn<PatientSummary>,
        ]
      : []),
    {
      id: 'phoneE164',
      accessorKey: 'phoneE164',
      header: 'Phone',
      enableSorting: false,
      meta: { className: 'w-44' },
      cell: ({ getValue }) => <MaskedPhone value={getValue<string | null>()} />,
    },
    {
      id: 'lastVisit',
      accessorKey: 'lastVisitAt',
      header: 'Last visit',
      sortDescFirst: true,
      meta: { className: 'w-36' },
      cell: ({ row }) => <LastVisit value={row.original.lastVisitAt} />,
    },
    {
      id: 'location',
      header: 'Location',
      enableSorting: false,
      meta: { className: 'min-w-40 max-w-64 whitespace-normal' },
      cell: ({ row }) => <PatientLocation patient={row.original} />,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: 'right', className: 'w-[11.5rem]' },
      /*
        One quiet View and one outlined Check in (pilot). A filled button on every row made the
        list a wall of teal; the row's action still reads as the action, in the brand colour.
        There is no row-click navigation: it fired for anything inside the row, including Check in.
      */
      cell: ({ row }) => (
        <DataTableActions>
          <Button asChild variant="ghost" size="sm" className="w-16">
            <Link href={patientHref(row.original.id)}>View</Link>
          </Button>
          {canCreateOpsCheckIn ? (
            <Button
              variant="primaryOutline"
              size="sm"
              className="w-24"
              loading={checkIn.busyPatientId === row.original.id}
              disabled={checkIn.isBusy || !checkIn.canSubmit}
              onClick={() => void submitCheckIn(row.original)}
            >
              Check in
            </Button>
          ) : null}
        </DataTableActions>
      ),
    },
  ];

  const setScreened = (from: string, to: string) => {
    setServerScreenedError(null);
    updateView({
      screenedFrom: from,
      screenedTo: to,
      // The screened column, and its sort, only exist while the filter is on.
      ...(!from && !to && sorting[0]?.id === 'screened' ? { sorting: [] } : {}),
    });
  };
  const clearScreened = () => {
    setScreened('', '');
    setCustomScreened(false);
  };

  const otherFiltersActive = Boolean(
    committed.q || region || district || committed.community || status,
  );
  const emptyState = (() => {
    if (registry.data?.rejected) {
      return {
        title: 'Check the screened dates',
        description: 'Fix the dates above to see who completed a screening.',
        icon: Users,
      };
    }
    if (screenedActive && screenedFrom) {
      const range = describeScreenedRange(screenedFrom, screenedTo);
      return {
        title: 'No completed screenings',
        description: [
          `No patients completed a screening ${range.single ? 'on' : 'between'} ${range.text} at this clinic.`,
          otherFiltersActive ? 'Try clearing the search or location filters.' : '',
        ]
          .filter(Boolean)
          .join(' '),
        icon: Users,
      };
    }
    return {
      title: otherFiltersActive ? 'No patients found' : 'No patients in this clinic yet',
      description: otherFiltersActive
        ? 'Try a broader search term or clearing a filter, or confirm the patient is registered in this clinic.'
        : 'Patients appear here as they are registered in this clinic.',
      icon: Users,
    };
  })();

  const clearFilters = () => {
    setServerScreenedError(null);
    setCustomScreened(false);
    updateView({
      q: '',
      location: EMPTY_LOCATION_FILTER,
      screenedFrom: '',
      screenedTo: '',
      sorting: sorting[0]?.id === 'screened' ? [] : sorting,
    });
  };
  const activeFilters = [
    { label: 'Search', value: q.trim() || null, onRemove: () => updateView({ q: '' }) },
    {
      label: 'Region',
      value: region ? GHANA_REGION_LABELS[region] : null,
      // A district only means something inside its region.
      onRemove: () => updateView({ location: { ...locationFilter, region: '', district: '' } }),
    },
    {
      label: 'District',
      value: district || null,
      onRemove: () => updateView({ location: { ...locationFilter, district: '' } }),
    },
    {
      label: 'Community',
      value: locationFilter.community.trim() || null,
      onRemove: () => updateView({ location: { ...locationFilter, community: '' } }),
    },
    {
      label: 'Location status',
      value: status ? PATIENT_LOCATION_STATUS_LABELS[status] : null,
      onRemove: () => updateView({ location: { ...locationFilter, status: '' } }),
    },
    {
      label: 'Screened',
      value:
        screenedFrom && !screenedError
          ? [screenedFrom, screenedTo]
              .filter((date, index) => date && (index === 0 || date !== screenedFrom))
              .map(formatScreenedDay)
              .join(' – ')
          : null,
      onRemove: clearScreened,
    },
  ].filter((filter) => Boolean(filter.value));

  const total = registry.data && !registry.data.rejected ? registry.data.total : undefined;

  /*
    One sort control in words, for the table and the phone list alike. The table's Patient and
    Last visit headers write the same state, so the two never disagree. Code order is
    registration order (codes are issued in sequence), which is what staff actually ask for.
  */
  const sortOptions = [
    { value: 'default', label: 'Recently updated' },
    { value: 'name:asc', label: 'Name, A to Z' },
    { value: 'name:desc', label: 'Name, Z to A' },
    { value: 'lastVisit:desc', label: 'Last visit, newest' },
    { value: 'lastVisit:asc', label: 'Last visit, oldest' },
    { value: 'patientCode:desc', label: 'Newest registered' },
    { value: 'patientCode:asc', label: 'Oldest registered' },
    ...(screenedActive
      ? [
          { value: 'screened:desc', label: 'Screened, newest' },
          { value: 'screened:asc', label: 'Screened, oldest' },
        ]
      : []),
  ];
  const sortValue = sorting[0] ? `${sorting[0].id}:${sorting[0].desc ? 'desc' : 'asc'}` : 'default';

  return (
    <div className="space-y-5">
      <AppPageHeader
        className="border-b-0 pb-0 md:pb-0"
        title="Patients"
        count={total}
        description="Search this clinic's records and move patients into care."
        helpTitle="How patient search works"
        helpText="Search by name, patient code, phone number, or the last four digits of the stored ID. Results update as you type and stay scoped to this clinic. Open the chart from any result, or check the patient into OPS when your role allows it."
        actions={
          canCreatePatient ? (
            <Button asChild>
              <Link href={`/clinics/${clinicId}/patients/new`}>
                <UserPlus className="h-4 w-4" />
                New patient
              </Link>
            </Button>
          ) : null
        }
      />

      <section aria-label="Search patients" className="space-y-3">
        <ListSearch
          id="patient-search"
          label="Name, patient code, phone or ID last 4"
          value={q}
          onChange={(value) => updateView({ q: value })}
          placeholder="Name, code, phone or ID…"
          help="Results update as you type. Press / to search, Escape to clear."
          shortcut
        />

        <ListFilters
          groupLabel="Patient filters"
          sheetTitle="Filter patients"
          sheetDescription="Filters update results immediately within this clinic."
          chips={activeFilters}
          onClearAll={clearFilters}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          trailing={
            <>
              <span id="patient-sort-label" className="text-sm text-muted-foreground">
                Sort
              </span>
              <Select
                value={
                  sortOptions.some((option) => option.value === sortValue) ? sortValue : 'default'
                }
                onValueChange={(value) => {
                  const [id, dir] = value.split(':');
                  updateView({
                    sorting: value === 'default' ? [] : [{ id, desc: dir === 'desc' }],
                  });
                }}
              >
                <SelectTrigger
                  aria-labelledby="patient-sort-label"
                  className="h-[var(--button-height-sm)] min-h-[var(--button-height-sm)] w-auto gap-2 border-border bg-transparent px-2.5 text-sm font-medium"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        >
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">Residential location</legend>
            <ResidentialLocationFilters
              value={locationFilter}
              onChange={(next) => updateView({ location: next })}
            />
          </fieldset>
          <div className="border-t border-border/70 pt-4">
            <ScreenedDateFilter
              customChosen={customScreened}
              onCustomChosenChange={setCustomScreened}
              value={{ from: screenedFrom, to: screenedTo }}
              today={today}
              timeZone={timeZone}
              error={screenedError}
              onChange={(next) => setScreened(next.from, next.to)}
            />
          </div>
        </ListFilters>
        {canCreateOpsCheckIn ? (
          // Only where the phone list is what shows, and only for a finger: the gesture's one hint.
          <p className="hidden items-center gap-1.5 text-sm text-muted-foreground [@media(pointer:coarse)_and_(max-width:743px)]:flex">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Swipe a patient left to check them in
          </p>
        ) : null}
        {/* While the filters are open the sheet says it beside the dates; once is enough. */}
        {screenedError && !filtersOpen ? (
          <p role="alert" className="text-sm text-destructive">
            {screenedError.message}{' '}
            <Button variant="link" onClick={() => setFiltersOpen(true)}>
              Edit screened dates
            </Button>
          </p>
        ) : null}
        {/* The empty state already says when nothing matched. */}
        {screenedActive && total ? (
          <p aria-live="polite" className="text-sm font-medium text-foreground">
            {screenedCountLine(total, screenedFrom, screenedTo)}
          </p>
        ) : null}
      </section>

      <OpsFeedbackNotice feedback={checkIn.feedback} />

      {/* Keep the final pagination controls above the fixed chat launcher at the page end. */}
      <section aria-label="Patient results" className="pb-20">
        <ResourceState
          state={registry}
          errorTitle="We couldn't load the patient registry"
          skeleton={
            <SectionSkeleton lines={4} className="border-0 bg-transparent p-0 shadow-none" />
          }
          isEmpty={(data) => data.items.length === 0}
          empty={emptyState}
        >
          {(data) => (
            <DataTable
              bleed
              mobileSort={false}
              caption="Patients in this clinic"
              columns={columns}
              data={data.items}
              getRowId={(row) => row.id}
              rowCount={data.total}
              isRefreshing={registry.isRefreshing}
              sorting={sorting}
              onSortingChange={(next) => updateView({ sorting: next })}
              pagination={{ pageIndex: page, pageSize }}
              onPaginationChange={(next) =>
                setView((current) => ({
                  ...current,
                  page: next.pageIndex,
                  pageSize: next.pageSize,
                }))
              }
              renderMobileRow={(row) => (
                <PatientRegistryCard
                  patient={row}
                  href={patientHref(row.id)}
                  canCheckIn={canCreateOpsCheckIn}
                  disabled={checkIn.isBusy || !checkIn.canSubmit}
                  busy={checkIn.busyPatientId === row.id}
                  onCheckIn={() => void submitCheckIn(row)}
                >
                  {screenedActive ? (
                    <div className="mt-2 text-sm">
                      <p className="font-medium">Screened</p>
                      <ScreenedDates
                        screenings={row.matchingScreenings ?? []}
                        timeZone={timeZone}
                      />
                    </div>
                  ) : null}
                </PatientRegistryCard>
              )}
            />
          )}
        </ResourceState>
      </section>
    </div>
  );
}

function MaskedPhone({ value }: { value: string | null }) {
  return value ? (
    <span className="tabular-nums">{maskPhone(value)}</span>
  ) : (
    <span className="text-muted-foreground">Not recorded</span>
  );
}

function LastVisit({ value }: { value?: string | null }) {
  return value ? (
    <time dateTime={value} className="tabular-nums">
      {formatOpsDay(value)}
    </time>
  ) : (
    <span className="text-muted-foreground">No visits yet</span>
  );
}

/** Place first, region last ("Abura, Central"): the district sits between them on the chart. */
function PatientLocation({ patient }: { patient: PatientSummary }) {
  const location = describeResidentialLocation(patient);
  if (!location.isRecorded)
    return <span className="text-muted-foreground">{location.summary}</span>;
  const place = location.community ?? location.district;
  return (
    <span title={location.summary}>
      {[place, location.regionLabel].filter(Boolean).join(', ') || location.summary}
    </span>
  );
}
