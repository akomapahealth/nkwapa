'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { Building2, Users, Activity, Map } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { TrendChart } from './TrendChart';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  zoneFilterFromSelect,
  zoneFilterLabel,
  zoneFilterOptions,
  zoneFilterToSelect,
  zoneLabel,
  type ZoneFilter,
  type ZoneSummary,
} from '@/lib/clinic-zones';

interface ClinicComparisonRow {
  clinicId: string;
  clinicName: string;
  zoneCode: string | null;
  totalPatients: number;
  totalEncounters: number;
  totalFinalized: number;
}

interface SystemAdminDashboardProps {
  totalClinics: number;
  totalUsers: number;
  systemWidePatients: number;
  systemWideEncounters: number;
  systemEncountersTrend: { date: string; count: number }[];
  clinicComparison: ClinicComparisonRow[];
  zones: ZoneSummary[];
  appliedZoneCode: string | null;
  zoneFilter: ZoneFilter;
  onZoneFilterChange: (filter: ZoneFilter) => void;
  isRefreshing?: boolean;
}

const columns: GridColDef[] = [
  { field: 'clinicName', headerName: 'Clinic', flex: 1, minWidth: 160 },
  {
    field: 'zoneCode',
    headerName: 'Zone',
    width: 140,
    renderCell: (params) =>
      params.row.zoneCode ? (
        <span className="font-mono text-xs">{params.row.zoneCode}</span>
      ) : (
        <span className="text-muted-foreground">{zoneLabel(null)}</span>
      ),
  },
  { field: 'totalPatients', headerName: 'Patients', width: 120, type: 'number' },
  { field: 'totalEncounters', headerName: 'Encounters', width: 120, type: 'number' },
  { field: 'totalFinalized', headerName: 'Finalized', width: 120, type: 'number' },
];

export function SystemAdminDashboard({
  totalClinics,
  totalUsers,
  systemWidePatients,
  systemWideEncounters,
  systemEncountersTrend,
  clinicComparison,
  zones,
  appliedZoneCode,
  zoneFilter,
  onZoneFilterChange,
  isRefreshing = false,
}: SystemAdminDashboardProps) {
  const zoneOptions = useMemo(() => zoneFilterOptions(zones), [zones]);
  const zonedCount = zones.filter((zone) => zone.zoneCode !== null).length;

  /*
    The control is driven by local state, but everything that *describes* the table reads the
    zone the server says it applied. Mid-refetch the two differ for a moment, and describing the
    rows by the pending filter would caption a table with a zone it is not showing yet.
  */
  const shownZone = appliedZoneCode;

  // Totals for what is on screen, not for the network. With a zone applied the network KPIs
  // above still describe the whole network, so without these the table and the cards would be
  // answering different questions side by side.
  const shownPatients = clinicComparison.reduce((sum, row) => sum + row.totalPatients, 0);
  const shownEncounters = clinicComparison.reduce((sum, row) => sum + row.totalEncounters, 0);
  const isFiltered = shownZone !== null;

  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Network overview"
        hint="Use this section to compare activity across clinics and zones, and spot where support is needed."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <DashboardKpiCard
          title="Clinics"
          value={totalClinics}
          icon={Building2}
          hint="Clinics currently active in the platform."
        />
        <DashboardKpiCard
          title="Zones"
          value={zonedCount}
          icon={Map}
          hint="Reporting zones in use across the network."
        />
        <DashboardKpiCard
          title="Staff accounts"
          value={totalUsers}
          icon={Users}
          hint="Active users across all clinics."
        />
        <DashboardKpiCard
          title="Patients across clinics"
          value={systemWidePatients}
          hint="Patients recorded across the full network."
        />
        <DashboardKpiCard
          title="Visits across clinics"
          value={systemWideEncounters}
          icon={Activity}
          hint="Visits recorded across the full network."
        />
      </div>

      <TrendChart
        title="Visits across clinics in the last 30 days"
        data={systemEncountersTrend}
        color="hsl(var(--chart-1))"
        hint="Daily visit count across every clinic."
      />

      <Card>
        <CardHeader className="space-y-3 pb-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <CardTitle className="text-sm font-medium">Clinic comparison</CardTitle>
            <div className="space-y-2 lg:w-64">
              <Label htmlFor="network-zone-filter">Zone</Label>
              <Select
                value={zoneFilterToSelect(zoneFilter)}
                onValueChange={(value) => onZoneFilterChange(zoneFilterFromSelect(value))}
              >
                <SelectTrigger id="network-zone-filter">
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
          </div>
          <ActiveFilterSummary
            items={[
              { label: 'Zone', value: zoneFilterLabel(shownZone) },
              { label: 'Clinics shown', value: clinicComparison.length },
              ...(isFiltered
                ? [
                    { label: 'Patients in view', value: shownPatients },
                    { label: 'Visits in view', value: shownEncounters },
                  ]
                : []),
            ]}
            emptyLabel="All zones"
          />
        </CardHeader>
        <CardContent>
          {clinicComparison.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
              <p>
                {isFiltered
                  ? `No clinic is in ${zoneFilterLabel(shownZone)}.`
                  : 'No clinic has any activity to compare yet.'}
              </p>
              {isFiltered ? (
                <Button variant="outline" className="mt-3" onClick={() => onZoneFilterChange(null)}>
                  Show all zones
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {/*
                Card list below md, grid above -- the same dual tree the clinic registry uses.
                This table was previously a bare DataGrid with a 560px floor, so on a phone the
                only way to read the last column was to scroll a nested region sideways.
              */}
              <ul className="space-y-3 md:hidden">
                {clinicComparison.map((row) => (
                  <li
                    key={row.clinicId}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="min-w-0 truncate text-base font-semibold text-foreground">
                        {row.clinicName}
                      </h4>
                      <span
                        className={
                          row.zoneCode
                            ? 'shrink-0 font-mono text-xs text-foreground'
                            : 'shrink-0 text-xs text-muted-foreground'
                        }
                      >
                        {zoneLabel(row.zoneCode)}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Patients</dt>
                        <dd className="tabular-nums text-foreground">{row.totalPatients}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Encounters</dt>
                        <dd className="tabular-nums text-foreground">{row.totalEncounters}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Finalized</dt>
                        <dd className="tabular-nums text-foreground">{row.totalFinalized}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              <Box
                sx={{ height: 400, width: '100%' }}
                className="hidden overflow-x-auto overflow-y-hidden md:block"
              >
                <DataGrid
                  rows={clinicComparison}
                  columns={columns}
                  loading={isRefreshing}
                  getRowId={(row) => row.clinicId}
                  pageSizeOptions={[10]}
                  disableRowSelectionOnClick
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  sx={{ ...dataGridSx, minWidth: 640 }}
                />
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
