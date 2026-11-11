'use client';

import { useMemo } from 'react';
import { Building2, Users, Activity, Map, UserRound } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { TrendChart } from './TrendChart';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback/AppState';
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
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { AppMetricGroup } from '@/components/app-shell/AppMetricCard';

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

/*
  One table at every width. The name column stays in view while a phone scrolls the counts
  sideways; it replaced a second, boxed card list below md that said the same thing (R4.3).
  The header cell keeps the header band's fill, the body cell the sheet's.
*/
const STICKY_NAME = 'sticky left-0 z-[1] bg-card [thead_&]:bg-surface-2';

const columns: DataTableColumn<ClinicComparisonRow>[] = [
  {
    id: 'clinicName',
    accessorKey: 'clinicName',
    header: 'Clinic',
    meta: { className: STICKY_NAME },
    cell: ({ row: params }) => (
      <span className="font-medium text-foreground">{params.original.clinicName}</span>
    ),
  },
  {
    id: 'zoneCode',
    accessorKey: 'zoneCode',
    header: 'Zone',
    cell: ({ row: params }) =>
      params.original.zoneCode ? (
        <span className="font-mono text-xs">{params.original.zoneCode}</span>
      ) : (
        <span className="text-muted-foreground">{zoneLabel(null)}</span>
      ),
  },
  {
    id: 'totalPatients',
    accessorKey: 'totalPatients',
    header: 'Patients',
    meta: { align: 'right' },
  },
  {
    id: 'totalEncounters',
    accessorKey: 'totalEncounters',
    header: 'Visits',
    meta: { align: 'right' },
  },
  {
    id: 'totalFinalized',
    accessorKey: 'totalFinalized',
    header: 'Finalized',
    meta: { align: 'right' },
  },
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

      <AppMetricGroup className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          icon={UserRound}
          hint="Patients recorded across the full network."
        />
        <DashboardKpiCard
          title="Visits across clinics"
          value={systemWideEncounters}
          icon={Activity}
          hint="Visits recorded across the full network."
        />
      </AppMetricGroup>

      <TrendChart
        title="Visits across clinics in the last 30 days"
        data={systemEncountersTrend}
        color="hsl(var(--chart-1))"
        hint="Daily visit count across every clinic."
      />

      <section className="space-y-3 border-t-2 border-rule-strong pt-3">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <h3 className="type-label pt-2.5 text-foreground">Clinic comparison</h3>
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
        </div>
        {clinicComparison.length === 0 ? (
          <EmptyState
            density="compact"
            icon={Building2}
            title={isFiltered ? 'No clinics in this zone' : 'Nothing to compare yet'}
            description={
              isFiltered
                ? `No clinic is in ${zoneFilterLabel(shownZone)}.`
                : 'No clinic has any activity to compare yet.'
            }
            action={
              isFiltered ? (
                <Button variant="outline" onClick={() => onZoneFilterChange(null)}>
                  Show all zones
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            caption="Clinics compared"
            columns={columns}
            data={clinicComparison}
            getRowId={(row) => row.clinicId}
            isRefreshing={isRefreshing}
            pageSizeOptions={[10]}
            initialPageSize={10}
          />
        )}
      </section>
    </section>
  );
}
