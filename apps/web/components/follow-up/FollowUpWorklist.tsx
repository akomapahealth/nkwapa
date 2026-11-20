'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PhoneCall, RefreshCw } from 'lucide-react';
import { FOLLOW_UP_TIER_LABELS } from '@nkwapa/db/follow-up-stratification';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ListFilters, ListSearch, TOOLBAR_SELECT } from '@/components/app-shell/ListToolbar';
import { ResourceState } from '@/components/feedback/ResourceState';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import {
  FollowUpTierFilter,
  parseFollowUpTier,
} from '@/components/patients/follow-up/FollowUpTierFilter';
import { FollowUpTierBadge } from '@/components/patients/follow-up/FollowUpTierBadge';
import { PatientIdentity } from '@/components/patients/PatientRegistryCard';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableActions,
  SHEET_GUTTER,
  type DataTableColumn,
} from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { showToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import type { OutboxSyncState } from '@/lib/db';
import {
  fetchFollowUpPacket,
  isFollowUpPacket,
  packetPage,
  type PendingAttempt,
} from '@/lib/follow-up-offline';
import { PENDING_SYNC_LABEL } from '@/lib/ops-offline';
import { useOpsView } from '@/lib/use-ops-view';
import { usePendingFollowUpAttempts } from '@/lib/use-pending-follow-up';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import {
  CONTACT_MODE_LABELS,
  CONTACT_OUTCOME_LABELS,
  CONTACT_PURPOSE_LABELS,
  dueLabel,
  fetchWorklist,
  takeContact,
  WORKLIST_TAB_LABELS,
  WORKLIST_TABS,
  type ContactMode,
  type WorklistFilters,
  type WorklistItem,
  type WorklistPage,
  type WorklistTab,
} from '@/lib/follow-up-contacts';
import { useAsyncResource } from '@/lib/use-async-resource';
import { cn } from '@/lib/utils';
import { RecordContactSheet } from './RecordContactSheet';

const SEARCH_DEBOUNCE_MS = 300;
const ANY = '__any__';
const TAB_COPY: Record<WorklistTab, string> = {
  today: 'Contacts due today, most urgent patients first.',
  overdue: 'Contacts past their date. A contact more than a week late counts as missed.',
  week: 'Contacts due in the next seven days.',
  done: 'Contacts completed, newest first.',
};
const OWNER_LABELS = { me: 'Mine', none: 'Nobody yet' } as const;

/** A row with any call for it still on this device. */
type Row = WorklistItem & { pendingSync?: OutboxSyncState };

/**
 * Lay this device's queued calls over a page. A queued call that reached the patient completes the
 * contact once it sends, so it leaves the due tabs now; one that did not stays, marked as pending.
 */
function withPending(items: WorklistItem[], pending: PendingAttempt[], tab: WorklistTab): Row[] {
  if (pending.length === 0) return items;
  return items.flatMap((item) => {
    const mine = pending.filter((p) => p.contactId === item.id);
    if (mine.length === 0) return [item];
    if (tab !== 'done' && mine.some((p) => p.reached)) return [];
    const state = mine.find((p) => p.state === 'blocked')?.state ?? mine[0].state;
    return [{ ...item, pendingSync: state }];
  });
}

function parseTab(value: string | null): WorklistTab {
  return (WORKLIST_TABS as readonly string[]).includes(value ?? '')
    ? (value as WorklistTab)
    : 'today';
}

/**
 * The follow-up worklist (#338): the clinic's calls and visits by due date, most urgent tier first
 * within each tab. Recording happens in a sheet so the list keeps its place. Offline, the due tabs
 * come from the device's copy of the week and calls queue until the device reconnects.
 */
export function FollowUpWorklist({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const getToken = useAuth();
  const tab = parseTab(searchParams.get('tab'));
  const [filters, setFilters] = useState<WorklistFilters>({
    q: '',
    mode: '',
    tier: parseFollowUpTier(searchParams.get('tier')),
    owner: '',
  });
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(
      () => setFilters((now) => ({ ...now, q: q.trim() })),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [q]);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  const live = useAsyncResource<WorklistPage>({
    fetcher: (token, signal) => fetchWorklist(clinicId, tab, filters, token, signal),
    resourceKey: `${clinicId}:${tab}:${JSON.stringify(filters)}`,
    errorMessage: 'The follow-up list could not be loaded.',
    requiresOnline: true,
  });
  const today = new Date().toISOString().slice(0, 10);
  const userId = useBootstrap()?.bootstrap?.userId ?? null;
  const pending = usePendingFollowUpAttempts(clinicId);
  const pendingIds = useMemo(() => pending.map((p) => p.attemptId), [pending]);
  const packet = useOpsView({
    clinicId,
    kind: 'follow-up-due',
    date: today,
    fetcher: (token, signal) => fetchFollowUpPacket(clinicId, token, signal),
    errorMessage: 'The offline copy of follow-up could not be loaded.',
    pendingIds,
    isValid: isFollowUpPacket,
  });

  // A queued call that left the queue has been recorded: reload the list for the server's view.
  const previousPending = useRef(pendingIds);
  const { refresh: refreshLive, isOnline } = live;
  useEffect(() => {
    const left = previousPending.current.some((id) => !pendingIds.includes(id));
    previousPending.current = pendingIds;
    if (left && isOnline) refreshLive();
  }, [pendingIds, isOnline, refreshLive]);

  // Offline, or the list could not be reached: the due tabs come from the device's copy.
  const fromCopy =
    tab !== 'done' &&
    packet.data !== null &&
    live.data === null &&
    (live.isOfflineBlocked || !!live.error);
  const state = fromCopy
    ? {
        ...live,
        data: packetPage(packet.data!, tab, filters, today, userId),
        error: null,
        isInitialLoading: false,
        savedCopyAt: packet.dataAsOf,
      }
    : live;

  if (!isWebFeatureEnabled('followUpStratification')) {
    return (
      <InlineNotice live={false}>Follow-up is not switched on for this clinic yet.</InlineNotice>
    );
  }

  const loadMore = async () => {
    const cursor = state.data?.nextCursor;
    if (!cursor || !getToken) return;
    setMore({ loading: true, error: null });
    try {
      const page = await fetchWorklist(
        clinicId,
        tab,
        filters,
        getToken,
        new AbortController().signal,
        cursor,
      );
      state.setData((now) =>
        now ? { items: [...now.items, ...page.items], nextCursor: page.nextCursor } : page,
      );
      setMore({ loading: false, error: null });
    } catch (caught) {
      setMore({
        loading: false,
        error: caught instanceof Error ? caught.message : 'More contacts could not be loaded.',
      });
    }
  };

  const take = async (item: WorklistItem) => {
    try {
      const owner = await takeContact(clinicId, item.id, getToken);
      state.setData((now) =>
        now
          ? {
              ...now,
              items: now.items.map((row) => (row.id === item.id ? { ...row, owner } : row)),
            }
          : now,
      );
    } catch (caught) {
      showToast({
        tone: 'error',
        title: 'Could not take this contact',
        description: caught instanceof Error ? caught.message : undefined,
      });
    }
  };

  const chips = [
    {
      label: 'Contact',
      value: filters.mode ? CONTACT_MODE_LABELS[filters.mode] : null,
      onRemove: () => setFilters((now) => ({ ...now, mode: '' })),
    },
    {
      label: 'Tier',
      value: filters.tier ? FOLLOW_UP_TIER_LABELS[filters.tier] : null,
      onRemove: () => setFilters((now) => ({ ...now, tier: '' })),
    },
    {
      label: 'Taken by',
      value: filters.owner ? OWNER_LABELS[filters.owner] : null,
      onRemove: () => setFilters((now) => ({ ...now, owner: '' })),
    },
  ];
  const sheetCopy = packet.data?.items.find((item) => item.id === open) ?? null;

  return (
    <div className="space-y-5">
      <AppPageHeader
        className="border-b-0 pb-0 md:pb-0"
        title="Follow-up"
        description="Calls and visits due, most urgent patients first."
        actions={
          <Button
            variant="ghost"
            className="-ml-4 self-start sm:ml-0"
            onClick={state.refresh}
            disabled={!state.isOnline || state.isInitialLoading || state.isRefreshing}
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {state.isRefreshing ? 'Refreshing' : 'Refresh'}
          </Button>
        }
      />
      <section aria-label="Search and filter follow-up" className="space-y-3">
        <ListSearch
          id="follow-up-search"
          label="Search by patient name or code"
          placeholder="Patient name or code"
          value={q}
          onChange={setQ}
        />
        <ListFilters
          groupLabel="Follow-up filters"
          sheetTitle="Filter follow-up"
          chips={chips}
          onClearAll={() => setFilters((now) => ({ ...now, mode: '', tier: '', owner: '' }))}
          trailing={
            <Select
              value={filters.owner || ANY}
              onValueChange={(value) =>
                setFilters((now) => ({
                  ...now,
                  owner: value === ANY ? '' : (value as WorklistFilters['owner']),
                }))
              }
            >
              <SelectTrigger className={TOOLBAR_SELECT} aria-label="Taken by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Anyone</SelectItem>
                <SelectItem value="me">Mine</SelectItem>
                <SelectItem value="none">Nobody yet</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <div className="space-y-2">
            <Label htmlFor="follow-up-mode">Contact</Label>
            <Select
              value={filters.mode || ANY}
              onValueChange={(value) =>
                setFilters((now) => ({ ...now, mode: value === ANY ? '' : (value as ContactMode) }))
              }
            >
              <SelectTrigger id="follow-up-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any contact</SelectItem>
                {(Object.keys(CONTACT_MODE_LABELS) as ContactMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {CONTACT_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FollowUpTierFilter
            id="follow-up-tier"
            value={filters.tier}
            onChange={(tier) => setFilters((now) => ({ ...now, tier }))}
          />
        </ListFilters>
      </section>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          const params = new URLSearchParams(window.location.search);
          params.set('tab', next);
          setMore({ loading: false, error: null });
          router.push(`/follow-up?${params}`, { scroll: false });
        }}
      >
        <TabsList aria-label="Follow-up contacts">
          {WORKLIST_TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {WORKLIST_TAB_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-0">
          <p className="pb-3 pt-4 text-sm leading-6 text-muted-foreground">{TAB_COPY[tab]}</p>
          <ResourceState
            state={state}
            errorTitle="The follow-up list could not be loaded"
            offlineDescription={
              tab === 'done'
                ? 'You are offline. Done contacts need a connection; the due tabs still work.'
                : 'You are offline and this device has no copy yet. Open Follow-up online once to keep one.'
            }
            offlineDetail="Calls you record are kept on this device. Taking a contact needs a connection."
            isEmpty={(page) => page.items.length === 0}
            empty={{
              title: tab === 'done' ? 'No contacts completed yet' : 'Nobody is due here',
              description:
                tab === 'done'
                  ? 'Contacts recorded at this clinic appear here.'
                  : 'Contacts appear here as patients are tiered and their dates come round.',
              icon: PhoneCall,
              titleAs: 'h2',
            }}
          >
            {(page) => (
              <div className="space-y-4">
                <p role="status" className="text-sm font-medium tabular-nums text-foreground">
                  {page.items.length}
                  {page.nextCursor ? '+' : ''} {page.items.length === 1 ? 'contact' : 'contacts'}
                </p>
                <WorklistTable
                  tab={tab}
                  rows={withPending(page.items, pending, tab)}
                  today={today}
                  refreshing={state.isRefreshing}
                  onOpen={setOpen}
                  onTake={(item) => void take(item)}
                  canTake={state.isOnline}
                />
                {fromCopy && packet.data?.truncated ? (
                  <InlineNotice live={false}>
                    This device keeps the most urgent contacts due this week, not all of them.
                  </InlineNotice>
                ) : null}
                {page.nextCursor ? (
                  <div className="flex flex-col items-start gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void loadMore()}
                      disabled={more.loading}
                    >
                      {more.loading ? 'Loading…' : 'Show more'}
                    </Button>
                    {more.error ? <InlineNotice tone="error">{more.error}</InlineNotice> : null}
                  </div>
                ) : null}
              </div>
            )}
          </ResourceState>
        </TabsContent>
      </Tabs>
      <RecordContactSheet
        clinicId={clinicId}
        contactId={open}
        online={state.isOnline}
        savedCopy={sheetCopy}
        onClose={() => setOpen(null)}
        onRecorded={(result) => {
          setOpen(null);
          showToast({
            tone: result.urgent ? 'warning' : result.queued ? 'info' : 'success',
            title: result.message,
          });
          if (!result.queued) state.refresh();
        }}
      />
    </div>
  );
}

function WorklistTable({
  tab,
  rows,
  today,
  refreshing,
  onOpen,
  onTake,
  canTake,
}: {
  tab: WorklistTab;
  rows: Row[];
  today: string;
  refreshing: boolean;
  onOpen: (id: string) => void;
  onTake: (item: WorklistItem) => void;
  canTake: boolean;
}) {
  const done = tab === 'done';
  const columns: DataTableColumn<Row>[] = [
    {
      id: 'patient',
      accessorFn: (row) => row.patient.name,
      header: 'Patient',
      enableSorting: false,
      meta: { className: 'min-w-56 whitespace-normal' },
      cell: ({ row }) => (
        <div className="space-y-1">
          <Link
            href={`/patients/${row.original.patient.id}?tab=overview`}
            className="hover:underline"
          >
            <PatientIdentity
              name={row.original.patient.name}
              code={row.original.patient.patientCode}
            />
          </Link>
          <FollowUpTierBadge tier={row.original.patient.tier} />
        </div>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      enableSorting: false,
      meta: { className: 'whitespace-normal' },
      cell: ({ row }) => <ContactSummary item={row.original} />,
    },
    {
      id: 'due',
      header: done ? 'Completed' : 'Due',
      enableSorting: false,
      meta: { className: 'w-36' },
      cell: ({ row }) => <DueCell item={row.original} today={today} />,
    },
    {
      id: 'owner',
      header: 'Taken by',
      enableSorting: false,
      meta: { className: 'w-40 whitespace-normal' },
      cell: ({ row }) =>
        row.original.owner ? (
          <span>{row.original.owner.displayName}</span>
        ) : done ? null : (
          <Button
            variant="outline"
            size="sm"
            disabled={!canTake}
            onClick={() => onTake(row.original)}
          >
            Take it
          </Button>
        ),
    },
    ...(done
      ? []
      : [
          {
            id: 'actions',
            header: () => <span className="sr-only">Actions</span>,
            enableSorting: false,
            meta: { align: 'right' as const, className: 'w-32' },
            cell: ({ row }: { row: { original: Row } }) => (
              <DataTableActions>
                <Button onClick={() => onOpen(row.original.id)}>Record</Button>
              </DataTableActions>
            ),
          } satisfies DataTableColumn<Row>,
        ]),
  ];
  return (
    <DataTable
      bleed
      caption="Follow-up contacts"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      isRefreshing={refreshing}
      pageSizeOptions={[10, 25]}
      renderMobileRow={(row) => (
        <article
          className={cn('flex min-w-0 items-start gap-3 border-b border-border py-3', SHEET_GUTTER)}
          aria-label={row.patient.name}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="break-words font-body text-base font-semibold leading-6 text-foreground">
              {row.patient.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <FollowUpTierBadge tier={row.patient.tier} />
              <DueCell item={row} today={today} />
            </div>
            <ContactSummary item={row} />
            <p className="text-sm text-muted-foreground">
              {row.owner
                ? `Taken by ${row.owner.displayName}`
                : done
                  ? null
                  : 'Nobody has taken it'}
            </p>
          </div>
          {done ? null : (
            <Button className="shrink-0" onClick={() => onOpen(row.id)}>
              Record
            </Button>
          )}
        </article>
      )}
    />
  );
}

function ContactSummary({ item }: { item: Row }) {
  return (
    <div className="text-sm">
      <p className="text-foreground">
        {CONTACT_MODE_LABELS[item.mode]}
        <span aria-hidden="true" className="text-muted-foreground">
          {' · '}
        </span>
        {CONTACT_PURPOSE_LABELS[item.purpose]}
      </p>
      {item.lastAttempt ? (
        <p className="text-muted-foreground">
          Last: {CONTACT_OUTCOME_LABELS[item.lastAttempt.outcome].toLowerCase()}
          {item.attemptCount > 1 ? ` (${item.attemptCount} tries)` : ''}
        </p>
      ) : null}
      {item.pendingSync ? (
        <p
          className={cn(
            'font-medium',
            item.pendingSync === 'blocked' ? 'text-destructive-ink' : 'text-warning-ink',
          )}
        >
          Call saved on this device · {PENDING_SYNC_LABEL[item.pendingSync].toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}

function DueCell({ item, today }: { item: WorklistItem; today: string }) {
  if (item.status === 'DONE' && item.completedAt) {
    return (
      <span className="text-sm tabular-nums">
        {new Date(item.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </span>
    );
  }
  const late = item.daysOverdue > 0;
  return (
    <span
      className={cn(
        'text-sm font-medium tabular-nums',
        late ? 'text-destructive-ink' : 'text-foreground',
      )}
    >
      {dueLabel(item, today)}
      {item.status === 'MISSED' ? <span className="font-normal"> · missed</span> : null}
    </span>
  );
}
