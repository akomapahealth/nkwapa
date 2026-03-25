"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";
import { ClipboardList } from "lucide-react";
import { DashboardSectionHeader } from "./DashboardSectionHeader";
import { DashboardKpiCard } from "./DashboardKpiCard";
import { DashboardActionRow } from "./DashboardActionRow";
import { TrendChart } from "./TrendChart";
import { DistributionChart } from "./DistributionChart";

interface PreceptorDashboardProps {
  awaitingReview: number;
  reviewsCompleted: { today: number; week: number };
  reviewsTrend: { date: string; count: number }[];
  bpDistribution: Record<string, number>;
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
  reviewsTrend,
  bpDistribution,
  recentReviews,
}: PreceptorDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Review queue"
        subtitle="Encounters awaiting your review"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardKpiCard title="Awaiting Review" value={awaitingReview} />
        <DashboardKpiCard title="Reviews Today" value={reviewsCompleted.today} />
        <DashboardKpiCard title="Reviews This Week" value={reviewsCompleted.week} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart
          title="Reviews completed (14 days)"
          data={reviewsTrend}
          color="hsl(var(--chart-1))"
        />
        <DistributionChart
          title="BP classification (your reviews)"
          data={bpDistribution}
          type="bar"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent reviews</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DashboardActionRow
            actions={[{ href: "/queues", label: "View Queues", icon: ClipboardList }]}
          />
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
    </section>
  );
}
