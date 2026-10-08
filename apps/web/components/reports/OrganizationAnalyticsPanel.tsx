'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, CalendarCheck, Filter, Users } from 'lucide-react';
import { apiFetch, readApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  summarizeZones,
  zoneFilterFromSelect,
  zoneFilterOptions,
  zoneFilterMatches,
  zoneFilterToSelect,
  zoneLabel,
} from '@/lib/clinic-zones';
import {
  ANALYTICS_WORKFLOWS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  EMPTY_COHORT_FILTERS,
  ENCOUNTER_STATUSES,
  ENCOUNTER_STATUS_LABELS,
  WORKFLOW_LABELS,
  cohortFilterProblem,
  hasActiveCohortFilters,
  isEmptyCohort,
  labelled,
  organizationAnalyticsQuery,
  workflowCounts,
  type ClinicAnalyticsRow,
  type CohortFilters,
  type OrganizationAnalytics,
} from '@/lib/organization-analytics';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DistributionChart } from '@/components/dashboard/DistributionChart';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { AppMetricGroup } from '@/components/app-shell/AppMetricCard';

/** The `Select` value standing for "no filter". Radix refuses an empty-string item value. */
const ANY = '__any__';

export interface AnalyticsClinicOption {
  clinicId: string;
  clinicName: string;
  zoneCode: string | null;
  isActive: boolean;
}

/**
 * Cohort analytics for one organization (#25): the same clinics as the report, narrowed by date,
 * clinic, zone, condition workflow and status. Counts only; no patient is ever listed.
 */
export function OrganizationAnalyticsPanel({
  organizationId,
  clinics,
}: {
  organizationId: string;
  /** Every clinic in the organization, for the clinic and zone pickers. */
  clinics: AnalyticsClinicOption[];
}) {
  const router = useRouter();
  const bootstrapCtx = useBootstrap();
  const [filters, setFilters] = useState<CohortFilters>(EMPTY_COHORT_FILTERS);
  const problem = cohortFilterProblem(filters);
  const query = organizationAnalyticsQuery(organizationId, filters);

  const analytics = useAsyncResource<OrganizationAnalytics>({
    resourceKey: query.resourceKey,
    errorMessage: 'The cohort analytics could not be loaded.',
    // An impossible range is said beside the dates; there is no point asking the API.
    enabled: problem === null,
    fetcher: async (token, signal) => {
      const response = await apiFetch(query.path, {
        getToken: token,
        skipClinicHeader: true,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as OrganizationAnalytics;
    },
  });

  const update = (patch: Partial<CohortFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));
  const reset = () => setFilters(EMPTY_COHORT_FILTERS);

  const zoneOptions = useMemo(() => zoneFilterOptions(summarizeZones(clinics)), [clinics]);
  // Picking a zone hides clinics outside it, so the two pickers cannot contradict each other.
  const clinicOptions = useMemo(
    () => clinics.filter((clinic) => zoneFilterMatches(clinic.zoneCode, filters.zone)),
    [clinics, filters.zone],
  );

  const openClinic = (row: ClinicAnalyticsRow) => {
    bootstrapCtx?.setActiveClinicId(row.drilldown.clinicId);
    router.push(row.drilldown.path);
  };

  const columns = useMemo<DataTableColumn<ClinicAnalyticsRow>[]>(
    () => [
      { id: 'clinicName', accessorKey: 'clinicName', header: 'Clinic', minWidth: 180 },
      {
        id: 'zoneCode',
        accessorKey: 'zoneCode',
        header: 'Zone',
        accessorFn: (row) => zoneLabel(row.zoneCode),
      },
      { id: 'encounters', accessorKey: 'encounters', header: 'Encounters', width: 110 },
      { id: 'patients', accessorKey: 'patients', header: 'Patients', width: 100 },
      {
        id: 'finalized',
        accessorKey: 'finalized',
        header: 'Finalized',
        accessorFn: (row) => row.encountersByStatus.FINALIZED,
      },
      { id: 'appointments', accessorKey: 'appointments', header: 'Appointments', width: 130 },
      {
        id: 'noShows',
        accessorKey: 'noShows',
        header: 'No-shows',
        accessorFn: (row) => row.appointmentsByStatus.NO_SHOW,
      },
      {
        id: 'actions',

        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row: params }) => (
          <span className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update({ clinicId: params.original.clinicId })}
              aria-label={`Show only ${params.original.clinicName}`}
            >
              Only this clinic
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openClinic(params.original)}
              aria-label={`Open the ${params.original.clinicName} dashboard`}
            >
              Open dashboard
            </Button>
          </span>
        ),
      },
    ],
    // update and openClinic close over stable setters, the router and bootstrap context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" aria-hidden />
            Cohort
          </CardTitle>
          <CardDescription>
            Dates are days on the organization&apos;s calendar, both ends included. Leave them blank
            for the last 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="cohort-from">From</Label>
              <Input
                id="cohort-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) => update({ from: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cohort-to">To</Label>
              <Input
                id="cohort-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) => update({ to: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cohort-zone">Zone</Label>
              <Select
                value={zoneFilterToSelect(filters.zone)}
                onValueChange={(value) => {
                  const zone = zoneFilterFromSelect(value);
                  const keepsClinic = clinics.some(
                    (clinic) =>
                      clinic.clinicId === filters.clinicId &&
                      zoneFilterMatches(clinic.zoneCode, zone),
                  );
                  update({ zone, clinicId: keepsClinic ? filters.clinicId : null });
                }}
              >
                <SelectTrigger id="cohort-zone">
                  <SelectValue placeholder="All zones" />
                </SelectTrigger>
                <SelectContent>
                  {zoneOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                      {option.clinicCount === null ? '' : ` (${option.clinicCount})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cohort-clinic">Clinic</Label>
              <Select
                value={filters.clinicId ?? ANY}
                onValueChange={(value) => update({ clinicId: value === ANY ? null : value })}
              >
                <SelectTrigger id="cohort-clinic">
                  <SelectValue placeholder="All clinics" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All clinics</SelectItem>
                  {clinicOptions.map((clinic) => (
                    <SelectItem key={clinic.clinicId} value={clinic.clinicId}>
                      {clinic.clinicName}
                      {clinic.isActive ? '' : ' (inactive)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FilterSelect
              id="cohort-workflow"
              label="Condition workflow"
              anyLabel="Any workflow"
              value={filters.workflow}
              options={ANALYTICS_WORKFLOWS}
              labels={WORKFLOW_LABELS}
              onChange={(workflow) => update({ workflow })}
            />
            <FilterSelect
              id="cohort-encounter-status"
              label="Encounter status"
              anyLabel="Any status"
              value={filters.encounterStatus}
              options={ENCOUNTER_STATUSES}
              labels={ENCOUNTER_STATUS_LABELS}
              onChange={(encounterStatus) => update({ encounterStatus })}
            />
            <FilterSelect
              id="cohort-appointment-status"
              label="Appointment status"
              anyLabel="Any status"
              value={filters.appointmentStatus}
              options={APPOINTMENT_STATUSES}
              labels={APPOINTMENT_STATUS_LABELS}
              onChange={(appointmentStatus) => update({ appointmentStatus })}
            />
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={reset}
                disabled={!hasActiveCohortFilters(filters)}
                className="w-full"
              >
                Reset filters
              </Button>
            </div>
          </div>
          {problem ? (
            <p className="text-sm text-destructive" role="alert">
              {problem}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {problem ? null : (
        <ResourceState
          state={analytics}
          errorTitle="The cohort analytics could not be loaded"
          skeleton={<SectionSkeleton lines={6} />}
          isEmpty={isEmptyCohort}
          empty={{
            title: 'Nothing matches this cohort',
            description:
              'No encounters or appointments fall within these filters. Widen the dates or clear a filter.',
            action: hasActiveCohortFilters(filters) ? (
              <Button variant="outline" onClick={reset}>
                Reset filters
              </Button>
            ) : undefined,
          }}
        >
          {(data) => (
            <div className="space-y-6" aria-busy={analytics.isRefreshing}>
              <p className="text-sm text-muted-foreground" role="status">
                {data.organization.name}, {formatDay(data.filters.from)} to{' '}
                {formatDay(data.filters.to)}
                {analytics.isRefreshing ? ' · Updating…' : ''}
              </p>

              <AppMetricGroup className="sm:grid-cols-2 xl:grid-cols-4">
                <DashboardKpiCard
                  title="Encounters"
                  value={data.totals.encounters.toLocaleString()}
                  hint={`${data.totals.encountersByStatus.FINALIZED.toLocaleString()} finalized`}
                  icon={Activity}
                />
                <DashboardKpiCard
                  title="Patients"
                  value={data.totals.patients.toLocaleString()}
                  hint="Distinct people with an encounter in the cohort"
                  icon={Users}
                />
                <DashboardKpiCard
                  title="Appointments"
                  value={data.totals.appointments.toLocaleString()}
                  hint={`${data.totals.appointmentsByStatus.COMPLETED.toLocaleString()} completed, ${data.totals.appointmentsByStatus.NO_SHOW.toLocaleString()} no-shows`}
                  icon={CalendarCheck}
                />
                <DashboardKpiCard
                  title="Clinics"
                  value={data.totals.clinics}
                  hint="In this cohort"
                />
              </AppMetricGroup>

              <TrendChart
                title="Encounters per day"
                hint="Encounters in the cohort, by the day they were opened"
                data={data.encounterTrend}
                emptyMessage="No encounters in this cohort."
              />

              <div className="grid gap-4 lg:grid-cols-3">
                <DistributionChart
                  title="Encounter status"
                  data={labelled(data.totals.encountersByStatus, ENCOUNTER_STATUS_LABELS)}
                  order={Object.values(ENCOUNTER_STATUS_LABELS)}
                  emptyMessage="No encounters in this cohort."
                />
                <DistributionChart
                  title="Condition workflows"
                  hint="An encounter can be in more than one"
                  data={labelled(workflowCounts(data.totals.workflows), WORKFLOW_LABELS)}
                  order={Object.values(WORKFLOW_LABELS)}
                  layout="horizontal"
                  emptyMessage="No encounters in this cohort."
                />
                <DistributionChart
                  title="Appointment status"
                  hint="Workflow and encounter status do not narrow appointments"
                  data={labelled(data.totals.appointmentsByStatus, APPOINTMENT_STATUS_LABELS)}
                  order={Object.values(APPOINTMENT_STATUS_LABELS)}
                  tones={{ Completed: 'success', 'No-show': 'warning', Cancelled: 'neutral' }}
                  emptyMessage="No appointments in this cohort."
                />
              </div>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="text-lg">By clinic</CardTitle>
                  <CardDescription>
                    Narrow the cohort to one clinic, or open its own dashboard. A patient seen at
                    two clinics counts once in the total above.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div>
                    <DataTable
                      caption="Cohort by clinic"
                      columns={columns}
                      data={data.clinics}
                      getRowId={(row) => row.clinicId}
                      pageSizeOptions={[25, 50]}
                      initialPageSize={25}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </ResourceState>
      )}
    </div>
  );
}

function FilterSelect<K extends string>({
  id,
  label,
  anyLabel,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  anyLabel: string;
  value: K | null;
  options: readonly K[];
  labels: Record<K, string>;
  onChange: (value: K | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? null : (next as K))}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={anyLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** `2026-09-25` as "25 Sep 2026", read as a calendar date with no time zone shift. */
function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
