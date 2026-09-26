'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { Activity, Building2, ClipboardList, Users } from 'lucide-react';
import { apiFetch, readApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import { useBootstrap } from '@/lib/bootstrap-context';
import { dataGridSx } from '@/lib/datagrid-theme';
import type { OrganizationSummary } from '@/lib/clinic-metadata';
import { zoneLabel } from '@/lib/clinic-zones';
import {
  formatRate,
  openWork,
  type ClinicReportRow,
  type OrganizationReport,
} from '@/lib/organization-report';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * An organization's dashboard across all of its clinics (#13).
 *
 * The rollup a leader reads without switching clinic eleven times, and a way back into any one
 * clinic's own dashboard from its row. Totals come from the API already summed; rates arrive with
 * their counts so a percentage is never read without knowing how many it rests on.
 */
export function OrganizationReportScreen() {
  const router = useRouter();
  const bootstrapCtx = useBootstrap();
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const organizations = useAsyncResource<OrganizationSummary[]>({
    resourceKey: 'report-organizations',
    errorMessage: 'The organization list could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch('/admin/clinics/organizations', {
        getToken: token,
        skipClinicHeader: true,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as OrganizationSummary[];
    },
  });

  // Default to the first organization once the list arrives; a report needs one to be chosen.
  useEffect(() => {
    if (!organizationId && organizations.data?.length) {
      setOrganizationId(organizations.data[0].id);
    }
  }, [organizationId, organizations.data]);

  const report = useAsyncResource<OrganizationReport>({
    resourceKey: `organization-report:${organizationId ?? 'none'}`,
    errorMessage: 'The organization report could not be loaded.',
    enabled: organizationId !== null,
    fetcher: async (token, signal) => {
      const response = await apiFetch(
        `/organizations/${encodeURIComponent(organizationId!)}/report`,
        { getToken: token, skipClinicHeader: true, signal },
      );
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as OrganizationReport;
    },
  });

  const openClinic = (row: ClinicReportRow) => {
    bootstrapCtx?.setActiveClinicId(row.drilldown.clinicId);
    router.push(row.drilldown.path);
  };

  const columns = useMemo<GridColDef<ClinicReportRow>[]>(
    () => [
      {
        field: 'clinicName',
        headerName: 'Clinic',
        flex: 1,
        minWidth: 180,
        renderCell: (params) => (
          <span className="flex items-center gap-2">
            <span className="truncate">{params.row.clinicName}</span>
            {params.row.isActive ? null : <Badge variant="outline">Inactive</Badge>}
          </span>
        ),
      },
      {
        field: 'zoneCode',
        headerName: 'Zone',
        width: 110,
        valueGetter: (_value, row) => zoneLabel(row.zoneCode),
      },
      { field: 'patients', headerName: 'Patients', type: 'number', width: 100 },
      { field: 'encounters', headerName: 'Encounters', type: 'number', width: 110 },
      {
        field: 'openWork',
        headerName: 'Open work',
        type: 'number',
        width: 110,
        valueGetter: (_value, row) => openWork(row),
      },
      {
        field: 'hypertensionScreeningRate',
        headerName: 'BP screened',
        width: 160,
        sortable: false,
        valueGetter: (_value, row) => formatRate(row.hypertensionScreeningRate),
      },
      { field: 'activeStaff', headerName: 'Staff', type: 'number', width: 90 },
      {
        field: 'drilldown',
        headerName: '',
        width: 150,
        sortable: false,
        renderCell: (params) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openClinic(params.row)}
            aria-label={`Open the ${params.row.clinicName} dashboard`}
          >
            Open dashboard
          </Button>
        ),
      },
    ],
    // openClinic reads the router and bootstrap context, both stable for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Reporting"
        title="Organization report"
        description="Every clinic in an organization at once, with a way back into any one of them."
        helpTitle="How these numbers are counted"
        helpText={
          <div className="space-y-2">
            <p>
              Activity counts cover the last 30 days, on the organization&apos;s own calendar. Open
              work (drafts, notes awaiting review, notes ready to finalize) is what each clinic is
              carrying right now, however old.
            </p>
            <p>
              Organization-wide rates are recalculated from the combined counts, so a small clinic
              does not weigh as much as a large one. Staff are counted once, even if they work at
              several clinics. Patients merged into another chart are not counted.
            </p>
          </div>
        }
      />

      <ResourceState
        state={organizations}
        errorTitle="The organization list could not be loaded"
        isEmpty={(data) => data.length === 0}
        empty={{
          title: 'No organizations yet',
          description: 'Create a clinic first; its organization appears here.',
        }}
      >
        {(list) => (
          <div className="max-w-sm space-y-2">
            <Label htmlFor="report-organization">Organization</Label>
            <Select value={organizationId ?? undefined} onValueChange={setOrganizationId}>
              <SelectTrigger id="report-organization">
                <SelectValue placeholder="Choose an organization" />
              </SelectTrigger>
              <SelectContent>
                {list.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </ResourceState>

      {organizationId ? (
        <ResourceState
          state={report}
          errorTitle="The organization report could not be loaded"
          skeleton={<SectionSkeleton lines={6} />}
        >
          {(data) => (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardKpiCard
                  title="Clinics"
                  value={data.totals.clinics}
                  hint={`${data.totals.activeClinics} active`}
                  icon={Building2}
                />
                <DashboardKpiCard
                  title="Patients"
                  value={data.totals.patients.toLocaleString()}
                  hint={`${data.totals.newPatients.toLocaleString()} registered in ${data.windowDays} days`}
                  icon={Users}
                />
                <DashboardKpiCard
                  title="Encounters"
                  value={data.totals.encounters.toLocaleString()}
                  hint={`Last ${data.windowDays} days, ${data.totals.finalized.toLocaleString()} finalized`}
                  icon={Activity}
                />
                <DashboardKpiCard
                  title="Open work"
                  value={openWork(data.totals).toLocaleString()}
                  hint={`${data.totals.openDrafts} drafts, ${data.totals.awaitingReview} awaiting review, ${data.totals.readyToFinalize} ready to finalize`}
                  icon={ClipboardList}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
                <TrendChart
                  title="Encounters per day"
                  hint={`All ${data.organization.name} clinics, last ${data.windowDays} days`}
                  data={data.encounterTrend}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Care quality</CardTitle>
                    <CardDescription>Across every clinic, from combined counts.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-3 text-sm">
                      {[
                        ['Blood pressure screened', data.totals.hypertensionScreeningRate],
                        ['Diabetes screened', data.totals.diabetesScreeningRate],
                        ['Care plans with a follow-up date', data.totals.followUpRate],
                      ].map(([label, value]) => (
                        <div key={label as string} className="flex flex-wrap justify-between gap-2">
                          <dt className="text-muted-foreground">{label as string}</dt>
                          <dd className="font-medium text-foreground">
                            {formatRate(value as OrganizationReport['totals']['followUpRate'])}
                          </dd>
                        </div>
                      ))}
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-muted-foreground">Active staff</dt>
                        <dd className="font-medium text-foreground">{data.totals.activeStaff}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </div>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="text-lg">By clinic</CardTitle>
                  <CardDescription>
                    Open any clinic&apos;s own dashboard to see its detail.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Box sx={{ width: '100%' }}>
                    <DataGrid
                      rows={data.clinics}
                      columns={columns}
                      getRowId={(row) => row.clinicId}
                      autoHeight
                      disableRowSelectionOnClick
                      pageSizeOptions={[25, 50]}
                      initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                      sx={dataGridSx}
                    />
                  </Box>
                </CardContent>
              </Card>
            </div>
          )}
        </ResourceState>
      ) : null}
    </div>
  );
}
