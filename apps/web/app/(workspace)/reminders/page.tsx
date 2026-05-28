'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Clock3, SendHorizontal } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyStateCard } from '@/components/ops/OpsShared';

interface ReminderRow {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string | null;
  channel: string;
  toAddress: string;
  templateKey: string;
  scheduledAt: string;
  sentAt: string | null;
  status: string;
  providerMessageId: string | null;
  failureReason: string | null;
  createdAt: string;
}

export default function RemindersPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId = getBootstrapActiveClinicId(bootstrap);

  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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
    [clinicId, getToken, status, from, to],
  );

  useEffect(() => {
    if (clinicId) fetchReminders();
  }, [fetchReminders, clinicId]);

  const columns: GridColDef[] = [
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 160,
      valueFormatter: (v) => (v ? new Date(v as string).toLocaleString() : ''),
    },
    {
      field: 'scheduledAt',
      headerName: 'Scheduled',
      width: 160,
      valueFormatter: (v) => (v ? new Date(v as string).toLocaleString() : ''),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Badge
          variant={
            params.value === 'SENT'
              ? 'finalized'
              : params.value === 'FAILED'
                ? 'destructive'
                : 'draft'
          }
        >
          {String(params.value)}
        </Badge>
      ),
    },
    { field: 'templateKey', headerName: 'Template', width: 180 },
    {
      field: 'toAddress',
      headerName: 'To',
      width: 140,
      valueFormatter: (v) =>
        v && String(v).length > 8 ? `${String(v).slice(0, 4)}***${String(v).slice(-4)}` : String(v),
    },
    { field: 'failureReason', headerName: 'Failure', width: 150 },
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

  return (
    <RouteGuard requiredPermission="REMINDER.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Follow-up delivery"
          title="Reminders"
          description="Review follow-up delivery at a glance."
          helpTitle="How reminder history works"
          helpText="Use the filters to narrow reminder history by status and date, then inspect queued, sent, or failed messages."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AppMetricCard
            title="Visible reminders"
            value={rows.length}
            icon={Bell}
            detail="Rows currently loaded into the active reminder view."
          />
          <AppMetricCard
            title="Queued"
            value={queuedCount}
            icon={Clock3}
            detail="Reminders waiting to be processed or delivered."
          />
          <AppMetricCard
            title="Sent"
            value={sentCount}
            icon={SendHorizontal}
            detail="Reminders already delivered successfully."
          />
        </div>

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
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
                    <SelectItem value="FAILED">Failed</SelectItem>
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
                  className="flex-1 rounded-2xl"
                >
                  {loading ? 'Loading...' : 'Apply filters'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => {
                    setStatus('');
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
                { label: 'From', value: from || null },
                { label: 'To', value: to || null },
              ]}
              emptyLabel="All reminder history"
            />
            <ProgressiveHelp title="Filter tips">
              Use status when you want delivery outcomes, use dates when you want a time window, and
              combine both when tracing a reminder campaign or troubleshooting failures.
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

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Reminder history</CardTitle>
                <CardDescription>Delivery timing, channel, and failure details.</CardDescription>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/75 px-4 py-3 text-sm">
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
                      className="rounded-3xl border border-border/80 bg-background/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            {row.templateKey}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {new Date(row.scheduledAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge
                          variant={
                            row.status === 'SENT'
                              ? 'finalized'
                              : row.status === 'FAILED'
                                ? 'destructive'
                                : 'draft'
                          }
                        >
                          {row.status}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{row.toAddress}</p>
                      {row.failureReason ? (
                        <p className="mt-2 text-sm text-destructive">{row.failureReason}</p>
                      ) : null}
                    </article>
                  ))}
                </div>

                <Box
                  sx={{ height: 500, width: '100%' }}
                  className="hidden overflow-x-auto md:block"
                >
                  <DataGrid
                    rows={rows}
                    columns={columns}
                    loading={loading}
                    pageSizeOptions={[25, 50]}
                    sx={dataGridSx}
                  />
                </Box>
              </>
            )}

            {nextCursor && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fetchReminders(nextCursor, true)}
                  disabled={loadingMore}
                  className="rounded-2xl"
                >
                  {loadingMore ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
