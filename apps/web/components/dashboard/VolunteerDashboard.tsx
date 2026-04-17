'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { UserPlus, ClipboardList, Stethoscope } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { DashboardActionRow } from './DashboardActionRow';
import { TrendChart } from './TrendChart';
import { DistributionChart } from './DistributionChart';

interface VolunteerDashboardProps {
  patientsRegisteredToday: number;
  encountersCreatedToday: number;
  pendingSubmissions: number;
  patientsRegisteredTrend: { date: string; count: number }[];
  encountersCreatedTrend: { date: string; count: number }[];
  statusBreakdown: Record<string, number>;
  bpDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
}

export function VolunteerDashboard({
  patientsRegisteredToday,
  encountersCreatedToday,
  pendingSubmissions,
  patientsRegisteredTrend,
  encountersCreatedTrend,
  statusBreakdown,
  bpDistribution,
  diabetesStats,
}: VolunteerDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Your work today"
        hint="Use this section to track your intake work and move patients to the next step."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardKpiCard
          title="Patients added today"
          value={patientsRegisteredToday}
          icon={UserPlus}
          hint="Patients you registered today."
        />
        <DashboardKpiCard
          title="Visits started today"
          value={encountersCreatedToday}
          icon={ClipboardList}
          hint="Visits you created today."
        />
        <DashboardKpiCard
          title="Draft visits"
          value={pendingSubmissions}
          hint="Visits you started but have not submitted yet."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart
          title="Patients added in the last 14 days"
          data={patientsRegisteredTrend}
          color="hsl(var(--chart-1))"
          hint="Daily count of patients you registered."
        />
        <TrendChart
          title="Visits started in the last 14 days"
          data={encountersCreatedTrend}
          color="hsl(var(--chart-2))"
          hint="Daily count of visits you created."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        <DistributionChart
          title="Visit status"
          data={statusBreakdown}
          type="bar"
          hint="Where your visits currently sit in the workflow."
        />
        <DistributionChart
          title="Blood pressure levels in your visits"
          data={bpDistribution}
          type="bar"
          hint="How blood pressure assessments in your visits are classified."
        />
        <DistributionChart
          title="Diabetes screening results"
          data={{
            Flagged: diabetesStats.flagged,
            Normal: diabetesStats.total - diabetesStats.flagged,
          }}
          type="bar"
          hint="Flagged diabetes screenings compared with normal results in your visits."
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <DashboardActionRow
            actions={[
              { href: '/patients/new', label: 'Add patient', icon: UserPlus },
              { href: '/my/assigned', label: 'My tasks', icon: Stethoscope },
              { href: '/queues', label: 'Open queues', icon: ClipboardList },
            ]}
          />
        </CardContent>
      </Card>
    </section>
  );
}
