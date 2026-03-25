"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { UserPlus, ClipboardList, Stethoscope } from "lucide-react";
import { DashboardSectionHeader } from "./DashboardSectionHeader";
import { DashboardKpiCard } from "./DashboardKpiCard";
import { DashboardActionRow } from "./DashboardActionRow";
import { TrendChart } from "./TrendChart";
import { DistributionChart } from "./DistributionChart";

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
        title="Your activity"
        subtitle="Patients and encounters you've registered today"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardKpiCard
          title="Registered Today"
          value={patientsRegisteredToday}
          icon={UserPlus}
        />
        <DashboardKpiCard
          title="Encounters Today"
          value={encountersCreatedToday}
          icon={ClipboardList}
        />
        <DashboardKpiCard title="Pending Submissions" value={pendingSubmissions} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart
          title="Patients registered (14 days)"
          data={patientsRegisteredTrend}
          color="hsl(var(--chart-1))"
        />
        <TrendChart
          title="Encounters created (14 days)"
          data={encountersCreatedTrend}
          color="hsl(var(--chart-2))"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        <DistributionChart
          title="Encounter status"
          data={statusBreakdown}
          type="bar"
        />
        <DistributionChart
          title="BP classification (your encounters)"
          data={bpDistribution}
          type="bar"
        />
        <DistributionChart
          title="Diabetes screening"
          data={{
            Flagged: diabetesStats.flagged,
            Normal: diabetesStats.total - diabetesStats.flagged,
          }}
          type="bar"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <DashboardActionRow
            actions={[
              { href: "/patients/new", label: "Register Patient", icon: UserPlus },
              { href: "/my/assigned", label: "My Assigned", icon: Stethoscope },
              { href: "/queues", label: "View Queues", icon: ClipboardList },
            ]}
          />
        </CardContent>
      </Card>
    </section>
  );
}
