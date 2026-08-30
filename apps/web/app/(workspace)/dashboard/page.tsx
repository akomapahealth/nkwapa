'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { DashboardLoadingState, InlineErrorState } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { DashboardSectionHeader } from '@/components/dashboard/DashboardSectionHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { DoctorDashboard } from '@/components/dashboard/DoctorDashboard';
import { ReviewDashboard } from '@/components/dashboard/ReviewDashboard';
import { DirectorDashboard } from '@/components/dashboard/DirectorDashboard';
import { VolunteerDashboard } from '@/components/dashboard/VolunteerDashboard';
import { SystemAdminDashboard } from '@/components/dashboard/SystemAdminDashboard';
import {
  ClinicalMeasurementsDashboard,
  type ClinicalMeasurementMetrics,
} from '@/components/dashboard/ClinicalMeasurementsDashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import { RefreshCw } from 'lucide-react';

interface DashboardData {
  summary: {
    totalPatients: number;
    encountersToday: number;
    pendingDrafts: number;
    pendingReview: number;
    readyToFinalize: number;
  };
  doctor?: {
    clinicalMeasurements: ClinicalMeasurementMetrics;
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
    pendingClinicalNoteCosigns?: number;
  };
  review?: {
    clinicalMeasurements: ClinicalMeasurementMetrics;
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
    clinicalMeasurements: ClinicalMeasurementMetrics;
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
    pendingClinicalNoteCosigns?: number;
  };
  volunteer?: {
    clinicalMeasurements: ClinicalMeasurementMetrics;
    patientsRegisteredToday: number;
    encountersCreatedToday: number;
    pendingSubmissions: number;
    patientsRegisteredTrend: { date: string; count: number }[];
    encountersCreatedTrend: { date: string; count: number }[];
    statusBreakdown: Record<string, number>;
    bpDistribution: Record<string, number>;
    diabetesStats: { flagged: number; total: number };
    clinicalNotes?: { drafts: number; pendingCosign: number };
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
  const { showToast } = useToast();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const activeClinic = getActiveBootstrapClinic(bootstrap, clinicId);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedDashboardRef = useRef(false);

  const fetchDashboard = useCallback(
    async (showRefreshToast = false) => {
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
          throw await readApiError(res);
        }
        const json = (await res.json()) as DashboardData;
        setData(json);
        hasLoadedDashboardRef.current = true;
        if (showRefreshToast) {
          showToast({
            tone: 'success',
            title: 'Dashboard refreshed',
            description: activeClinic
              ? `${activeClinic.clinicName} metrics are up to date.`
              : 'Clinic metrics are up to date.',
          });
        }
      } catch (err) {
        const message = getErrorMessage(
          err,
          'The dashboard could not load. Check your connection and try again.',
        );
        const hasLoadedDashboard = hasLoadedDashboardRef.current;
        const description = hasLoadedDashboard
          ? `${message} The dashboard shown below is the last version we loaded; refresh is the affected part.`
          : `${message} Records and other workspace tools may still work from their own pages.`;
        setError(description);
        showToast({
          tone: 'error',
          title: hasLoadedDashboard ? 'Dashboard refresh is affected' : 'Dashboard could not load',
          description,
          durationMs: 6500,
        });
      } finally {
        setLoading(false);
      }
    },
    [activeClinic, clinicId, getToken, showToast],
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const isInitialLoading = loading && !data;

  return (
    <RouteGuard requiredPermission="DASHBOARD.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic snapshot"
          title={activeClinic?.clinicName ?? 'Dashboard'}
          description="Current clinic totals and next work."
          // Was a persistent ProgressiveHelp card under the page title. It is generic orientation
          // copy with no safety or consent significance, which is exactly what #63 says belongs in
          // a bubble; the disclosure was costing a block of vertical space above the metrics on
          // every visit, to every user, forever.
          hint="The dashboard always reflects the clinic selected in the header. Start with the clinic snapshot, then use the role sections below to clear intake work, reviews, finalizations, and oversight tasks."
          badges={
            activeClinic ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {activeClinic.clinicName}
              </Badge>
            ) : null
          }
          actions={
            clinicId ? (
              <Button
                type="button"
                variant="outline"
                className="border-border"
                onClick={() => void fetchDashboard(true)}
                disabled={loading}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={loading ? 'animate-spin motion-reduce:animate-none' : ''}
                />
                {/*
                  The label stays put. Swapping it for "Refreshing" grew the button by 19px,
                  measured, which moved everything beside it in the header every time someone
                  refreshed. The spinner carries the state visually and the live region carries it
                  for assistive technology, so nothing is lost by keeping the word still.
                */}
                Refresh
                <span aria-live="polite" className="sr-only">
                  {loading ? 'Refreshing the dashboard' : ''}
                </span>
              </Button>
            ) : null
          }
        />

        {!clinicId ? (
          <EmptyStateCard
            title="Pick a clinic"
            description="Choose a clinic in the header to load this dashboard."
          />
        ) : null}

        {isInitialLoading ? <DashboardLoadingState clinicName={activeClinic?.clinicName} /> : null}

        {error ? (
          <InlineErrorState
            title={data ? 'Dashboard refresh is affected' : "We couldn't load dashboard metrics"}
            description={error}
            onRetry={() => void fetchDashboard()}
            retryLabel="Reload dashboard"
          />
        ) : null}

        {data && clinicId && (
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

            <div className="space-y-8 border-t border-border/70 pt-6">
              {(data.director?.clinicalMeasurements ??
                data.doctor?.clinicalMeasurements ??
                data.volunteer?.clinicalMeasurements) && (
                <ClinicalMeasurementsDashboard
                  metrics={
                    data.director?.clinicalMeasurements ??
                    data.doctor?.clinicalMeasurements ??
                    data.volunteer!.clinicalMeasurements
                  }
                />
              )}

              {data.doctor && <DoctorDashboard {...data.doctor} />}

              {data.review && <ReviewDashboard {...data.review} />}

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
