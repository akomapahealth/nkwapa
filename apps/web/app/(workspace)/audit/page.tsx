'use client';

import { useCallback, useEffect, useState } from 'react';
import { ActivitySquare, FileClock, Search, Shield } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { zoneLabel } from '@/lib/clinic-zones';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

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

  const columns: DataTableColumn<AuditRow>[] = [
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Time',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return v ? new Date(v as string).toLocaleString() : '';
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
    { id: 'entityId', accessorKey: 'entityId', header: 'Entity ID' },
    { id: 'requestId', accessorKey: 'requestId', header: 'Request ID' },
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
          helpText="Search for a person, or select a name in the results, then narrow by date, action, entity, or request ID to rebuild a timeline for support, governance, or incident review."
        />

        <AppMetricGroup className="md:grid-cols-3">
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
        </AppMetricGroup>

        <RecordSection>
          <RecordSectionHeader className="space-y-3">
            <RecordSectionTitle>Filters</RecordSectionTitle>
            <RecordSectionDescription>
              Focus the timeline before loading results.
            </RecordSectionDescription>
          </RecordSectionHeader>
          <RecordSectionContent className="space-y-4">
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="person">Person</Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="person"
                    type="search"
                    value={actor ? actor.name : personDraft}
                    onChange={(e) => {
                      setActor(null);
                      setPersonDraft(e.target.value);
                    }}
                    placeholder="Name or email of a staff member or volunteer"
                    className="pl-9"
                  />
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
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fetchAudit()} disabled={loading} className="rounded-lg">
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
                  setFrom('');
                  setTo('');
                  setAction('');
                  setActor(null);
                  setPersonDraft('');
                  setPerson('');
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
                { label: 'Person', value: actor?.name ?? (person || null) },
                { label: 'Entity', value: entityType || null },
                { label: 'Request', value: requestId || null },
                { label: 'Zone', value: activeClinic ? zoneLabel(activeClinic.zoneCode) : null },
              ]}
              emptyLabel="Recent clinic activity"
            />
            <ProgressiveHelp title="Filter tips">
              Type part of someone&apos;s name or email to see what they did, or select a name in
              the results to follow that one person. Add a date range, action, entity, or request ID
              to rebuild a narrower timeline for support or incident review.
            </ProgressiveHelp>
          </RecordSectionContent>
        </RecordSection>

        {error ? (
          <InlineErrorState
            description={error}
            onRetry={() => void fetchAudit()}
            retryLabel="Reload audit log"
          />
        ) : null}

        <RecordSection>
          <RecordSectionHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <RecordSectionTitle>Audit events</RecordSectionTitle>
                <RecordSectionDescription>
                  Recent activity for the active clinic.
                </RecordSectionDescription>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
                <p className="text-muted-foreground">Loaded rows</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{rows.length}</p>
              </div>
            </div>
          </RecordSectionHeader>
          <RecordSectionContent className="space-y-4">
            {loading && rows.length === 0 ? (
              <SectionSkeleton lines={4} className="border-0 bg-transparent p-0 shadow-none" />
            ) : !loading && rows.length === 0 ? (
              <EmptyStateCard
                title="No audit events match the current filters"
                description="Adjust your filters or widen the date range to pull more activity into view."
              />
            ) : (
              <>
                <div className="divide-y divide-border md:hidden">
                  {rows.map((row) => (
                    <article key={row.id} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        {/*
                          min-w-0 and break-words, because an audit action is an unbroken token
                          like PATIENT_RESIDENTIAL_LOCATION_UPDATED. A flex item defaults to
                          min-width:auto, so it refuses to shrink below that word and pushed the
                          card 188px past a 375px screen -- the audit log was unreadable on a
                          phone, which is where a director checks it.
                        */}
                        <div className="min-w-0">
                          <h3 className="break-words text-sm font-semibold text-foreground">
                            {row.action}
                          </h3>
                          <p className="mt-1 break-words text-sm text-muted-foreground">
                            {row.entityType} • <ActorButton row={row} onSelect={filterToActor} />
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
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

                <div className="hidden md:block">
                  <DataTable
                    keyboardScroll
                    caption="Audit events"
                    columns={columns}
                    data={rows}
                    isRefreshing={loading}
                    pageSizeOptions={[25, 50, 100]}
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
                  className="rounded-lg"
                >
                  Load more
                  <span aria-live="polite" className="sr-only">
                    {loadingMore ? 'Loading more results' : ''}
                  </span>
                </Button>
              </div>
            )}
          </RecordSectionContent>
        </RecordSection>
      </div>
    </RouteGuard>
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
