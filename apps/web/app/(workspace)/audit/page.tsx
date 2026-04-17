'use client';

import { useCallback, useEffect, useState } from 'react';
import { ActivitySquare, FileClock, Shield } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { EmptyStateCard } from '@/components/ops/OpsShared';

interface AuditRow {
  id: string;
  createdAt: string;
  actorDisplayName: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
}

export default function AuditPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId = bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [entityType, setEntityType] = useState('');
  const [requestId, setRequestId] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(
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
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (action) params.set('action', action);
        if (actor) params.set('actor', actor);
        if (entityType) params.set('entityType', entityType);
        if (requestId) params.set('requestId', requestId);
        if (cursor) params.set('cursor', cursor);
        params.set('limit', '50');
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/audit?${params.toString()}`,
          { getToken },
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          items: AuditRow[];
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
    [clinicId, getToken, from, to, action, actor, entityType, requestId],
  );

  useEffect(() => {
    if (clinicId) fetchAudit();
  }, [fetchAudit, clinicId]);

  const columns: GridColDef[] = [
    {
      field: 'createdAt',
      headerName: 'Time',
      width: 180,
      valueFormatter: (v) => (v ? new Date(v as string).toLocaleString() : ''),
    },
    {
      field: 'actorDisplayName',
      headerName: 'Actor',
      width: 150,
    },
    { field: 'action', headerName: 'Action', width: 200 },
    { field: 'entityType', headerName: 'Entity', width: 120 },
    { field: 'entityId', headerName: 'Entity ID', width: 280 },
    { field: 'requestId', headerName: 'Request ID', width: 120 },
  ];

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="AUDIT.READ">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to view audit.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="AUDIT.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Governance"
          title="Audit log"
          description="Trace clinic activity and changes."
          helpTitle="How to investigate activity"
          helpText="Filter by date, actor, action, entity, or request ID to rebuild a timeline for support, governance, or incident review."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AppMetricCard
            title="Visible events"
            value={rows.length}
            icon={ActivitySquare}
            detail="Events currently loaded into the investigation view."
          />
          <AppMetricCard
            title="Has more results"
            value={nextCursor ? 'Yes' : 'No'}
            icon={FileClock}
            detail="Cursor pagination remains available when more history exists."
          />
          <AppMetricCard
            title="Audit scope"
            value="Clinic"
            icon={Shield}
            detail="Audit records are filtered to the active clinic context."
          />
        </div>

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader className="space-y-3">
            <CardTitle className="text-xl">Filters</CardTitle>
            <CardDescription>Focus the timeline before loading results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
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
              <div className="space-y-2">
                <Label htmlFor="action">Action</Label>
                <Input
                  id="action"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="ENCOUNTER.CREATE"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actor">Actor</Label>
                <Input
                  id="actor"
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="User ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entityType">Entity type</Label>
                <Input
                  id="entityType"
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  placeholder="Encounter"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requestId">Request ID</Label>
                <Input
                  id="requestId"
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value)}
                  placeholder="Trace a request"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fetchAudit()} disabled={loading} className="rounded-2xl">
                {loading ? 'Loading...' : 'Apply filters'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setAction('');
                  setActor('');
                  setEntityType('');
                  setRequestId('');
                }}
              >
                Clear
              </Button>
            </div>
            <ActiveFilterSummary
              items={[
                { label: 'From', value: from || null },
                { label: 'To', value: to || null },
                { label: 'Action', value: action || null },
                { label: 'Actor', value: actor || null },
                { label: 'Entity', value: entityType || null },
                { label: 'Request', value: requestId || null },
              ]}
              emptyLabel="Recent clinic activity"
            />
            <ProgressiveHelp title="Filter tips">
              Start with a date range, then add action, actor, entity, or request ID only when you
              need to rebuild a narrower timeline for support or incident review.
            </ProgressiveHelp>
          </CardContent>
        </Card>

        {error ? (
          <InlineErrorState
            description={error}
            onRetry={() => void fetchAudit()}
            retryLabel="Reload audit log"
          />
        ) : null}

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Audit events</CardTitle>
                <CardDescription>Recent activity for the active clinic.</CardDescription>
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
                title="No audit events match the current filters"
                description="Adjust your filters or widen the date range to pull more activity into view."
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
                          <h3 className="text-sm font-semibold text-foreground">{row.action}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {row.entityType} • {row.actorDisplayName}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-3 break-all text-xs text-muted-foreground">
                        Entity ID: {row.entityId}
                      </p>
                      <p className="mt-2 break-all text-xs text-muted-foreground">
                        Request ID: {row.requestId}
                      </p>
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
                    pageSizeOptions={[25, 50, 100]}
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
                  onClick={() => fetchAudit(nextCursor, true)}
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
