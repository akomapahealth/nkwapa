'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, Clock3, SendHorizontal, Timer } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { readApiError } from '@/lib/ops';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';
import {
  NOTIFICATION_TYPE_FILTERS,
  describeEmailAvailability,
  deliveryLatencyMs,
  explainFailure,
  explainTerminalStatus,
  formatDeliveryLatency,
  formatFailureReason,
  formatTemplateLabel,
  getStatusVariant,
  medianDeliveryLatencyMs,
  type EmailAvailability,
} from '@/lib/notification-delivery';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { removeWithUndo } from '@/lib/undoable';

interface ReminderRow {
  id: string;
  clinicId: string | null;
  patientId: string | null;
  encounterId: string | null;
  appointmentId: string | null;
  channel: string;
  toAddress: string;
  templateKey: string;
  scheduledAt: string;
  sentAt: string | null;
  status: string;
  providerMessageId: string | null;
  failureReason: string | null;
  /** Set only on a reminder a staff member scheduled directly, the only kind staff can cancel. */
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Partially hide the recipient.
 *
 * Phone numbers and email addresses are patient contact details, and this page is a
 * broad operator view rather than a chart. Enough is shown to recognise a row without
 * putting a readable contact list on screen.
 */
function maskAddress(value: string) {
  return value && value.length > 8 ? `${value.slice(0, 4)}***${value.slice(-4)}` : value;
}

export default function RemindersPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  // Staff lifecycle notices are withheld by the server from anyone without this (#116).
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const seesStaffNotices = perms.includes('*') || perms.includes('REMINDER.READ_STAFF_NOTICES');
  const canCancelAny = perms.includes('*') || perms.includes('REMINDER.CANCEL_ANY');
  // Reminders cancelled on screen and waiting out their Undo window.
  const [pendingCancelIds, setPendingCancelIds] = useState<ReadonlySet<string>>(new Set());
  const [cancelError, setCancelError] = useState<string | null>(null);
  const typeFilters = NOTIFICATION_TYPE_FILTERS.filter(
    (option) => seesStaffNotices || option.value !== 'STAFF',
  );

  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [emailStatus, setEmailStatus] = useState<EmailAvailability | null>(null);
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReminders = useCallback(
    async (cursor?: string, append = false) => {
      if (!clinicId || !getToken) return;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (channel) params.set('channel', channel);
        if (type) params.set('type', type);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (cursor) params.set('cursor', cursor);
        params.set('limit', '50');
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/reminders?${params.toString()}`,
          { getToken },
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          items: ReminderRow[];
          nextCursor: string | null;
        };
        if (append) {
          setRows((prev) => [...prev, ...data.items]);
        } else {
          setRows(data.items);
        }
        setNextCursor(data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!append) setRows([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [clinicId, getToken, status, channel, type, from, to],
  );

  /**
   * Whether email can be delivered at all.
   *
   * Fetched separately from the ledger and deliberately non-blocking: if this probe
   * fails the page still lists messages, it just cannot explain a configuration
   * problem it could not read.
   */
  useEffect(() => {
    if (!clinicId || !getToken) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/reminders/email-status`,
          { getToken },
        );
        if (!res.ok) return;
        const data = (await res.json()) as EmailAvailability;
        if (!cancelled) setEmailStatus(data);
      } catch {
        // Non-fatal: the ledger is still worth showing without the banner.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clinicId, getToken]);

  useEffect(() => {
    if (clinicId) fetchReminders();
  }, [fetchReminders, clinicId]);

  /** A queued reminder this person scheduled, or anyone's for a manager (#116). */
  const canCancel = (row: ReminderRow) =>
    row.status === 'QUEUED' &&
    row.createdByUserId !== null &&
    (canCancelAny || row.createdByUserId === bootstrap?.userId);

  /*
    A queued reminder that has not gone out costs nothing to cancel and can be rescheduled, so it
    does not ask first: it shows as cancelled at once and is sent a few seconds later, with Undo.
  */
  const cancelReminder = (row: ReminderRow) => {
    if (!clinicId || !getToken) return;
    setCancelError(null);
    const mark = (pending: boolean) =>
      setPendingCancelIds((current) => {
        const next = new Set(current);
        if (pending) next.add(row.id);
        else next.delete(row.id);
        return next;
      });
    removeWithUndo({
      message: 'Reminder cancelled',
      hide: () => mark(true),
      restore: () => mark(false),
      commit: async () => {
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/reminders/${encodeURIComponent(row.id)}/cancel`,
          { method: 'POST', getToken },
        );
        if (!res.ok) throw new Error(await readApiError(res));
        await fetchReminders();
        mark(false);
      },
      failureMessage: 'The reminder could not be cancelled, so it is still queued.',
    });
  };

  const columns: DataTableColumn<ReminderRow>[] = [
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return v ? new Date(v as string).toLocaleString() : '';
      },
    },
    {
      id: 'scheduledAt',
      accessorKey: 'scheduledAt',
      header: 'Scheduled',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return v ? new Date(v as string).toLocaleString() : '';
      },
    },
    {
      id: 'sentAt',
      accessorKey: 'sentAt',
      header: 'Sent',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return v ? new Date(v as string).toLocaleString() : '';
      },
    },
    {
      /*
        Derived, not a stored column: `sentAt` already records the fact and this is the
        arithmetic on it. Sorting works because the value is the number of milliseconds; the
        formatter is only what an operator reads.
      */
      id: 'deliveryLatency',
      accessorKey: 'deliveryLatency',
      header: 'Time to send',
      accessorFn: (row) => deliveryLatencyMs(row),
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return formatDeliveryLatency(typeof v === 'number' ? v : null);
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => (
        <Badge variant={getStatusVariant(String(getValue()))}>{String(getValue())}</Badge>
      ),
    },
    { id: 'channel', accessorKey: 'channel', header: 'Channel' },
    {
      id: 'templateKey',
      accessorKey: 'templateKey',
      header: 'Type',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return formatTemplateLabel(String(v));
      },
    },
    {
      id: 'appointmentId',
      accessorKey: 'appointmentId',
      header: 'Appointment',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return v ? String(v).slice(0, 8) : '';
      },
    },
    {
      id: 'toAddress',
      accessorKey: 'toAddress',
      header: 'To',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return maskAddress(String(v));
      },
    },
    {
      id: 'failureReason',
      accessorKey: 'failureReason',
      header: 'Failure',
      cell: ({ getValue }) => {
        const explanation = explainFailure(getValue() ? String(getValue()) : null);
        if (!explanation) return '';
        // The detail and recovery are the point of the column; without them the code
        // is just a restatement of "this failed".
        return (
          <span title={[explanation.detail, explanation.recovery].filter(Boolean).join(' ')}>
            {explanation.label}
          </span>
        );
      },
    },
    {
      id: 'updatedAt',
      accessorKey: 'updatedAt',
      header: 'Updated',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return v ? new Date(v as string).toLocaleString() : '';
      },
    },
    {
      id: 'actions',

      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row: params }) => {
        const row = params.original;
        if (pendingCancelIds.has(row.id)) {
          return <span className="text-sm text-muted-foreground">Cancelled</span>;
        }
        if (!canCancel(row)) return null;
        return (
          <Button size="sm" variant="outline" className="h-9" onClick={() => cancelReminder(row)}>
            Cancel
          </Button>
        );
      },
    },
  ];

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="REMINDER.READ">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to view reminders.</p>
        </div>
      </RouteGuard>
    );
  }

  const queuedCount = rows.filter((row) => row.status === 'QUEUED').length;
  const sentCount = rows.filter((row) => row.status === 'SENT').length;
  const deliveredCount = rows.filter((row) => row.status === 'DELIVERED').length;
  const failedCount = rows.filter((row) => row.status === 'FAILED').length;
  const medianLatencyMs = medianDeliveryLatencyMs(rows);
  const emailNotice = describeEmailAvailability(emailStatus);

  return (
    <RouteGuard requiredPermission="REMINDER.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Message delivery"
          title="Notifications"
          description={
            seesStaffNotices
              ? 'Review every message the clinic has sent: reminders, portal invites, appointment updates, and staff access notices.'
              : 'Review the messages the clinic has sent to patients: reminders, portal invites and appointment updates.'
          }
          helpTitle="How message delivery works"
          helpText="Filter by status, channel, type, or date, then inspect queued, sent, delivered, or failed messages. Failed rows explain what went wrong and what to do about it."
        />

        {cancelError ? <InlineNotice tone="error">{cancelError}</InlineNotice> : null}

        {emailNotice ? (
          <InlineNotice tone={emailNotice.tone} live={false}>
            <span className="font-semibold">{emailNotice.title}.</span> {emailNotice.detail}
          </InlineNotice>
        ) : null}

        <AppMetricGroup className="sm:grid-cols-2 xl:grid-cols-6">
          <AppMetricCard
            title="Visible messages"
            value={rows.length}
            icon={Bell}
            detail="Rows currently loaded into the active view."
          />
          <AppMetricCard
            title="Queued"
            value={queuedCount}
            icon={Clock3}
            detail="Waiting to be processed or delivered."
          />
          <AppMetricCard
            title="Sent"
            value={sentCount}
            icon={SendHorizontal}
            detail="Accepted by the configured provider."
          />
          <AppMetricCard
            title="Delivered"
            value={deliveredCount}
            icon={CheckCheck}
            detail="Confirmed delivered by a provider callback. Only SMS reports this."
          />
          <AppMetricCard
            title="Failed"
            value={failedCount}
            icon={AlertTriangle}
            detail="Not delivered. Open a row to see why and what to do."
          />
          <AppMetricCard
            title="Typical time to send"
            value={formatDeliveryLatency(medianLatencyMs)}
            icon={Timer}
            detail="Median wait between a message becoming due and the provider accepting it, across the rows loaded here."
          />
        </AppMetricGroup>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-xl">Filters</CardTitle>
            <CardDescription>Focus the reminder history before opening results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={status || 'ALL'}
                  onValueChange={(value) => setStatus(value === 'ALL' ? '' : value)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="QUEUED">Queued</SelectItem>
                    <SelectItem value="SENT">Sent</SelectItem>
                    <SelectItem value="DELIVERED">Delivered</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel">Channel</Label>
                <Select
                  value={channel || 'ALL'}
                  onValueChange={(value) => setChannel(value === 'ALL' ? '' : value)}
                >
                  <SelectTrigger id="channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All channels</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={type || 'ALL'}
                  onValueChange={(value) => setType(value === 'ALL' ? '' : value)}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All types</SelectItem>
                    {typeFilters.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="from">From</Label>
                <Input
                  id="from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  onClick={() => fetchReminders()}
                  disabled={loading}
                  className="flex-1 rounded-lg"
                >
                  Apply filters
                  <span aria-live="polite" className="sr-only">
                    {loading ? 'Applying filters' : ''}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    setStatus('');
                    setChannel('');
                    setType('');
                    setFrom('');
                    setTo('');
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
            <ActiveFilterSummary
              items={[
                { label: 'Status', value: status || null },
                { label: 'Channel', value: channel || null },
                {
                  label: 'Type',
                  value:
                    NOTIFICATION_TYPE_FILTERS.find((option) => option.value === type)?.label ??
                    null,
                },
                { label: 'From', value: from || null },
                { label: 'To', value: to || null },
              ]}
              emptyLabel="All message history"
            />
            <ProgressiveHelp title="Reading delivery status">
              Queued means the message is waiting to send, and Sent means the provider accepted it —
              the Sent column and &ldquo;Time to send&rdquo; show when that happened and how long it
              waited. Only SMS reports Delivered: {explainTerminalStatus('EMAIL')} So a message
              reading Sent has left the clinic, and anything after that is the mail provider&rsquo;s
              to answer for. Failed rows name the reason and what to do about it, so start there
              when a patient says they heard nothing.
            </ProgressiveHelp>
          </CardContent>
        </Card>

        {error ? (
          <InlineErrorState
            description={error}
            onRetry={() => void fetchReminders()}
            retryLabel="Reload reminders"
          />
        ) : null}

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Reminder history</CardTitle>
                <CardDescription>Delivery timing, channel, and failure details.</CardDescription>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
                <p className="text-muted-foreground">Loaded rows</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{rows.length}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && rows.length === 0 ? (
              <SectionSkeleton lines={4} className="border-0 bg-transparent p-0 shadow-none" />
            ) : !loading && rows.length === 0 ? (
              <EmptyStateCard
                title="No reminders match the current filters"
                description="Try a wider date range or a broader status filter to review reminder activity."
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {rows.map((row) => (
                    <article
                      key={row.id}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground">
                            {row.templateKey}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {new Date(row.scheduledAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant={getStatusVariant(row.status)}>{row.status}</Badge>
                      </div>
                      <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                        <p>
                          {row.channel} to {maskAddress(row.toAddress)}
                        </p>
                        {row.appointmentId ? (
                          <p>Appointment {row.appointmentId.slice(0, 8)}</p>
                        ) : null}
                        {row.sentAt ? (
                          <p>
                            Sent {new Date(row.sentAt).toLocaleString()} (
                            {formatDeliveryLatency(deliveryLatencyMs(row))} after it was due)
                          </p>
                        ) : null}
                      </div>
                      {row.failureReason ? (
                        <p className="mt-2 text-sm text-destructive">
                          {formatFailureReason(row.failureReason)}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>

                <div className="hidden md:block">
                  <DataTable
                    caption="Messages sent by the clinic"
                    columns={columns}
                    data={rows}
                    isRefreshing={loading}
                    pageSizeOptions={[25, 50]}
                  />
                </div>
              </>
            )}

            {nextCursor && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fetchReminders(nextCursor, true)}
                  disabled={loadingMore}
                  className="rounded-lg"
                >
                  Load more
                  <span aria-live="polite" className="sr-only">
                    {loadingMore ? 'Loading more results' : ''}
                  </span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
