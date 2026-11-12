'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Search, SlidersHorizontal, UserPlus, Users, X } from 'lucide-react';
import { apiFetch, readApiError as readApiErrorDetail } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  parseRegistryView,
  registryViewQuery,
  type RegistryView,
} from '@/lib/patient-registry-url';
import { OPS_DEFAULT_TIMEZONE, getTodayInTimeZone, hasPermission, readApiError } from '@/lib/ops';
import {
  describeScreenedRange,
  formatScreenedDay,
  screenedCountLine,
  screenedRangeError,
  type MatchingScreening,
} from '@/lib/patient-registry-screened';
import { GHANA_REGION_LABELS, PATIENT_LOCATION_STATUS_LABELS } from '@/lib/residential-location';
import { useAsyncResource } from '@/lib/use-async-resource';
import { usePatientCheckIn } from '@/lib/use-patient-check-in';
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { DataTable, DataTableActions, type DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  nationalIdLast4?: string | null;
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
  const [wideSheet, setWideSheet] = useState(false);
  const [customScreened, setCustomScreened] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 600px)');
    const update = () => setWideSheet(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
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
  const [view, setView] = useState<RegistryView>(() => {
    const parsed = parseRegistryView(new URLSearchParams(searchParams.toString()));
    // W3 folded the code into the Patient column, so an old "sort by code" link sorts nothing.
    return parsed.sorting[0]?.id === 'patientCode' ? { ...parsed, sorting: [] } : parsed;
  });
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
      id: 'nationalIdLast4',
      accessorKey: 'nationalIdLast4',
      header: 'ID last 4',
      enableSorting: false,
      meta: { className: 'w-32' },
      cell: ({ getValue }) => {
        const value = getValue<string | null>();
        return value ? (
          <span className="tabular-nums">…{value}</span>
        ) : (
          <span className="text-muted-foreground">Not recorded</span>
        );
      },
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
                New Patient
              </Link>
            </Button>
          ) : null
        }
      />

      <section aria-label="Search patients" className="space-y-3">
        <div className="relative">
          <Label htmlFor="patient-search" className="sr-only">
            Name, patient code, phone or ID last 4
          </Label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="patient-search"
            type="search"
            value={q}
            onChange={(event) => updateView({ q: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && q) updateView({ q: '' });
            }}
            placeholder="Name, code, phone or ID last 4…"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="patient-search-help"
            className="bg-surface-2 pl-10 pr-12 focus-visible:bg-card [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                updateView({ q: '' });
                document.getElementById('patient-search')?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            // The shortcut is a mouse-and-keyboard affordance; touch screens never see it.
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 place-items-center rounded-sm bg-card px-1.5 font-mono text-xs font-medium text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)),0_1px_0_hsl(var(--border))] [@media(hover:hover)]:sm:grid"
            >
              /
            </kbd>
          )}
          <p id="patient-search-help" className="sr-only">
            Results update as you type. Press / to search, Escape to clear.
          </p>
        </div>

        {/*
          Filter chips (pilot): the dashed chip opens the filters, each set filter is a chip that
          removes itself. On a phone the row scrolls sideways instead of wrapping into a block.
        */}
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] compact:mx-0 compact:flex-wrap compact:overflow-visible compact:px-0"
          aria-label="Patient filters"
          role="group"
        >
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-dashed bg-transparent text-muted-foreground hover:text-foreground"
                aria-label="Filter patients"
              >
                <SlidersHorizontal aria-hidden="true" /> Filter
              </Button>
            </SheetTrigger>
            <SheetContent
              side={wideSheet ? 'right' : 'bottom'}
              className={cn(
                'flex flex-col bg-card p-0 pb-[env(safe-area-inset-bottom)]',
                wideSheet ? 'w-full sm:max-w-lg' : 'max-h-[90dvh] rounded-t-xl',
              )}
            >
              <SheetHeader className="shrink-0 px-5 pb-4 text-left">
                <SheetTitle className="pr-12 font-body">Filter patients</SheetTitle>
                <SheetDescription>
                  Filters update results immediately within this clinic.
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 [&_.grid]:grid-cols-1 [&_.grid]:compact:grid-cols-2">
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-foreground">
                    Residential location
                  </legend>
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
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-5 py-4">
                <Button variant="outline" onClick={clearFilters}>
                  Clear all filters
                </Button>
                <SheetClose asChild>
                  <Button>Show results</Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
          {activeFilters.map((filter) => (
            <Button
              key={filter.label}
              variant="outline"
              size="sm"
              className="h-auto max-w-[min(20rem,80vw)] shrink-0 gap-1.5 whitespace-normal py-1.5 text-left font-medium"
              aria-label={`Remove ${filter.label} filter`}
              onClick={filter.onRemove}
            >
              <span className="min-w-0 break-words">
                <span className="font-normal text-muted-foreground">{filter.label}</span>{' '}
                {filter.value}
              </span>
              <X aria-hidden="true" className="!size-3.5 shrink-0" />
            </Button>
          ))}
          {activeFilters.length ? (
            <Button variant="link" size="sm" className="shrink-0" onClick={clearFilters}>
              Clear all filters
            </Button>
          ) : null}
        </div>
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
