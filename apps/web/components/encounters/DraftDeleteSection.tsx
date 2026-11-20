'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReasonDialog, type ReasonPrompt } from '@/components/ui/reason-dialog';
import { showToast } from '@/components/ui/toast';
import { apiFetch, getErrorMessage, readApiError, type GetToken } from '@/lib/api';

/**
 * A system admin's way to remove a draft visit, or only its draft note, made by accident (#384).
 * The API is the gate (SYSTEM_ADMIN, DRAFT only, checked in its transaction); this only decides
 * whether to offer it. Every delete records the reason on its audit row.
 */
export function DraftDeleteSection({
  clinicId,
  encounterId,
  patientId,
  noteStatus,
  getToken,
  onDeleted,
}: {
  clinicId: string;
  encounterId: string;
  patientId: string;
  /** The visit's clinical note status, when it has one. */
  noteStatus: string | null;
  getToken: GetToken;
  /** Runs after either delete, e.g. to sync the device and reload. */
  onDeleted: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState<ReasonPrompt | null>(null);
  const base = `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}`;

  const remove = async (path: string, reason: string, done: string) => {
    try {
      const res = await apiFetch(path, {
        method: 'DELETE',
        getToken,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw await readApiError(res);
      showToast({ title: done, tone: 'success' });
      return true;
    } catch (error) {
      showToast({
        title: 'Nothing was deleted',
        description: getErrorMessage(error),
        tone: 'error',
      });
      return false;
    }
  };

  const askVisit = () =>
    setPrompt({
      title: 'Delete this draft visit?',
      description:
        'The visit and everything recorded in it (vitals, screenings, prescriptions and its draft note) are removed for everyone, including offline devices. This cannot be undone.',
      confirmLabel: 'Delete visit',
      placeholder: 'For example: created for a test patient',
      destructive: true,
      onConfirm: async (reason) => {
        const ok = await remove(base, reason, 'Draft visit deleted');
        if (ok) {
          await onDeleted();
          router.replace(
            `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}`,
          );
        }
        return ok;
      },
    });

  const askNote = () =>
    setPrompt({
      title: 'Delete the draft note?',
      description:
        'Only the clinical note is removed. The visit and its measurements stay. This cannot be undone.',
      confirmLabel: 'Delete note',
      placeholder: 'For example: duplicate note',
      destructive: true,
      onConfirm: async (reason) => {
        const ok = await remove(`${base}/clinical-note`, reason, 'Draft note deleted');
        if (ok) await onDeleted();
        return ok;
      },
    });

  return (
    <section
      aria-labelledby="draft-delete-heading"
      className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4 compact:flex-row compact:items-center compact:justify-between"
    >
      <div className="min-w-0">
        <h2 id="draft-delete-heading" className="font-sans text-base font-semibold">
          Created by accident?
        </h2>
        <p className="text-sm text-muted-foreground">
          As a system admin you can delete this draft. You will be asked for a reason, which is kept
          in the audit log.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {noteStatus === 'DRAFT' ? (
          <Button variant="outline" onClick={askNote}>
            Delete draft note
          </Button>
        ) : null}
        <Button variant="destructive" onClick={askVisit}>
          <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
          Delete draft visit
        </Button>
      </div>
      <ReasonDialog prompt={prompt} onClose={() => setPrompt(null)} />
    </section>
  );
}
