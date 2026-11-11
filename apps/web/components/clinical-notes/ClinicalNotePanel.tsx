'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, LockKeyhole, Plus, Save, Sparkles, ShieldCheck } from 'lucide-react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import type { ClinicalNote } from '@/lib/clinical-notes';
import { Button } from '@/components/ui/button';
import { FormActions } from '@/components/ui/form-actions';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InlineNotice } from '@/components/ops/OpsShared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChartSectionLoading } from '@/components/patients/chart/ChartSectionState';
import { ClinicalNoteStatusBadge } from './ClinicalNoteStatusBadge';
import { confirmAction as askToConfirm } from '@/components/ui/confirm-dialog';
import { formatOpsDateTime } from '@/lib/ops';
import styles from '@/components/encounters/encounter-workspace.module.css';

const EMPTY_DRAFT = { history: '', assessment: '', plan: '' };
const SECTION_HINTS = {
  history: 'Symptoms, relevant history, and the patient narrative.',
  assessment: 'Clinical interpretation, working problems, and relevant findings.',
  plan: 'Treatment, education, follow-up, referrals, and next steps.',
} as const;

export function ClinicalNotePanel({
  clinicId,
  encounterId,
  userId,
  isDoctor,
}: {
  clinicId: string;
  encounterId: string;
  userId: string;
  isDoctor: boolean;
}) {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const [note, setNote] = useState<ClinicalNote | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'submit' | 'cosign' | null>(null);
  const [addendumOpen, setAddendumOpen] = useState(false);
  const [addendumReason, setAddendumReason] = useState('');
  const [addendumContent, setAddendumContent] = useState('');

  const loadNote = useCallback(async () => {
    if (!getToken || !isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/clinical-note`,
        { getToken, activeClinicId: clinicId },
      );
      if (response.status === 404) {
        setNote(null);
        setDraft(EMPTY_DRAFT);
        return;
      }
      if (!response.ok) throw await readApiError(response);
      const loaded = (await response.json()) as ClinicalNote;
      setNote(loaded);
      setDraft({ history: loaded.history, assessment: loaded.assessment, plan: loaded.plan });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'The clinical note could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [clinicId, encounterId, getToken, isOnline]);

  useEffect(() => {
    void loadNote();
  }, [loadNote]);

  const dirty = useMemo(
    () =>
      Boolean(
        note &&
        (draft.history !== note.history ||
          draft.assessment !== note.assessment ||
          draft.plan !== note.plan),
      ),
    [draft, note],
  );
  /**
   * Draft the note from this encounter's chronic-disease interviews.
   *
   * Generated server-side and written through the ordinary draft path, so authorship, the
   * DRAFT-only rule and the optimistic version check all still decide whether it lands.
   *
   * Confirms before replacing text somebody has already written. The generator regenerates
   * wholesale rather than appending -- which is what makes pressing it twice safe -- and that is
   * exactly what makes it destructive to a draft that has been edited.
   */
  const seedFromInterviews = useCallback(async () => {
    if (!getToken || !isOnline) return;
    const hasWriting = [draft.history, draft.assessment, draft.plan].some(
      (text) => text.trim().length > 0,
    );
    if (
      hasWriting &&
      !(await askToConfirm({
        title: 'Replace the draft?',
        description:
          'The draft is replaced with text generated from the hypertension and diabetes interviews. Anything typed here is lost.',
        confirmLabel: 'Replace draft',
      }))
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/clinical-note/seed`,
        {
          method: 'POST',
          body: JSON.stringify(note ? { expectedVersion: note.version } : {}),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) throw await readApiError(response);
      const saved = (await response.json()) as ClinicalNote;
      setNote(saved);
      setDraft({ history: saved.history, assessment: saved.assessment, plan: saved.plan });
      setSuccess('Draft written from the interviews. Review it before submitting.');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'The draft could not be generated.'));
    } finally {
      setBusy(false);
    }
  }, [clinicId, encounterId, getToken, isOnline, note, draft]);

  const editable = note?.status === 'DRAFT' && note.authorUserId === userId;
  const canCosign =
    isDoctor && note?.status === 'PENDING_COSIGN' && note.assignedDoctor?.id === userId;
  const signed = note?.status === 'COSIGNED' || note?.status === 'AMENDED';

  const saveDraft = useCallback(async () => {
    if (!getToken || !isOnline) return false;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/clinical-note`,
        {
          method: note ? 'PUT' : 'POST',
          body: JSON.stringify(note ? { ...draft, expectedVersion: note.version } : draft),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) throw await readApiError(response);
      const saved = (await response.json()) as ClinicalNote;
      setNote(saved);
      setDraft({ history: saved.history, assessment: saved.assessment, plan: saved.plan });
      setSuccess(note ? 'Draft saved.' : 'HAP note started.');
      return true;
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'The draft could not be saved.'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [clinicId, draft, encounterId, getToken, isOnline, note]);

  useEffect(() => {
    if (!editable) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editable, saveDraft]);

  const transition = async () => {
    if (!getToken || !note || !confirmAction || !isOnline) return;
    setBusy(true);
    setError(null);
    try {
      if (confirmAction === 'submit' && dirty) {
        const saved = await saveDraft();
        if (!saved) return;
      }
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/clinical-note/${confirmAction}`,
        { method: 'POST', getToken, activeClinicId: clinicId },
      );
      if (!response.ok) throw await readApiError(response);
      const updated = (await response.json()) as ClinicalNote;
      setNote(updated);
      setDraft({
        history: updated.history,
        assessment: updated.assessment,
        plan: updated.plan,
      });
      setSuccess(
        confirmAction === 'cosign'
          ? 'Note cosigned. Its signed content is now immutable.'
          : updated.status === 'COSIGNED'
            ? 'Note signed. Its content is now immutable.'
            : 'Note submitted to the assigned doctor.',
      );
      setConfirmAction(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'The note status could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  const addAddendum = async () => {
    if (!getToken || !note || !isOnline) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/clinical-note/addenda`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: addendumReason, content: addendumContent }),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) throw await readApiError(response);
      setNote((await response.json()) as ClinicalNote);
      setAddendumOpen(false);
      setAddendumReason('');
      setAddendumContent('');
      setSuccess('Addendum appended without changing the signed note.');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'The addendum could not be appended.'));
    } finally {
      setBusy(false);
    }
  };

  if (!isOnline) {
    return (
      <InlineNotice>
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Clinical notes require a secure connection</p>
            <p className="mt-1 text-muted-foreground">
              Note content is never stored in this device&apos;s offline cache. Reconnect to view or
              update this HAP note.
            </p>
          </div>
        </div>
      </InlineNotice>
    );
  }

  // Every other chart panel routes its loading state through ChartSectionLoading, which announces
  // itself to a screen reader. This one returned a bare paragraph, so a volunteer using a reader
  // heard nothing at all while the note was fetching.
  if (loading) return <ChartSectionLoading label="clinical note" lines={4} />;

  if (!note && error) {
    return <InlineNotice tone="error">{error}</InlineNotice>;
  }

  if (!note) {
    return (
      <div className="space-y-4">
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <section
          aria-labelledby="clinical-note-empty"
          className="border-t-2 border-rule-strong pt-4"
        >
          <h2 id="clinical-note-empty" className="type-section-title text-foreground">
            No HAP note for this encounter
          </h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
            Start one History, Assessment, and Plan note for this visit, or draft it from the
            hypertension and diabetes interviews and edit it before submitting.
          </p>
          <div className="mt-4 flex flex-col gap-2 compact:flex-row compact:flex-wrap [&>button]:h-auto [&>button]:whitespace-normal">
            <Button type="button" onClick={() => void saveDraft()} disabled={busy}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Start HAP note
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void seedFromInterviews()}
              disabled={busy}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Draft from the interviews
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const displayed = signed
    ? {
        history: note.signedHistory ?? '',
        assessment: note.signedAssessment ?? '',
        plan: note.signedPlan ?? '',
      }
    : draft;
  const authorRole = note.authorRole === 'DOCTOR' ? 'doctor' : 'volunteer';

  return (
    <div className="space-y-5">
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}

      {/* The same deliberate band as encounter sign-off: what is waiting, and what it freezes. */}
      {canCosign ? (
        <section aria-labelledby="clinical-note-cosign" className={styles.signoff}>
          <div className={styles.signoffText}>
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning-ink" aria-hidden="true" />
            <div>
              <h2 id="clinical-note-cosign" className="font-sans text-base font-semibold">
                Waiting for your cosign
              </h2>
              <p className="text-sm text-muted-foreground">
                Read the note below. Cosigning freezes it; later corrections become addenda.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmAction('cosign')}
            disabled={busy}
            className="border-warning text-warning-ink"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Cosign note
          </Button>
        </section>
      ) : null}

      {/* No region label: "History, Assessment, and Plan" would also answer getByLabel('History'). */}
      <div className="border-t-2 border-rule-strong pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h2 id="clinical-note-title" className="type-section-title text-foreground">
            History, Assessment, and Plan
          </h2>
          <ClinicalNoteStatusBadge status={note.status} />
        </div>
        <dl className="mt-3 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm compact:grid-cols-[max-content_minmax(0,1fr)] compact:gap-x-6">
          <dt className="text-muted-foreground">Written by</dt>
          <dd className="min-w-0 font-medium">
            {note.author.displayName}
            <span className="font-normal text-muted-foreground">, {authorRole}</span>
          </dd>
          {note.assignedDoctorNameSnapshot ? (
            <>
              <dt className="text-muted-foreground">Care team at submission</dt>
              <dd className="min-w-0">
                Volunteer {note.assignedVolunteerNameSnapshot ?? 'not assigned'} · Doctor{' '}
                {note.assignedDoctorNameSnapshot}
              </dd>
            </>
          ) : null}
          {note.submittedAt ? (
            <>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="tabular-nums">
                <time dateTime={note.submittedAt}>{formatOpsDateTime(note.submittedAt)}</time>
              </dd>
            </>
          ) : null}
          {note.cosignedAt ? (
            <>
              <dt className="text-muted-foreground">
                {note.cosignedBy && note.cosignedBy.id === note.authorUserId
                  ? 'Signed'
                  : 'Cosigned'}
              </dt>
              <dd className="tabular-nums">
                <time dateTime={note.cosignedAt}>{formatOpsDateTime(note.cosignedAt)}</time>
                {note.cosignedBy ? ` by ${note.cosignedBy.displayName}` : ''}
              </dd>
            </>
          ) : null}
        </dl>

        <div className="mt-4">
          {(['history', 'assessment', 'plan'] as const).map((section) => (
            <div key={section} className="space-y-2 border-t border-rule py-4">
              {editable ? (
                <Label htmlFor={`clinical-note-${section}`} className="text-base capitalize">
                  {section}
                </Label>
              ) : (
                <h3 className="font-sans text-base font-semibold capitalize text-foreground">
                  {section}
                </h3>
              )}
              <p className="text-xs text-muted-foreground">{SECTION_HINTS[section]}</p>
              {editable ? (
                <Textarea
                  id={`clinical-note-${section}`}
                  value={draft[section]}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [section]: event.target.value }))
                  }
                  maxLength={20_000}
                  rows={9}
                  className="min-h-48 resize-y text-base leading-7"
                />
              ) : (
                <p
                  className={
                    displayed[section]
                      ? 'max-w-[70ch] whitespace-pre-wrap text-base leading-7 text-foreground'
                      : 'text-sm italic text-muted-foreground'
                  }
                >
                  {displayed[section] || 'Not recorded'}
                </p>
              )}
            </div>
          ))}
        </div>

        {editable ? (
          <FormActions split>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void seedFromInterviews()}
              disabled={busy}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Draft from the interviews
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void saveDraft()}
              disabled={busy || !dirty}
              // Names the shortcut the keydown handler above already takes (#280).
              aria-keyshortcuts="Control+S Meta+S"
              title="Save draft (Ctrl+S or ⌘S)"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save draft
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAction('submit')}
              disabled={busy}
              className="border-warning text-warning-ink"
            >
              <FileCheck2 className="h-4 w-4" aria-hidden="true" />
              {note.authorRole === 'DOCTOR' ? 'Sign note' : 'Submit for cosign'}
            </Button>
          </FormActions>
        ) : signed && isDoctor ? (
          <FormActions>
            <Button type="button" variant="outline" onClick={() => setAddendumOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add addendum
            </Button>
          </FormActions>
        ) : null}
      </div>

      {note.addenda.length ? (
        <section
          aria-labelledby="clinical-note-addenda"
          className="border-t-2 border-rule-strong pt-4"
        >
          <h2 id="clinical-note-addenda" className="type-section-title text-foreground">
            Addenda
          </h2>
          <ol className="mt-3 divide-y divide-rule border-y border-rule">
            {note.addenda.map((addendum) => (
              <li key={addendum.id} className="py-4">
                <div className="flex flex-col gap-1 compact:flex-row compact:justify-between compact:gap-4">
                  <p className="font-medium">{addendum.reason}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {addendum.author.displayName} ·{' '}
                    <time dateTime={addendum.createdAt}>
                      {formatOpsDateTime(addendum.createdAt)}
                    </time>
                  </p>
                </div>
                <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-sm leading-6">
                  {addendum.content}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'cosign' ? 'Cosign this HAP note?' : 'Submit this HAP note?'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'cosign'
                ? `You are signing for the note ${note.author.displayName} wrote. `
                : ''}
              This freezes History, Assessment, and Plan. Future corrections must be appended as
              addenda and cannot rewrite the signed record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void transition()} disabled={busy}>
              {busy ? 'Saving…' : confirmAction === 'cosign' ? 'Cosign note' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addendumOpen} onOpenChange={setAddendumOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Append an addendum</DialogTitle>
            <DialogDescription>
              The addendum becomes a permanent, timestamped addition. It does not modify the signed
              HAP note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="addendum-reason">Reason</Label>
              <Textarea
                id="addendum-reason"
                value={addendumReason}
                onChange={(event) => setAddendumReason(event.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addendum-content">Addendum</Label>
              <Textarea
                id="addendum-content"
                value={addendumContent}
                onChange={(event) => setAddendumContent(event.target.value)}
                maxLength={20_000}
                rows={8}
                className="min-h-44 resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddendumOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => void addAddendum()}
              disabled={busy || !addendumReason.trim() || !addendumContent.trim()}
            >
              {busy ? 'Appending…' : 'Append addendum'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
