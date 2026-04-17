'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { DashboardSectionHeader } from '@/components/dashboard/DashboardSectionHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { DoctorDashboard } from '@/components/dashboard/DoctorDashboard';
import { PreceptorDashboard } from '@/components/dashboard/PreceptorDashboard';
import { DirectorDashboard } from '@/components/dashboard/DirectorDashboard';
import { VolunteerDashboard } from '@/components/dashboard/VolunteerDashboard';
import { SystemAdminDashboard } from '@/components/dashboard/SystemAdminDashboard';
import { Badge } from '@/components/ui/badge';
import { EmptyStateCard } from '@/components/ops/OpsShared';

interface DashboardData {
  summary: {
    totalPatients: number;
    encountersToday: number;
    pendingDrafts: number;
    pendingReview: number;
    readyToFinalize: number;
  };
  doctor?: {
    awaitingFinalization: number;
    patientsSeen: { today: number; week: number; month: number };
    followUpComplianceRate: number;
    hypertensionDistribution: Record<string, number>;
    diabetesStats: { flagged: number; total: number };
    recentEncounters: {
      id: string;
      patientCode: string;
      patientName: string;
      status: string;
      createdAt: string;
    }[];
    finalizationsTrend: { date: string; count: number }[];
  };
  preceptor?: {
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
  };
  director?: {
    patientRegistrationTrend: { date: string; count: number }[];
    encounterVolumeTrend: { date: string; count: number }[];
    screeningRates: { hypertension: number; diabetes: number };
    bpDistribution: Record<string, number>;
    followUpComplianceRate: number;
    staffActivity: {
      userId: string;
      displayName: string;
      role: string;
      encountersCreated: number;
      encountersFinalized: number;
    }[];
    encounterStatusDistribution: Record<string, number>;
  };
  volunteer?: {
    patientsRegisteredToday: number;
    encountersCreatedToday: number;
    pendingSubmissions: number;
    patientsRegisteredTrend: { date: string; count: number }[];
    encountersCreatedTrend: { date: string; count: number }[];
    statusBreakdown: Record<string, number>;
    bpDistribution: Record<string, number>;
    diabetesStats: { flagged: number; total: number };
  };
  systemAdmin?: {
    totalClinics: number;
    totalUsers: number;
    systemWidePatients: number;
    systemWideEncounters: number;
    systemEncountersTrend: { date: string; count: number }[];
    clinicComparison: {
      clinicId: string;
      clinicName: string;
      totalPatients: number;
      totalEncounters: number;
      totalFinalized: number;
    }[];
  };
}

export default function DashboardPage() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId = bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId;
  const activeMembership =
    bootstrap?.memberships.find((membership) => membership.clinicId === clinicId) ?? null;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!clinicId || !getToken) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/dashboard`, {
        getToken,
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return (
    <RouteGuard requiredPermission="DASHBOARD.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic snapshot"
          title={activeMembership?.clinicName ?? 'Dashboard'}
          description="Current clinic totals and next work."
          hint="The dashboard always reflects the clinic selected in the header."
          helpTitle="How the dashboard is organized"
          helpText="Start with the clinic snapshot, then use the role sections below to clear intake work, reviews, finalizations, and oversight tasks."
          badges={
            activeMembership ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {activeMembership.clinicName}
              </Badge>
            ) : null
          }
        />

        {!clinicId ? (
          <EmptyStateCard
            title="Pick a clinic"
            description="Choose a clinic in the header to load this dashboard."
          />
        ) : null}

        {loading && !data ? (
          <div className="space-y-4">
            <SectionSkeleton lines={2} className="rounded-[28px] p-6" />
            <SectionSkeleton lines={4} className="rounded-[28px] p-6" />
          </div>
        ) : null}

        {error ? (
          <InlineErrorState
            description={error}
            onRetry={() => void fetchDashboard()}
            retryLabel="Reload dashboard"
          />
        ) : null}

        {data && !loading && clinicId && (
          <>
            <DashboardSectionHeader
              title="Today at a glance"
              hint="These totals help you see what is active now before you move into the role-specific sections below."
            />
            <SummaryCards
              totalPatients={data.summary.totalPatients}
              encountersToday={data.summary.encountersToday}
              pendingDrafts={data.summary.pendingDrafts}
              pendingReview={data.summary.pendingReview}
              readyToFinalize={data.summary.readyToFinalize}
            />

            <div className="border-t border-border pt-6">
              {data.doctor && <DoctorDashboard {...data.doctor} />}

              {data.preceptor && <PreceptorDashboard {...data.preceptor} />}

              {data.director && <DirectorDashboard {...data.director} />}

              {data.volunteer && <VolunteerDashboard {...data.volunteer} />}

              {data.systemAdmin && <SystemAdminDashboard {...data.systemAdmin} />}
            </div>
          </>
        )}
      </div>
    </RouteGuard>
  );
}
