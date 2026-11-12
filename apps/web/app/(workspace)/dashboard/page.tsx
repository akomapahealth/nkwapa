'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import {
  DashboardLoadingState,
  InlineErrorState,
  SelectClinicState,
} from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { DashboardSectionHeader } from '@/components/dashboard/DashboardSectionHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { VolunteerDashboard } from '@/components/dashboard/VolunteerDashboard';
import { VolunteerWelcome } from '@/components/dashboard/VolunteerWelcome';
import { NeedsYouNow } from '@/components/dashboard/NeedsYouNow';
import { RoleHome, type DashboardData } from '@/components/dashboard/RoleHome';
import { getOpsDestination } from '@/lib/ops';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { pickMainRole } from '@/lib/main-role';
import { ClinicalMeasurementsDashboard } from '@/components/dashboard/ClinicalMeasurementsDashboard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { RefreshCw } from 'lucide-react';
import { zoneQueryString, type ZoneFilter } from '@/lib/clinic-zones';

export default function DashboardPage() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();
  const { showToast } = useToast();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const activeClinic = getActiveBootstrapClinic(bootstrap, clinicId);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>(null);
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
  const roles = bootstrap?.effectiveRolesForActiveClinic ?? [];
  const mainRole = pickMainRole(roles, data);

  const refreshAction = clinicId ? (
    <Button
      type="button"
      variant={mainRole === 'VOLUNTEER' ? 'outline' : 'ghost'}
      onClick={() => void fetchDashboard(true)}
      disabled={loading}
    >
      <RefreshCw
        aria-hidden="true"
        className={loading ? 'animate-spin motion-reduce:animate-none' : ''}
      />
      {/*
        The label stays put. Swapping it for "Refreshing" grew the button by 19px, measured, which
        moved everything beside it every time someone refreshed (MASTER 11). The spinner carries
        the state visually and the live region carries it for assistive technology.
      */}
      <span className="sr-only compact:not-sr-only">Refresh</span>
      <span aria-live="polite" className="sr-only">
        {loading ? 'Refreshing the dashboard' : ''}
      </span>
    </Button>
  ) : null;

  const status = (
    <>
      {isInitialLoading ? <DashboardLoadingState clinicName={activeClinic?.clinicName} /> : null}
      {error ? (
        <InlineErrorState
          title={data ? 'Dashboard refresh is affected' : "We couldn't load dashboard metrics"}
          description={error}
          onRetry={() => void fetchDashboard()}
          retryLabel="Reload dashboard"
        />
      ) : null}
    </>
  );

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="DASHBOARD.READ">
        <div className="space-y-6">
          <AppPageHeader title="Dashboard" description="Current clinic totals and next work." />
          <SelectClinicState surface="The dashboard" />
        </div>
      </RouteGuard>
    );
  }

  // One home for the person's main role here (W2); other roles' work is "Also on your plate".
  if (mainRole && mainRole !== 'VOLUNTEER') {
    return (
      <RouteGuard requiredPermission="DASHBOARD.READ">
        <RoleHome
          role={mainRole}
          roles={roles}
          data={data}
          perms={perms}
          clinicId={clinicId}
          clinicName={activeClinic?.clinicName}
          refresh={refreshAction}
          status={status}
          zoneFilter={zoneFilter}
          onZoneFilterChange={setZoneFilter}
          isRefreshing={loading}
        />
      </RouteGuard>
    );
  }

  // A volunteer's home (recomposed in W4), and the fallback for a role with no home of its own.
  return (
    <RouteGuard requiredPermission="DASHBOARD.READ">
      <div className="space-y-6">
        <VolunteerWelcome
          actions={refreshAction}
          {...(mainRole ? {} : { solo: true, summary: 'Current clinic totals and next work.' })}
        />
        {status}
        {data && (
          <>
            {/* Work first (MASTER.md section 12), then today's counts, then trends. */}
            <NeedsYouNow
              steps
              volunteer={data.volunteer}
              worklistHref={getOpsDestination(perms, isWebFeatureEnabled('stationWorkflow'))}
            />
            <DashboardSectionHeader
              title="Today at a glance"
              hint="These totals help you see what is active now before you move into your own work below."
            />
            <SummaryCards {...data.summary} />
            {data.volunteer ? (
              <div className="space-y-8 border-t border-border/70 pt-6">
                <VolunteerDashboard {...data.volunteer} clinicId={clinicId} />
                <ClinicalMeasurementsDashboard metrics={data.volunteer.clinicalMeasurements} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </RouteGuard>
  );
}
