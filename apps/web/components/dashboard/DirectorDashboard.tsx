"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrendChart } from "./TrendChart";
import { DistributionChart } from "./DistributionChart";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";

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
}

const staffColumns: GridColDef[] = [
  { field: "displayName", headerName: "Staff Name", flex: 1 },
  { field: "role", headerName: "Role", width: 130 },
  {
    field: "encountersCreated",
    headerName: "Created",
    width: 100,
    type: "number",
  },
  {
    field: "encountersFinalized",
    headerName: "Finalized",
    width: 100,
    type: "number",
  },
];

export function DirectorDashboard({
  patientRegistrationTrend,
  encounterVolumeTrend,
  screeningRates,
  bpDistribution,
  followUpComplianceRate,
  staffActivity,
}: DirectorDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart
          title="Patient Registrations (30 days)"
          data={patientRegistrationTrend}
          color="hsl(var(--chart-1))"
        />
        <TrendChart
          title="Encounter Volume (30 days)"
          data={encounterVolumeTrend}
          color="hsl(var(--chart-2))"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        <DistributionChart
          title="BP Classification"
          data={bpDistribution}
          type="bar"
        />
        <DistributionChart
          title="Screening Coverage"
          data={{
            Hypertension: screeningRates.hypertension,
            Diabetes: screeningRates.diabetes,
          }}
          type="bar"
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Follow-up Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">
                {followUpComplianceRate}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Patients with scheduled follow-up
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Staff Activity Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
            <DataGrid
              rows={staffActivity}
              columns={staffColumns}
              getRowId={(row) => row.userId}
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
