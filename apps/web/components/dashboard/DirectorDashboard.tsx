'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendChart } from './TrendChart';
import { DistributionChart } from './DistributionChart';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';

interface StaffActivityRow {
  userId: string;
  displayName: string;
  role: string;
  encountersCreated: number;
  encountersFinalized: number;
}

interface DirectorDashboardProps {
  patientRegistrationTrend: { date: string; count: number }[];
  encounterVolumeTrend: { date: string; count: number }[];
  screeningRates: { hypertension: number; diabetes: number };
  bpDistribution: Record<string, number>;
  followUpComplianceRate: number;
  staffActivity: StaffActivityRow[];
  encounterStatusDistribution: Record<string, number>;
  pendingClinicalNoteCosigns?: number;
}

const staffColumns: GridColDef[] = [
  { field: 'displayName', headerName: 'Staff Name', flex: 1 },
  { field: 'role', headerName: 'Role', width: 130 },
  {
    field: 'encountersCreated',
    headerName: 'Created',
    width: 100,
    type: 'number',
  },
  {
    field: 'encountersFinalized',
    headerName: 'Finalized',
    width: 100,
    type: 'number',
  },
];

export function DirectorDashboard({
  patientRegistrationTrend,
  encounterVolumeTrend,
  screeningRates,
  bpDistribution,
  followUpComplianceRate,
  staffActivity,
  encounterStatusDistribution,
  pendingClinicalNoteCosigns,
}: DirectorDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Clinic trends"
        hint="Use this section to watch how the clinic is performing across patient flow and follow-up."
      />

      {pendingClinicalNoteCosigns !== undefined ? (
        <div className="grid gap-4 sm:max-w-sm">
          <DashboardKpiCard
            title="Pending HAP cosigns"
            value={pendingClinicalNoteCosigns}
            hint="Clinic-level operational count only. Clinical note content remains restricted."
          />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart
          title="Patient registrations in the last 30 days"
          data={patientRegistrationTrend}
          color="hsl(var(--chart-1))"
          hint="Daily count of new patient registrations in this clinic."
        />
        <TrendChart
          title="Visit volume in the last 30 days"
          data={encounterVolumeTrend}
          color="hsl(var(--chart-2))"
          hint="Daily count of visits created in this clinic."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <DistributionChart
          title="Queue status"
          data={encounterStatusDistribution}
          type="bar"
          hint="How visits are distributed across draft, review, and finalized stages."
        />
        <DistributionChart
          title="Blood pressure levels"
          data={bpDistribution}
          type="bar"
          hint="How recent hypertension assessments are classified in this clinic."
        />
        <DistributionChart
          title="Screening coverage"
          data={{
            Hypertension: screeningRates.hypertension,
            Diabetes: screeningRates.diabetes,
          }}
          type="bar"
          hint="How often hypertension and diabetes screenings are being completed."
        />
        <AppMetricCard
          className="lg:col-span-1"
          title="Follow-up compliance"
          value={`${followUpComplianceRate}%`}
          detail="Care plans with a follow-up date"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Staff activity summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ height: 400, width: '100%' }} className="overflow-x-auto overflow-y-hidden">
            <DataGrid
              rows={staffActivity}
              columns={staffColumns}
              getRowId={(row) => row.userId}
              pageSizeOptions={[10]}
              disableRowSelectionOnClick
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
              }}
              sx={{ ...dataGridSx, minWidth: 560 }}
            />
          </Box>
        </CardContent>
      </Card>
    </section>
  );
}
