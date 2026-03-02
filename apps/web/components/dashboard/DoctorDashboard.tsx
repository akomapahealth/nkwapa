"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DistributionChart } from "./DistributionChart";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";

interface DoctorDashboardProps {
  awaitingFinalization: number;
  patientsSeen: { today: number; week: number; month: number };
  followUpComplianceRate: number;
  hypertensionDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
  recentEncounters: {
    id: string;
    patientCode: string;
    patientName: string;
    status: string;
    createdAt: string;
  }[];
}

const columns: GridColDef[] = [
  { field: "patientCode", headerName: "Patient Code", width: 140 },
  { field: "patientName", headerName: "Patient Name", flex: 1 },
  { field: "status", headerName: "Status", width: 120 },
  {
    field: "createdAt",
    headerName: "Date",
    width: 160,
    valueFormatter: (v: string) =>
      v ? new Date(v).toLocaleDateString() : "",
  },
];

export function DoctorDashboard({
  awaitingFinalization,
  patientsSeen,
  followUpComplianceRate,
  hypertensionDistribution,
  diabetesStats,
  recentEncounters,
}: DoctorDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Awaiting Finalization" value={awaitingFinalization} />
        <StatCard title="Seen Today" value={patientsSeen.today} />
        <StatCard title="Seen This Week" value={patientsSeen.week} />
        <StatCard
          title="Follow-up Compliance"
          value={`${followUpComplianceRate}%`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DistributionChart
          title="Hypertension Classification"
          data={hypertensionDistribution}
          type="pie"
        />
        <DistributionChart
          title="Diabetes Screening"
          data={{
            Flagged: diabetesStats.flagged,
            Normal: diabetesStats.total - diabetesStats.flagged,
          }}
          type="bar"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Recent Finalized Encounters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
            <DataGrid
              rows={recentEncounters}
              columns={columns}
              pageSizeOptions={[10]}
              disableRowSelectionOnClick
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
              }}
              sx={dataGridSx}
            />
          </Box>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: number | string;
}) {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary">{value}</div>
      </CardContent>
    </Card>
  );
}
