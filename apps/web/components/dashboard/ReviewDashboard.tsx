'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { DashboardActionRow } from './DashboardActionRow';
import { TrendChart } from './TrendChart';
import { DistributionChart } from './DistributionChart';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

interface ReviewDashboardProps {
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

const columns: DataTableColumn<ReviewDashboardProps['recentReviews'][number]>[] = [
  { id: 'patientCode', accessorKey: 'patientCode', header: 'Patient Code' },
  { id: 'patientName', accessorKey: 'patientName', header: 'Patient Name' },
  { id: 'status', accessorKey: 'status', header: 'Status' },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ getValue }) => {
      const v = getValue() as string | number | null | undefined;
      return v ? new Date(v).toLocaleDateString() : '';
    },
  },
];

export function ReviewDashboard({
  awaitingReview,
  reviewsCompleted,
  reviewsTrend,
  bpDistribution,
  recentReviews,
}: ReviewDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Review queue"
        hint="Use this section to clear visits that still need clinical review."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardKpiCard
          title="Waiting for review"
          value={awaitingReview}
          hint="Visits in review that have not yet been reviewed."
        />
        <DashboardKpiCard
          title="Reviewed today"
          value={reviewsCompleted.today}
          hint="Visits you reviewed today."
        />
        <DashboardKpiCard
          title="Reviewed this week"
          value={reviewsCompleted.week}
          hint="Visits you reviewed this week."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart
          title="Reviews in the last 14 days"
          data={reviewsTrend}
          color="hsl(var(--chart-1))"
          hint="Daily count of visits you reviewed."
        />
        <DistributionChart
          title="Blood pressure levels in your reviews"
          data={bpDistribution}
          hint="How the blood pressure assessments in your reviewed visits are classified."
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent reviews</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DashboardActionRow
            actions={[{ href: '/queues', label: 'Open queues', icon: ClipboardList }]}
          />
          <div className="overflow-y-hidden">
            <DataTable
              caption="Recent reviews"
              columns={columns}
              data={recentReviews}
              pageSizeOptions={[10]}
              initialPageSize={10}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
