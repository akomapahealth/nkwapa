'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SortingState } from '@tanstack/react-table';
import { Search, Stethoscope, UserPlus, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { registrySortQuery } from '@/lib/patient-registry-sort';
import { hasPermission, readApiError } from '@/lib/ops';
import { GHANA_REGION_LABELS, PATIENT_LOCATION_STATUS_LABELS } from '@/lib/residential-location';
import { useAsyncResource } from '@/lib/use-async-resource';
import { usePatientCheckIn } from '@/lib/use-patient-check-in';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
import { OpsFeedbackNotice } from '@/components/ops/OpsShared';
import {
  EMPTY_LOCATION_FILTER,
  ResidentialLocationFilters,
  type ResidentialLocationFilterValue,
} from '@/components/patients/ResidentialLocationFilters';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableActions, type DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';

interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  nationalIdLast4?: string | null;
}

interface PatientRegistryResponse {
  items: PatientSummary[];
  total: number;
  page: number;
  pageSize: number;
}

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

  const [q, setQ] = useState('');
  const [locationFilter, setLocationFilter] =
    useState<ResidentialLocationFilterValue>(EMPTY_LOCATION_FILTER);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([]);
  const sortQuery = registrySortQuery(sorting);

  /*
    Only the free-text inputs are debounced. Typing a name should not fire a request per
    keystroke, but choosing a region is a single deliberate act and has to answer immediately.
    The committed values are what identify the read, so they drive `resourceKey` below.
  */
  const [committed, setCommitted] = useState({ q: '', community: '' });
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

  const registry = useAsyncResource<PatientRegistryResponse>({
    resourceKey: [
      clinicId,
      page,
      pageSize,
      committed.q,
      region,
      district,
      committed.community,
      status,
      sortQuery.sortBy ?? '',
      sortQuery.sortDir ?? '',
    ].join('|'),
    errorMessage: 'The patient registry could not be loaded.',
    fetcher: async (token, signal) => {
      const query = new URLSearchParams({
        page: String(page + 1),
        pageSize: String(pageSize),
        ...sortQuery,
      });
      if (committed.q) query.set('q', committed.q);
      if (region) query.set('residentialRegion', region);
      if (district) query.set('residentialDistrict', district);
      if (committed.community) query.set('residentialCommunity', committed.community);
      if (status) query.set('residentialLocationStatus', status);

      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients?${query.toString()}`,
        { getToken: token, activeClinicId: clinicId, signal },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      return (await response.json()) as PatientRegistryResponse;
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

      <div className="grid gap-4 md:grid-cols-3">
        <AppMetricCard
          title="Visible results"
          value={items.length}
          icon={Users}
          detail="Patients currently shown for the active search."
        />
        <AppMetricCard
          title="Search mode"
          value={committed.q ? 'Focused' : 'Browsing'}
          icon={Search}
          detail={
            committed.q
              ? 'Results are filtered by the active query.'
              : 'Enter a patient name, code, phone, or ID.'
          }
        />
        <AppMetricCard
          title="OPS handoff"
          value={canCreateOpsCheckIn ? 'Enabled' : 'Read only'}
          icon={Stethoscope}
          detail="Check-in shortcuts appear when your role can add patients to the clinic board."
        />
      </div>

      <FormSectionCard
        title="Search patients"
        description="Results update as you type and stay scoped to this clinic."
      >
        <Input
          type="search"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(0);
          }}
          placeholder="Search by name, patient code, phone, or national ID last 4"
          className="w-full md:max-w-xl"
        />
        <div className="space-y-3 border-t border-border/70 pt-4">
          <p className="text-sm font-medium text-foreground">Residential location filters</p>
          <ResidentialLocationFilters
            value={locationFilter}
            onChange={(next) => {
              setLocationFilter(next);
              setPage(0);
            }}
          />
          <ActiveFilterSummary
            items={[
              { label: 'Query', value: q.trim() || null },
              { label: 'Page', value: page > 0 ? page + 1 : null },
              {
                label: 'Region',
                value: region ? GHANA_REGION_LABELS[region] : null,
              },
              { label: 'District', value: district || null },
              { label: 'Community', value: locationFilter.community.trim() || null },
              {
                label: 'Location status',
                value: status ? PATIENT_LOCATION_STATUS_LABELS[status] : null,
              },
            ]}
            emptyLabel="Browsing the full clinic registry"
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
            empty={{
              title: committed.q ? 'No patients found' : 'No patients in this clinic yet',
              description: committed.q
                ? 'Try a broader search term or confirm the patient is registered in this clinic.'
                : 'Patients appear here as they are registered in this clinic.',
              icon: Users,
            }}
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
                onSortingChange={(next) => {
                  setSorting(next);
                  setPage(0);
                }}
                pagination={{ pageIndex: page, pageSize }}
                onPaginationChange={(next) => {
                  setPage(next.pageIndex);
                  setPageSize(next.pageSize);
                }}
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
