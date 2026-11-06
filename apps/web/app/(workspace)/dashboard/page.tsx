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
import { StationFlowDashboard } from '@/components/dashboard/StationFlowDashboard';
import { NeedsYouNow } from '@/components/dashboard/NeedsYouNow';
import { getOpsDestination } from '@/lib/ops';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import {
  ClinicalMeasurementsDashboard,
  type ClinicalMeasurementMetrics,
} from '@/components/dashboard/ClinicalMeasurementsDashboard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pickDashboardTab, readDashboardTab, writeDashboardTab } from '@/lib/dashboard-tab-storage';
import { useToast } from '@/components/ui/toast';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import { RefreshCw } from 'lucide-react';
import { zoneQueryString, type ZoneFilter, type ZoneSummary } from '@/lib/clinic-zones';
import type { DashboardWorkItem } from '@/lib/dashboard-work-items';

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
    awaitingFinalizationItems?: DashboardWorkItem[];
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
    pendingSubmissionItems?: DashboardWorkItem[];
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
      zoneCode: string | null;
      totalPatients: number;
      totalEncounters: number;
      totalFinalized: number;
    }[];
    zones: ZoneSummary[];
    appliedZoneCode: string | null;
  };
}

export default function DashboardPage() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();
  const { showToast } = useToast();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const activeClinic = getActiveBootstrapClinic(bootstrap, clinicId);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  // The people who run the station line: managers, directors and system administrators (#24).
  const showStationFlow =
    isWebFeatureEnabled('stationWorkflow') &&
    Boolean(clinicId) &&
    (perms.includes('*') || perms.includes('OPS.STATION.MANAGE'));

  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>(null);
  const userId = bootstrap?.userId ?? null;
  // Read after mount, not during render, so the server and first client render agree (#315).
  const [storedTab, setStoredTab] = useState<string | null>(null);
  useEffect(() => {
    setStoredTab(userId && clinicId ? readDashboardTab(userId, clinicId) : null);
  }, [userId, clinicId]);
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
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/dashboard${zoneQueryString(zoneFilter)}`,
          { getToken },
        );
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
    [activeClinic, clinicId, getToken, showToast, zoneFilter],
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const isInitialLoading = loading && !data;

  // Oversight first (director, then network), then a person's own queues (MASTER.md section 12).
  const roleSections = data
    ? [
        data.director && {
          id: 'clinic',
          label: 'Clinic trends',
          node: <DirectorDashboard {...data.director} />,
        },
        data.systemAdmin && {
          id: 'network',
          label: 'Network overview',
          node: (
            <SystemAdminDashboard
              {...data.systemAdmin}
              zoneFilter={zoneFilter}
              onZoneFilterChange={setZoneFilter}
              isRefreshing={loading}
            />
          ),
        },
        // A doctor's review queue is part of the same job, so the two stay one view.
        (data.doctor || data.review) && {
          id: 'doctor',
          label: data.doctor ? 'Doctor queue' : 'Review queue',
          node: (
            <div className="space-y-8">
              {data.doctor && <DoctorDashboard {...data.doctor} />}
              {data.review && <ReviewDashboard {...data.review} />}
            </div>
          ),
        },
        data.volunteer && {
          id: 'volunteer',
          label: 'Your work today',
          node: <VolunteerDashboard {...data.volunteer} clinicId={clinicId ?? undefined} />,
        },
      ].filter((section): section is { id: string; label: string; node: JSX.Element } =>
        Boolean(section),
      )
    : [];

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
          // No clinic-name badge: the title and the header's switcher already say which clinic,
          // and on a phone the chip pushed the volunteer's own work below the first screen.
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
            {/* Work first (MASTER.md section 12), then today's counts, then trends. */}
            <NeedsYouNow
              volunteer={data.volunteer}
              doctor={data.doctor}
              review={data.review}
              clinic={
                data.director || data.systemAdmin
                  ? {
                      ...data.summary,
                      pendingClinicalNoteCosigns: data.director?.pendingClinicalNoteCosigns,
                    }
                  : undefined
              }
              worklistHref={getOpsDestination(perms, isWebFeatureEnabled('stationWorkflow'))}
            />

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
              {/* What is happening right now on the line, before any role's trends. */}
              {showStationFlow && clinicId ? <StationFlowDashboard clinicId={clinicId} /> : null}

              {roleSections.length > 1 ? (
                /*
                  One role's section at a time for someone who holds several. Stacked, an account
                  with every role ran past 8,000px at 1440; each section is still one press away,
                  and its numbers are unchanged.
                */
                <Tabs
                  value={pickDashboardTab(
                    storedTab,
                    roleSections.map((section) => section.id),
                  )}
                  onValueChange={(tab) => {
                    setStoredTab(tab);
                    if (userId && clinicId) writeDashboardTab(userId, clinicId, tab);
                  }}
                  className="space-y-6"
                >
                  <TabsList
                    aria-label="Dashboard view"
                    className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0"
                  >
                    {roleSections.map((section) => (
                      <TabsTrigger key={section.id} value={section.id}>
                        {section.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {roleSections.map((section) => (
                    <TabsContent key={section.id} value={section.id} className="mt-0">
                      {section.node}
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                roleSections[0]?.node
              )}

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
            </div>
          </>
        )}
      </div>
    </RouteGuard>
  );
}
