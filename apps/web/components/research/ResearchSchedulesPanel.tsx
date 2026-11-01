'use client';

import { useCallback, useState } from 'react';
import { CalendarClock, Loader2, Pause, Pencil, Play, Plus, Zap } from 'lucide-react';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useAsyncResource } from '@/lib/use-async-resource';
import {
  DESTINATION_LABELS,
  SCHEDULE_STATUS_LABELS,
  describeCadence,
  type ResearchExportItem,
  type ResearchSchedule,
  type ResearchScheduleList,
  type ResearchScheduleStatus,
} from '@/lib/research';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { showToast } from '@/components/ui/toast';
import { ResearchReasonDialog, type ReasonPrompt } from './ResearchReasonDialog';
import { ResearchRunKey } from './ResearchRunKey';
import { ResearchScheduleDialog, type ScheduleDraft } from './ResearchScheduleDialog';
import { EXPORT_STATUS_STYLES } from './research-status';

const SCHEDULE_STATUS_STYLES: Record<ResearchScheduleStatus, string> = {
  PENDING_APPROVAL: 'border-warning/25 bg-warning/10 text-warning-ink',
  ACTIVE: 'border-success/25 bg-success/10 text-success-ink',
  PAUSED: 'border-border bg-muted text-muted-foreground',
  EXPIRED: 'border-warning/25 bg-warning/10 text-warning-ink',
  REVOKED: 'border-border bg-muted text-muted-foreground',
};

function formatWhen(iso: string | null): string | null {
  return iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;
}

function formatDay(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : null;
}

/**
 * Standing approvals for recurring research exports (#166). Requesters set one up and can pause
 * it or run it now; directors approve, reject and revoke it. Every run still appears in the
 * export activity below, with its own run key.
 */
export function ResearchSchedulesPanel({
  clinicId,
  canRequest,
  canApprove,
  onRunCreated,
}: {
  clinicId: string;
  canRequest: boolean;
  canApprove: boolean;
  onRunCreated: () => void;
}) {
  const getToken = useAuth();
  const base = `/clinics/${encodeURIComponent(clinicId)}/research/schedules`;

  const resource = useAsyncResource<ResearchScheduleList>({
    resourceKey: clinicId,
    errorMessage: 'Research schedules could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(base, { getToken: token, activeClinicId: clinicId, signal });
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as ResearchScheduleList;
    },
  });
  const refresh = resource.refresh;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResearchSchedule | 'new' | null>(null);
  const [reasonPrompt, setReasonPrompt] = useState<ReasonPrompt | null>(null);

  /** One schedule mutation: a toast either way, and a refresh when it worked. */
  const mutate = useCallback(
    async (
      path: string,
      { method = 'POST', body, success, failure, id }: MutateOptions,
    ): Promise<boolean> => {
      setBusyId(id);
      try {
        const response = await apiFetch(path, {
          method,
          body: body === undefined ? undefined : JSON.stringify(body),
          getToken: getToken ?? undefined,
          activeClinicId: clinicId,
        });
        if (!response.ok) throw await readApiError(response);
        showToast({ title: success, tone: 'success' });
        refresh();
        return true;
      } catch (error) {
        showToast({ title: failure, description: getErrorMessage(error, failure), tone: 'error' });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [clinicId, getToken, refresh],
  );

  const saveSchedule = (draft: ScheduleDraft) =>
    editing && editing !== 'new'
      ? mutate(`${base}/${editing.id}`, {
          method: 'PATCH',
          body: draft,
          id: editing.id,
          success: 'Schedule saved',
          failure: 'The schedule could not be saved',
        })
      : mutate(base, {
          body: draft,
          id: 'new',
          success: 'Schedule created',
          failure: 'The schedule could not be created',
        });

  const runNow = async (schedule: ResearchSchedule) => {
    const ok = await mutate(`${base}/${schedule.id}/run-now`, {
      id: schedule.id,
      success: 'Run queued. It appears in export activity below.',
      failure: 'The run could not be started',
    });
    if (ok) onRunCreated();
  };

  const pause = (schedule: ResearchSchedule) =>
    mutate(`${base}/${schedule.id}/pause`, {
      id: schedule.id,
      success: 'Schedule paused',
      failure: 'The schedule could not be paused',
    });

  const resume = (schedule: ResearchSchedule) =>
    mutate(`${base}/${schedule.id}/resume`, {
      id: schedule.id,
      success: 'Schedule resumed',
      failure: 'The schedule could not be resumed',
    });

  const approve = async (schedule: ResearchSchedule, context: ResearchScheduleList) => {
    const confirmed = await confirmAction({
      title: 'Approve this schedule?',
      description: `${describeCadence(schedule, context.timezone)}, publishing to ${DESTINATION_LABELS[schedule.destination]} without asking again until its review in ${context.defaultReviewMonths} months. Each run is still checked for consent and cohort size when it starts.`,
      confirmLabel: 'Approve schedule',
      destructive: false,
    });
    if (!confirmed) return;
    await mutate(`${base}/${schedule.id}/approve`, {
      body: {},
      id: schedule.id,
      success: 'Schedule approved',
      failure: 'The schedule could not be approved',
    });
  };

  const askReason = (schedule: ResearchSchedule, kind: 'reject' | 'revoke') =>
    setReasonPrompt({
      title: kind === 'reject' ? 'Reject this schedule' : 'Revoke this schedule',
      description:
        kind === 'reject'
          ? 'The requester sees this reason. No run is created.'
          : 'No further runs will be created. Runs already published stay until they expire.',
      confirmLabel: kind === 'reject' ? 'Reject schedule' : 'Revoke schedule',
      placeholder: 'Example: the study protocol has not been renewed.',
      onConfirm: (reason) =>
        mutate(`${base}/${schedule.id}/${kind}`, {
          body: { reason },
          id: schedule.id,
          success: kind === 'reject' ? 'Schedule rejected' : 'Schedule revoked',
          failure: `The schedule could not be ${kind === 'reject' ? 'rejected' : 'revoked'}`,
        }),
    });

  return (
    <Card className="rounded-lg border-border/80 bg-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-xl">
            <CalendarClock aria-hidden="true" className="h-5 w-5 text-primary" />
            Scheduled exports
          </CardTitle>
          <CardDescription>
            A director approves a schedule once; each run is checked again when it starts.
          </CardDescription>
        </div>
        {canRequest && resource.data?.researchEnabled ? (
          <Button onClick={() => setEditing('new')} className="gap-2 self-start">
            <Plus aria-hidden="true" className="h-4 w-4" />
            New schedule
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <ResourceState
          state={resource}
          errorTitle="We couldn't load the schedules"
          skeleton={
            <SectionSkeleton lines={3} className="border-0 bg-transparent p-0 shadow-none" />
          }
        >
          {(context) => (
            <div className="space-y-4">
              {!context.researchEnabled ? (
                <InlineNotice tone="warning" live={false}>
                  Research is turned off for this clinic. Turn it on in clinic settings before
                  scheduling exports.
                </InlineNotice>
              ) : null}

              {context.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center">
                  <p className="font-medium text-foreground">No schedules yet</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    A schedule publishes a fresh de-identified dataset every week or month, so
                    researchers stop waiting on one-off requests.
                  </p>
                </div>
              ) : (
                <ul className="grid gap-4 lg:grid-cols-2">
                  {context.items.map((schedule) => (
                    <ScheduleCard
                      key={schedule.id}
                      schedule={schedule}
                      context={context}
                      busy={busyId === schedule.id}
                      canRequest={canRequest}
                      canApprove={canApprove}
                      onEdit={() => setEditing(schedule)}
                      onRunNow={() => void runNow(schedule)}
                      onPause={() => void pause(schedule)}
                      onResume={() => void resume(schedule)}
                      onApprove={() => void approve(schedule, context)}
                      onReject={() => askReason(schedule, 'reject')}
                      onRevoke={() => askReason(schedule, 'revoke')}
                    />
                  ))}
                </ul>
              )}

              <ResearchScheduleDialog
                open={editing !== null}
                schedule={editing === 'new' ? null : editing}
                context={context}
                onClose={() => setEditing(null)}
                onSubmit={saveSchedule}
              />
            </div>
          )}
        </ResourceState>
      </CardContent>
      <ResearchReasonDialog prompt={reasonPrompt} onClose={() => setReasonPrompt(null)} />
    </Card>
  );
}

interface MutateOptions {
  method?: string;
  body?: unknown;
  id: string;
  success: string;
  failure: string;
}

function ScheduleCard({
  schedule,
  context,
  busy,
  canRequest,
  canApprove,
  onEdit,
  onRunNow,
  onPause,
  onResume,
  onApprove,
  onReject,
  onRevoke,
}: {
  schedule: ResearchSchedule;
  context: ResearchScheduleList;
  busy: boolean;
  canRequest: boolean;
  canApprove: boolean;
  onEdit: () => void;
  onRunNow: () => void;
  onPause: () => void;
  onResume: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevoke: () => void;
}) {
  const { status } = schedule;
  const live = status !== 'REVOKED';
  const facts: Array<[string, string | null]> = [
    ['Publishes to', DESTINATION_LABELS[schedule.destination]],
    ['Covers from', schedule.coverageStartDate],
    ['Next run', status === 'ACTIVE' ? formatWhen(schedule.nextRunAt) : null],
    ['Review by', formatDay(schedule.reviewBy)],
    ['Approved by', schedule.approvedBy?.displayName ?? null],
  ];

  return (
    <li
      // The decision queue links here, so the card clears the sticky header when it scrolls in.
      id={`schedule-${schedule.id}`}
      className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-border/70 bg-background/60 p-4 target:ring-2 target:ring-primary/40 sm:p-5"
      data-testid="research-schedule"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={SCHEDULE_STATUS_STYLES[status]}>
          {SCHEDULE_STATUS_LABELS[status]}
        </Badge>
        <span className="text-sm font-medium text-foreground">
          {describeCadence(schedule, schedule.timezone)}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[420px]:grid-cols-2">
        {facts
          .filter((fact): fact is [string, string] => fact[1] !== null)
          .map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="truncate text-foreground">{value}</dd>
            </div>
          ))}
      </dl>

      {schedule.statusReason ? (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          {schedule.statusReason}
        </p>
      ) : null}

      {schedule.lastRun ? <LastRun run={schedule.lastRun} /> : null}

      {live ? (
        <div className="mt-auto flex flex-wrap gap-2">
          {canApprove && (status === 'PENDING_APPROVAL' || status === 'EXPIRED') ? (
            <Button size="sm" onClick={onApprove} disabled={busy}>
              {busy ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
              {status === 'EXPIRED' ? 'Approve again' : 'Approve'}
            </Button>
          ) : null}
          {canApprove && status === 'PENDING_APPROVAL' ? (
            <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
              Reject
            </Button>
          ) : null}
          {canRequest && status === 'ACTIVE' ? (
            <>
              <Button size="sm" onClick={onRunNow} disabled={busy} className="gap-2">
                {busy ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap aria-hidden="true" className="h-4 w-4" />
                )}
                Run now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onPause}
                disabled={busy}
                className="gap-2"
              >
                <Pause aria-hidden="true" className="h-4 w-4" />
                Pause
              </Button>
            </>
          ) : null}
          {canRequest && status === 'PAUSED' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onResume}
              disabled={busy}
              className="gap-2"
            >
              <Play aria-hidden="true" className="h-4 w-4" />
              Resume
            </Button>
          ) : null}
          {canRequest && context.researchEnabled ? (
            <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy} className="gap-2">
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit
            </Button>
          ) : null}
          {canApprove ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRevoke}
              disabled={busy}
              className="text-destructive-ink hover:text-destructive-ink"
            >
              Revoke
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function LastRun({ run }: { run: ResearchExportItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-sm">
      <span className="text-muted-foreground">Last run</span>
      <ResearchRunKey runKey={run.runKey} />
      <Badge variant="outline" className={EXPORT_STATUS_STYLES[run.status]}>
        {run.status.replaceAll('_', ' ')}
      </Badge>
    </div>
  );
}
