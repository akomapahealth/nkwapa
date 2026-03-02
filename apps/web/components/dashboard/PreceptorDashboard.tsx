"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";

interface PreceptorDashboardProps {
  awaitingReview: number;
  reviewsCompleted: { today: number; week: number };
  recentReviews: {
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

export function PreceptorDashboard({
  awaitingReview,
  reviewsCompleted,
  recentReviews,
}: PreceptorDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Awaiting Review" value={awaitingReview} />
        <StatCard title="Reviews Today" value={reviewsCompleted.today} />
        <StatCard title="Reviews This Week" value={reviewsCompleted.week} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Recent Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
            <DataGrid
              rows={recentReviews}
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
