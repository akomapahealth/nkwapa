'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  GitBranch,
  Loader2,
  Redo2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { hasPermission } from '@/lib/ops';
import { getActiveBootstrapClinic } from '@/lib/bootstrap-clinics';
import { useAsyncResource } from '@/lib/use-async-resource';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { saveBlob } from '@/lib/download';
import {
  DESTINATION_LABELS,
  EXPORT_STATUS_LABELS,
  describeChanges,
  formatBytes,
  skipReasonLabel,
  type ResearchExportItem,
  type ResearchExportStatus,
  type ResearchOverview,
} from '@/lib/research';
import { ResearchOverviewPanel } from './ResearchOverviewPanel';
import { ResearchReasonDialog, type ReasonPrompt } from './ResearchReasonDialog';
import { ResearchRunDetails } from './ResearchRunDetails';
import { ResearchRunKey } from './ResearchRunKey';
import { ResearchSchedulesPanel } from './ResearchSchedulesPanel';
import { EXPORT_STATUS_STYLES } from './research-status';

const PACK_CONTENTS = [
  ['manifest.json', 'SHA256SUMS.txt', 'changes.json'],
  ['research_subjects.csv', 'research_ops_checkins.csv'],
  ['research_ops_assignments.csv', 'research_clinical_vitals.csv'],
  ['research_clinical_screenings.csv', 'research_measurements.csv'],
  ['research_appointments.csv', 'research_revocations.csv'],
];

const POLL_INTERVAL_MS = 10_000;
const PAGE_SIZE = 20;
// shortcut: "Load more" grows one request's limit, so polling keeps every loaded run fresh; past
// the API's 100-row cap the filters narrow the list instead. Switch to cursor pages if clinics
// routinely need more than 100 runs on screen.
const MAX_LOADED = 100;
const ALL = 'ALL';
type TriggerFilter = 'MANUAL' | 'SCHEDULED';

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function minusDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatRange(fromDate: string, toDate: string) {
  return `${fromDate} to ${toDate}`;
}

export function ResearchExportsScreen({ clinicId }: { clinicId: string }) {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const permissions = useMemo(
    () => bootstrap?.effectivePermissionsForActiveClinic ?? [],
    [bootstrap],
  );
  const canApprove = hasPermission(permissions, 'RESEARCH.EXPORT.APPROVE');
  const canRequest = hasPermission(permissions, 'RESEARCH.EXPORT.REQUEST');
  const canEditSettings = hasPermission(permissions, 'RESEARCH.SETTINGS.UPDATE');
  const clinicName = getActiveBootstrapClinic(bootstrap, clinicId)?.clinicName ?? null;

  const [statusFilter, setStatusFilter] = useState<ResearchExportStatus | typeof ALL>(ALL);
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter | typeof ALL>(ALL);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const overviewResource = useAsyncResource<ResearchOverview>({
    resourceKey: clinicId,
    errorMessage: 'The research overview could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/overview`,
        { getToken: token, activeClinicId: clinicId, signal },
      );
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as ResearchOverview;
    },
  });

  const exportsQuery = useMemo(() => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (statusFilter !== ALL) params.set('status', statusFilter);
    if (triggerFilter !== ALL) params.set('trigger', triggerFilter);
    return params.toString();
  }, [limit, statusFilter, triggerFilter]);

  const exportsResource = useAsyncResource<{ items: ResearchExportItem[]; hasMore: boolean }>({
    resourceKey: `${clinicId}?${exportsQuery}`,
    errorMessage: 'The research export queue could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports?${exportsQuery}`,
        { getToken: token, activeClinicId: clinicId, signal },
      );
      if (!response.ok) {
        throw await readApiError(response);
      }
      const payload = (await response.json()) as {
        items: ResearchExportItem[];
        nextCursor: string | null;
      };
      return { items: payload.items, hasMore: payload.nextCursor !== null };
    },
  });

  const exports = useMemo(() => exportsResource.data?.items ?? [], [exportsResource.data]);
  const refreshList = exportsResource.refresh;
  const refreshOverview = overviewResource.refresh;
  // Every action and poll can change both the queue and the readiness above it.
  const refreshExports = useCallback(() => {
    refreshList();
    refreshOverview();
  }, [refreshList, refreshOverview]);

  const [fromDate, setFromDate] = useState(minusDays(29));
  const [toDate, setToDate] = useState(todayString());

  /*
    Requesting, approving, rejecting, retrying and downloading keep their own error and notice.

    One `error` used to cover the queue read and all five mutations, so a download that failed
    rendered as "we couldn't load this view" above a list that had loaded perfectly well, and the
    recovery on offer was to reload the queue. The read's failure is ResourceState's business;
    everything below is the operator's action failing, which is a different sentence.
  */
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reasonPrompt, setReasonPrompt] = useState<ReasonPrompt | null>(null);

  const hasActiveWork = useMemo(
    () => exports.some((item) => item.status === 'APPROVED' || item.status === 'PROCESSING'),
    [exports],
  );

  useEffect(() => {
    if (!hasActiveWork) {
      return;
    }

    // The hook's own `isRefreshing` is what the old `background: true` flag was approximating by
    // hand, so the poll is now just a refresh: it never re-skeletons a list already on screen,
    // and a poll that fails leaves the last good queue up under a stale banner.
    const intervalId = window.setInterval(() => refreshExports(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [hasActiveWork, refreshExports]);

  /** Runs one export mutation, keeping its failure out of the queue read's state. */
  const runAction = useCallback(
    async (
      action: () => Promise<void>,
      { busyId, fallback }: { busyId: string | null; fallback: string },
    ): Promise<boolean> => {
      if (!getToken) return false;

      setActionLoadingId(busyId);
      setSubmitting(busyId === null);
      setActionError(null);
      setNotice(null);

      try {
        await action();
        refreshExports();
        return true;
      } catch (requestError) {
        setActionError(getErrorMessage(requestError, fallback));
        return false;
      } finally {
        setActionLoadingId(null);
        setSubmitting(false);
      }
    },
    [getToken, refreshExports],
  );

  const post = useCallback(
    async (path: string, init?: { method?: string; body?: string }) => {
      const response = await apiFetch(path, {
        method: init?.method ?? 'POST',
        body: init?.body,
        getToken: getToken ?? undefined,
        activeClinicId: clinicId,
      });
      if (!response.ok) {
        throw await readApiError(response);
      }
      return response;
    },
    [clinicId, getToken],
  );

  const handleRequestExport = () =>
    runAction(
      async () => {
        await post(`/clinics/${encodeURIComponent(clinicId)}/research/exports`, {
          body: JSON.stringify({ fromDate, toDate }),
        });
        setNotice(
          'Research export requested. Approval or processing will continue from the queue.',
        );
      },
      { busyId: null, fallback: 'The export request could not be submitted.' },
    );

  const handleApprove = (exportId: string) =>
    runAction(
      async () => {
        await post(`/clinics/${encodeURIComponent(clinicId)}/research/exports/${exportId}/approve`);
        setNotice('Export approved and queued for processing.');
      },
      { busyId: exportId, fallback: 'This export could not be approved.' },
    );

  const askRejectReason = (item: ResearchExportItem) =>
    setReasonPrompt({
      title: 'Reject export request',
      description: 'Provide a reason so the requester knows what to fix before retrying.',
      confirmLabel: 'Reject export',
      placeholder: 'Example: clinic consent review is incomplete for this date range.',
      onConfirm: (reason) =>
        runAction(
          async () => {
            await post(
              `/clinics/${encodeURIComponent(clinicId)}/research/exports/${item.id}/reject`,
              { body: JSON.stringify({ reason }) },
            );
            setNotice('Export rejected.');
          },
          { busyId: item.id, fallback: 'This export could not be rejected.' },
        ),
    });

  // A rerun publishes the same period again as the next -r<n> revision; the old run stays.
  const askRerunReason = (item: ResearchExportItem) =>
    setReasonPrompt({
      title: `Rerun ${item.runKey}`,
      description:
        'The same period is built again from today’s consents and published as a new revision. The earlier run is kept.',
      confirmLabel: 'Rerun',
      placeholder: 'Example: a data-entry correction was made for this period.',
      onConfirm: (reason) =>
        runAction(
          async () => {
            await post(
              `/clinics/${encodeURIComponent(clinicId)}/research/exports/${item.id}/rerun`,
              { body: JSON.stringify({ reason }) },
            );
            setNotice('Rerun queued as a new revision.');
          },
          { busyId: item.id, fallback: 'This run could not be rerun.' },
        ),
    });

  const handleRetry = (exportId: string) =>
    runAction(
      async () => {
        await post(`/clinics/${encodeURIComponent(clinicId)}/research/exports/${exportId}/retry`, {
          method: 'PATCH',
        });
        setNotice('Export queued for retry.');
      },
      { busyId: exportId, fallback: 'This export could not be queued for retry.' },
    );

  const handleDownload = (item: ResearchExportItem) =>
    runAction(
      async () => {
        const response = await post(
          `/clinics/${encodeURIComponent(clinicId)}/research/exports/${item.id}/download`,
          { method: 'GET' },
        );
        await saveBlob(await response.blob(), `${item.runKey}.zip`);
      },
      { busyId: item.id, fallback: 'This export pack could not be downloaded.' },
    );

  /** The decisions a director can make on a run; the row and the decision queue share them. */
  const renderRunActions = (item: ResearchExportItem): ReactNode => {
    if (!canApprove) return null;
    const isBusy = actionLoadingId === item.id;
    const spinner = <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />;
    if (item.status === 'PENDING_APPROVAL') {
      return (
        <>
          <Button onClick={() => void handleApprove(item.id)} disabled={isBusy} className="gap-2">
            {isBusy ? spinner : null}
            Approve
          </Button>
          <Button variant="outline" onClick={() => askRejectReason(item)} disabled={isBusy}>
            Reject
          </Button>
        </>
      );
    }
    if (item.status === 'FAILED') {
      return (
        <Button
          variant="outline"
          onClick={() => void handleRetry(item.id)}
          disabled={isBusy}
          className="gap-2"
        >
          {isBusy ? spinner : <RotateCcw aria-hidden="true" className="h-4 w-4" />}
          Retry
        </Button>
      );
    }
    if (item.status === 'COMPLETED' || item.status === 'SKIPPED') {
      return (
        <Button
          variant={item.status === 'SKIPPED' ? 'outline' : 'ghost'}
          onClick={() => askRerunReason(item)}
          disabled={isBusy}
          className="gap-2"
        >
          <Redo2 aria-hidden="true" className="h-4 w-4" />
          Rerun
        </Button>
      );
    }
    return null;
  };

  const rowCountEntries = (item: ResearchExportItem) =>
    Object.entries(item.rowCounts).filter(([, value]) => value > 0);

  const dateRangeInvalid = !fromDate || !toDate || toDate < fromDate;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {canEditSettings ? (
          <Link
            href="/settings/clinic"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Clinic research settings
          </Link>
        ) : null}
        <AppPageHeader
          eyebrow={clinicName ? `Research operations · ${clinicName}` : 'Research operations'}
          title="Research exports"
          description="Check readiness, decide on runs and schedules, and download de-identified packs."
          actions={
            <Button
              variant="outline"
              onClick={() => refreshExports()}
              disabled={
                exportsResource.isRefreshing ||
                exportsResource.isInitialLoading ||
                overviewResource.isRefreshing
              }
              className="gap-2"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${exportsResource.isRefreshing || overviewResource.isRefreshing ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
          }
        />
      </div>

      {/* Required reading, not header help: #63 keeps it visible on the page. */}
      <ProgressiveHelp title="How research exports work">
        Exports use the approved research transform profile: stable clinic-scoped keys, rounded
        timestamps, no names or free text. Each run is published under its run key, and a run with
        too few consented patients is skipped rather than published.
      </ProgressiveHelp>

      {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <ResourceState
        state={overviewResource}
        errorTitle="We couldn't load the research overview"
        skeleton={<SectionSkeleton lines={3} />}
      >
        {(overview) => (
          <ResearchOverviewPanel
            overview={overview}
            canApprove={canApprove}
            canEditSettings={canEditSettings}
            renderRunActions={renderRunActions}
          />
        )}
      </ResourceState>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <FormSectionCard
          title="Request export pack"
          description="Choose the date range, then submit the pack for approval or processing."
          hint="The exported format is a fixed v1 ZIP bundle of CSV tables plus manifest files."
        >
          <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Export format: fixed v1 ZIP pack of CSV tables plus manifest files.
          </div>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fromDate">From date</Label>
                <Input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(event) => setFromDate(event.target.value)}
                  aria-invalid={dateRangeInvalid || undefined}
                  aria-describedby={dateRangeInvalid ? 'date-range-error' : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="toDate">To date</Label>
                <Input
                  id="toDate"
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(event) => setToDate(event.target.value)}
                  aria-invalid={dateRangeInvalid || undefined}
                  aria-describedby={dateRangeInvalid ? 'date-range-error' : undefined}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFromDate(minusDays(6));
                  setToDate(todayString());
                }}
              >
                Last 7 days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFromDate(minusDays(29));
                  setToDate(todayString());
                }}
              >
                Last 30 days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFromDate(minusDays(89));
                  setToDate(todayString());
                }}
              >
                Last 90 days
              </Button>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
              <p className="text-sm font-medium text-foreground">Destination</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The research storage this server is configured with. Completed runs show where they
                were published.
              </p>
            </div>

            <ProgressiveHelp title="De-identification profile">
              Stable patient keys, rounded timestamps, no names or free text, no raw payload JSON,
              and only research-safe fields are included in the export pack.
            </ProgressiveHelp>

            {dateRangeInvalid ? (
              <p
                id="date-range-error"
                role="alert"
                className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive-ink"
              >
                The end date must be on or after the start date.
              </p>
            ) : null}

            <Button
              onClick={() => void handleRequestExport()}
              disabled={submitting || dateRangeInvalid}
              className="gap-2"
            >
              {submitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              Request export for {formatRange(fromDate, toDate)}
            </Button>
          </div>
        </FormSectionCard>

        <Card className="rounded-lg border-border/80 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <GitBranch aria-hidden="true" className="h-5 w-5 text-primary" />
              Pack contents
            </CardTitle>
            <CardDescription>
              Every completed export produces the same de-identified bundle.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {/* These are filenames, so they are marked up as filenames. They were wrapped in
                markdown backticks, which rendered as literal backtick characters. */}
            <ul className="space-y-2">
              {PACK_CONTENTS.map((pair) => (
                <li key={pair[0]} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {pair.map((name) => (
                    <code
                      key={name}
                      className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                    >
                      {name}
                    </code>
                  ))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <ResearchSchedulesPanel
        clinicId={clinicId}
        canRequest={canRequest}
        canApprove={canApprove}
        onRunCreated={refreshExports}
      />

      <Card className="rounded-lg border-border/80 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-primary" />
            Export activity
          </CardTitle>
          <CardDescription>
            Manual and scheduled runs, approval, processing, publishing and downloads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="researchStatusFilter">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as ResearchExportStatus | typeof ALL);
                  setLimit(PAGE_SIZE);
                }}
              >
                <SelectTrigger id="researchStatusFilter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {Object.entries(EXPORT_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="researchTriggerFilter">Started by</Label>
              <Select
                value={triggerFilter}
                onValueChange={(value) => {
                  setTriggerFilter(value as TriggerFilter | typeof ALL);
                  setLimit(PAGE_SIZE);
                }}
              >
                <SelectTrigger id="researchTriggerFilter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Manual and scheduled</SelectItem>
                  <SelectItem value="MANUAL">Manual requests</SelectItem>
                  <SelectItem value="SCHEDULED">Schedules</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ResourceState
            state={exportsResource}
            errorTitle="We couldn't load the export queue"
            skeleton={
              <SectionSkeleton lines={4} className="border-0 bg-transparent p-0 shadow-none" />
            }
            isEmpty={({ items }) => items.length === 0}
            empty={
              statusFilter !== ALL || triggerFilter !== ALL
                ? {
                    title: 'No runs match these filters',
                    description: 'Choose another status or show manual and scheduled runs.',
                    icon: FileArchive,
                  }
                : {
                    title: 'No exports yet',
                    description:
                      'Request your first research pack above. It will appear here while it waits for approval and while it processes.',
                    icon: FileArchive,
                  }
            }
          >
            {({ items, hasMore }) => (
              <div className="space-y-4">
                {items.map((item) => {
                  const rows = rowCountEntries(item);
                  const isBusy = actionLoadingId === item.id;
                  const changes = describeChanges(item.changes);
                  const size = formatBytes(item.artifactSizeBytes);
                  return (
                    <div
                      key={item.id}
                      data-testid="research-run"
                      className="space-y-4 rounded-lg border border-border/70 bg-background/60 p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={EXPORT_STATUS_STYLES[item.status]}>
                              {EXPORT_STATUS_LABELS[item.status]}
                            </Badge>
                            {item.trigger === 'SCHEDULED' ? (
                              <Badge variant="outline">Scheduled</Badge>
                            ) : null}
                            <ResearchRunKey runKey={item.runKey} />
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {formatRange(item.fromDate, item.toDate)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Requested {new Date(item.requestedAt).toLocaleString()}
                            {item.requestedBy ? ` by ${item.requestedBy.displayName}` : ''}
                            {item.approvedBy && item.approvedAt
                              ? ` · approved ${new Date(item.approvedAt).toLocaleString()} by ${item.approvedBy.displayName}`
                              : ''}
                          </p>
                        </div>

                        {item.status === 'PROCESSING' ? (
                          <div className="inline-flex items-center gap-2 rounded-full bg-info/10 px-3 py-1 text-xs font-medium text-info-ink">
                            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                            Background job running
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
                        <div className="space-y-3">
                          {rows.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {rows.map(([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground"
                                >
                                  {key}: {value}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Row counts will appear after the export pack is generated.
                            </p>
                          )}

                          {item.consentedSubjectCount != null ? (
                            <p className="text-sm text-foreground">
                              {item.consentedSubjectCount} consented patients
                              {item.revokedSinceLastCount
                                ? ` · ${item.revokedSinceLastCount} revoked since the last run`
                                : ''}
                            </p>
                          ) : null}
                          {changes ? (
                            <p className="text-sm text-muted-foreground">{changes}</p>
                          ) : null}

                          {item.status === 'SKIPPED' ? (
                            <InlineNotice tone="warning" live={false}>
                              <span className="font-medium">Skipped. </span>
                              {skipReasonLabel(item.skipReason)}
                            </InlineNotice>
                          ) : null}

                          {item.failureReason ? (
                            <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive-ink">
                              <div className="mb-1 flex items-center gap-2 font-medium">
                                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                                Processing failed
                              </div>
                              {item.failureReason}
                            </div>
                          ) : null}

                          {item.rejectionReason ? (
                            <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                              <div className="mb-1 font-medium">Rejected reason</div>
                              {item.rejectionReason}
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm">
                          <div>
                            <p className="font-medium text-foreground">Artifact</p>
                            <p className="text-muted-foreground">
                              {item.fileFormat?.toUpperCase() ?? 'ZIP'}
                              {size ? ` · ${size}` : ''}
                            </p>
                          </div>

                          <div>
                            <p className="font-medium text-foreground">
                              {item.storageProvider
                                ? DESTINATION_LABELS[item.storageProvider]
                                : 'Storage'}
                            </p>
                            {item.storagePath ? (
                              <>
                                <p className="break-all font-mono text-xs text-muted-foreground">
                                  {item.storagePath}
                                </p>
                                {item.storageUrl ? (
                                  <a
                                    href={item.storageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-block text-primary underline-offset-4 hover:underline"
                                  >
                                    {item.storageProvider === 'GITHUB' ? 'Open commit' : 'Open'}
                                  </a>
                                ) : null}
                              </>
                            ) : (
                              <p className="text-muted-foreground">
                                The location appears once the run is published.
                              </p>
                            )}
                          </div>

                          {item.completedAt ? (
                            <p className="text-muted-foreground">
                              Completed {new Date(item.completedAt).toLocaleString()}
                            </p>
                          ) : item.startedAt ? (
                            <p className="text-muted-foreground">
                              Started {new Date(item.startedAt).toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {item.status === 'COMPLETED' && !item.downloadAvailable ? (
                        <InlineNotice tone="info" live={false}>
                          The server no longer holds this run’s zip (a restart or redeploy clears
                          it). The published copy above is unaffected
                          {canApprove ? '; rerun the period to download a fresh zip.' : '.'}
                        </InlineNotice>
                      ) : null}

                      <ResearchRunDetails clinicId={clinicId} item={item} />

                      <div className="flex flex-wrap gap-2">
                        {renderRunActions(item)}

                        {item.status === 'COMPLETED' && item.downloadAvailable ? (
                          <Button
                            variant="outline"
                            onClick={() => void handleDownload(item)}
                            disabled={isBusy}
                            className="gap-2"
                          >
                            {isBusy ? (
                              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download aria-hidden="true" className="h-4 w-4" />
                            )}
                            Download zip
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {hasMore && limit < MAX_LOADED ? (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setLimit((current) => Math.min(current + PAGE_SIZE, MAX_LOADED))
                      }
                      disabled={exportsResource.isRefreshing}
                    >
                      Load more runs
                    </Button>
                  </div>
                ) : hasMore ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Showing the latest {MAX_LOADED} runs. Use the filters to find older ones.
                  </p>
                ) : null}
              </div>
            )}
          </ResourceState>
        </CardContent>
      </Card>

      <ResearchReasonDialog prompt={reasonPrompt} onClose={() => setReasonPrompt(null)} />
    </div>
  );
}
