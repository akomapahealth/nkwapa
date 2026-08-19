'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Search, Stethoscope, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { getOpsDestination, hasPermission, readApiError } from '@/lib/ops';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';
import { dataGridSx } from '@/lib/datagrid-theme';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
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

export default function ClinicPatientsPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
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
    if (!clinicId || !getToken) {
      return;
    }

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

      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients?${query.toString()}`,
        { getToken, activeClinicId: clinicId },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as PatientRegistryResponse;
      setResults(payload.items);
      setTotal(payload.total);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken, page, pageSize, q, locationFilter]);

  useEffect(() => {
    const debounce = q.trim() || locationFilter.community.trim() ? 300 : 0;
    const timeoutId = window.setTimeout(() => {
      void search();
    }, debounce);

    return () => window.clearTimeout(timeoutId);
  }, [q, locationFilter.community, search]);

  const handleCheckIn = async (patient: PatientSummary) => {
    if (!clinicId || !getToken) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/checkins`, {
        method: 'POST',
        body: JSON.stringify({ patientId: patient.id }),
        getToken,
        activeClinicId: clinicId,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const destination = getOpsDestination(perms);
      setSuccess(
        destination
          ? `${patient.firstName} ${patient.lastName} is now on the clinic board.`
          : `${patient.firstName} ${patient.lastName} has been checked in successfully.`,
      );

      if (destination === '/today') {
        router.prefetch('/today');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  };

  const columns: GridColDef[] = [
    { field: 'patientCode', headerName: 'Patient Code', width: 140 },
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      valueGetter: (_, row) => `${row.firstName} ${row.lastName}`.trim(),
    },
    {
      field: 'phoneE164',
      headerName: 'Phone',
      width: 150,
      valueFormatter: (value) => (value ? String(value).replace(/(.{4}).*(.{4})/, '$1***$2') : ''),
    },
    {
      field: 'nationalIdLast4',
      headerName: 'ID Last 4',
      width: 100,
      valueFormatter: (value) => (value ? `...${value}` : ''),
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
            className="text-sm text-primary hover:underline"
          >
            View
          </Link>
          {canCreateOpsCheckIn ? (
            <button
              type="button"
              onClick={() => void handleCheckIn(params.row as PatientSummary)}
              disabled={loading}
              className="text-sm text-emerald-700 hover:underline disabled:opacity-50"
            >
              Check-in
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const rows = results.map((patient) => ({ ...patient, id: patient.id }));

  return (
    <RouteGuard requiredPermission="PATIENT.SEARCH">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic patient registry"
          title="Patient Search"
          description="Search this clinic’s patient records quickly, open detailed charts, and move patients into today’s workflow without leaving the page."
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
            detail="Patients currently shown for your clinic search."
          />
          <AppMetricCard
            title="Search mode"
            value={q.trim() ? 'Focused' : 'Browsing'}
            icon={Search}
            detail={
              q.trim()
                ? 'Results are filtered by the active query.'
                : 'Search by name, code, phone, or national ID.'
            }
          />
          <AppMetricCard
            title="OPS handoff"
            value={canCreateOpsCheckIn ? 'Enabled' : 'Read only'}
            icon={Stethoscope}
            detail="Check-in shortcuts appear here when your role can add patients to the clinic board."
          />
        </div>

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl">Search patients</CardTitle>
            <CardDescription>
              Results update as you type and stay scoped to the active clinic.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  {
                    label: 'Region',
                    value: locationFilter.region
                      ? GHANA_REGION_LABELS[locationFilter.region]
                      : null,
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
            </div>
          </CardContent>
        </Card>

        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
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
          <CardHeader>
            <CardTitle className="text-xl">Patient results</CardTitle>
            <CardDescription>
              Browse the full clinic registry, search by patient details, and move directly into the
              next care step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!loading && rows.length === 0 ? (
              <EmptyStateCard
                title={q.trim() ? 'No patients found' : 'No patients in this clinic yet'}
                description={
                  q.trim()
                    ? 'Try a broader search term or confirm the patient has already been registered in this clinic.'
                    : 'Once patients are added to this clinic, they will appear here for full registry browsing.'
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
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline" className="rounded-2xl">
                          <Link href={`/clinics/${clinicId}/patients/${row.id}`}>View record</Link>
                        </Button>
                        {canCreateOpsCheckIn ? (
                          <Button
                            size="sm"
                            onClick={() => void handleCheckIn(row)}
                            disabled={loading}
                            className="rounded-2xl"
                          >
                            Check-in
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden md:block">
                  <Box sx={{ width: '100%' }}>
                    <DataGrid
                      autoHeight
                      disableColumnMenu
                      disableRowSelectionOnClick
                      rows={rows}
                      columns={columns}
                      loading={loading}
                      getRowHeight={() => 64}
                      paginationMode="server"
                      rowCount={total}
                      pageSizeOptions={[10, 25, 50]}
                      paginationModel={{ page, pageSize }}
                      onPaginationModelChange={(model) => {
                        setPage(model.page);
                        setPageSize(model.pageSize);
                      }}
                      sx={dataGridSx}
                    />
                  </Box>
                </div>

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
