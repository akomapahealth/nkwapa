'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  GitBranch,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { hasPermission } from '@/lib/ops';
import { useAsyncResource } from '@/lib/use-async-resource';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { Textarea } from '@/components/ui/textarea';

type ExportStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

export interface ResearchExportItem {
  id: string;
  clinicId: string;
  status: ExportStatus;
  fromDate: string;
  toDate: string;
  datasetVersion: number;
  policyVersionSnapshot: string;
  rejectionReason: string | null;
  failureReason: string | null;
  filePath: string | null;
  fileFormat: string | null;
  recordCount: number | null;
  rowCounts: Record<string, number>;
  artifactSha256: string | null;
  artifactSizeBytes: number | null;
  repoProvider: string | null;
  repoPath: string | null;
  repoCommitSha: string | null;
  repoCommitUrl: string | null;
  requestedAt: string;
  startedAt: string | null;
  approvedAt: string | null;
  syncedAt: string | null;
  completedAt: string | null;
  requestedBy?: { id: string; displayName: string };
  approvedBy?: { id: string; displayName: string } | null;
}

const STATUS_STYLES: Record<ExportStatus, string> = {
  /*
    Six export states across four semantic tokens.

    This was the last file in the product still running its own palette -- amber, sky, indigo,
    emerald, rose and zinc, none of which resolve in dark mode and none of which match the status
    colours the rest of the app uses for the same ideas. Approved and Processing deliberately
    share --info: they are both "accepted, not finished", and inventing a sixth hue to separate
    two adjacent waiting states is what produced a six-colour palette in the first place. The
    words differ, and the words are what the reader acts on.
  */
  PENDING_APPROVAL: 'border-warning/25 bg-warning/10 text-warning-ink',
  APPROVED: 'border-info/25 bg-info/10 text-info-ink',
  PROCESSING: 'border-info/25 bg-info/10 text-info-ink',
  COMPLETED: 'border-success/25 bg-success/10 text-success-ink',
  FAILED: 'border-destructive/25 bg-destructive/10 text-destructive-ink',
  REJECTED: 'border-border bg-muted text-muted-foreground',
};

const PACK_CONTENTS = [
  ['manifest.json', 'SHA256SUMS.txt'],
  ['research_subjects.csv', 'research_ops_checkins.csv'],
  ['research_ops_assignments.csv', 'research_clinical_vitals.csv'],
  ['research_clinical_screenings.csv', 'research_measurements.csv'],
  ['research_appointments.csv', 'research_revocations.csv'],
];

const POLL_INTERVAL_MS = 10_000;

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

  const exportsResource = useAsyncResource<ResearchExportItem[]>({
    resourceKey: clinicId,
    errorMessage: 'The research export queue could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/research/exports`, {
        getToken: token,
        activeClinicId: clinicId,
        signal,
      });
      if (!response.ok) {
        throw await readApiError(response);
      }
      const payload = (await response.json()) as {
        items: ResearchExportItem[];
        nextCursor: string | null;
      };
      return payload.items;
    },
  });

  const exports = useMemo(() => exportsResource.data ?? [], [exportsResource.data]);
  const refreshExports = exportsResource.refresh;

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
  const [rejectTarget, setRejectTarget] = useState<ResearchExportItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

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
    ) => {
      if (!getToken) return;

      setActionLoadingId(busyId);
      setSubmitting(busyId === null);
      setActionError(null);
      setNotice(null);

      try {
        await action();
        refreshExports();
      } catch (requestError) {
        setActionError(getErrorMessage(requestError, fallback));
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

  const handleRejectConfirm = () => {
    if (!rejectTarget) return Promise.resolve();
    const target = rejectTarget;
    return runAction(
      async () => {
        await post(
          `/clinics/${encodeURIComponent(clinicId)}/research/exports/${target.id}/reject`,
          { body: JSON.stringify({ reason: rejectReason.trim() }) },
        );
        setNotice('Export rejected.');
        setRejectTarget(null);
        setRejectReason('');
      },
      { busyId: target.id, fallback: 'This export could not be rejected.' },
    );
  };

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

  const handleDownload = (exportId: string) =>
    runAction(
      async () => {
        const response = await post(
          `/clinics/${encodeURIComponent(clinicId)}/research/exports/${exportId}/download`,
          { method: 'GET' },
        );
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `research-export-${exportId}.zip`;
        link.click();
        URL.revokeObjectURL(objectUrl);
      },
      { busyId: exportId, fallback: 'This export pack could not be downloaded.' },
    );

  const rowCountEntries = (item: ResearchExportItem) =>
    Object.entries(item.rowCounts).filter(([, value]) => value > 0);

  const dateRangeInvalid = !fromDate || !toDate || toDate < fromDate;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/settings/clinic"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to clinic settings
        </Link>
        <AppPageHeader
          eyebrow="Research operations"
          title="Research exports"
          description="Request and track de-identified export packs."
          helpTitle="How research exports work"
          helpText="Exports use the approved research transform profile: stable clinic-scoped keys, rounded timestamps, no names or free text, and optional private GitHub sync after processing."
          actions={
            <Button
              variant="outline"
              onClick={() => refreshExports()}
              disabled={exportsResource.isRefreshing || exportsResource.isInitialLoading}
              className="gap-2"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${exportsResource.isRefreshing ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
          }
        />
      </div>

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
              <p className="text-sm font-medium text-foreground">Destination preview</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Provider: private GitHub repo (server configured)
              </p>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                clinics/&lt;research_clinic_key&gt;/exports/&lt;timestamp&gt;__&lt;exportId&gt;/
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

      {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <Card className="rounded-lg border-border/80 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-primary" />
            Export activity
          </CardTitle>
          <CardDescription>
            Approval, background processing, GitHub sync, and downloads all appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResourceState
            state={exportsResource}
            errorTitle="We couldn't load the export queue"
            skeleton={
              <SectionSkeleton lines={4} className="border-0 bg-transparent p-0 shadow-none" />
            }
            isEmpty={(items) => items.length === 0}
            empty={{
              title: 'No exports yet',
              description:
                'Request your first research pack above. It will appear here while it waits for approval and while it processes.',
              icon: FileArchive,
            }}
          >
            {(items) => (
              <div className="space-y-4">
                {items.map((item) => {
                  const rows = rowCountEntries(item);
                  const isBusy = actionLoadingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="space-y-4 rounded-lg border border-border/70 bg-background/60 p-5"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={STATUS_STYLES[item.status]}>
                              {item.status.replaceAll('_', ' ')}
                            </Badge>
                            <span className="text-sm font-medium text-foreground">
                              {formatRange(item.fromDate, item.toDate)}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.id.slice(0, 8)}…
                            </span>
                          </div>
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
                              {item.fileFormat?.toUpperCase() ?? 'ZIP'}{' '}
                              {item.artifactSizeBytes != null
                                ? `· ${Math.max(1, Math.round(item.artifactSizeBytes / 1024))} KB`
                                : ''}
                            </p>
                          </div>

                          <div>
                            <p className="font-medium text-foreground">GitHub sync</p>
                            {item.repoPath ? (
                              <>
                                <p className="font-mono text-xs text-muted-foreground">
                                  {item.repoPath}
                                </p>
                                {item.repoCommitUrl ? (
                                  <a
                                    href={item.repoCommitUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-block text-primary underline-offset-4 hover:underline"
                                  >
                                    Open commit
                                  </a>
                                ) : null}
                              </>
                            ) : (
                              <p className="text-muted-foreground">
                                The repo path appears after a successful sync.
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

                      <div className="flex flex-wrap gap-2">
                        {canApprove && item.status === 'PENDING_APPROVAL' ? (
                          <>
                            <Button onClick={() => void handleApprove(item.id)} disabled={isBusy}>
                              {isBusy ? (
                                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setRejectTarget(item);
                                setRejectReason('');
                              }}
                              disabled={isBusy}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}

                        {canApprove && item.status === 'FAILED' ? (
                          <Button
                            variant="outline"
                            onClick={() => void handleRetry(item.id)}
                            disabled={isBusy}
                            className="gap-2"
                          >
                            {isBusy ? (
                              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw aria-hidden="true" className="h-4 w-4" />
                            )}
                            Retry
                          </Button>
                        ) : null}

                        {item.status === 'COMPLETED' ? (
                          <Button
                            variant="outline"
                            onClick={() => void handleDownload(item.id)}
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
              </div>
            )}
          </ResourceState>
        </CardContent>
      </Card>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-lg border-border/80">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Reject export request</DialogTitle>
            <DialogDescription>
              Provide a reason so the requester knows what to fix before retrying.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="rejectReason">Reason</Label>
            <Textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Example: clinic consent review is incomplete for this date range."
              rows={5}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleRejectConfirm()}
              disabled={
                !rejectReason.trim() || (rejectTarget ? actionLoadingId === rejectTarget.id : false)
              }
            >
              {rejectTarget && actionLoadingId === rejectTarget.id ? (
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Reject export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
