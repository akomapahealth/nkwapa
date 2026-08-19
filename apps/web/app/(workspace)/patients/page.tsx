'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, UserPlus, Users } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { getOpsDestination, hasPermission, readApiError } from '@/lib/ops';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';
import {
  EMPTY_LOCATION_FILTER,
  ResidentialLocationFilters,
  type ResidentialLocationFilterValue,
} from '@/components/patients/ResidentialLocationFilters';
import { GHANA_REGION_LABELS, PATIENT_LOCATION_STATUS_LABELS } from '@/lib/residential-location';

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

export default function PatientsPage() {
  const router = useRouter();
  const bootstrapContext = useBootstrap();
  const bootstrap = bootstrapContext?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId = bootstrapContext?.activeClinicId ?? getBootstrapActiveClinicId(bootstrap);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canCreateOpsCheckIn = hasPermission(perms, 'OPS.CHECKIN.CREATE');

  const [q, setQ] = useState('');
  const [locationFilter, setLocationFilter] =
    useState<ResidentialLocationFilterValue>(EMPTY_LOCATION_FILTER);
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: String(page + 1),
        pageSize: String(pageSize),
      });
      if (q.trim()) query.set('q', q.trim());
      if (locationFilter.region) query.set('residentialRegion', locationFilter.region);
      if (locationFilter.district) query.set('residentialDistrict', locationFilter.district);
      if (locationFilter.community.trim())
        query.set('residentialCommunity', locationFilter.community.trim());
      if (locationFilter.status) query.set('residentialLocationStatus', locationFilter.status);

      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients?${query.toString()}`,
        { getToken, activeClinicId: clinicId },
      );
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as PatientRegistryResponse;
      setResults(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken, page, pageSize, q, locationFilter]);

  useEffect(() => {
    const debounce = q.trim() || locationFilter.community.trim() ? 300 : 0;
    const t = setTimeout(() => {
      search();
    }, debounce);
    return () => clearTimeout(t);
  }, [q, locationFilter.community, search]);

  const handleCheckIn = async (patient: PatientSummary) => {
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/checkins`, {
        method: 'POST',
        body: JSON.stringify({ patientId: patient.id }),
        getToken,
        activeClinicId: clinicId,
      });
      if (!res.ok) throw new Error(await readApiError(res));

      const destination = getOpsDestination(perms);
      setSuccess(
        destination
          ? `${patient.firstName} ${patient.lastName} is now on the clinic board.`
          : `${patient.firstName} ${patient.lastName} has been checked in successfully.`,
      );

      if (destination === '/today') {
        router.prefetch('/today');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const columns: GridColDef[] = [
    { field: 'patientCode', headerName: 'Patient Code', width: 130 },
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      valueGetter: (_, row) => `${row.firstName} ${row.lastName}`.trim(),
    },
    {
      field: 'phoneE164',
      headerName: 'Phone',
      width: 140,
      valueFormatter: (v) => (v ? String(v).replace(/(.{4}).*(.{4})/, '$1***$2') : ''),
    },
    {
      field: 'nationalIdLast4',
      headerName: 'ID Last 4',
      width: 90,
      valueFormatter: (v) => (v ? `…${v}` : ''),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 180,
      sortable: false,
      renderCell: (params) => (
        <div className="flex gap-2">
          <Link
            href={`/clinics/${clinicId}/patients/${params.row.id}`}
            className="text-primary hover:underline text-sm"
          >
            View
          </Link>
          {canCreateOpsCheckIn ? (
            <button
              type="button"
              onClick={() => handleCheckIn(params.row as PatientSummary)}
              disabled={loading}
              className="text-sm text-green-700 hover:underline disabled:opacity-50"
            >
              Check-in
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const rows = results.map((p) => ({ ...p, id: p.id }));

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="PATIENT.SEARCH">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to search patients.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="PATIENT.SEARCH">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Patient registry"
          title="Patients"
          description="Search records and move patients into care."
          helpTitle="How patient search works"
          helpText="Search by name, patient code, phone number, or ID fragment, then open the chart or check the patient into OPS when your role allows it."
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
            value={rows.length}
            icon={Users}
            detail="Patients currently shown for the active search."
          />
          <AppMetricCard
            title="Search mode"
            value={q.trim() ? 'Focused' : 'Browsing'}
            icon={Search}
            detail={
              q.trim()
                ? 'Results are filtered by your current query.'
                : 'Enter a patient name, code, phone, or ID.'
            }
          />
          <AppMetricCard
            title="OPS handoff"
            value={canCreateOpsCheckIn ? 'Enabled' : 'Read only'}
            icon={UserPlus}
            detail="Check-in shortcuts appear when your role can add patients to OPS."
          />
        </div>

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader className="space-y-3">
            <CardTitle className="text-xl">Search patients</CardTitle>
            <CardDescription>Search the active clinic registry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
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
            </div>
            <ActiveFilterSummary
              items={[
                { label: 'Query', value: q.trim() || null },
                { label: 'Page', value: page > 0 ? page + 1 : null },
                {
                  label: 'Region',
                  value: locationFilter.region ? GHANA_REGION_LABELS[locationFilter.region] : null,
                },
                { label: 'District', value: locationFilter.district || null },
                { label: 'Community', value: locationFilter.community.trim() || null },
                {
                  label: 'Location status',
                  value: locationFilter.status
                    ? PATIENT_LOCATION_STATUS_LABELS[locationFilter.status]
                    : null,
                },
              ]}
              emptyLabel="Browsing the full clinic registry"
            />
            <ProgressiveHelp title="Search tips">
              Search by patient name, code, phone number, or the last four digits of the stored ID.
              Results update as you type, and the desktop table opens the chart when you click a
              row.
            </ProgressiveHelp>
          </CardContent>
        </Card>

        {error ? (
          <InlineErrorState
            description={error}
            onRetry={() => void search()}
            retryLabel="Reload patients"
          />
        ) : null}
        {success ? (
          <InlineNotice tone="success">
            <span>{success}</span>
            {getOpsDestination(perms) ? (
              <>
                {' '}
                <Link
                  href={getOpsDestination(perms)!}
                  className="font-medium underline underline-offset-4"
                >
                  Open OPS view
                </Link>
              </>
            ) : null}
          </InlineNotice>
        ) : null}

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Patient results</CardTitle>
                <CardDescription>Open a chart or hand the patient into OPS.</CardDescription>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/75 px-4 py-3 text-sm">
                <p className="text-muted-foreground">Showing</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {rows.length} of {total}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && results.length === 0 ? (
              <SectionSkeleton lines={4} className="border-0 bg-transparent p-0 shadow-none" />
            ) : !loading && results.length === 0 ? (
              <EmptyStateCard
                title={q.trim() ? 'No patients found' : 'No patients in this clinic yet'}
                description={
                  q.trim()
                    ? 'Try a broader search term or confirm the patient is registered in the active clinic.'
                    : 'Use this page to browse the full patient registry for the active clinic as records are added.'
                }
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {rows.map((row) => (
                    <article
                      key={row.id}
                      className="rounded-3xl border border-border/80 bg-background/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {row.firstName} {row.lastName}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">{row.patientCode}</p>
                        </div>
                        {row.nationalIdLast4 ? (
                          <span className="text-xs text-muted-foreground">
                            ...{row.nationalIdLast4}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {row.phoneE164 || 'No phone on file'}
                      </p>
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => router.push(`/clinics/${clinicId}/patients/${row.id}`)}
                        >
                          View
                        </Button>
                        {canCreateOpsCheckIn ? (
                          <Button
                            className="flex-1"
                            disabled={loading}
                            onClick={() => handleCheckIn(row)}
                          >
                            Check-in
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <Box
                  sx={{ height: 460, width: '100%' }}
                  className="hidden overflow-x-auto md:block"
                >
                  <DataGrid
                    rows={rows}
                    columns={columns}
                    loading={loading}
                    paginationMode="server"
                    rowCount={total}
                    pageSizeOptions={[10, 25, 50]}
                    paginationModel={{ page, pageSize }}
                    onPaginationModelChange={(model) => {
                      setPage(model.page);
                      setPageSize(model.pageSize);
                    }}
                    onRowClick={(params) =>
                      router.push(`/clinics/${clinicId}/patients/${params.id}`)
                    }
                    sx={{ ...dataGridSx, cursor: 'pointer' }}
                  />
                </Box>

                <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm md:hidden">
                  <p className="text-muted-foreground">
                    Showing {rows.length} of {total} patients
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 0 || loading}
                      onClick={() => setPage((current) => Math.max(0, current - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(page + 1) * pageSize >= total || loading}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
