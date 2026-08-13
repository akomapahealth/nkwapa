'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, FilePenLine, LockKeyhole, Plus, Save, Stethoscope } from 'lucide-react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import type { ClinicalNote } from '@/lib/clinical-notes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClinicalNoteStatusBadge } from './ClinicalNoteStatusBadge';

const EMPTY_DRAFT = { history: '', assessment: '', plan: '' };

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

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading clinical note…</p>;

  if (!note) {
    return (
      <div className="space-y-4">
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <EmptyStateCard
          title="No HAP note for this encounter"
          description="Start one canonical History, Assessment, and Plan note for this visit."
        />
        <Button
          type="button"
          onClick={() => void saveDraft()}
          disabled={busy}
          className="min-h-11 cursor-pointer rounded-2xl"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Start HAP note
        </Button>
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

  return (
    <div className="space-y-5">
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}

      <Card className="rounded-[28px] border-border/80 bg-card/90">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FilePenLine className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="text-xl font-semibold">History, Assessment, and Plan</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Authored by {note.author.displayName} as {note.authorRole.toLowerCase()}.
              </p>
            </div>
            <ClinicalNoteStatusBadge status={note.status} />
          </div>
          {note.assignedDoctorNameSnapshot ? (
            <div className="rounded-2xl border border-border/70 bg-background/75 p-3 text-sm">
              <p className="font-medium">Assigned care team at submission</p>
              <p className="mt-1 text-muted-foreground">
                Volunteer: {note.assignedVolunteerNameSnapshot ?? 'Not assigned'} · Doctor:{' '}
                {note.assignedDoctorNameSnapshot}
              </p>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {(['history', 'assessment', 'plan'] as const).map((section) => (
            <div key={section} className="space-y-2">
              <Label htmlFor={`clinical-note-${section}`} className="text-base capitalize">
                {section}
              </Label>
              <p className="text-xs text-muted-foreground">
                {section === 'history'
                  ? 'Symptoms, relevant history, and the patient narrative.'
                  : section === 'assessment'
                    ? 'Clinical interpretation, working problems, and relevant findings.'
                    : 'Treatment, education, follow-up, referrals, and next steps.'}
              </p>
              {editable ? (
                <Textarea
                  id={`clinical-note-${section}`}
                  value={draft[section]}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [section]: event.target.value }))
                  }
                  maxLength={20_000}
                  rows={9}
                  className="min-h-48 resize-y rounded-2xl text-base leading-7"
                />
              ) : (
                <div
                  id={`clinical-note-${section}`}
                  className="min-h-24 whitespace-pre-wrap rounded-2xl border border-border/70 bg-background/75 p-4 text-sm leading-6"
                >
                  {displayed[section] || 'Not recorded'}
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground" aria-live="polite">
              {editable ? (dirty ? 'Unsaved changes' : 'All changes saved') : null}
              {note.submittedAt ? ` Submitted ${new Date(note.submittedAt).toLocaleString()}.` : ''}
              {note.cosignedAt ? ` Cosigned ${new Date(note.cosignedAt).toLocaleString()}.` : ''}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {editable ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void saveDraft()}
                    disabled={busy || !dirty}
                    className="min-h-11 cursor-pointer rounded-2xl"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setConfirmAction('submit')}
                    disabled={busy}
                    className="min-h-11 cursor-pointer rounded-2xl"
                  >
                    <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                    {note.authorRole === 'DOCTOR' ? 'Sign note' : 'Submit for cosign'}
                  </Button>
                </>
              ) : null}
              {canCosign ? (
                <Button
                  type="button"
                  onClick={() => setConfirmAction('cosign')}
                  disabled={busy}
                  className="min-h-11 cursor-pointer rounded-2xl"
                >
                  <Stethoscope className="h-4 w-4" aria-hidden="true" />
                  Cosign note
                </Button>
              ) : null}
              {signed && isDoctor ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddendumOpen(true)}
                  className="min-h-11 cursor-pointer rounded-2xl"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add addendum
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {note.addenda.length ? (
        <section aria-labelledby="clinical-note-addenda" className="space-y-3">
          <h2 id="clinical-note-addenda" className="text-lg font-semibold">
            Addenda
          </h2>
          <ol className="space-y-3">
            {note.addenda.map((addendum) => (
              <li key={addendum.id} className="rounded-2xl border border-border/80 bg-card/90 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                  <p className="font-medium">{addendum.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {addendum.author.displayName} · {new Date(addendum.createdAt).toLocaleString()}
                  </p>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{addendum.content}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent className="max-w-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'cosign' ? 'Cosign this HAP note?' : 'Submit this HAP note?'}
            </DialogTitle>
            <DialogDescription>
              This freezes History, Assessment, and Plan. Future corrections must be appended as
              addenda and cannot rewrite the signed record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-3xl">
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
          <DialogFooter className="gap-2">
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
