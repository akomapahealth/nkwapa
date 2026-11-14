'use client';

import { UserPlus, ClipboardList, Stethoscope } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardActionRow } from './DashboardActionRow';
import { TrendChart } from './TrendChart';
import { DistributionChart } from './DistributionChart';
import { HapDraftsList } from './HapDraftsList';

interface VolunteerDashboardProps {
  patientsRegisteredToday: number;
  encountersCreatedToday: number;
  pendingSubmissions: number;
  patientsRegisteredTrend: { date: string; count: number }[];
  encountersCreatedTrend: { date: string; count: number }[];
  statusBreakdown: Record<string, number>;
  bpDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
  clinicalNotes?: { drafts: number; pendingCosign: number };
  /** Lists the author's HAP drafts by patient when there are any (#307). */
  clinicId?: string;
}

export function VolunteerDashboard({
  patientsRegisteredTrend,
  encountersCreatedTrend,
  statusBreakdown,
  bpDistribution,
  diabetesStats,
  clinicalNotes,
  clinicId,
}: VolunteerDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Your work today"
        hint="Use this section to track your intake work and move patients to the next step."
      />

      {/* Personal intake counts already appear in NeedsYouNow. HAP totals retain their scope. */}
      {clinicalNotes ? (
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-rule py-4">
          <div className="flex items-baseline gap-3">
            <dt className="text-sm text-muted-foreground">Your HAP notes</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {clinicalNotes.drafts + clinicalNotes.pendingCosign}
            </dd>
          </div>
          <div>
            <dt className="sr-only">Note status</dt>
            <dd className="text-sm text-muted-foreground">
              {clinicalNotes.drafts} draft · {clinicalNotes.pendingCosign} awaiting cosign
            </dd>
          </div>
        </dl>
      ) : null}

      {clinicId && clinicalNotes && clinicalNotes.drafts > 0 ? (
        <HapDraftsList clinicId={clinicId} />
      ) : null}

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
          hint="Where your visits currently sit in the workflow."
        />
        <DistributionChart
          title="Blood pressure levels in your visits"
          data={bpDistribution}
          hint="How blood pressure assessments in your visits are classified."
        />
        <DistributionChart
          title="Diabetes screening results"
          data={{
            Flagged: diabetesStats.flagged,
            Normal: diabetesStats.total - diabetesStats.flagged,
          }}
          hint="Flagged diabetes screenings compared with normal results in your visits."
        />
      </div>

      <section className="space-y-3 border-t-2 border-rule-strong pt-3">
        <h3 className="type-label pt-2.5 text-foreground">Quick actions</h3>
        <DashboardActionRow
          actions={[
            { href: '/patients/new', label: 'Add patient', icon: UserPlus },
            { href: '/my/assigned', label: 'My tasks', icon: Stethoscope },
            { href: '/queues', label: 'Open queues', icon: ClipboardList },
          ]}
        />
      </section>
    </section>
  );
}
