'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Download,
  Eye,
  Network,
  RefreshCw,
  SearchX,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { readApiError } from '@/lib/ops';
import { useAsyncResource } from '@/lib/use-async-resource';
import {
  buildDuplicateQuery,
  burdenTableRows,
  clinicPairLabel,
  confidenceBadgeVariant,
  DEFAULT_DUPLICATE_FILTERS,
  describeMergeAvailability,
  DUPLICATE_CONFIDENCE_LABELS,
  DUPLICATE_MATCH_REASON_LABELS,
  formatReasons,
  patientDisplayName,
  type CrossClinicBurden,
  type CrossClinicBurdenRow,
  type CrossClinicInvestigation,
  type DuplicateCandidate,
  type DuplicateFilters,
} from '@/lib/patient-duplicates';
import { cn } from '@/lib/utils';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { EmptyState, SectionSkeleton } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { DuplicateComparisonSheet } from './duplicates/DuplicateComparisonSheet';
import { DuplicateFilterFields } from './duplicates/DuplicateFilterFields';
import { DuplicatePairCard } from './duplicates/DuplicatePairCard';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

/**
 * Every decision by default. The question here is "how many are there", and a pair someone has
 * already confirmed is still a duplicate that a consolidation policy would have to deal with.
 */
const INVESTIGATION_DEFAULT_FILTERS: DuplicateFilters = {
  ...DEFAULT_DUPLICATE_FILTERS,
  status: 'ALL',
};

const ENDPOINT = '/admin/patients/duplicates/cross-clinic';

function filtersAreDefault(filters: DuplicateFilters, clinicPair: string | null): boolean {
  return (
    clinicPair === null &&
    filters.status === INVESTIGATION_DEFAULT_FILTERS.status &&
    filters.confidence === INVESTIGATION_DEFAULT_FILTERS.confidence &&
    filters.reason === INVESTIGATION_DEFAULT_FILTERS.reason &&
    filters.q.trim() === ''
  );
}

/**
 * Likely duplicates whose two charts sit in different clinics, and how many there are.
 *
 * Investigation, not review. The queue at /admin/duplicates is where an operator decides on a
 * pair; this screen exists so leadership can size the cross-clinic problem before deciding whether
 * consolidating charts across clinics should be built at all. So it has no control that writes:
 * no decisions, no merge link, and a comparison panel that says so. The API audits every load.
 */
export function CrossClinicInvestigationScreen() {
  const [filters, setFilters] = useState<DuplicateFilters>(INVESTIGATION_DEFAULT_FILTERS);
  const [clinicPair, setClinicPair] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<DuplicateCandidate | null>(null);

  const query = useMemo(
    () => buildDuplicateQuery(filters, page, pageSize, { clinicPair }),
    [filters, page, pageSize, clinicPair],
  );

  const investigation = useAsyncResource<CrossClinicInvestigation>({
    resourceKey: `${ENDPOINT}?${query}`,
    errorMessage: 'The cross-clinic investigation could not be loaded.',
    fetcher: async (token, signal) => {
      // No clinic header: the question spans clinics, and the API scopes it to the caller's
      // global role rather than to whichever clinic happens to be active.
      const response = await apiFetch(`${ENDPOINT}?${query}`, {
        getToken: token,
        signal,
        skipClinicHeader: true,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      return (await response.json()) as CrossClinicInvestigation;
    },
  });

  const burden = investigation.data?.burden ?? null;
  const selectedPair = burden?.clinicPairs.find((row) => row.key === clinicPair) ?? null;

  const changeFilters = (next: DuplicateFilters) => {
    setFilters(next);
    setPage(0);
  };

  const focusClinicPair = (key: string | null) => {
    setClinicPair(key);
    setPage(0);
  };

  /*
    Column widths follow the review queue's: the grid gets roughly 880px inside the two-column
    layout at 1440, and the Compare action has to stay on screen without a horizontal scrollbar.
  */
  const columns: DataTableColumn<DuplicateCandidate>[] = useMemo(
    () => [
      {
        id: 'confidence',
        accessorKey: 'confidence',
        header: 'Strength',
        enableSorting: false,
        cell: ({ row: params }) => (
          <Badge variant={confidenceBadgeVariant(params.original.confidence)}>
            {DUPLICATE_CONFIDENCE_LABELS[params.original.confidence]}
          </Badge>
        ),
      },
      {
        id: 'patients',
        accessorKey: 'patients',
        header: 'Charts and clinics',
        enableSorting: false,
        cell: ({ row: params }) => (
          <div className="py-2 text-sm leading-5">
            {params.original.patients.map((patient) => (
              <p
                key={patient.id}
                className="truncate"
                title={`${patientDisplayName(patient)} · ${patient.patientCode} · ${patient.clinic.name}`}
              >
                <span className="font-medium text-foreground">{patientDisplayName(patient)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {patient.patientCode} · {patient.clinic.name}
                </span>
              </p>
            ))}
          </div>
        ),
      },
      {
        id: 'reasons',
        accessorKey: 'reasons',
        header: 'Why it matched',
        enableSorting: false,
        // One line each, so a long first reason cannot push "and N more" out of a 64px row.
        cell: ({ row: params }) => (
          <div className="min-w-0 py-2 text-sm leading-5">
            <p className="truncate text-foreground" title={formatReasons(params.original.reasons)}>
              {DUPLICATE_MATCH_REASON_LABELS[params.original.reasons[0]]}
            </p>
            {params.original.reasons.length > 1 ? (
              <p className="text-muted-foreground">and {params.original.reasons.length - 1} more</p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'mergeEligible',
        accessorKey: 'mergeEligible',
        header: 'Merge',
        enableSorting: false,
        // Spelled out on every row rather than implied by the screen, because "can I just merge
        // these?" is the first thing anyone looking at a likely duplicate will ask.
        cell: ({ row: params }) => {
          const availability = describeMergeAvailability(params.original);
          return (
            <span
              className={cn(
                'text-sm',
                availability.available ? 'text-foreground' : 'text-muted-foreground',
              )}
              title={availability.reason ?? undefined}
            >
              {availability.available ? 'Allowed' : 'Not allowed'}
            </span>
          );
        },
      },
      {
        id: 'actions',

        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row: params }) => (
          <Button variant="ghost" size="sm" onClick={() => setSelected(params.original)}>
            Compare
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Patient identity"
        title="Cross-clinic duplicates"
        description="Charts in different clinics that look like the same person, counted per clinic pair. For sizing the problem, not fixing it: nothing here changes or merges a record."
        badges={<Badge variant="outline">Investigation only</Badge>}
        actions={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              disabled={!burden || burden.totalPairs === 0}
              onClick={() => {
                if (!burden) return;
                downloadCsv(
                  `cross-clinic-duplicates-${new Date().toISOString().slice(0, 10)}.csv`,
                  burdenTableRows(burden),
                );
              }}
            >
              <Download aria-hidden="true" className="mr-2 h-4 w-4" />
              Export counts
            </Button>
            <Button
              variant="outline"
              onClick={() => investigation.refresh()}
              disabled={investigation.isRefreshing}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn('mr-2 h-4 w-4', investigation.isRefreshing && 'animate-spin')}
              />
              Refresh
              <span aria-live="polite" className="sr-only">
                {investigation.isRefreshing ? 'Refreshing the cross-clinic investigation' : ''}
              </span>
            </Button>
          </div>
        }
      />

      {/* Required reading, not header help: #63 keeps it visible on the page. */}
      <ProgressiveHelp title="Why these cannot be merged">
        <div className="space-y-2">
          <p>
            A chart belongs to one clinic, and merging is limited to two charts in the same clinic:
            the merge moves visits, notes and prescriptions onto the surviving chart and records the
            merge against that clinic. Two clinics may hold different consent, different staff and
            different records for the same person, and nothing yet decides which clinic should own
            the result.
          </p>
          <p>
            Until that policy exists, these pairs are investigated rather than resolved. Only active
            clinics are included, every view is recorded in the audit log, and only system
            administrators can open this page.
          </p>
        </div>
      </ProgressiveHelp>

      <InlineNotice tone="info" live={false}>
        <span className="font-medium">Read-only.</span> Pairs here are counted and compared, never
        merged or decided on. To record what you found about a pair, use the duplicate review queue
        under All clinics.
      </InlineNotice>

      <AppMetricGroup className="sm:grid-cols-2 xl:grid-cols-4">
        <AppMetricCard
          title="Pairs across clinics"
          value={burden?.totalPairs ?? '—'}
          icon={Network}
          detail={
            burden ? `${burden.openPairs} not yet reviewed.` : 'Likely duplicates spanning clinics.'
          }
        />
        <AppMetricCard
          title="Very likely"
          value={burden?.highConfidencePairs ?? '—'}
          icon={AlertTriangle}
          detail="Pairs with the strongest signals."
        />
        <AppMetricCard
          title="Clinics affected"
          value={burden?.clinicsAffected ?? '—'}
          icon={Building2}
          detail="Active clinics holding at least one of these charts."
        />
        <AppMetricCard
          title="Organisations"
          value={burden?.organizationsAffected ?? '—'}
          icon={Eye}
          detail={
            burden && burden.crossOrganizationPairs > 0
              ? `${burden.crossOrganizationPairs} pairs span two organisations.`
              : 'Every pair sits inside one organisation.'
          }
        />
      </AppMetricGroup>

      <ResourceState
        state={investigation}
        errorTitle="We couldn't load the cross-clinic investigation"
        skeleton={<SectionSkeleton lines={6} />}
        isEmpty={(data) => data.burden.totalPairs === 0}
        empty={{
          title: 'No likely duplicates across clinics',
          description:
            'No chart in one active clinic looks like a chart in another. New pairs appear here as patients are registered.',
          icon: Network,
        }}
      >
        {(data) => (
          <div className="space-y-6">
            {data.truncated ? (
              <InlineNotice tone="warning" live={false}>
                There were more candidate pairs than one scan considers, so these counts are a lower
                bound. Treat them as at least this many.
              </InlineNotice>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr),320px]">
              <BurdenByClinicPair
                burden={data.burden}
                activeKey={clinicPair}
                onFocus={focusClinicPair}
              />
              <ReasonBreakdown burden={data.burden} />
            </section>

            {/* min-w-0 on both tracks, so a wide grid scrolls inside its card at 768 and 1024. */}
            <section className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="text-lg">Filters</CardTitle>
                  <CardDescription>
                    Narrow the pairs. The counts above always cover every pair.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DuplicateFilterFields
                    idPrefix="cross-clinic"
                    filters={filters}
                    onChange={changeFilters}
                    onReset={() => {
                      changeFilters(INVESTIGATION_DEFAULT_FILTERS);
                      setClinicPair(null);
                    }}
                    resetDisabled={filtersAreDefault(filters, clinicPair)}
                    extraSummary={[
                      {
                        label: 'Clinics',
                        value: selectedPair ? clinicPairLabel(selectedPair) : null,
                      },
                    ]}
                    emptyLabel="Showing every pair across clinics"
                  />
                  <ProgressiveHelp title="What a match strength means">
                    <p>
                      Strength is the sum of the rules a pair matched. It is a prompt to look, never
                      a decision: a shared phone number can be a household, and two siblings can
                      share a surname and a birthday. Compare the charts before drawing a conclusion
                      from any single pair.
                    </p>
                  </ProgressiveHelp>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <CardTitle className="text-xl">Pairs</CardTitle>
                      <CardDescription>
                        {selectedPair
                          ? `Only pairs between ${clinicPairLabel(selectedPair)}.`
                          : 'Open a pair to compare the two charts side by side.'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedPair ? (
                        <Button variant="ghost" size="sm" onClick={() => focusClinicPair(null)}>
                          <X aria-hidden="true" className="mr-1.5 h-4 w-4" />
                          All clinic pairs
                        </Button>
                      ) : null}
                      <div className="rounded-lg border border-border/70 bg-background/75 px-4 py-3 text-sm">
                        <p className="text-muted-foreground">Showing</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                          {data.items.length} of {data.total}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.items.length === 0 ? (
                    <EmptyState
                      title="No pairs match these filters"
                      description="Try a broader decision or match strength, clear the search, or show every clinic pair."
                      icon={SearchX}
                      density="compact"
                    />
                  ) : (
                    <>
                      {/*
                        Cards until lg, as on the review queue: a row is a pair of charts, and the
                        columns need roughly 830px to keep both and the Compare action on screen.
                      */}
                      <div className="space-y-3 lg:hidden">
                        {data.items.map((candidate) => (
                          <DuplicatePairCard
                            key={candidate.pairKey}
                            candidate={candidate}
                            onCompare={setSelected}
                            showClinics
                          />
                        ))}
                      </div>

                      <div className="hidden lg:block">
                        <DataTable
                          caption="Possible duplicates across clinics"
                          columns={columns}
                          data={data.items}
                          getRowId={(row) => row.pairKey}
                          isRefreshing={investigation.isRefreshing}
                          pageSizeOptions={[10, 25, 50]}
                          rowCount={data.total}
                          pagination={{ pageIndex: page, pageSize }}
                          onPaginationChange={(next) => {
                            setPage(next.pageIndex);
                            setPageSize(next.pageSize);
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/70 px-4 py-3 text-sm lg:hidden">
                        <p className="tabular-nums text-muted-foreground">
                          Showing {data.items.length} of {data.total}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={page === 0 || investigation.isRefreshing}
                            onClick={() => setPage((current) => Math.max(0, current - 1))}
                          >
                            Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              (page + 1) * pageSize >= data.total || investigation.isRefreshing
                            }
                            onClick={() => setPage((current) => current + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        )}
      </ResourceState>

      {/* No onDecide: the investigation's comparison panel has no control that writes. */}
      <DuplicateComparisonSheet candidate={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/**
 * The confidence mix of one clinic pair, as a single bar.
 *
 * Confidence is ordered, so it is drawn as one hue at three strengths rather than three hues: the
 * darkest segment is the strongest signal. The counts are written beside it, so the bar is never
 * the only way to read the numbers.
 */
function ConfidenceBar({ row }: { row: CrossClinicBurdenRow }) {
  const segments = [
    { key: 'high', count: row.high, className: 'bg-primary' },
    { key: 'medium', count: row.medium, className: 'bg-primary/55' },
    { key: 'low', count: row.low, className: 'bg-primary/20' },
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {segments.map((segment) =>
        segment.count > 0 ? (
          <span
            key={segment.key}
            className={segment.className}
            style={{ width: `${(segment.count / row.total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function ConfidenceLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {[
        { label: DUPLICATE_CONFIDENCE_LABELS.HIGH, className: 'bg-primary' },
        { label: DUPLICATE_CONFIDENCE_LABELS.MEDIUM, className: 'bg-primary/55' },
        { label: DUPLICATE_CONFIDENCE_LABELS.LOW, className: 'bg-primary/20' },
      ].map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function confidenceSummary(row: CrossClinicBurdenRow): string {
  return [
    `${row.high} ${DUPLICATE_CONFIDENCE_LABELS.HIGH.toLowerCase()}`,
    `${row.medium} ${DUPLICATE_CONFIDENCE_LABELS.MEDIUM.toLowerCase()}`,
    `${row.low} ${DUPLICATE_CONFIDENCE_LABELS.LOW.toLowerCase()}`,
  ].join(', ');
}

/**
 * Where the duplicates are: one entry per pair of clinics, busiest first.
 *
 * Choosing a clinic pair narrows the list below to it. That is a filter on what is read, not on
 * what is counted, so the totals on this card never move while someone browses.
 */
function BurdenByClinicPair({
  burden,
  activeKey,
  onFocus,
}: {
  burden: CrossClinicBurden;
  activeKey: string | null;
  onFocus: (key: string | null) => void;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-3">
        <div className="space-y-1.5">
          <CardTitle className="text-xl">Where the duplicates are</CardTitle>
          <CardDescription>
            Each pair of clinics, with how many likely duplicates they share. Choose one to see its
            pairs.
          </CardDescription>
        </div>
        <ConfidenceLegend />
      </CardHeader>
      <CardContent>
        <ul className="space-y-2" aria-label="Likely duplicates by clinic pair">
          {burden.clinicPairs.map((row) => {
            const active = row.key === activeKey;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFocus(active ? null : row.key)}
                  className={cn(
                    'w-full rounded-lg border px-4 py-3 text-left transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    active
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border/70 bg-background/70 hover:border-primary/30 hover:bg-card',
                  )}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{clinicPairLabel(row)}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.sameOrganization
                          ? row.clinics[0].organizationName
                          : `${row.clinics[0].organizationName} and ${row.clinics[1].organizationName}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {!row.sameOrganization ? (
                        <Badge variant="warning">Two organisations</Badge>
                      ) : null}
                      <span className="text-sm tabular-nums text-muted-foreground">
                        <span className="text-lg font-semibold text-foreground">{row.total}</span>{' '}
                        {row.total === 1 ? 'pair' : 'pairs'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <ConfidenceBar row={row} />
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {confidenceSummary(row)} · {row.open} not yet reviewed
                      {row.confirmed > 0 ? ` · ${row.confirmed} confirmed` : ''}
                      {row.dismissed > 0 ? ` · ${row.dismissed} ruled out` : ''}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Which rules found these pairs, strongest rule first, as a share of every pair. */
function ReasonBreakdown({ burden }: { burden: CrossClinicBurden }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-lg">Why they matched</CardTitle>
        <CardDescription>
          A pair can match on more than one rule, so these add up to more than the total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {burden.reasons.map(({ reason, count }) => {
            const share = burden.totalPairs > 0 ? Math.round((count / burden.totalPairs) * 100) : 0;
            return (
              <li key={reason} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground">{DUPLICATE_MATCH_REASON_LABELS[reason]}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {count} · {share}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
