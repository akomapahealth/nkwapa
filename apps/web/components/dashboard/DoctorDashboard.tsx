'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DistributionChart } from './DistributionChart';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { ClipboardList, Stethoscope } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { DashboardActionRow } from './DashboardActionRow';
import { TrendChart } from './TrendChart';

interface DoctorDashboardProps {
  awaitingFinalization: number;
  patientsSeen: { today: number; week: number; month: number };
  followUpComplianceRate: number;
  hypertensionDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
  finalizationsTrend: { date: string; count: number }[];
  recentEncounters: {
    id: string;
    patientCode: string;
    patientName: string;
    status: string;
    createdAt: string;
  }[];
}

const columns: GridColDef[] = [
  { field: 'patientCode', headerName: 'Patient Code', width: 140 },
  { field: 'patientName', headerName: 'Patient Name', flex: 1 },
  { field: 'status', headerName: 'Status', width: 120 },
  {
    field: 'createdAt',
    headerName: 'Date',
    width: 160,
    valueFormatter: (v: string) => (v ? new Date(v).toLocaleDateString() : ''),
  },
];

export function DoctorDashboard({
  awaitingFinalization,
  patientsSeen,
  followUpComplianceRate,
  hypertensionDistribution,
  diabetesStats,
  finalizationsTrend,
  recentEncounters,
}: DoctorDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Doctor queue"
        subtitle="Visits waiting for your sign-off and recent clinical trends."
        hint="Use this section to spot visits that still need a doctor's final decision."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          title="Waiting for sign-off"
          value={awaitingFinalization}
          hint="Visits already reviewed by a preceptor but not yet finalized by a doctor."
        />
        <DashboardKpiCard
          title="Finalized today"
          value={patientsSeen.today}
          icon={Stethoscope}
          hint="Visits you finalized today."
        />
        <DashboardKpiCard
          title="Finalized this week"
          value={patientsSeen.week}
          hint="Visits you finalized this week."
        />
        <DashboardKpiCard
          title="Follow-up scheduled"
          value={`${followUpComplianceRate}%`}
          hint="Share of care plans in this clinic that include a follow-up date."
        />
      </div>

      <TrendChart
        title="Finalizations in the last 14 days"
        data={finalizationsTrend}
        color="hsl(var(--chart-1))"
        hint="Daily count of visits finalized by this doctor."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <DistributionChart
          title="Blood pressure levels"
          data={hypertensionDistribution}
          type="pie"
          hint="How recent hypertension assessments are classified in this clinic."
        />
        <DistributionChart
          title="Diabetes screening results"
          data={{
            Flagged: diabetesStats.flagged,
            Normal: diabetesStats.total - diabetesStats.flagged,
          }}
          type="bar"
          hint="Flagged screenings compared with normal results in this clinic."
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recently finalized visits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DashboardActionRow
            actions={[
              { href: '/my/assigned', label: 'My tasks', icon: Stethoscope },
              { href: '/queues', label: 'Open queues', icon: ClipboardList },
            ]}
          />
          <Box sx={{ height: 400, width: '100%' }} className="overflow-x-auto overflow-y-hidden">
            <DataGrid
              rows={recentEncounters}
              columns={columns}
              pageSizeOptions={[10]}
              disableRowSelectionOnClick
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
              }}
              sx={{ ...dataGridSx, minWidth: 620 }}
            />
          </Box>
        </CardContent>
      </Card>
    </section>
  );
}
