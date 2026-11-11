'use client';

import { DistributionChart } from './DistributionChart';
import { HYPERTENSION_ORDER, HYPERTENSION_TONES, toLabelledDistribution } from '@/lib/hypertension';
import { ClipboardList, Stethoscope } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { DashboardActionRow } from './DashboardActionRow';
import { TrendChart } from './TrendChart';
import { DataTable } from '@/components/ui/data-table';
import { recentVisitColumns, type RecentVisit } from './recent-visit-columns';
import { AppMetricGroup } from '@/components/app-shell/AppMetricCard';

interface DoctorDashboardProps {
  awaitingFinalization: number;
  patientsSeen: { today: number; week: number; month: number };
  followUpComplianceRate: number;
  hypertensionDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
  finalizationsTrend: { date: string; count: number }[];
  recentEncounters: RecentVisit[];
  pendingClinicalNoteCosigns?: number;
}

export function DoctorDashboard({
  patientsSeen,
  followUpComplianceRate,
  hypertensionDistribution,
  diabetesStats,
  finalizationsTrend,
  recentEncounters,
}: DoctorDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Doctor queue"
        hint="Visits you finalized and how this clinic's readings are classified. Visits waiting for your sign-off are under Needs you now."
      />

      {/* Sign-off and cosign counts lead the page as "Needs you now" rows; these are done work. */}
      <AppMetricGroup className="sm:grid-cols-3">
        <DashboardKpiCard
          title="Finalized today"
          value={patientsSeen.today}
          icon={Stethoscope}
          hint="Visits you finalized today."
        />
        <DashboardKpiCard
          title="Finalized this week"
          value={patientsSeen.week}
          hint="Visits you finalized this week."
        />
        <DashboardKpiCard
          title="Follow-up scheduled"
          value={`${followUpComplianceRate}%`}
          hint="Share of care plans in this clinic that include a follow-up date."
        />
      </AppMetricGroup>

      <TrendChart
        title="Finalizations in the last 14 days"
        data={finalizationsTrend}
        color="hsl(var(--chart-1))"
        hint="Daily count of visits finalized by this doctor."
        emptyMessage="No visits have been finalized in this date range yet. Finalized encounters will appear here automatically."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <DistributionChart
          title="Blood pressure levels"
          data={toLabelledDistribution(hypertensionDistribution)}
          order={HYPERTENSION_ORDER}
          tones={HYPERTENSION_TONES}
          layout="horizontal"
          hint="How recent hypertension assessments are classified in this clinic, from normal to crisis."
          emptyMessage="No hypertension assessments have been recorded for this clinic yet."
        />
        <DistributionChart
          title="Diabetes screening results"
          data={{
            Flagged: diabetesStats.flagged,
            Normal: Math.max(diabetesStats.total - diabetesStats.flagged, 0),
          }}
          hint="Flagged screenings compared with normal results in this clinic."
          emptyMessage="No diabetes screenings have been recorded for this clinic yet."
        />
      </div>

      <section className="space-y-4 border-t-2 border-rule-strong pt-3">
        <h3 className="type-label pt-2.5 text-foreground">Recently finalized visits</h3>
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
    </section>
  );
}
