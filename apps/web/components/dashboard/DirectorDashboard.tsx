'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendChart } from './TrendChart';
import { DistributionChart } from './DistributionChart';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { DashboardSectionHeader } from './DashboardSectionHeader';

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
}: DirectorDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Clinic trends"
        subtitle="Patient volume, screening coverage, queue status, and staff activity."
        hint="Use this section to watch how the clinic is performing across patient flow and follow-up."
      />

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
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Follow-up compliance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">{followUpComplianceRate}%</div>
              <p className="mt-1 text-sm text-muted-foreground">Care plans with a follow-up date</p>
            </div>
          </CardContent>
        </Card>
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
