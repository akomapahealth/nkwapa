'use client';

import { useState } from 'react';
import { Activity, CalendarCheck, GitMerge, KeyRound, RefreshCw, ShieldAlert } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { apiFetch, readApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import {
  METRICS_SECTIONS,
  METRICS_WINDOWS,
  formatRatio,
  humanizeReason,
  metricsHeadlines,
  type MetricsSummary,
  type MetricsWindow,
} from '@/lib/metrics';
import { RouteGuard } from '@/components/RouteGuard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { DistributionChart } from '@/components/dashboard/DistributionChart';
import { MetricsFunnelCard } from '@/components/metrics/MetricsFunnelCard';
import { MetricsEventTable } from '@/components/metrics/MetricsEventTable';

function MetricsContent() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const [window, setWindow] = useState<MetricsWindow>('30');

  const state = useAsyncResource<MetricsSummary>({
    resourceKey: `${clinicId}:${window}`,
    enabled: Boolean(clinicId),
    requiresOnline: true,
    errorMessage: 'Metrics could not be loaded.',
    fetcher: async (getToken, signal) => {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId ?? '')}/metrics?days=${window}`,
        { getToken, activeClinicId: clinicId ?? undefined, signal },
      );
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as MetricsSummary;
    },
  });

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Oversight"
        title="Metrics"
        description="How often key workflows run at this clinic, how they end, and why they fail."
        helpTitle="What these numbers are"
        helpText="Counts of activity, recorded without names, contact details or clinical values. For who did what to which record, use the audit log."
        actions={
          <SegmentedControl
            label="Time window"
            value={window}
            options={METRICS_WINDOWS}
            onChange={setWindow}
            // Wide enough for the three windows on one row; the grid wraps only on a phone.
            className="sm:w-[24rem]"
          />
        }
      />

      <ResourceState
        state={state}
        skeleton={<SectionSkeleton lines={8} />}
        errorTitle="Metrics could not be loaded"
        offlineDescription="Metrics are calculated on the server, so they need a connection."
      >
        {(summary) => {
          const headlines = metricsHeadlines(summary);
          const failures = Object.fromEntries(
            summary.failureReasons
              .slice(0, 8)
              .map((row) => [humanizeReason(row.reason), row.count]),
          );
          return (
            <div className="space-y-6">
              <section
                aria-label="Headline figures"
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              >
                <AppMetricCard
                  title="Request conversion"
                  value={formatRatio(headlines.requestConversion)}
                  detail={`${headlines.requests} appointment requests`}
                  icon={CalendarCheck}
                  hint="Confirmed requests over submitted requests in this window."
                />
                <AppMetricCard title="Charts merged" value={headlines.merges} icon={GitMerge} />
                <AppMetricCard
                  title="Claim success"
                  value={formatRatio(headlines.claimSuccess)}
                  icon={KeyRound}
                  hint="Successful record claims over all claim attempts."
                />
                <AppMetricCard
                  title="Offline changes refused"
                  value={formatRatio(headlines.syncConflictRate)}
                  detail={`${summary.sync.mutations} changes in ${summary.sync.pushes} syncs`}
                  icon={RefreshCw}
                  hint="Conflicts and errors over every offline change devices sent."
                />
                <AppMetricCard
                  title="Requests throttled"
                  value={headlines.throttled}
                  icon={ShieldAlert}
                  hint="Requests refused for arriving too fast. A sudden rise can mean a misbehaving device or an attack."
                />
                <AppMetricCard
                  title="Activity recorded"
                  value={summary.events.reduce((sum, row) => sum + row.total, 0)}
                  detail={`Last ${summary.range.days} days`}
                  icon={Activity}
                />
              </section>

              <section aria-labelledby="metrics-funnels" className="space-y-3">
                <h2 id="metrics-funnels" className="text-base font-semibold">
                  Conversions
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {summary.funnels.map((funnel) => (
                    <MetricsFunnelCard key={funnel.id} funnel={funnel} />
                  ))}
                </div>
              </section>

              <div className="grid gap-3 lg:grid-cols-2">
                <TrendChart
                  title="Completed actions per day"
                  hint="Tracked workflow steps that succeeded, per day."
                  data={summary.daily.map((day) => ({ date: day.date, count: day.succeeded }))}
                />
                <DistributionChart
                  title="Most common failure reasons"
                  hint="The codes behind failed and refused actions. Support can search logs for the code."
                  data={failures}
                  tones={Object.fromEntries(
                    Object.keys(failures).map((label) => [label, 'destructive' as const]),
                  )}
                  layout="horizontal"
                  emptyMessage="Nothing failed in this window."
                />
              </div>

              <section aria-labelledby="metrics-workflows" className="space-y-3">
                <h2 id="metrics-workflows" className="text-base font-semibold">
                  By workflow
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {METRICS_SECTIONS.map((section) => (
                    <MetricsEventTable
                      key={section.category}
                      title={section.title}
                      description={section.description}
                      rows={summary.events.filter((row) => row.category === section.category)}
                    />
                  ))}
                </div>
              </section>

              <ProgressiveHelp title="How these metrics protect privacy">
                <p>
                  Each event records only what happened, when, at which clinic, whether it worked,
                  and a machine code if it did not. Names, contact details, dates of birth, national
                  IDs and clinical values are never recorded, and neither are patient or staff
                  identifiers. Events are kept for a limited time and then deleted.
                </p>
              </ProgressiveHelp>
            </div>
          );
        }}
      </ResourceState>
    </div>
  );
}

export default function MetricsPage() {
  return (
    <RouteGuard requiredPermission="METRICS.READ" requiresClinic clinicSurface="Metrics">
      <MetricsContent />
    </RouteGuard>
  );
}
