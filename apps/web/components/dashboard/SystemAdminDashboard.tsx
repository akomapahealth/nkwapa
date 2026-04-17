'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { Building2, Users, Activity } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { TrendChart } from './TrendChart';

interface ClinicComparisonRow {
  clinicId: string;
  clinicName: string;
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
}

const columns: GridColDef[] = [
  { field: 'clinicName', headerName: 'Clinic', flex: 1 },
  {
    field: 'totalPatients',
    headerName: 'Patients',
    width: 120,
    type: 'number',
  },
  {
    field: 'totalEncounters',
    headerName: 'Encounters',
    width: 120,
    type: 'number',
  },
  {
    field: 'totalFinalized',
    headerName: 'Finalized',
    width: 120,
    type: 'number',
  },
];

export function SystemAdminDashboard({
  totalClinics,
  totalUsers,
  systemWidePatients,
  systemWideEncounters,
  systemEncountersTrend,
  clinicComparison,
}: SystemAdminDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Network overview"
        hint="Use this section to compare activity across clinics and spot where support is needed."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          title="Clinics"
          value={totalClinics}
          icon={Building2}
          hint="Clinics currently active in the platform."
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
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Clinic comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ height: 400, width: '100%' }} className="overflow-x-auto overflow-y-hidden">
            <DataGrid
              rows={clinicComparison}
              columns={columns}
              getRowId={(row) => row.clinicId}
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
