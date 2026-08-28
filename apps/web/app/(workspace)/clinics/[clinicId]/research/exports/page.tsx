'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  GitBranch,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { RouteGuard } from '@/components/RouteGuard';
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

interface ResearchExportItem {
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
  FAILED: 'border-destructive/25 bg-destructive/10 text-destructive',
  REJECTED: 'border-border bg-muted text-muted-foreground',
};

function hasPermission(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission);
}

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

export default function ResearchExportsPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canApprove = hasPermission(permissions, 'RESEARCH.EXPORT.APPROVE');

  const [exports, setExports] = useState<ResearchExportItem[]>([]);
  const [fromDate, setFromDate] = useState(minusDays(29));
  const [toDate, setToDate] = useState(todayString());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ResearchExportItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const hasActiveWork = useMemo(
    () => exports.some((item) => item.status === 'APPROVED' || item.status === 'PROCESSING'),
    [exports],
  );

  const loadExports = useCallback(
    async (options?: { background?: boolean }) => {
      if (!clinicId || !getToken) {
        return;
      }

      if (!options?.background) {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/research/exports`,
          {
            getToken,
            activeClinicId: clinicId,
          },
        );
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as {
          items: ResearchExportItem[];
          nextCursor: string | null;
        };
        setExports(payload.items);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : String(requestError));
      } finally {
        setLoading(false);
      }
    },
    [clinicId, getToken],
  );

  useEffect(() => {
    void loadExports();
  }, [loadExports]);

  useEffect(() => {
    if (!hasActiveWork) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadExports({ background: true });
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [hasActiveWork, loadExports]);

  async function handleRequestExport() {
    if (!clinicId || !getToken) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/research/exports`, {
        method: 'POST',
        body: JSON.stringify({ fromDate, toDate }),
        getToken,
        activeClinicId: clinicId,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setNotice('Research export requested. Approval or processing will continue from the queue.');
      await loadExports({ background: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(exportId: string) {
    if (!clinicId || !getToken) {
      return;
    }

    setActionLoadingId(exportId);
    setError(null);
    setNotice(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports/${exportId}/approve`,
        {
          method: 'POST',
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setNotice('Export approved and queued for processing.');
      await loadExports({ background: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRejectConfirm() {
    if (!clinicId || !getToken || !rejectTarget) {
      return;
    }

    setActionLoadingId(rejectTarget.id);
    setError(null);
    setNotice(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports/${rejectTarget.id}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: rejectReason.trim() }),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setNotice('Export rejected.');
      setRejectTarget(null);
      setRejectReason('');
      await loadExports({ background: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRetry(exportId: string) {
    if (!clinicId || !getToken) {
      return;
    }

    setActionLoadingId(exportId);
    setError(null);
    setNotice(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports/${exportId}/retry`,
        {
          method: 'PATCH',
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setNotice('Export queued for retry.');
      await loadExports({ background: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDownload(exportId: string) {
    if (!clinicId || !getToken) {
      return;
    }

    setActionLoadingId(exportId);
    setError(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports/${exportId}/download`,
        {
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `research-export-${exportId}.zip`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setActionLoadingId(null);
    }
  }

  const rowCountEntries = (item: ResearchExportItem) =>
    Object.entries(item.rowCounts).filter(([, value]) => value > 0);

  const dateRangeInvalid = !fromDate || !toDate || toDate < fromDate;

  return (
    <RouteGuard requiredPermission="RESEARCH.EXPORT.REQUEST">
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
                onClick={() => void loadExports({ background: true })}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toDate">To date</Label>
                  <Input
                    id="toDate"
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
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

              {dateRangeInvalid && (
                <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  The end date must be on or after the start date.
                </div>
              )}

              <Button
                onClick={() => void handleRequestExport()}
                disabled={submitting || dateRangeInvalid}
                className="gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Request export for {formatRange(fromDate, toDate)}
              </Button>
            </div>
          </FormSectionCard>

          <Card className="rounded-lg border-border/80 bg-card/90 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <GitBranch className="h-5 w-5 text-primary" />
                Pack Contents
              </CardTitle>
              <CardDescription>
                Every completed export produces the same de-identified bundle.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <ul className="space-y-2">
                <li>`manifest.json`, `SHA256SUMS.txt`</li>
                <li>`research_subjects.csv`, `research_ops_checkins.csv`</li>
                <li>`research_ops_assignments.csv`, `research_clinical_vitals.csv`</li>
                <li>`research_clinical_screenings.csv`, `research_measurements.csv`</li>
                <li>`research_appointments.csv`, `research_revocations.csv`</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-success-ink">
            {notice}
          </div>
        )}

        <Card className="rounded-lg border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Export Activity
            </CardTitle>
            <CardDescription>
              Approval, background processing, GitHub sync, and downloads all appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading exports…
              </div>
            ) : exports.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
                No exports yet. Request your first research pack above.
              </div>
            ) : (
              exports.map((item) => {
                const rows = rowCountEntries(item);
                const isBusy = actionLoadingId === item.id;
                return (
                  <div
                    key={item.id}
                    className="space-y-4 rounded-[24px] border border-border/70 bg-background/60 p-5"
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
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
                          <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            <div className="mb-1 flex items-center gap-2 font-medium">
                              <AlertTriangle className="h-4 w-4" />
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
                            {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Download zip
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
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
                  !rejectReason.trim() ||
                  (rejectTarget ? actionLoadingId === rejectTarget.id : false)
                }
              >
                {rejectTarget && actionLoadingId === rejectTarget.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Reject export
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RouteGuard>
  );
}
