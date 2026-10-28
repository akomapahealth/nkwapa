'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Stethoscope, UserPlus, Users, X } from 'lucide-react';
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
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
import { OpsFeedbackNotice } from '@/components/ops/OpsShared';
import {
  EMPTY_LOCATION_FILTER,
  ResidentialLocationFilters,
} from '@/components/patients/ResidentialLocationFilters';
import { ScreenedDateFilter, ScreenedDates } from '@/components/patients/ScreenedDateFilter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  // Bumped when a chip or Clear all empties the filter, so the control drops back to Any time.
  const [screenedResetKey, setScreenedResetKey] = useState(0);

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

  const patientHref = (patientId: string) => `/clinics/${clinicId}/patients/${patientId}`;

  const items = registry.data?.items ?? [];
  const total = registry.data?.total ?? 0;

  const columns: DataTableColumn<PatientSummary>[] = [
    {
      id: 'patientCode',
      accessorKey: 'patientCode',
      header: 'Patient code',
      meta: { className: 'whitespace-nowrap font-medium' },
    },
    {
      id: 'name',
      accessorFn: (row) => `${row.firstName} ${row.lastName}`.trim(),
      header: 'Name',
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
      meta: { className: 'w-40 text-muted-foreground' },
      cell: ({ getValue }) => {
        const value = getValue<string | null>();
        return value ? value.replace(/(.{4}).*(.{4})/, '$1***$2') : '—';
      },
    },
    {
      id: 'nationalIdLast4',
      accessorKey: 'nationalIdLast4',
      header: 'ID last 4',
      enableSorting: false,
      meta: { className: 'w-28 text-muted-foreground' },
      cell: ({ getValue }) => {
        const value = getValue<string | null>();
        return value ? `…${value}` : '—';
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: 'right', className: 'w-[220px]' },
      /*
        Real buttons, aligned down the column. They were two text links side by side whose widths
        depended on the label, so "View" and "Check-in" wandered row to row. There is still no
        row-click navigation: it fired for anything inside the row, including Check in.
      */
      cell: ({ row }) => (
        <DataTableActions>
          <Button asChild variant="outline" size="sm" className="h-9 w-20">
            <Link href={patientHref(row.original.id)}>View</Link>
          </Button>
          {canCreateOpsCheckIn ? (
            <Button
              size="sm"
              className="h-9 w-24"
              loading={checkIn.busyPatientId === row.original.id}
              disabled={checkIn.isBusy || !checkIn.canSubmit}
              onClick={() => void checkIn.checkIn(row.original)}
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
    setScreenedResetKey((key) => key + 1);
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

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Patient registry"
        title="Patients"
        description="Search this clinic's records and move patients into care."
        helpTitle="How patient search works"
        helpText="Search by name, patient code, phone number, or the last four digits of the stored ID. Results update as you type and stay scoped to this clinic. Open the chart from any result, or check the patient into OPS when your role allows it."
        actions={
          <Button asChild>
            <Link href={`/clinics/${clinicId}/patients/new`}>
              <UserPlus className="h-4 w-4" />
              New Patient
            </Link>
          </Button>
        }
      />

      <AppMetricGroup className="md:grid-cols-3">
        <AppMetricCard
          title="Visible results"
          value={items.length}
          icon={Users}
          detail="Patients currently shown for the active search."
        />
        <AppMetricCard
          title="Search mode"
          value={otherFiltersActive || screenedActive ? 'Filtered' : 'Browsing'}
          icon={Search}
          detail={
            otherFiltersActive || screenedActive
              ? 'Results are narrowed by the active search and filters.'
              : 'Enter a patient name, code, phone, or ID.'
          }
        />
        <AppMetricCard
          title="OPS handoff"
          value={canCreateOpsCheckIn ? 'Enabled' : 'Read only'}
          icon={Stethoscope}
          detail="Check-in shortcuts appear when your role can add patients to the clinic board."
        />
      </AppMetricGroup>

      <FormSectionCard
        title="Search patients"
        description="Results update as you type and stay scoped to this clinic."
      >
        <div className="space-y-2 md:max-w-xl">
          <Label htmlFor="patient-search">Name, patient code, phone or ID last 4</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="patient-search"
              type="search"
              value={q}
              onChange={(event) => updateView({ q: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && q) updateView({ q: '' });
              }}
              placeholder="e.g. Ama Mensah or NKP-2026-000123"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="patient-search-help"
              className="pl-9 pr-11 [&::-webkit-search-cancel-button]:hidden"
            />
            {q ? (
              <button
                type="button"
                onClick={() => {
                  updateView({ q: '' });
                  document.getElementById('patient-search')?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <p id="patient-search-help" className="text-xs text-muted-foreground">
            Results update as you type. Press Escape to clear.
          </p>
        </div>
        <div className="space-y-3 border-t border-border/70 pt-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">Residential location</legend>
            <ResidentialLocationFilters
              value={locationFilter}
              onChange={(next) => updateView({ location: next })}
            />
          </fieldset>
          <div className="border-t border-border/70 pt-4">
            <ScreenedDateFilter
              key={screenedResetKey}
              value={{ from: screenedFrom, to: screenedTo }}
              today={today}
              timeZone={timeZone}
              error={screenedError}
              onChange={(next) => setScreened(next.from, next.to)}
            />
          </div>
          <ActiveFilterSummary
            items={[
              { label: 'Search', value: q.trim() || null, onRemove: () => updateView({ q: '' }) },
              {
                label: 'Region',
                value: region ? GHANA_REGION_LABELS[region] : null,
                // A district only means something inside its region.
                onRemove: () =>
                  updateView({ location: { ...locationFilter, region: '', district: '' } }),
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
            ]}
            emptyLabel="Browsing the full clinic registry"
            onClearAll={() => {
              setServerScreenedError(null);
              setScreenedResetKey((key) => key + 1);
              updateView({
                q: '',
                location: EMPTY_LOCATION_FILTER,
                screenedFrom: '',
                screenedTo: '',
                sorting: sorting[0]?.id === 'screened' ? [] : sorting,
              });
            }}
          />
        </div>
      </FormSectionCard>

      <OpsFeedbackNotice feedback={checkIn.feedback} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-xl">Patient results</CardTitle>
              <CardDescription>Open a chart or hand the patient into OPS.</CardDescription>
              {/* The empty state already says when nothing matched. */}
              {screenedActive &&
              registry.data &&
              !registry.data.rejected &&
              registry.data.total > 0 ? (
                <p aria-live="polite" className="text-sm font-medium text-foreground">
                  {screenedCountLine(registry.data.total, screenedFrom, screenedTo)}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-border/70 bg-background/75 px-4 py-3 text-sm">
              <p className="text-muted-foreground">Showing</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {items.length} of {total}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  <article className="rounded-lg border border-border/80 bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          {row.firstName} {row.lastName}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">{row.patientCode}</p>
                      </div>
                      {row.nationalIdLast4 ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          …{row.nationalIdLast4}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm tabular-nums text-muted-foreground">
                      {row.phoneE164 || 'No phone on file'}
                    </p>
                    {screenedActive ? (
                      <div className="mt-3 text-sm">
                        <p className="font-medium text-foreground">Screened</p>
                        <ScreenedDates
                          screenings={row.matchingScreenings ?? []}
                          timeZone={timeZone}
                        />
                      </div>
                    ) : null}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button asChild variant="outline">
                        <Link href={patientHref(row.id)}>View record</Link>
                      </Button>
                      {canCreateOpsCheckIn ? (
                        <Button
                          loading={checkIn.busyPatientId === row.id}
                          disabled={checkIn.isBusy || !checkIn.canSubmit}
                          onClick={() => void checkIn.checkIn(row)}
                        >
                          Check in
                        </Button>
                      ) : null}
                    </div>
                  </article>
                )}
              />
            )}
          </ResourceState>
        </CardContent>
      </Card>
    </div>
  );
}
