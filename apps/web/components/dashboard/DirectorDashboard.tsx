'use client';

import type { ReactNode } from 'react';
import { TrendChart } from './TrendChart';
import { DistributionChart } from './DistributionChart';
import { HYPERTENSION_ORDER, HYPERTENSION_TONES, toLabelledDistribution } from '@/lib/hypertension';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Activity } from 'lucide-react';
import { formatRoleLabel } from '@/lib/ops';
import { DashboardActionRow } from './DashboardActionRow';

interface StaffActivityRow {
  userId: string;
  displayName: string;
  role: string;
  encountersCreated: number;
  encountersFinalized: number;
}

interface DirectorDashboardProps {
  patientRegistrationTrend: { date: string; count: number }[];
  encounterVolumeTrend: { date: string; count: number }[];
  screeningRates: { hypertension: number; diabetes: number };
  bpDistribution: Record<string, number>;
  followUpComplianceRate: number;
  staffActivity: StaffActivityRow[];
  encounterStatusDistribution: Record<string, number>;
  pendingClinicalNoteCosigns?: number;
  /** Where the clinic's queues are held up, first in the wide column. */
  needs?: ReactNode;
  /** Further oversight between the charts and the staff table, e.g. station flow. */
  children?: ReactNode;
}

const staffColumns: DataTableColumn<StaffActivityRow>[] = [
  {
    id: 'displayName',
    accessorKey: 'displayName',
    header: 'Name',
    // Stays in view while a phone scrolls the counts sideways (R4.2 contract).
    meta: { className: 'sticky left-0 z-[1] bg-card [thead_&]:bg-surface-2' },
  },
  {
    id: 'role',
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => formatRoleLabel(row.original.role),
  },
  {
    id: 'encountersCreated',
    accessorKey: 'encountersCreated',
    header: 'Visits started',
    meta: { align: 'right' },
  },
  {
    id: 'encountersFinalized',
    accessorKey: 'encountersFinalized',
    header: 'Visits finalized',
    meta: { align: 'right' },
  },
];

/**
 * A director's own work under their greeting and figure strip (W2): the clinic's 30-day trends
 * beside how its queue, screening and readings stand, then staff activity. Registered patients,
 * visit volume, BP screening and follow-up share are the strip above.
 */
export function DirectorDashboard({
  patientRegistrationTrend,
  encounterVolumeTrend,
  screeningRates,
  bpDistribution,
  staffActivity,
  encounterStatusDistribution,
  needs,
  children,
}: DirectorDashboardProps) {
  return (
    <div className="space-y-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          {needs}
          <TrendChart
            title="Patient registrations in the last 30 days"
            titleAs="h2"
            data={patientRegistrationTrend}
            color="hsl(var(--chart-1))"
            hint="Daily count of new patient registrations in this clinic."
          />
          <TrendChart
            title="Visit volume in the last 30 days"
            titleAs="h2"
            data={encounterVolumeTrend}
            color="hsl(var(--chart-1))"
            hint="Daily count of visits created in this clinic."
          />
        </div>
        <div className="min-w-0 space-y-8">
          <DistributionChart
            title="Queue status"
            titleAs="h2"
            layout="horizontal"
            data={encounterStatusDistribution}
            hint="How visits are distributed across draft, review, and finalized stages."
          />
          <DistributionChart
            title="Screening coverage (% of visits)"
            titleAs="h2"
            layout="horizontal"
            data={{
              Hypertension: screeningRates.hypertension,
              Diabetes: screeningRates.diabetes,
            }}
            hint="Share of visits that recorded a hypertension or a diabetes screening."
          />
          <DistributionChart
            title="Blood pressure levels"
            titleAs="h2"
            layout="horizontal"
            data={toLabelledDistribution(bpDistribution)}
            order={HYPERTENSION_ORDER}
            tones={HYPERTENSION_TONES}
            hint="How recent hypertension assessments are classified in this clinic, from normal to crisis."
          />
        </div>
      </div>

      {children}

      {/* Pending HAP cosigns lead the page as a "Needs you now" row when there are any. */}
      <section className="space-y-3 border-t-2 border-rule-strong pt-3">
        <h2 className="type-section-title pt-2.5 text-foreground">Staff activity summary</h2>
        {/* Everyone shown this section holds AUDIT.READ (director, manager), so the page opens. */}
        <DashboardActionRow
          actions={[{ href: '/staff-activity', label: 'Open staff activity', icon: Activity }]}
        />
        <div className="overflow-y-hidden">
          <DataTable
            caption="Staff activity"
            columns={staffColumns}
            data={staffActivity}
            getRowId={(row) => row.userId}
            pageSizeOptions={[10]}
            initialPageSize={10}
          />
        </div>
      </section>
    </div>
  );
}
