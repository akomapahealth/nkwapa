'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  AlertTriangle,
  Building2,
  CopyCheck,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { DUPLICATE_MATCH_REASONS } from '@nkwapa/db';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { dataGridSx } from '@/lib/datagrid-theme';
import { readApiError } from '@/lib/ops';
import { useAsyncResource } from '@/lib/use-async-resource';
import {
  candidateStatus,
  confidenceBadgeVariant,
  DUPLICATE_CONFIDENCE_LABELS,
  DUPLICATE_MATCH_REASON_LABELS,
  DUPLICATE_REVIEW_STATUS_LABELS,
  formatReasons,
  patientChartHref,
  patientDisplayName,
  reviewStatusBadgeVariant,
  type DuplicateCandidate,
  type DuplicateCandidatePage,
  type DuplicateReviewStatus,
} from '@/lib/patient-duplicates';
import { PatientComparisonTable } from '@/components/patients/PatientComparisonTable';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { SectionSkeleton, SelectClinicState } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

type ScopeMode = 'clinic' | 'all';
type StatusFilter = DuplicateReviewStatus | 'ALL';
type ConfidenceFilter = 'HIGH' | 'MEDIUM' | 'LOW' | 'ALL';
type ReasonFilter = (typeof DUPLICATE_MATCH_REASONS)[number] | 'ALL';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'OPEN', label: DUPLICATE_REVIEW_STATUS_LABELS.OPEN },
  { value: 'CONFIRMED', label: DUPLICATE_REVIEW_STATUS_LABELS.CONFIRMED },
  { value: 'DISMISSED', label: DUPLICATE_REVIEW_STATUS_LABELS.DISMISSED },
  { value: 'ALL', label: 'Every candidate' },
];

const CONFIDENCE_OPTIONS: { value: ConfidenceFilter; label: string }[] = [
  { value: 'ALL', label: 'Any strength' },
  { value: 'HIGH', label: DUPLICATE_CONFIDENCE_LABELS.HIGH },
  { value: 'MEDIUM', label: DUPLICATE_CONFIDENCE_LABELS.MEDIUM },
  { value: 'LOW', label: DUPLICATE_CONFIDENCE_LABELS.LOW },
];

/**
 * What each decision says, in one place.
 *
 * Every string names what will change and, just as importantly, what will not. A confirmation
 * that does not say "neither chart changes" leaves an operator guessing whether they have just
 * merged two people's records.
 */
const DECISION_COPY: Record<
  DuplicateReviewStatus,
  { title: string; description: string; confirm: string; notice: string }
> = {
  DISMISSED: {
    title: 'Mark as not a duplicate',
    description:
      'This records your decision and takes the pair out of the review list. Neither chart changes.',
    confirm: 'Not a duplicate',
    notice: 'Marked as not a duplicate. It will stay out of the review list.',
  },
  CONFIRMED: {
    title: 'Confirm these are the same person',
    description:
      'This records your decision so the pair is queued for a merge. Neither chart changes until a system administrator merges them.',
    confirm: 'Confirm duplicate',
    notice: 'Marked as a confirmed duplicate, ready for a merge.',
  },
  OPEN: {
    title: 'Move this pair back to review',
    description:
      'This clears the earlier decision and puts the pair back in the review list. Neither chart changes.',
    confirm: 'Move back to review',
    notice: 'Moved back to the review list.',
  },
};

const DEFAULT_FILTERS = {
  status: 'OPEN' as StatusFilter,
  confidence: 'ALL' as ConfidenceFilter,
  reason: 'ALL' as ReasonFilter,
  q: '',
};

/**
 * The suspected duplicate review queue.
 *
 * Read-only by construction: the list endpoint computes candidates from columns that already
 * exist and writes nothing, and the only mutation on this screen records a review decision
 * against a separate table. Merging two charts stays on the patient chart, behind the existing
 * system-admin dialog, and this screen links into it rather than reimplementing it.
 */
export function DuplicateReviewScreen() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const activeClinicId = getBootstrapActiveClinicId(bootstrap);
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;

  const [scope, setScope] = useState<ScopeMode>('clinic');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<DuplicateCandidate | null>(null);
  const [pendingDecision, setPendingDecision] = useState<DuplicateReviewStatus | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const effectiveScope: ScopeMode = isSystemAdmin ? scope : 'clinic';
  const clinicId = effectiveScope === 'clinic' ? activeClinicId : null;
  const scopeReady = effectiveScope === 'all' || Boolean(clinicId);

  const basePath = useMemo(
    () =>
      effectiveScope === 'all'
        ? '/admin/patients/duplicates'
        : `/clinics/${encodeURIComponent(clinicId ?? '')}/patients/duplicates`,
    [effectiveScope, clinicId],
  );

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('status', filters.status);
    if (filters.confidence !== 'ALL') params.set('confidence', filters.confidence);
    if (filters.reason !== 'ALL') params.set('reason', filters.reason);
    if (filters.q.trim()) params.set('q', filters.q.trim());
    params.set('page', String(page + 1));
    params.set('pageSize', String(pageSize));
    return params.toString();
  }, [filters, page, pageSize]);

  const queue = useAsyncResource<DuplicateCandidatePage>({
    resourceKey: [basePath, query, scopeReady].join('|'),
    enabled: scopeReady,
    errorMessage: 'The duplicate review queue could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(`${basePath}?${query}`, {
        getToken: token,
        signal,
        ...(effectiveScope === 'all'
          ? { skipClinicHeader: true }
          : { activeClinicId: clinicId ?? undefined }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      return (await response.json()) as DuplicateCandidatePage;
    },
  });

  const summary = queue.data?.summary ?? { open: 0, high: 0, crossClinic: 0, dismissed: 0 };

  const closeSheet = useCallback(() => {
    setSelected(null);
    setPendingDecision(null);
    setNote('');
    setReviewError(null);
  }, []);

  const submitDecision = useCallback(async () => {
    if (!selected || !pendingDecision) return;
    setSaving(true);
    setReviewError(null);
    try {
      const response = await apiFetch(`${basePath}/review`, {
        method: 'POST',
        body: JSON.stringify({
          patientAId: selected.patients[0].id,
          patientBId: selected.patients[1].id,
          status: pendingDecision,
          note: note.trim() || undefined,
        }),
        getToken,
        ...(effectiveScope === 'all'
          ? { skipClinicHeader: true }
          : { activeClinicId: clinicId ?? undefined }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      setNotice(DECISION_COPY[pendingDecision].notice);
      closeSheet();
      queue.refresh();
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : 'The decision could not be recorded.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    selected,
    pendingDecision,
    basePath,
    note,
    getToken,
    effectiveScope,
    clinicId,
    closeSheet,
    queue,
  ]);

  /*
    Column widths are chosen to fit, not to be generous. The grid gets roughly 880px inside the
    two-column layout at 1440, and an earlier set summing to 928 pushed the Actions cell -- the
    only way into the comparison -- off the right edge behind a scrollbar nobody scrolls.
  */
  const columns: GridColDef<DuplicateCandidate>[] = useMemo(
    () => [
      {
        field: 'confidence',
        headerName: 'Strength',
        width: 104,
        sortable: false,
        renderCell: (params) => (
          <Badge variant={confidenceBadgeVariant(params.row.confidence)}>
            {DUPLICATE_CONFIDENCE_LABELS[params.row.confidence]}
          </Badge>
        ),
      },
      {
        field: 'patients',
        headerName: 'Charts',
        flex: 1.9,
        minWidth: 236,
        sortable: false,
        renderCell: (params) => (
          <div className="py-2 text-sm leading-5">
            {params.row.patients.map((patient, index) => (
              <p key={patient.id} className={index === 0 ? 'text-foreground' : 'text-foreground'}>
                <span className="font-medium">{patientDisplayName(patient)}</span>
                <span className="text-muted-foreground"> · {patient.patientCode}</span>
              </p>
            ))}
          </div>
        ),
      },
      {
        field: 'reasons',
        headerName: 'Why it matched',
        flex: 1,
        minWidth: 180,
        sortable: false,
        // The strongest reason in full, with a count for the rest. The joined list ran to three
        // wrapped lines in a 64px row and clipped; the comparison sheet spells all of them out.
        renderCell: (params) => (
          <div className="py-2 text-sm leading-5">
            <p className="whitespace-normal text-foreground">
              {DUPLICATE_MATCH_REASON_LABELS[params.row.reasons[0]]}
            </p>
            {params.row.reasons.length > 1 ? (
              <p className="text-muted-foreground">and {params.row.reasons.length - 1} more</p>
            ) : null}
          </div>
        ),
      },
      {
        field: 'clinic',
        headerName: 'Scope',
        width: 112,
        sortable: false,
        // Which clinic a same-clinic pair sits in is always the clinic already named in the
        // header, so the column earns its width only by calling out the pairs that span two.
        // The clinic and organisation names for both charts are in the comparison sheet.
        renderCell: (params) =>
          params.row.crossClinic ? (
            <Badge variant="warning">Across clinics</Badge>
          ) : (
            <span className="text-muted-foreground">This clinic</span>
          ),
      },
      {
        field: 'lastUpdatedAt',
        headerName: 'Updated',
        width: 100,
        sortable: false,
        renderCell: (params) => (
          <span className="tabular-nums text-muted-foreground">
            {params.row.lastUpdatedAt.slice(0, 10)}
          </span>
        ),
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 100,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <Button variant="ghost" size="sm" onClick={() => setSelected(params.row)}>
            Compare
          </Button>
        ),
      },
    ],
    [],
  );

  const filtersAreDefault =
    filters.status === DEFAULT_FILTERS.status &&
    filters.confidence === DEFAULT_FILTERS.confidence &&
    filters.reason === DEFAULT_FILTERS.reason &&
    filters.q.trim() === '';

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Patient identity"
        title="Duplicate review"
        description="Charts that look like the same person, ranked by how strong the match is. Nothing here changes a record."
        helpTitle="How candidates are found"
        helpText={
          <div className="space-y-2">
            <p>
              Every pair below matched at least one conservative rule: the same national ID, the
              same name and date of birth, the same ID type and last four digits with a matching
              date of birth, the same phone number, or the same email address. A first name that is
              close but not identical counts only when the surname and date of birth already agree.
            </p>
            <p>
              This screen never merges anything. Marking a pair only records what you decided, so
              the queue gets shorter as it is worked instead of resetting each time it is opened.
              Merging two charts is a separate, irreversible step on the patient chart itself, and
              is limited to system administrators.
            </p>
          </div>
        }
        actions={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {isSystemAdmin ? (
              <SegmentedControl
                label="Which clinics to search"
                value={scope}
                onChange={(next) => {
                  setScope(next);
                  setPage(0);
                }}
                options={[
                  { value: 'clinic', label: 'This clinic' },
                  {
                    value: 'all',
                    label: 'All clinics',
                    description: 'Includes pairs that span two clinics.',
                  },
                ]}
                className="sm:w-72"
              />
            ) : null}
            {/*
              The label does not change while a refresh is in flight. Swapping it for "Refreshing"
              resizes the control and moves everything beside it, which the design system forbids;
              the icon spins and an sr-only live region carries the state instead.
            */}
            <Button
              variant="outline"
              onClick={() => queue.refresh()}
              disabled={queue.isRefreshing || !scopeReady}
            >
              <RefreshCw
                aria-hidden="true"
                className={`mr-2 h-4 w-4 ${queue.isRefreshing ? 'animate-spin' : ''}`}
              />
              Refresh
              <span aria-live="polite" className="sr-only">
                {queue.isRefreshing ? 'Refreshing the duplicate queue' : ''}
              </span>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AppMetricCard
          title="Needs review"
          value={summary.open}
          icon={CopyCheck}
          detail="Pairs nobody has decided on yet."
        />
        <AppMetricCard
          title="Very likely"
          value={summary.high}
          icon={AlertTriangle}
          detail="Open pairs with the strongest signals."
        />
        <AppMetricCard
          title="Across clinics"
          value={summary.crossClinic}
          icon={Building2}
          detail="Cannot be merged until a clinic owns the chart."
        />
        <AppMetricCard
          title="Ruled out"
          value={summary.dismissed}
          icon={ShieldCheck}
          detail="Already checked and marked as different people."
        />
      </div>

      {notice ? (
        <InlineNotice tone="success" live>
          {notice}
        </InlineNotice>
      ) : null}

      {/*
        min-w-0 on both columns. A CSS grid track defaults to min-width:auto, so a wide table in
        the right column pushes the whole grid past the viewport at 768 and 1024 instead of
        scrolling inside its own container.
      */}
      <section className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>Narrow the queue to the work in front of you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-status">Decision</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => {
                  setFilters((current) => ({ ...current, status: value as StatusFilter }));
                  setPage(0);
                }}
              >
                <SelectTrigger id="duplicate-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duplicate-confidence">Match strength</Label>
              <Select
                value={filters.confidence}
                onValueChange={(value) => {
                  setFilters((current) => ({ ...current, confidence: value as ConfidenceFilter }));
                  setPage(0);
                }}
              >
                <SelectTrigger id="duplicate-confidence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIDENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duplicate-reason">Why it matched</Label>
              <Select
                value={filters.reason}
                onValueChange={(value) => {
                  setFilters((current) => ({ ...current, reason: value as ReasonFilter }));
                  setPage(0);
                }}
              >
                <SelectTrigger id="duplicate-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Any reason</SelectItem>
                  {DUPLICATE_MATCH_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {DUPLICATE_MATCH_REASON_LABELS[reason]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duplicate-search">Name or chart code</Label>
              <Input
                id="duplicate-search"
                value={filters.q}
                placeholder="Mensah, or NKP-2026-000001"
                onChange={(event) => {
                  setFilters((current) => ({ ...current, q: event.target.value }));
                  setPage(0);
                }}
              />
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={filtersAreDefault}
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setPage(0);
              }}
            >
              Reset filters
            </Button>

            <ActiveFilterSummary
              items={[
                {
                  label: 'Decision',
                  value: STATUS_OPTIONS.find((o) => o.value === filters.status)?.label,
                },
                {
                  label: 'Strength',
                  value:
                    filters.confidence === 'ALL'
                      ? null
                      : DUPLICATE_CONFIDENCE_LABELS[filters.confidence],
                },
                {
                  label: 'Reason',
                  value:
                    filters.reason === 'ALL' ? null : DUPLICATE_MATCH_REASON_LABELS[filters.reason],
                },
                { label: 'Search', value: filters.q.trim() || null },
              ]}
              emptyLabel="Showing every open candidate"
            />

            <ProgressiveHelp title="What a match strength means">
              <p>
                Strength is the sum of the rules a pair matched, so two weak signals together
                outrank either one alone. It is a prompt to look, never a decision: a shared phone
                number can be a household, and two siblings can share a surname and a birthday.
                Always open the comparison before you act.
              </p>
            </ProgressiveHelp>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-xl">Candidates</CardTitle>
                <CardDescription>
                  Open a pair to compare the two charts side by side.
                </CardDescription>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/75 px-4 py-3 text-sm">
                <p className="text-muted-foreground">Showing</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {queue.data?.items.length ?? 0} of {queue.data?.total ?? 0}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!scopeReady ? (
              <SelectClinicState surface="The duplicate review queue" />
            ) : (
              <ResourceState
                state={queue}
                errorTitle="We couldn't load the duplicate review queue"
                skeleton={
                  <SectionSkeleton lines={5} className="border-0 bg-transparent p-0 shadow-none" />
                }
                isEmpty={(data) => data.items.length === 0}
                empty={{
                  title:
                    filters.status === 'OPEN' && filtersAreDefault
                      ? 'No suspected duplicates'
                      : 'No candidates match these filters',
                  description:
                    filters.status === 'OPEN' && filtersAreDefault
                      ? 'Every chart in scope looks like a distinct person. New candidates appear here as patients are registered.'
                      : 'Try a broader decision or match strength, or clear the search term.',
                  icon: Users,
                }}
              >
                {(data) => (
                  <>
                    {data.truncated ? (
                      <InlineNotice tone="warning">
                        There were more candidates than one page can scan. Narrow to a single
                        clinic, or work through these first and refresh.
                      </InlineNotice>
                    ) : null}

                    {/*
                      Cards until lg, not md. Every other grid in the product switches at md
                      because its row is one record; a row here is a pair, and the columns need
                      roughly 830px to keep both chart codes and the Compare action on screen. At
                      768 that leaves the only way into the comparison behind a horizontal
                      scrollbar, which is the same failure the column widths above were rebalanced
                      to fix.
                    */}
                    <div className="space-y-3 lg:hidden">
                      {data.items.map((candidate) => (
                        <article
                          key={candidate.pairKey}
                          className="rounded-lg border border-border/80 bg-background/80 p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <Badge variant={confidenceBadgeVariant(candidate.confidence)}>
                              {DUPLICATE_CONFIDENCE_LABELS[candidate.confidence]}
                            </Badge>
                            {candidate.crossClinic ? (
                              <Badge variant="warning">Across clinics</Badge>
                            ) : null}
                          </div>
                          <h3 className="mt-3 text-base font-semibold text-foreground">
                            {patientDisplayName(candidate.patients[0])}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {candidate.patients[0].patientCode}
                          </p>
                          <p className="mt-2 text-base font-semibold text-foreground">
                            {patientDisplayName(candidate.patients[1])}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {candidate.patients[1].patientCode}
                          </p>
                          <p className="mt-3 text-sm leading-5 text-muted-foreground">
                            {formatReasons(candidate.reasons)}
                          </p>
                          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                            Last updated {candidate.lastUpdatedAt.slice(0, 10)}
                          </p>
                          <Button
                            variant="outline"
                            className="mt-4 w-full"
                            onClick={() => setSelected(candidate)}
                          >
                            Compare charts
                          </Button>
                        </article>
                      ))}
                    </div>

                    {/*
                      A bounded height rather than autoHeight: the sticky column headers in
                      dataGridSx only stick against the grid's own scroll container.
                    */}
                    <Box
                      sx={{ height: 460, width: '100%' }}
                      className="hidden overflow-x-auto lg:block"
                    >
                      <DataGrid
                        rows={data.items}
                        columns={columns}
                        getRowId={(row) => row.pairKey}
                        /*
                          The one deviation from the 44px row height in dataGridSx, and a
                          deliberate one: every other grid in the product puts a single record
                          on a row, while a row here is a pair of them. At 44px both chart
                          codes and the match reason clip, which is exactly what an operator
                          opens this screen to read.
                        */
                        rowHeight={64}
                        loading={queue.isRefreshing}
                        disableColumnMenu
                        disableRowSelectionOnClick
                        paginationMode="server"
                        rowCount={data.total}
                        pageSizeOptions={[10, 25, 50]}
                        paginationModel={{ page, pageSize }}
                        onPaginationModelChange={(model) => {
                          setPage(model.page);
                          setPageSize(model.pageSize);
                        }}
                        sx={dataGridSx}
                      />
                    </Box>

                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/70 px-4 py-3 text-sm lg:hidden">
                      <p className="tabular-nums text-muted-foreground">
                        Showing {data.items.length} of {data.total}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page === 0 || queue.isRefreshing}
                          onClick={() => setPage((current) => Math.max(0, current - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={(page + 1) * pageSize >= data.total || queue.isRefreshing}
                          onClick={() => setPage((current) => current + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </ResourceState>
            )}
          </CardContent>
        </Card>
      </section>

      <DuplicateComparisonSheet
        candidate={selected}
        onClose={closeSheet}
        onDecide={(status) => {
          setPendingDecision(status);
          setReviewError(null);
        }}
      />

      <Dialog
        open={pendingDecision !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDecision(null);
            setNote('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{DECISION_COPY[pendingDecision ?? 'DISMISSED'].title}</DialogTitle>
            <DialogDescription>
              {DECISION_COPY[pendingDecision ?? 'DISMISSED'].description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="duplicate-note">Note for whoever reads this next (optional)</Label>
            <Textarea
              id="duplicate-note"
              value={note}
              maxLength={280}
              rows={3}
              placeholder="e.g. Twins, confirmed with the family."
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {reviewError ? <InlineNotice tone="error">{reviewError}</InlineNotice> : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingDecision(null);
                setNote('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void submitDecision()} disabled={saving}>
              {DECISION_COPY[pendingDecision ?? 'DISMISSED'].confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DuplicateComparisonSheet({
  candidate,
  onClose,
  onDecide,
}: {
  candidate: DuplicateCandidate | null;
  onClose: () => void;
  onDecide: (status: DuplicateReviewStatus) => void;
}) {
  // Nothing selected renders nothing. Keeping a closed Sheet mounted would leave an empty
  // dialog in the accessibility tree for every page view that never opens one.
  if (!candidate) return null;

  const [left, right] = candidate.patients;
  const status = candidateStatus(candidate);

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Compare two charts</SheetTitle>
          <SheetDescription>
            {formatReasons(candidate.reasons)}. Nothing on this panel changes either record.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant={confidenceBadgeVariant(candidate.confidence)}>
              {DUPLICATE_CONFIDENCE_LABELS[candidate.confidence]}
            </Badge>
            <Badge variant={reviewStatusBadgeVariant(status)}>
              {DUPLICATE_REVIEW_STATUS_LABELS[status]}
            </Badge>
            {candidate.crossClinic ? <Badge variant="warning">Across clinics</Badge> : null}
          </div>

          {candidate.review?.note ? (
            <InlineNotice tone="info">
              &ldquo;{candidate.review.note}&rdquo;
              {candidate.review.reviewedBy ? ` — ${candidate.review.reviewedBy.displayName}` : null}
            </InlineNotice>
          ) : null}

          {candidate.crossClinic ? (
            <InlineNotice tone="warning">
              These charts belong to different clinics, so they cannot be merged yet. Record what
              you found here, and raise it with the clinics that own the two records.
            </InlineNotice>
          ) : null}

          <PatientComparisonTable
            left={left}
            right={right}
            caption="Field by field comparison of the two patient charts"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="outline">
              <Link href={patientChartHref(left)}>
                <ExternalLink aria-hidden="true" className="mr-2 h-4 w-4" />
                Open {left.patientCode}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={patientChartHref(right)}>
                <ExternalLink aria-hidden="true" className="mr-2 h-4 w-4" />
                Open {right.patientCode}
              </Link>
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-4">
            <h3 className="text-base font-semibold text-foreground">Record your decision</h3>
            <p className="text-sm leading-5 text-muted-foreground">
              Neither option changes a patient record. Merging is a separate, irreversible step on
              the chart itself.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => onDecide('DISMISSED')}>
                Not a duplicate
              </Button>
              <Button onClick={() => onDecide('CONFIRMED')}>Confirm duplicate</Button>
            </div>
            {/*
              A decision has to be reversible. Without this, one mis-click hides a genuine
              duplicate from the queue permanently and the only way back is the database.
            */}
            {status !== 'OPEN' ? (
              <Button variant="ghost" className="w-full" onClick={() => onDecide('OPEN')}>
                Move back to review
              </Button>
            ) : null}
            {/*
              Deliberately not the destructive treatment. This link navigates to the patient
              chart; it does not merge anything. Dressing it in the same red as the control that
              irreversibly consolidates two records would teach an operator to expect a
              confirmation step this button does not have.
            */}
            {candidate.mergeEligible ? (
              <Button asChild variant="outline" className="w-full">
                {/*
                  Carries the pair, so the chart opens straight into the merge preview rather
                  than asking an operator to search again for the chart they were just reading.
                  The preview is read-only; the merge still has its own confirmation there.
                */}
                <Link href={`${patientChartHref(left)}?merge=${encodeURIComponent(right.id)}`}>
                  Preview merging {right.patientCode} into {left.patientCode}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
