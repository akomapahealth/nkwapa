'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Search, ShieldAlert } from 'lucide-react';
import { apiFetch, getErrorMessage, readApiError, type GetToken } from '@/lib/api';
import {
  confirmationMatches,
  describeCount,
  describePortalOutcome,
  fetchMergePreview,
  partitionRelations,
  type MergeFinding,
  type MergeInviteStrategy,
  type MergePortalLinkStrategy,
  type PatientMergePreview,
} from '@/lib/patient-merge';
import {
  DUPLICATE_CONFIDENCE_LABELS,
  confidenceBadgeVariant,
  formatReasons,
} from '@/lib/patient-duplicates';
import { useAsyncResource } from '@/lib/use-async-resource';
import { PatientComparisonTable } from '@/components/patients/PatientComparisonTable';
import { ResourceState } from '@/components/feedback/ResourceState';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface MergeCandidate {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  email?: string | null;
  nationalIdLast4?: string | null;
}

type Step = 'choose' | 'review' | 'confirm';

const STEP_ORDER: Step[] = ['choose', 'review', 'confirm'];

const STEP_COPY: Record<Step, { title: string; description: string }> = {
  choose: {
    title: 'Find the duplicate chart',
    description:
      'Search for the other record of this same person. Nothing changes until you have read what the merge would do and confirmed it.',
  },
  review: {
    title: 'Check what the merge would do',
    description:
      'This is a read-only summary of both charts. Nothing has changed yet, and closing this panel changes nothing.',
  },
  confirm: {
    title: 'Confirm the merge',
    description:
      'This cannot be undone. The duplicate chart is retired and everything on it moves to this one.',
  },
};

/**
 * Choose a duplicate, read what merging it would do, then commit.
 *
 * Lifted out of the patient chart page, which held the whole flow inline as a search box and a
 * button that merged two people's records with no confirmation and no destructive treatment --
 * against the design system's own rule that an irreversible action needs a confirmation step
 * naming what will change.
 *
 * The three steps are one Dialog rather than three, because each step is the same decision seen
 * in more detail, and because a wizard that navigates away loses the chart the operator opened
 * it from. The Dialog primitive already handles small screens; nothing here re-solves that.
 */
export function MergePatientDialog({
  open,
  onOpenChange,
  clinicId,
  canonical,
  initialSourcePatientId,
  getToken,
  onMerged,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  canonical: MergeCandidate;
  /** Pre-selects the duplicate, so the duplicate review queue can hand a pair straight over. */
  initialSourcePatientId?: string | null;
  getToken: GetToken | undefined;
  onMerged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>('choose');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sourcePatientId, setSourcePatientId] = useState('');
  const [portalLinkStrategy, setPortalLinkStrategy] = useState<MergePortalLinkStrategy | ''>('');
  const [inviteStrategy, setInviteStrategy] = useState<MergeInviteStrategy>('MERGE');
  const [confirmation, setConfirmation] = useState('');
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const confirmFieldId = useId();
  const confirmInputRef = useRef<HTMLInputElement>(null);

  /*
    Clearing happens on close, not on open.

    Reopening must not resume a half-finished decision about a different chart, but doing the
    reset when `open` becomes true races the user: the dialog body mounts and is typeable a frame
    before an effect runs, so a fast typist -- or a test -- could get their first keystrokes wiped
    by the reset that was meant to prepare the panel for them. Nothing is being typed while it is
    closed, so that is where the clearing belongs.
  */
  useEffect(() => {
    if (open) return;
    setQuery('');
    setCandidates([]);
    setSearchError(null);
    setPortalLinkStrategy('');
    setInviteStrategy('MERGE');
    setConfirmation('');
    setConfirmationError(null);
    setSubmitError(null);
  }, [open]);

  // Where to start. Neither field is one the operator can be mid-way through typing into.
  useEffect(() => {
    if (!open) return;
    setStep(initialSourcePatientId ? 'review' : 'choose');
    setSourcePatientId(initialSourcePatientId ?? '');
  }, [open, initialSourcePatientId]);

  useEffect(() => {
    if (!open || step !== 'choose' || !getToken) return;
    const timer = setTimeout(
      () => {
        void (async () => {
          try {
            const response = await apiFetch(
              `/clinics/${encodeURIComponent(clinicId)}/patients?page=1&pageSize=8&q=${encodeURIComponent(query)}`,
              { getToken, activeClinicId: clinicId },
            );
            if (!response.ok) throw new Error('Patient search failed');
            const payload = (await response.json()) as { items: MergeCandidate[] };
            setCandidates(payload.items.filter((candidate) => candidate.id !== canonical.id));
            setSearchError(null);
          } catch (error) {
            setSearchError(getErrorMessage(error, 'Patient search could not be completed.'));
          }
        })();
      },
      query.trim() ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [canonical.id, clinicId, getToken, open, query, step]);

  const previewEnabled = open && step !== 'choose' && sourcePatientId !== '' && !!getToken;

  const preview = useAsyncResource<PatientMergePreview>({
    resourceKey: [clinicId, canonical.id, sourcePatientId, portalLinkStrategy, inviteStrategy].join(
      '|',
    ),
    enabled: previewEnabled,
    errorMessage: 'The merge preview could not be loaded.',
    fetcher: (token, signal) =>
      fetchMergePreview(
        {
          clinicId,
          canonicalPatientId: canonical.id,
          sourcePatientId,
          portalLinkStrategy: portalLinkStrategy || undefined,
          inviteStrategy,
        },
        token,
        signal,
      ),
  });

  const data = preview.data;

  const handleSubmit = useCallback(async () => {
    if (!data || !getToken) return;
    if (!confirmationMatches(confirmation, data.source.patientCode)) {
      setConfirmationError(
        `Type ${data.source.patientCode} to confirm you are retiring that chart.`,
      );
      confirmInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await apiFetch('/admin/patients/merge', {
        method: 'POST',
        body: JSON.stringify({
          canonicalPatientId: canonical.id,
          sourcePatientId: data.source.id,
          portalLinkStrategy: data.strategies.portalLinkStrategy,
          inviteStrategy: data.strategies.inviteStrategy,
          // Proves the operator acted on the panel they were shown.
          previewFingerprint: data.fingerprint,
        }),
        getToken,
        skipClinicHeader: true,
      });
      if (!response.ok) throw await readApiError(response);
      onOpenChange(false);
      onMerged(
        `${data.source.patientCode} was merged into ${canonical.patientCode}. Its old chart code now finds this record.`,
      );
    } catch (error) {
      const message = getErrorMessage(error, 'The merge could not be completed.');
      setSubmitError(message);
      onError(message);
      // The charts may have moved under the panel, so re-read rather than leaving a stale one up.
      preview.refresh();
    } finally {
      setSubmitting(false);
    }
  }, [
    canonical.id,
    canonical.patientCode,
    confirmation,
    data,
    getToken,
    onError,
    onMerged,
    onOpenChange,
    preview,
  ]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const copy = STEP_COPY[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <p className="text-eyebrow text-muted-foreground">
            Step {stepIndex + 1} of {STEP_ORDER.length}
          </p>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {/*
          One polite live region for the whole flow. Moving between steps changes the entire body
          of the dialog, and a screen-reader user who tabbed into it would otherwise get no
          indication that the ground moved.
        */}
        <span aria-live="polite" className="sr-only">
          {`Step ${stepIndex + 1} of ${STEP_ORDER.length}. ${copy.title}.`}
        </span>

        <div className="space-y-4 py-2">
          {submitError ? <InlineNotice tone="error">{submitError}</InlineNotice> : null}

          {step === 'choose' ? (
            <ChooseStep
              canonical={canonical}
              candidates={candidates}
              query={query}
              onQueryChange={setQuery}
              error={searchError}
              selectedId={sourcePatientId}
              onSelect={setSourcePatientId}
            />
          ) : (
            <ResourceState
              state={preview}
              errorTitle="The merge preview could not be loaded."
              skeleton={<PreviewSkeleton />}
            >
              {(loaded) =>
                step === 'review' ? (
                  <ReviewStep
                    preview={loaded}
                    portalLinkStrategy={portalLinkStrategy}
                    onPortalLinkStrategyChange={setPortalLinkStrategy}
                    inviteStrategy={inviteStrategy}
                    onInviteStrategyChange={setInviteStrategy}
                  />
                ) : (
                  <ConfirmStep
                    preview={loaded}
                    canonicalPatientCode={canonical.patientCode}
                    fieldId={confirmFieldId}
                    inputRef={confirmInputRef}
                    value={confirmation}
                    error={confirmationError}
                    onChange={(next) => {
                      setConfirmation(next);
                      if (confirmationError) setConfirmationError(null);
                    }}
                  />
                )
              }
            </ResourceState>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => (step === 'choose' ? onOpenChange(false) : setStep(previousStep(step)))}
            disabled={submitting}
          >
            {step === 'choose' ? 'Cancel' : 'Back'}
          </Button>

          {step === 'choose' ? (
            <Button disabled={!sourcePatientId} onClick={() => setStep('review')}>
              Preview the merge
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Button>
          ) : step === 'review' ? (
            /*
              Blocked shows no continue control at all rather than a disabled one. A disabled
              button says "not now"; a refused merge needs the operator to go and do something
              else, and the recovery line above says what.
            */
            data?.canMerge ? (
              <Button onClick={() => setStep('confirm')}>
                Continue
                <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </Button>
            ) : null
          ) : (
            <Button
              variant="destructive"
              onClick={() => void handleSubmit()}
              disabled={submitting || !data}
            >
              <ShieldAlert aria-hidden="true" className="mr-2 h-4 w-4" />
              Merge and retire {data?.source.patientCode ?? 'the duplicate'}
              {/* The label never changes size mid-press; the state goes to the live region. */}
              <span aria-live="polite" className="sr-only">
                {submitting ? 'Merging the two charts' : ''}
              </span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function previousStep(step: Step): Step {
  return step === 'confirm' ? 'review' : 'choose';
}

function PreviewSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-3 rounded-lg border border-border/70 p-4"
    >
      <span className="sr-only">Loading the merge preview</span>
      {[0, 1, 2, 3, 4].map((line) => (
        <div key={line} className="h-4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function ChooseStep({
  canonical,
  candidates,
  query,
  onQueryChange,
  error,
  selectedId,
  onSelect,
}: {
  canonical: MergeCandidate;
  candidates: MergeCandidate[];
  query: string;
  onQueryChange: (value: string) => void;
  error: string | null;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const searchId = useId();

  return (
    <div className="space-y-3">
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      <InlineNotice tone="info" live={false}>
        {canonical.patientCode} is the chart that survives. The record you pick here is the one that
        gets retired.
      </InlineNotice>

      <div className="space-y-2">
        <Label htmlFor={searchId}>Search this clinic&rsquo;s charts</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name, chart code, phone, or a retired code"
            className="pl-9"
          />
        </div>
      </div>

      <ul className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border/70 bg-background/75 p-2">
        {candidates.map((candidate) => {
          const selected = selectedId === candidate.id;
          return (
            <li key={candidate.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(candidate.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border/70 bg-card hover:border-primary/40'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">
                    {candidate.firstName} {candidate.lastName}
                  </span>
                  {selected ? (
                    <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                </span>
                <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
                  {candidate.patientCode}
                  {candidate.phoneE164 ? ` · ${candidate.phoneE164}` : ''}
                  {candidate.nationalIdLast4 ? ` · ID …${candidate.nationalIdLast4}` : ''}
                </span>
              </button>
            </li>
          );
        })}
        {candidates.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">
            {query.trim()
              ? 'No other chart in this clinic matches that search.'
              : 'Start typing to find the duplicate record.'}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function FindingList({ findings, tone }: { findings: MergeFinding[]; tone: 'error' | 'warning' }) {
  if (findings.length === 0) return null;

  return (
    <ul className="space-y-2">
      {findings.map((finding) => (
        <li key={finding.code}>
          <InlineNotice tone={tone}>
            <span className="flex gap-2">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-medium">{finding.label}</span>
                {finding.detail ? <span className="opacity-90"> — {finding.detail}</span> : null}
                {/* Every refusal names a next step; a blocker nobody can act on is a support call. */}
                <span className="mt-1 block opacity-90">{finding.recovery}</span>
              </span>
            </span>
          </InlineNotice>
        </li>
      ))}
    </ul>
  );
}

function ReviewStep({
  preview,
  portalLinkStrategy,
  onPortalLinkStrategyChange,
  inviteStrategy,
  onInviteStrategyChange,
}: {
  preview: PatientMergePreview;
  portalLinkStrategy: MergePortalLinkStrategy | '';
  onPortalLinkStrategyChange: (value: MergePortalLinkStrategy) => void;
  inviteStrategy: MergeInviteStrategy;
  onInviteStrategyChange: (value: MergeInviteStrategy) => void;
}) {
  const { moving, untouched, emptyCount, totalMoving } = useMemo(
    () => partitionRelations(preview.relations),
    [preview.relations],
  );
  const bothLinked = preview.portal.canonicalLinked && preview.portal.sourceLinked;
  const portalFieldId = useId();
  const inviteFieldId = useId();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={confidenceBadgeVariant(preview.duplicateSignal.confidence)}>
          {DUPLICATE_CONFIDENCE_LABELS[preview.duplicateSignal.confidence]}
        </Badge>
        {preview.duplicateSignal.reasons.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {formatReasons(preview.duplicateSignal.reasons)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            Nothing about these two charts matches automatically.
          </span>
        )}
      </div>

      <FindingList findings={preview.blockers} tone="error" />
      <FindingList findings={preview.warnings} tone="warning" />

      <PatientComparisonTable
        left={preview.canonical}
        right={preview.source}
        leftLabel="Keeps"
        rightLabel="Retired"
        caption="Field by field comparison of the chart being kept and the chart being retired"
      />

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">What moves</h3>
        {moving.length > 0 ? (
          <dl className="divide-y divide-border/70 rounded-lg border border-border/70">
            {moving.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd className="text-sm tabular-nums text-foreground">
                  <span className="font-medium">{describeCount(row.sourceCount, row.label)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    joining {describeCount(row.canonicalCount, row.label)} already here
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded-lg border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            The duplicate chart holds no clinical records. Only its identity and chart code move.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {totalMoving === 0
            ? 'Nothing on the retired chart needs moving.'
            : `${totalMoving} record${totalMoving === 1 ? '' : 's'} move in total.`}
          {untouched.length > 0
            ? ` ${untouched.length} kind${untouched.length === 1 ? '' : 's'} of record on ${preview.canonical.patientCode} are untouched.`
            : ''}
          {emptyCount > 0 ? ` ${emptyCount} kinds are empty on both charts.` : ''}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">App access and invitations</h3>
        <p className="text-sm text-muted-foreground">{describePortalOutcome(preview)}</p>

        {bothLinked ? (
          <div className="space-y-2">
            <Label htmlFor={portalFieldId}>Which app account keeps access</Label>
            <Select
              value={portalLinkStrategy || 'CANONICAL'}
              onValueChange={(value) =>
                onPortalLinkStrategyChange(value as MergePortalLinkStrategy)
              }
            >
              <SelectTrigger id={portalFieldId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CANONICAL">
                  The account on {preview.canonical.patientCode}
                </SelectItem>
                <SelectItem value="SOURCE">The account on {preview.source.patientCode}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {preview.portal.canonicalPendingInvites + preview.portal.sourcePendingInvites > 0 ? (
          <div className="space-y-2">
            <Label htmlFor={inviteFieldId}>Unclaimed invitations</Label>
            <Select
              value={inviteStrategy}
              onValueChange={(value) => onInviteStrategyChange(value as MergeInviteStrategy)}
            >
              <SelectTrigger id={inviteFieldId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MERGE">Keep both, on the surviving chart</SelectItem>
                <SelectItem value="CANONICAL">
                  Keep this chart&rsquo;s, cancel the duplicate&rsquo;s
                </SelectItem>
                <SelectItem value="SOURCE">
                  Keep the duplicate&rsquo;s, cancel this chart&rsquo;s
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Chart codes</h3>
        <p className="text-sm text-muted-foreground">
          Searching for <span className="font-medium text-foreground">{preview.aliases.added}</span>{' '}
          will find {preview.canonical.patientCode} after the merge. The retired chart is renamed to{' '}
          <span className="tabular-nums">{preview.tombstonePatientCode}</span>.
          {preview.aliases.carriedOver.length > 0
            ? ` ${preview.aliases.carriedOver.length} earlier code${
                preview.aliases.carriedOver.length === 1 ? '' : 's'
              } carry across too.`
            : ''}
        </p>
      </section>
    </div>
  );
}

function ConfirmStep({
  preview,
  canonicalPatientCode,
  fieldId,
  inputRef,
  value,
  error,
  onChange,
}: {
  preview: PatientMergePreview;
  canonicalPatientCode: string;
  fieldId: string;
  inputRef: React.RefObject<HTMLInputElement>;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const { totalMoving } = partitionRelations(preview.relations);

  return (
    <div className="space-y-4">
      <InlineNotice tone="warning" live={false}>
        <span className="flex gap-2">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {/*
              The dialog description above already says the merge cannot be undone. Repeating it
              here word for word teaches the reader to skim the notice; what belongs here is the
              consequence for these two charts specifically.
            */}
            <span className="block font-medium">
              {preview.source.patientCode} stops being a chart anyone can open.
            </span>
            {totalMoving === 0
              ? 'It holds no records to move.'
              : `Its ${totalMoving} record${totalMoving === 1 ? '' : 's'} move to ${canonicalPatientCode}.`}{' '}
            {describePortalOutcome(preview)}
          </span>
        </span>
      </InlineNotice>

      <div className="space-y-2">
        <Label htmlFor={fieldId}>
          Type {preview.source.patientCode} to confirm you are retiring that chart
        </Label>
        <Input
          id={fieldId}
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={preview.source.patientCode}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className="tabular-nums"
        />
        {error ? (
          <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Typing the code is the last check that you are retiring the record you meant to.
          </p>
        )}
      </div>
    </div>
  );
}
