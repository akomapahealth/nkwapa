'use client';

import { formatPersonName } from '@/lib/person-name';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, type GetToken } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { useAsyncResource } from '@/lib/use-async-resource';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { RouteGuard } from '@/components/RouteGuard';
import { DashboardIllustration } from '@/components/dashboard/DashboardIllustration';
import { ResourceState } from '@/components/feedback/ResourceState';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { InlineErrorState } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { StatusLabel } from '@/components/ui/status-label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import {
  DataTable,
  DataTableActions,
  SHEET_GUTTER,
  type DataTableColumn,
} from '@/components/ui/data-table';
import { PatientIdentity } from '@/components/patients/PatientRegistryCard';
import { FollowUpTierBadge } from '@/components/patients/follow-up/FollowUpTierBadge';
import { FollowUpTierFilter } from '@/components/patients/follow-up/FollowUpTierFilter';
import { canSeeFollowUpTier } from '@/lib/follow-up';
import { FOLLOW_UP_TIER_LABELS, type FollowUpTier } from '@nkwapa/db/follow-up-stratification';
import { RelativeTime } from '@/components/app-shell/RelativeTime';
import { ListFilters, ListSearch, type ListFilterChip } from '@/components/app-shell/ListToolbar';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, fieldErrorId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HYPERTENSION_CLASSIFICATIONS, HYPERTENSION_LABELS } from '@/lib/hypertension';
import { OPS_DEFAULT_TIMEZONE } from '@/lib/ops';
import { cn } from '@/lib/utils';
import {
  encounterQueueQuery,
  hasQueueFilters,
  laneTotal,
  NO_QUEUE_FILTERS,
  parseQueueFilters,
  QUEUE_PAGE_SIZE,
  queueFilterParams,
  type EncounterQueueCounts,
  type EncounterQueueStage,
  type QueueFilters,
} from '@/lib/encounter-queues';

interface QueueRow {
  id: string;
  encounterId: string;
  patientCode: string;
  patientName: string;
  createdAt: string;
  bpStage?: string;
  glucoseFlag?: boolean;
  /** Undefined when the reader may not see tiers; null when not yet computed (#336). */
  followUpTier?: FollowUpTier | null;
  status: string;
}
type Lane = 'drafts' | 'review' | 'finalize' | 'cosign';
const LANES: Lane[] = ['drafts', 'review', 'finalize', 'cosign'];
// The pilot's tab names: the lane copy under the tabs says what each step holds.
const LANE_LABEL: Record<Lane, string> = {
  drafts: 'Drafts',
  review: 'Review',
  finalize: 'Sign-off',
  cosign: 'Cosign',
};
const LANE_COPY: Record<Lane, string> = {
  drafts: 'Visits still being recorded. They move to review when submitted.',
  review: 'Submitted visits waiting for a clinical review.',
  finalize: 'Reviewed visits waiting for a doctor to sign off. Finalizing locks the record.',
  cosign: 'HAP notes assigned to you and waiting for your cosign.',
};
const EMPTY_COPY: Record<Lane, string> = {
  drafts: 'No draft visits were returned for this clinic.',
  review: 'No visits were returned for clinical review in this clinic.',
  finalize: 'No reviewed visits were returned for doctor sign-off in this clinic.',
  cosign: 'No HAP notes were returned for your cosign.',
};
const STAGES = { drafts: 'DRAFT', review: 'REVIEW', finalize: 'DOCTOR_READY' } as const;
const SEARCH_DEBOUNCE_MS = 300;
interface QueuePage {
  rows: QueueRow[];
  offset: number;
  hasMore: boolean;
  /** How many match the filters, from X-Total-Count; null when the header is missing. */
  matches: number | null;
}
interface QueueSnapshot {
  lanes: Record<Lane, QueuePage>;
  counts: EncounterQueueCounts | null;
  /** The filters this snapshot was read with. */
  filtered: boolean;
  /** The Cosign lane's size before the browser filters it. */
  cosignTotal: number;
}
/** A clinic-local YYYY-MM-DD for comparing against the date filters. */
const clinicDay = new Intl.DateTimeFormat('en-CA', { timeZone: OPS_DEFAULT_TIMEZONE });

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes('*') || permissions.includes(perm);
}

export default function QueuesPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const clinicRoles =
    bootstrap?.memberships.find((membership) => membership.clinicId === clinicId)?.roles ?? [];
  const allowed = {
    drafts: hasPermission(perms, 'ENCOUNTER.READ'),
    review: hasPermission(perms, 'ENCOUNTER.REVIEW'),
    finalize: hasPermission(perms, 'DOCTOR.FINALIZE'),
    cosign:
      isWebFeatureEnabled('clinicalNotes') &&
      clinicRoles.includes('DOCTOR') &&
      hasPermission(perms, 'CLINICAL_NOTE.COSIGN'),
  };
  const lanes = LANES.filter((lane) => allowed[lane]);
  return (
    <RouteGuard requiredPermission="ENCOUNTER.READ" requiresClinic clinicSurface="Encounter queues">
      {clinicId && lanes.length ? (
        <QueueWorkspace key={`${clinicId}:${lanes.join(',')}`} clinicId={clinicId} lanes={lanes} />
      ) : null}
    </RouteGuard>
  );
}

async function readQueue(
  clinicId: string,
  stage: EncounterQueueStage,
  getToken: GetToken,
  signal: AbortSignal,
  skip: number,
  filters: QueueFilters,
): Promise<QueuePage> {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/encounters?${encounterQueueQuery(stage, skip, filters)}`,
    { getToken, signal },
  );
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as Array<{
    id: string;
    status: string;
    createdAt: string;
    patient?: {
      patientCode: string;
      firstName: string;
      lastName: string;
      currentRiskTier?: FollowUpTier | null;
    };
    hypertensionAssessment?: { classification?: string };
    glucoseFlagged?: boolean;
  }>;
  const rows = data.map((e) => ({
    id: e.id,
    encounterId: e.id,
    patientCode: e.patient?.patientCode ?? 'No code',
    patientName: e.patient ? formatPersonName(e.patient, 'short') : 'Unknown patient',
    createdAt: e.createdAt,
    bpStage: e.hypertensionAssessment?.classification ?? '',
    // The fasting/random thresholds live on the server, next to the filter that uses them.
    glucoseFlag: e.glucoseFlagged === true,
    followUpTier: e.patient?.currentRiskTier,
    status: e.status,
  }));
  const matches = res.headers.get('X-Total-Count');
  // Advance by the server page, even if a changing queue later yields overlapping rows.
  return {
    rows,
    offset: skip + data.length,
    hasMore: data.length === QUEUE_PAGE_SIZE,
    matches: matches === null || !Number.isFinite(Number(matches)) ? null : Number(matches),
  };
}

/**
 * Pending cosigns come back unpaged, so the lane filters them here. Notes carry no BP or glucose,
 * so only the search and the dates apply.
 */
function filterCosign(rows: QueueRow[], filters: QueueFilters) {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (search && !`${row.patientName} ${row.patientCode}`.toLowerCase().includes(search))
      return false;
    const day = clinicDay.format(new Date(row.createdAt));
    if (filters.createdFrom && day < filters.createdFrom) return false;
    if (filters.createdTo && day > filters.createdTo) return false;
    return true;
  });
}

function QueueWorkspace({ clinicId, lanes }: { clinicId: string; lanes: Lane[] }) {
  const router = useRouter();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const canSeeTier = canSeeFollowUpTier(bootstrap?.effectivePermissionsForActiveClinic ?? []);
  const searchParams = useSearchParams();
  const getToken = useAuth();
  const requested = searchParams.get('tab');
  const defaultTab = lanes.includes('cosign')
    ? 'cosign'
    : lanes.includes('finalize')
      ? 'finalize'
      : lanes.includes('review')
        ? 'review'
        : 'drafts';
  const activeTab = lanes.find((lane) => lane === requested) ?? defaultTab;

  /*
    The filters apply to every lane and live in the URL beside ?tab=, so a filtered lane can be
    bookmarked. Only the search is debounced; picking a filter answers at once.
  */
  const [filters, setFilters] = useState<QueueFilters>(() =>
    parseQueueFilters(new URLSearchParams(searchParams.toString())),
  );
  const [committedSearch, setCommittedSearch] = useState(() => filters.search.trim());
  useEffect(() => {
    const timer = window.setTimeout(
      () => setCommittedSearch(filters.search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [filters.search]);
  const dateError =
    filters.createdFrom && filters.createdTo && filters.createdFrom > filters.createdTo
      ? 'The start date must be on or before the end date.'
      : undefined;
  // A range the API would refuse is explained beside the dates and never sent.
  const applied: QueueFilters = {
    ...filters,
    search: committedSearch,
    createdFrom: dateError ? '' : filters.createdFrom,
    createdTo: dateError ? '' : filters.createdTo,
  };
  const appliedQuery = queueFilterParams(applied).toString();
  /*
    history.replaceState, not router.replace: a Next navigation refetches the route's RSC payload,
    which fails offline. Read from the address bar so the tab already there is kept.
  */
  useEffect(() => {
    const params = queueFilterParams(applied);
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab) params.set('tab', tab);
    const next = params.size ? `${window.location.pathname}?${params}` : window.location.pathname;
    if (`${window.location.pathname}${window.location.search}` !== next)
      window.history.replaceState(window.history.state, '', next);
    // appliedQuery is the identity of `applied`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedQuery]);
  const updateFilters = (patch: Partial<QueueFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));
  const clearFilters = () => {
    setFilters(NO_QUEUE_FILTERS);
    setCommittedSearch('');
  };

  const moreRequest = useRef<AbortController | null>(null);
  const [loadingMore, setLoadingMore] = useState<Lane | null>(null);
  const [moreError, setMoreError] = useState<{ lane: Lane; message: string } | null>(null);
  const state = useAsyncResource<QueueSnapshot>({
    resourceKey: `${clinicId}|${appliedQuery}`,
    requiresOnline: true,
    errorMessage: 'The queues could not be loaded.',
    fetcher: async (token, signal) => {
      const empty = (): QueuePage => ({ rows: [], offset: 0, hasMore: false, matches: 0 });
      const countsRequest = apiFetch(`/clinics/${encodeURIComponent(clinicId)}/encounters/counts`, {
        getToken: token,
        signal,
      })
        .then(async (res) => (res.ok ? ((await res.json()) as EncounterQueueCounts) : null))
        .catch(() => null);
      const read = (lane: keyof typeof STAGES) =>
        lanes.includes(lane)
          ? readQueue(clinicId, STAGES[lane], token, signal, 0, applied)
          : empty();
      const [drafts, review, finalize, cosign, counts] = await Promise.all([
        read('drafts'),
        read('review'),
        read('finalize'),
        lanes.includes('cosign')
          ? apiFetch(`/clinics/${encodeURIComponent(clinicId)}/clinical-notes/pending-cosign`, {
              getToken: token,
              activeClinicId: clinicId,
              signal,
            }).then(async (res): Promise<{ page: QueuePage; total: number }> => {
              if (!res.ok) throw new Error(await res.text());
              const notes = (await res.json()) as Array<{
                id: string;
                encounterId: string;
                submittedAt: string;
                author: { displayName: string };
                patient: { patientCode: string; firstName: string; lastName: string };
              }>;
              const rows = filterCosign(
                notes.map((note) => ({
                  id: note.id,
                  encounterId: note.encounterId,
                  patientCode: note.patient.patientCode,
                  patientName: formatPersonName(note.patient, 'short'),
                  createdAt: note.submittedAt,
                  status: `HAP note by ${note.author.displayName}`,
                })),
                applied,
              );
              return {
                page: { rows, offset: notes.length, hasMore: false, matches: rows.length },
                total: notes.length,
              };
            })
          : { page: empty(), total: 0 },
        countsRequest,
      ]);
      return {
        lanes: { drafts, review, finalize, cosign: cosign.page },
        counts,
        filtered: hasQueueFilters(applied),
        cosignTotal: cosign.total,
      };
    },
  });
  useEffect(() => () => moreRequest.current?.abort(), []);
  // A page of the old filters must not land in the new result.
  useEffect(() => () => moreRequest.current?.abort(), [appliedQuery]);
  useEffect(() => {
    if (!state.isOnline) moreRequest.current?.abort();
  }, [state.isOnline]);

  const loadMore = async (lane: Exclude<Lane, 'cosign'>) => {
    const snapshot = state.data;
    if (!snapshot || !getToken || moreRequest.current || !state.isOnline || state.isRefreshing)
      return;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(lane);
    setMoreError(null);
    try {
      const next = await readQueue(
        clinicId,
        STAGES[lane],
        getToken,
        controller.signal,
        snapshot.lanes[lane].offset,
        applied,
      );
      if (controller.signal.aborted) return;
      state.setData((current) => {
        // A reconnect/refresh may have replaced this snapshot while the page was in flight.
        if (current !== snapshot) return current;
        const previous = current.lanes[lane];
        return {
          ...current,
          lanes: {
            ...current.lanes,
            [lane]: {
              ...next,
              rows: [
                ...previous.rows,
                ...next.rows.filter((row) => !previous.rows.some((r) => r.id === row.id)),
              ],
            },
          },
        };
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setMoreError({ lane, message: getErrorMessage(error, 'More visits could not be loaded.') });
      }
    } finally {
      moreRequest.current = null;
      setLoadingMore(null);
    }
  };
  const day = (value: string) =>
    value
      ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : '';
  const chips: ListFilterChip[] = [
    {
      label: 'BP',
      value: filters.bpClassification ? HYPERTENSION_LABELS[filters.bpClassification] : '',
      onRemove: () => updateFilters({ bpClassification: '' }),
    },
    {
      label: 'Glucose',
      value: filters.glucoseFlagged ? 'High' : '',
      onRemove: () => updateFilters({ glucoseFlagged: false }),
    },
    {
      label: 'Tier',
      value: filters.riskTier ? FOLLOW_UP_TIER_LABELS[filters.riskTier] : '',
      onRemove: () => updateFilters({ riskTier: '' }),
    },
    {
      label: 'Created from',
      value: day(filters.createdFrom),
      onRemove: () => updateFilters({ createdFrom: '' }),
    },
    {
      label: 'Created to',
      value: day(filters.createdTo),
      onRemove: () => updateFilters({ createdTo: '' }),
    },
  ];
  const refresh = () => {
    if (moreRequest.current) return;
    setMoreError(null);
    state.refresh();
  };

  return (
    <div className="space-y-5">
      <AppPageHeader
        className="border-b-0 pb-0 md:pb-0"
        title="Queues"
        description="Visits moving from draft to review to sign-off."
        hideDescriptionOnPhone
        helpTitle="How the queues work"
        helpText="Each lane holds the visits at that step, so you can go straight to the record."
        actions={
          <Button
            variant="ghost"
            // A lone ghost button stretched across a phone reads as a bar; keep it a control.
            className="-ml-4 self-start sm:ml-0"
            onClick={refresh}
            disabled={
              !state.isOnline ||
              state.isInitialLoading ||
              state.isRefreshing ||
              loadingMore !== null
            }
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {state.isRefreshing ? 'Refreshing queues' : 'Refresh queues'}
          </Button>
        }
      />
      <section aria-label="Search and filter queues" className="space-y-3">
        <ListSearch
          id="queue-search"
          label="Search by patient name or code"
          value={filters.search}
          onChange={(search) => updateFilters({ search })}
          placeholder="Patient name or code…"
          help="Searches every lane as you type. Press Escape to clear."
        />
        <ListFilters
          groupLabel="Queue filters"
          sheetTitle="Filter queues"
          sheetDescription="Filters apply to every lane and update results immediately."
          chips={chips}
          onClearAll={clearFilters}
        >
          <div className="space-y-2">
            <Label htmlFor="queue-bp">Blood pressure</Label>
            <Select
              value={filters.bpClassification || 'any'}
              onValueChange={(value) =>
                updateFilters({
                  bpClassification:
                    value === 'any' ? '' : (value as QueueFilters['bpClassification']),
                })
              }
            >
              <SelectTrigger id="queue-bp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any classification</SelectItem>
                {HYPERTENSION_CLASSIFICATIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {HYPERTENSION_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canSeeTier ? (
            <div className="border-t border-border/70 pt-4">
              <FollowUpTierFilter
                id="queue-risk-tier"
                value={filters.riskTier}
                onChange={(next) => updateFilters({ riskTier: next })}
              />
            </div>
          ) : null}
          <div className="flex items-start gap-3 border-t border-border/70 pt-4">
            <Checkbox
              id="queue-glucose"
              className="mt-1"
              checked={filters.glucoseFlagged}
              onCheckedChange={(checked) => updateFilters({ glucoseFlagged: checked === true })}
              aria-describedby="queue-glucose-help"
            />
            <div className="space-y-1">
              <Label htmlFor="queue-glucose" className="leading-6">
                High glucose only
              </Label>
              <p id="queue-glucose-help" className="text-sm leading-5 text-muted-foreground">
                Fasting 126 mg/dL or more, or random 200 mg/dL or more
              </p>
            </div>
          </div>
          <div className="border-t border-border/70 pt-4">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground">Visit created</legend>
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="queue-created-from">From</Label>
                  <Input
                    id="queue-created-from"
                    type="date"
                    value={filters.createdFrom}
                    max={filters.createdTo || undefined}
                    onChange={(event) => updateFilters({ createdFrom: event.target.value })}
                    aria-invalid={dateError ? true : undefined}
                    aria-describedby={dateError ? fieldErrorId('queue-created') : undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="queue-created-to">To</Label>
                  <Input
                    id="queue-created-to"
                    type="date"
                    value={filters.createdTo}
                    min={filters.createdFrom || undefined}
                    onChange={(event) => updateFilters({ createdTo: event.target.value })}
                    aria-invalid={dateError ? true : undefined}
                    aria-describedby={dateError ? fieldErrorId('queue-created') : undefined}
                  />
                </div>
              </div>
              <FieldError id="queue-created" message={dateError} />
            </fieldset>
          </div>
        </ListFilters>
      </section>
      <Tabs
        value={activeTab}
        onValueChange={(lane) => {
          // The address bar, not useSearchParams: the filters are written there by replaceState.
          const params = new URLSearchParams(window.location.search);
          params.set('tab', lane);
          router.push(`/queues?${params}`, { scroll: false });
        }}
      >
        <TabsList aria-label="Encounter queues">
          {lanes.map((lane) => (
            <TabsTrigger key={lane} value={lane}>
              {LANE_LABEL[lane]}
              <span className="ml-1.5 font-mono text-xs font-normal tabular-nums text-muted-foreground">
                {state.data ? (
                  lane === 'cosign' ? (
                    state.data.cosignTotal
                  ) : (
                    <>
                      {laneTotal(state.data.counts, lane, state.data.lanes[lane].rows.length)}
                      {state.data.counts === null ? ' loaded' : ''}
                    </>
                  )
                ) : (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">
                      {state.isInitialLoading ? 'Loading count' : 'Count unavailable'}
                    </span>
                  </>
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {lanes.map((lane) => (
          <TabsContent
            key={lane}
            value={lane}
            forceMount
            className="mt-0 data-[state=inactive]:hidden"
          >
            <p className="pb-3 pt-4 text-sm leading-6 text-muted-foreground">{LANE_COPY[lane]}</p>
            <ResourceState
              state={state}
              errorTitle="The queues could not be loaded"
              offlineDescription="You are offline. Reconnect to load the queues. Showing the last visits loaded."
              offlineDetail="Reconnect to load the queues. Showing the last visits loaded."
            >
              {(snapshot) => {
                const page = snapshot.lanes[lane];
                const laneSize = lane === 'cosign' ? snapshot.cosignTotal : snapshot.counts?.[lane];
                // While filtering, paging and emptiness follow the matches, not the whole lane.
                const total =
                  lane === 'cosign'
                    ? page.rows.length
                    : snapshot.filtered
                      ? (page.matches ?? undefined)
                      : laneSize;
                const mayLoadMore =
                  lane !== 'cosign' &&
                  page.hasMore &&
                  (total === undefined || total > page.rows.length);
                const confirmedEmpty =
                  page.rows.length === 0 &&
                  !state.isOfflineBlocked &&
                  !state.isStale &&
                  !state.isRefreshing &&
                  !(total && total > 0);
                return (
                  <div className="space-y-4">
                    {snapshot.filtered ? (
                      <p role="status" className="text-sm font-medium tabular-nums text-foreground">
                        {laneSize === undefined
                          ? `${total ?? page.rows.length} match`
                          : `${total ?? page.rows.length} of ${laneSize} match`}
                      </p>
                    ) : null}
                    {lane === 'cosign' &&
                    (applied.bpClassification || applied.glucoseFlagged || applied.riskTier) ? (
                      <p className="text-sm text-muted-foreground">
                        HAP notes filter by search and dates only.
                      </p>
                    ) : null}
                    {snapshot.counts === null && lane !== 'cosign' ? (
                      <InlineNotice tone="warning">
                        Queue totals are unavailable. Counts show loaded visits only.
                      </InlineNotice>
                    ) : null}
                    <QueueEmpty
                      lane={lane}
                      visible={confirmedEmpty && !snapshot.filtered}
                      active={activeTab === lane}
                    />
                    {confirmedEmpty && snapshot.filtered ? (
                      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                        <h2 className="type-section-title">No visits match</h2>
                        <p className="max-w-md text-sm leading-6 text-muted-foreground">
                          Clear the search and filters to see the whole lane.
                        </p>
                        <Button
                          variant="outline"
                          className="mt-2"
                          onClick={() => {
                            clearFilters();
                            document.getElementById('queue-search')?.focus();
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    ) : null}
                    {!confirmedEmpty &&
                      (page.rows.length ? (
                        <QueueTable lane={lane} rows={page.rows} refreshing={state.isRefreshing} />
                      ) : (
                        <p className="py-6 text-sm text-muted-foreground">
                          {!state.isOnline || state.isStale || state.isRefreshing
                            ? 'No visits in the last load. Refresh when back online.'
                            : 'The total and loaded visits differ. Refresh queues to check this lane.'}
                        </p>
                      ))}
                    {moreError?.lane === lane ? (
                      <InlineErrorState
                        title="More visits could not be loaded"
                        description={moreError.message}
                        onRetry={() => {
                          if (lane !== 'cosign') void loadMore(lane);
                        }}
                      />
                    ) : null}
                    {mayLoadMore ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule py-3">
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {total === undefined
                            ? `${page.rows.length} visits loaded`
                            : `Showing ${page.rows.length} of ${Math.max(total, page.rows.length)}`}
                        </p>
                        <Button
                          variant="outline"
                          disabled={
                            loadingMore !== null ||
                            !state.isOnline ||
                            state.isRefreshing ||
                            state.isStale
                          }
                          onClick={() => void loadMore(lane)}
                        >
                          {loadingMore === lane ? 'Loading…' : 'Show more'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              }}
            </ResourceState>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function QueueEmpty({ lane, visible, active }: { lane: Lane; visible: boolean; active: boolean }) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (visible && active) setSeen(true);
  }, [visible, active]);
  return (
    <div hidden={!visible}>
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center compact:py-14">
        <div className="h-28 w-28">{seen ? <DashboardIllustration kind="checklist" /> : null}</div>
        <h2 className="type-section-title">
          {lane === 'drafts' ? 'No draft visits' : 'All caught up'}
        </h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          {EMPTY_COPY[lane]} Refresh queues to check for new work.
        </p>
        <Button asChild variant="outline" className="mt-2">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function OpenEncounter({ row, className }: { row: QueueRow; className?: string }) {
  // Quiet, like the registry's View: the row is the work, the button only opens it.
  return (
    <Button asChild variant="ghost" size="sm" className={className}>
      <Link href={`/encounters/${encodeURIComponent(row.encounterId)}`}>
        Open<span className="sr-only"> encounter for {row.patientName}</span>
        <ChevronRight aria-hidden="true" />
      </Link>
    </Button>
  );
}
function QueueTime({ row }: { row: QueueRow }) {
  return <RelativeTime value={row.createdAt} />;
}
/** BP stage and the glucose flag together. Nothing raised is "Nothing flagged", never "normal". */
function QueueFlags({ row }: { row: QueueRow }) {
  const tier =
    row.followUpTier === undefined ? null : <FollowUpTierBadge tier={row.followUpTier} />;
  if (!row.bpStage && !row.glucoseFlag)
    return tier ?? <span className="text-muted-foreground">Nothing flagged</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {tier}
      {row.bpStage ? (
        <span className="inline-flex items-center gap-1">
          <span className="text-xs text-muted-foreground">BP</span>
          <StatusLabel value={row.bpStage} />
        </span>
      ) : null}
      {row.glucoseFlag ? <GlucoseFlag /> : null}
    </span>
  );
}
function QueueTable({
  lane,
  rows,
  refreshing,
}: {
  lane: Lane;
  rows: QueueRow[];
  refreshing: boolean;
}) {
  const columns: DataTableColumn<QueueRow>[] = [
    {
      id: 'patientName',
      accessorKey: 'patientName',
      header: 'Patient',
      meta: { className: 'min-w-56 whitespace-normal' },
      cell: ({ row }) => (
        <PatientIdentity name={row.original.patientName} code={row.original.patientCode} />
      ),
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: lane === 'cosign' ? 'Submitted' : 'Created',
      meta: { className: 'w-44' },
      cell: ({ row }) => <QueueTime row={row.original} />,
    },
    lane === 'cosign'
      ? ({
          id: 'status',
          accessorKey: 'status',
          header: 'Note',
          meta: { className: 'whitespace-normal' },
          cell: ({ row }) => <span>{row.original.status}</span>,
        } satisfies DataTableColumn<QueueRow>)
      : ({
          id: 'flags',
          // BP stage first; a raised glucose sorts after it within the same stage.
          accessorFn: (row) => `${row.bpStage ?? ''}${row.glucoseFlag ? '~glucose' : ''}`,
          header: 'Flags',
          meta: { className: 'whitespace-normal' },
          cell: ({ row }) => <QueueFlags row={row.original} />,
        } satisfies DataTableColumn<QueueRow>),
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: 'right', className: 'w-28' },
      cell: ({ row }) => (
        <DataTableActions>
          <OpenEncounter row={row.original} />
        </DataTableActions>
      ),
    },
  ];
  return (
    <DataTable
      bleed
      caption="Encounters in this lane"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      isRefreshing={refreshing}
      pageSizeOptions={[10, 25]}
      renderMobileRow={(row) => (
        <article
          className={cn(
            'flex min-w-0 items-center gap-3 border-b border-border py-3',
            SHEET_GUTTER,
          )}
          aria-label={row.patientName}
        >
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-body text-base font-semibold leading-6 text-foreground">
              {row.patientName}
            </h2>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              <span className="break-all font-mono text-xs leading-5" translate="no">
                {row.patientCode}
              </span>
              <span>
                <span className="sr-only">{lane === 'cosign' ? 'Submitted' : 'Created'} </span>
                <QueueTime row={row} />
              </span>
            </p>
            {lane === 'cosign' ? (
              <p className="mt-1 text-sm text-muted-foreground">{row.status}</p>
            ) : row.bpStage || row.glucoseFlag ? (
              <div className="mt-1.5 text-sm">
                <QueueFlags row={row} />
              </div>
            ) : null}
          </div>
          <OpenEncounter row={row} className="shrink-0" />
        </article>
      )}
    />
  );
}
function GlucoseFlag() {
  return <StatusLabel variant="destructive" value="High glucose" />;
}
