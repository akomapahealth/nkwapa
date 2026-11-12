'use client';

import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';

import { useCallback, useEffect, useState } from 'react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { zoneLabel } from '@/lib/clinic-zones';
import { formatOpsDateTime, formatOpsTimestamp } from '@/lib/ops';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import {
  InlineErrorState,
  SectionSkeleton,
  SelectClinicState,
} from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import { DataTable, SHEET_GUTTER, type DataTableColumn } from '@/components/ui/data-table';
import { ListFilters, ListSearch } from '@/components/app-shell/ListToolbar';

interface AuditRow {
  id: string;
  createdAt: string;
  actorUserId: string;
  actorDisplayName: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
}

export default function AuditPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const { isOnline } = useSync();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  /*
    Context, not a filter. This log is `/clinics/:clinicId/audit` -- one clinic, therefore one
    zone -- so a zone control here could only say "all" or "none". What is worth saying is which
    zone's activity the reader is looking at, and that sharing a zone with another clinic does
    not put that clinic's entries in this log.
  */
  const activeClinic = getActiveBootstrapClinic(bootstrap, clinicId);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  // A person picked from a result row: an exact id, with the name kept for the summary.
  const [actor, setActor] = useState<{ id: string; name: string } | null>(null);
  // Free text matched against actor names and emails, sent once typing pauses.
  const [personDraft, setPersonDraft] = useState('');
  const [person, setPerson] = useState('');
  const [entityType, setEntityType] = useState('');
  const [requestId, setRequestId] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setPerson(personDraft.trim()), 300);
    return () => clearTimeout(timer);
  }, [personDraft]);

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
        if (actor) params.set('actor', actor.id);
        else if (person) params.set('q', person);
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
    [clinicId, getToken, from, to, action, actor, person, entityType, requestId],
  );

  useEffect(() => {
    if (clinicId) fetchAudit();
  }, [fetchAudit, clinicId]);

  const filterToActor = (row: AuditRow) => {
    setActor({ id: row.actorUserId, name: row.actorDisplayName });
    setPersonDraft('');
    setPerson('');
  };

  const clearAll = () => {
    setFrom('');
    setTo('');
    setAction('');
    setActor(null);
    setPersonDraft('');
    setPerson('');
    setEntityType('');
    setRequestId('');
  };

  const columns: DataTableColumn<AuditRow>[] = [
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Time',
      cell: ({ getValue }) => {
        const v = getValue() as string | null | undefined;
        return v ? formatOpsTimestamp(v) : '';
      },
    },
    {
      id: 'actorDisplayName',
      accessorKey: 'actorDisplayName',
      header: 'Actor',
      cell: ({ row }) => <ActorButton row={row.original} onSelect={filterToActor} />,
    },
    { id: 'action', accessorKey: 'action', header: 'Action' },
    { id: 'entityType', accessorKey: 'entityType', header: 'Entity' },
    {
      id: 'entityId',
      accessorKey: 'entityId',
      header: 'Entity ID',
      cell: ({ getValue }) => <Token value={getValue() as string} />,
    },
    {
      id: 'requestId',
      accessorKey: 'requestId',
      header: 'Request ID',
      cell: ({ getValue }) => <Token value={getValue() as string} />,
    },
  ];

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="AUDIT.READ">
        <SelectClinicState surface="The audit log" />
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="AUDIT.READ">
      <div className="space-y-6">
        <AppPageHeader
          title="Audit log"
          description="Trace clinic activity and changes."
          helpTitle="How to investigate activity"
          helpText="Search for a person, or select a name in the results, then narrow by date, action, entity, or request ID to rebuild a timeline for support, governance, or incident review."
        />

        <section aria-label="Search the audit log" className="space-y-3">
          <ListSearch
            id="person"
            label="Person"
            value={actor ? actor.name : personDraft}
            onChange={(value) => {
              setActor(null);
              setPersonDraft(value);
            }}
            placeholder="Name or email of a staff member or volunteer"
            help="Results update as you type. Select a name in the results to follow one person."
          />
          <ListFilters
            groupLabel="Audit filters"
            sheetTitle="Filter audit events"
            sheetDescription="Filters update the timeline immediately, for this clinic only."
            onClearAll={clearAll}
            chips={[
              {
                label: 'Zone',
                value: activeClinic ? zoneLabel(activeClinic.zoneCode) : null,
              },
              { label: 'From', value: from || null, onRemove: () => setFrom('') },
              { label: 'To', value: to || null, onRemove: () => setTo('') },
              { label: 'Action', value: action || null, onRemove: () => setAction('') },
              { label: 'Entity', value: entityType || null, onRemove: () => setEntityType('') },
              { label: 'Request', value: requestId || null, onRemove: () => setRequestId('') },
            ]}
          >
            <div className="grid gap-4">
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
          </ListFilters>
        </section>

        {!isOnline ? <StaleDataNotice isOnline={false} /> : null}
        {error ? (
          <InlineErrorState
            description={error}
            onRetry={() => void fetchAudit()}
            retryLabel="Reload audit log"
          />
        ) : null}

        <section aria-label="Audit results" className="space-y-3 pb-20">
          {/* What is loaded, said once in words: a count tile and "Has more: Yes" said it twice. */}
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Newest first, for this clinic only.{' '}
            <span className="tabular-nums">
              {rows.length === 1 ? '1 event' : `${rows.length} events`} loaded
            </span>
            {nextCursor ? '; older history is available below.' : '.'}
          </p>
          {loading && rows.length === 0 ? (
            <SectionSkeleton lines={4} className="border-0 bg-transparent p-0 shadow-none" />
          ) : error && rows.length === 0 ? null : !loading && rows.length === 0 ? (
            <EmptyStateCard
              title="No audit events match the current filters"
              description="Adjust your filters or widen the date range to pull more activity into view."
            />
          ) : (
            <>
              <div className="-mx-4 divide-y divide-border border-y border-border compact:-mx-6 md:hidden">
                {rows.map((row) => (
                  <article key={row.id} className={`py-4 ${SHEET_GUTTER}`}>
                    <div className="flex items-start justify-between gap-3">
                      {/*
                          min-w-0 and break-words, because an audit action is an unbroken token
                          like PATIENT_RESIDENTIAL_LOCATION_UPDATED. A flex item defaults to
                          min-width:auto, so it refuses to shrink below that word and pushed the
                          card 188px past a 375px screen -- the audit log was unreadable on a
                          phone, which is where a director checks it.
                        */}
                      <div className="min-w-0">
                        <h2 className="break-words font-body text-sm font-semibold text-foreground">
                          {row.action}
                        </h2>
                        <p className="mt-1 break-words text-sm text-muted-foreground">
                          {row.entityType} • <ActorButton row={row} onSelect={filterToActor} />
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatOpsDateTime(row.createdAt)}
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

              <div className="hidden md:block">
                <DataTable
                  bleed
                  keyboardScroll
                  caption="Audit events"
                  columns={columns}
                  data={rows}
                  isRefreshing={loading}
                  pageSizeOptions={[25, 50, 100]}
                  initialPageSize={25}
                />
              </div>
            </>
          )}

          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fetchAudit(nextCursor, true)}
                disabled={loadingMore}
              >
                Load more
                <span aria-live="polite" className="sr-only">
                  {loadingMore ? 'Loading more results' : ''}
                </span>
              </Button>
            </div>
          )}
        </section>
      </div>
    </RouteGuard>
  );
}

/** A long id: mono, quiet, the first 8 characters with the rest on hover and for copy. */
function Token({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span title={value} className="font-mono text-xs text-muted-foreground">
      {value.length > 12 ? `${value.slice(0, 8)}…` : value}
    </span>
  );
}

/** An actor's name that narrows the log to that one person. */
function ActorButton({ row, onSelect }: { row: AuditRow; onSelect: (row: AuditRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className="rounded-sm text-left font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`Show only ${row.actorDisplayName}'s activity`}
    >
      {row.actorDisplayName}
    </button>
  );
}
