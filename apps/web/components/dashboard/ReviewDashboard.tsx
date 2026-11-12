'use client';

import { ClipboardList } from 'lucide-react';
import { DashboardActionRow } from './DashboardActionRow';
import { DataTable } from '@/components/ui/data-table';
import { recentVisitColumns, type RecentVisit } from './recent-visit-columns';

/**
 * The visits a doctor reviewed most recently, under their home (W2). What waits for review is a
 * Needs you now row; the review counts and charts left the home with the role tabs.
 */
export function ReviewDashboard({ recentReviews }: { recentReviews: RecentVisit[] }) {
  return (
    <section className="space-y-4 border-t-2 border-rule-strong pt-3">
      <h2 className="type-section-title pt-2.5 text-foreground">Recent reviews</h2>
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
  );
}
