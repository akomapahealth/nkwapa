'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CalendarClock, ClipboardCheck, Database, Microscope, Users } from 'lucide-react';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DESTINATION_LABELS,
  EXPORT_STATUS_LABELS,
  SCHEDULE_ATTENTION_LABELS,
  describeCadence,
  skipReasonLabel,
  type ResearchExportItem,
  type ResearchOverview,
} from '@/lib/research';
import { ResearchRunKey } from './ResearchRunKey';
import { EXPORT_STATUS_STYLES } from './research-status';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** Why a run is in the queue, in the words the run row also uses. */
function runReason(run: ResearchExportItem): string {
  if (run.status === 'PENDING_APPROVAL') return `Covers ${run.fromDate} to ${run.toDate}.`;
  if (run.status === 'SKIPPED') return skipReasonLabel(run.skipReason);
  return run.failureReason ?? 'Processing failed.';
}

/**
 * The top of the research page (#166): can this clinic publish right now, what happened last,
 * what happens next, and what is waiting on a director. Decisions use the same actions as the
 * run rows below, passed in as `renderRunActions`.
 */
export function ResearchOverviewPanel({
  overview,
  canApprove,
  canEditSettings,
  renderRunActions,
}: {
  overview: ResearchOverview;
  canApprove: boolean;
  canEditSettings: boolean;
  renderRunActions: (run: ResearchExportItem) => ReactNode;
}) {
  const { storage, attention } = overview;
  const cohortShort = overview.consentedSubjects < overview.minSubjects;
  const decisions = attention.runs.length + attention.schedules.length;
  const settingsLink = canEditSettings ? (
    <>
      {' '}
      <Link href="/settings/clinic" className="font-medium underline underline-offset-4">
        Open clinic settings
      </Link>
    </>
  ) : null;

  return (
    <section aria-labelledby="research-overview-title" className="space-y-4">
      <h2 id="research-overview-title" className="sr-only">
        Readiness
      </h2>
      <AppMetricGroup className="sm:grid-cols-2 xl:grid-cols-4">
        <AppMetricCard
          title="Research"
          value={overview.researchEnabled ? 'On' : 'Off'}
          icon={Microscope}
          detail={
            overview.approvalRequired
              ? 'Each manual export needs a director.'
              : 'Manual exports run without approval.'
          }
        />
        <AppMetricCard
          title="Consented patients"
          value={overview.consentedSubjects}
          icon={Users}
          detail={`A run needs at least ${overview.minSubjects}.`}
        />
        <AppMetricCard
          title="Publishes to"
          value={
            storage.defaultDestination
              ? DESTINATION_LABELS[storage.defaultDestination]
              : 'Not configured'
          }
          icon={Database}
          detail={
            overview.lastCompleted?.completedAt
              ? `Last published ${formatWhen(overview.lastCompleted.completedAt)}.`
              : 'Nothing published yet.'
          }
        />
        <AppMetricCard
          title="Next scheduled run"
          value={overview.nextRun ? formatWhen(overview.nextRun.at) : 'None scheduled'}
          icon={CalendarClock}
          detail={`Times in ${overview.timezone}.`}
        />
      </AppMetricGroup>

      {!overview.researchEnabled ? (
        <InlineNotice tone="warning" live={false}>
          Research is off for this clinic, so every run is skipped until it is turned on.
          {settingsLink}
        </InlineNotice>
      ) : null}
      {cohortShort ? (
        <InlineNotice tone="warning" live={false}>
          {overview.consentedSubjects} of the {overview.minSubjects} consented patients a run needs.
          Runs are skipped until more patients consent to research.
        </InlineNotice>
      ) : null}
      {storage.destinations.length === 0 ? (
        <InlineNotice tone="warning" live={false}>
          No research storage is configured on this server, so runs cannot be published.
        </InlineNotice>
      ) : null}

      <Card className="rounded-lg border-border/80 bg-card" data-testid="research-decisions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-primary" />
            Needs a decision
            {decisions > 0 ? <Badge variant="outline">{decisions}</Badge> : null}
          </CardTitle>
          <CardDescription>
            {canApprove
              ? 'Runs waiting for approval, and failed or skipped runs from the last 30 days that have not been run again.'
              : 'What is waiting on a director. You can follow it here; a director makes the call.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {decisions === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting on a decision.</p>
          ) : (
            <ul className="space-y-3">
              {attention.runs.map((run) => (
                <li
                  key={run.id}
                  data-testid="research-decision"
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/60 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={EXPORT_STATUS_STYLES[run.status]}>
                        {EXPORT_STATUS_LABELS[run.status]}
                      </Badge>
                      <ResearchRunKey runKey={run.runKey} />
                    </div>
                    <p className="text-sm text-muted-foreground">{runReason(run)}</p>
                  </div>
                  {canApprove ? (
                    <div className="flex shrink-0 flex-wrap gap-2">{renderRunActions(run)}</div>
                  ) : null}
                </li>
              ))}
              {attention.schedules.map((schedule) => (
                <li
                  key={schedule.id}
                  data-testid="research-decision"
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/60 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <Badge
                      variant="outline"
                      className="border-warning/25 bg-warning/10 text-warning-ink"
                    >
                      {SCHEDULE_ATTENTION_LABELS[schedule.kind]}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {describeCadence(schedule, overview.timezone)}
                      {schedule.reviewBy ? ` · review by ${formatDay(schedule.reviewBy)}` : ''}
                    </p>
                  </div>
                  <a
                    href={`#schedule-${schedule.id}`}
                    className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Go to schedule
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
