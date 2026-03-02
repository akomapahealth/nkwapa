"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";

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
  clinicComparison,
}: SystemAdminDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Clinics" value={totalClinics} />
        <StatCard title="Total Users" value={totalUsers} />
        <StatCard title="System Patients" value={systemWidePatients} />
        <StatCard title="System Encounters" value={systemWideEncounters} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Clinic Comparison
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
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
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
