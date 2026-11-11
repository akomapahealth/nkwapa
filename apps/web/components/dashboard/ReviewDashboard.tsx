'use client';

import { ClipboardList } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { DashboardActionRow } from './DashboardActionRow';
import { TrendChart } from './TrendChart';
import { DistributionChart } from './DistributionChart';
import { DataTable } from '@/components/ui/data-table';
import { recentVisitColumns, type RecentVisit } from './recent-visit-columns';
import { AppMetricGroup } from '@/components/app-shell/AppMetricCard';

interface ReviewDashboardProps {
  awaitingReview: number;
  reviewsCompleted: { today: number; week: number };
  reviewsTrend: { date: string; count: number }[];
  bpDistribution: Record<string, number>;
  recentReviews: RecentVisit[];
}

export function ReviewDashboard({
  reviewsCompleted,
  reviewsTrend,
  bpDistribution,
  recentReviews,
}: ReviewDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Review queue"
        hint="Visits you reviewed and their blood pressure levels. Visits waiting for review are under Needs you now."
      />

      {/* What is waiting leads the page as a "Needs you now" row; these are done work. */}
      <AppMetricGroup className="sm:grid-cols-2">
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
      </AppMetricGroup>

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

      <section className="space-y-4 border-t-2 border-rule-strong pt-3">
        <h3 className="type-label pt-2.5 text-foreground">Recent reviews</h3>
        <DashboardActionRow
          actions={[{ href: '/queues', label: 'Open queues', icon: ClipboardList }]}
        />
        <div className="overflow-y-hidden">
          <DataTable
            caption="Recent reviews"
            columns={recentVisitColumns}
            data={recentReviews}
            pageSizeOptions={[10]}
            initialPageSize={10}
          />
        </div>
      </section>
    </section>
  );
}
