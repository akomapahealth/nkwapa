'use client';

import type { ReactNode } from 'react';
import { DistributionChart } from './DistributionChart';
import { HYPERTENSION_ORDER, HYPERTENSION_TONES, toLabelledDistribution } from '@/lib/hypertension';
import { ClipboardList, Stethoscope } from 'lucide-react';
import { DashboardActionRow } from './DashboardActionRow';
import { TrendChart } from './TrendChart';
import { DataTable } from '@/components/ui/data-table';
import { recentVisitColumns, type RecentVisit } from './recent-visit-columns';

interface DoctorDashboardProps {
  hypertensionDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
  finalizationsTrend: { date: string; count: number }[];
  recentEncounters: RecentVisit[];
  /** The doctor's Needs you now rows, set first in the wide column (pilot `#s-dash-doctor`). */
  needs?: ReactNode;
  /** Further work below the two columns, e.g. the doctor's recent reviews. */
  children?: ReactNode;
}

/**
 * A doctor's own work under their greeting and figure strip (W2): what waits for sign-off and
 * cosign, then their finalizations, beside how this clinic's readings are classified. The counts
 * a doctor tracks (queue, finalized today and this week, cosigns) are in the strip above.
 */
export function DoctorDashboard({
  hypertensionDistribution,
  diabetesStats,
  finalizationsTrend,
  recentEncounters,
  needs,
  children,
}: DoctorDashboardProps) {
  return (
    <div className="space-y-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          {needs}
          <TrendChart
            title="Finalized in the last 14 days"
            titleAs="h2"
            data={finalizationsTrend}
            color="hsl(var(--chart-1))"
            hint="Daily count of visits finalized by this doctor."
            emptyMessage="No visits have been finalized in this date range yet. Finalized encounters will appear here automatically."
          />
        </div>
        <div className="min-w-0 space-y-8">
          <DistributionChart
            title="Blood pressure levels"
            titleAs="h2"
            data={toLabelledDistribution(hypertensionDistribution)}
            order={HYPERTENSION_ORDER}
            tones={HYPERTENSION_TONES}
            layout="horizontal"
            hint="How recent hypertension assessments are classified in this clinic, from normal to crisis."
            emptyMessage="No hypertension assessments have been recorded for this clinic yet."
          />
          <DistributionChart
            title="Diabetes screening results"
            titleAs="h2"
            data={{
              Flagged: diabetesStats.flagged,
              Normal: Math.max(diabetesStats.total - diabetesStats.flagged, 0),
            }}
            layout="horizontal"
            hint="Flagged screenings compared with normal results in this clinic."
            emptyMessage="No diabetes screenings have been recorded for this clinic yet."
          />
        </div>
      </div>

      <section className="space-y-4 border-t-2 border-rule-strong pt-3">
        <h2 className="type-section-title pt-2.5 text-foreground">Recently finalized visits</h2>
        <DashboardActionRow
          actions={[
            { href: '/my/assigned', label: 'My tasks', icon: Stethoscope },
            { href: '/queues', label: 'Open queues', icon: ClipboardList },
          ]}
        />
        <div className="overflow-y-hidden">
          <DataTable
            caption="Recent encounters"
            columns={recentVisitColumns}
            data={recentEncounters}
            pageSizeOptions={[10]}
            initialPageSize={10}
          />
        </div>
      </section>
      {children}
    </div>
  );
}
