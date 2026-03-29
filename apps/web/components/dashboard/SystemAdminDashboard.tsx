"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";
import { Building2, Users, Activity } from "lucide-react";
import { DashboardSectionHeader } from "./DashboardSectionHeader";
import { DashboardKpiCard } from "./DashboardKpiCard";
import { TrendChart } from "./TrendChart";

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
  { field: "clinicName", headerName: "Clinic", flex: 1 },
  {
    field: "totalPatients",
    headerName: "Patients",
    width: 120,
    type: "number",
  },
  {
    field: "totalEncounters",
    headerName: "Encounters",
    width: 120,
    type: "number",
  },
  {
    field: "totalFinalized",
    headerName: "Finalized",
    width: 120,
    type: "number",
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
        title="System overview"
        subtitle="Cross-clinic metrics and comparison"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard title="Total clinics" value={totalClinics} icon={Building2} />
        <DashboardKpiCard title="Total users" value={totalUsers} icon={Users} />
        <DashboardKpiCard title="System patients" value={systemWidePatients} />
        <DashboardKpiCard title="System encounters" value={systemWideEncounters} icon={Activity} />
      </div>

      <TrendChart
        title="System encounters (30 days)"
        data={systemEncountersTrend}
        color="hsl(var(--chart-1))"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Clinic comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
            <DataGrid
              rows={clinicComparison}
              columns={columns}
              getRowId={(row) => row.clinicId}
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
    </section>
  );
}
