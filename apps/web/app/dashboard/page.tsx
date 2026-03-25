"use client";

import { useCallback, useEffect, useState } from "react";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { AppPageHeader } from "@/components/app-shell/AppPageHeader";
import { RouteGuard } from "@/components/RouteGuard";
import { DashboardSectionHeader } from "@/components/dashboard/DashboardSectionHeader";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { DoctorDashboard } from "@/components/dashboard/DoctorDashboard";
import { PreceptorDashboard } from "@/components/dashboard/PreceptorDashboard";
import { DirectorDashboard } from "@/components/dashboard/DirectorDashboard";
import { VolunteerDashboard } from "@/components/dashboard/VolunteerDashboard";
import { SystemAdminDashboard } from "@/components/dashboard/SystemAdminDashboard";
import { Badge } from "@/components/ui/badge";
import { EmptyStateCard, InlineNotice } from "@/components/ops/OpsShared";

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
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId;
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
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/dashboard`,
        { getToken }
      );
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
          eyebrow="Clinic intelligence"
          title={activeMembership?.clinicName ?? "Dashboard"}
          description="A role-aware snapshot of clinic flow, patient activity, and operational priorities for the currently selected workspace."
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
            title="Select an active clinic"
            description="Choose a clinic in the header to load the role-aware dashboard and operational metrics."
          />
        ) : null}

        {loading && (
          <div className="flex items-center justify-center p-12">
            <div className="space-y-4 w-full max-w-4xl">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
              <div className="h-64 animate-pulse rounded-xl bg-muted" />
            </div>
          </div>
        )}

        {error && (
          <InlineNotice tone="error">
            {error}
          </InlineNotice>
        )}

        {data && !loading && clinicId && (
          <>
            <DashboardSectionHeader
              title="Clinic overview"
              subtitle="Pipeline and queue status"
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

            {data.systemAdmin && (
              <SystemAdminDashboard {...data.systemAdmin} />
            )}
            </div>
          </>
        )}
      </div>
    </RouteGuard>
  );
}
