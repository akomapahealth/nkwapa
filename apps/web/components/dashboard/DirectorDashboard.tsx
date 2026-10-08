'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendChart } from './TrendChart';
import { DistributionChart } from './DistributionChart';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardKpiCard } from './DashboardKpiCard';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

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
}

const staffColumns: DataTableColumn<StaffActivityRow>[] = [
  { id: 'displayName', accessorKey: 'displayName', header: 'Staff Name' },
  { id: 'role', accessorKey: 'role', header: 'Role' },
  {
    id: 'encountersCreated',
    accessorKey: 'encountersCreated',
    header: 'Created',
  },
  {
    id: 'encountersFinalized',
    accessorKey: 'encountersFinalized',
    header: 'Finalized',
  },
];

export function DirectorDashboard({
  patientRegistrationTrend,
  encounterVolumeTrend,
  screeningRates,
  bpDistribution,
  followUpComplianceRate,
  staffActivity,
  encounterStatusDistribution,
  pendingClinicalNoteCosigns,
}: DirectorDashboardProps) {
  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        title="Clinic trends"
        hint="Use this section to watch how the clinic is performing across patient flow and follow-up."
      />

      {pendingClinicalNoteCosigns !== undefined ? (
        <div className="grid gap-4 sm:max-w-sm">
          <DashboardKpiCard
            title="Pending HAP cosigns"
            value={pendingClinicalNoteCosigns}
            hint="Clinic-level operational count only. Clinical note content remains restricted."
          />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart
          title="Patient registrations in the last 30 days"
          data={patientRegistrationTrend}
          color="hsl(var(--chart-1))"
          hint="Daily count of new patient registrations in this clinic."
        />
        <TrendChart
          title="Visit volume in the last 30 days"
          data={encounterVolumeTrend}
          color="hsl(var(--chart-2))"
          hint="Daily count of visits created in this clinic."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <DistributionChart
          title="Queue status"
          data={encounterStatusDistribution}
          hint="How visits are distributed across draft, review, and finalized stages."
        />
        <DistributionChart
          title="Blood pressure levels"
          data={bpDistribution}
          hint="How recent hypertension assessments are classified in this clinic."
        />
        <DistributionChart
          title="Screening coverage"
          data={{
            Hypertension: screeningRates.hypertension,
            Diabetes: screeningRates.diabetes,
          }}
          hint="How often hypertension and diabetes screenings are being completed."
        />
        <AppMetricCard
          className="lg:col-span-1"
          title="Follow-up compliance"
          value={`${followUpComplianceRate}%`}
          detail="Care plans with a follow-up date"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Staff activity summary</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </section>
  );
}
