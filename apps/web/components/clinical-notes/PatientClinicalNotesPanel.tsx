'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import type { ClinicalNoteSummary } from '@/lib/clinical-notes';
import { Button } from '@/components/ui/button';
import { ClinicalNoteStatusBadge } from './ClinicalNoteStatusBadge';
import {
  ChartSectionEmpty,
  ChartSectionError,
  ChartSectionLoading,
  ChartSectionOffline,
} from '@/components/patients/chart/ChartSectionState';
import { formatOpsDay } from '@/lib/ops';

export function PatientClinicalNotesPanel({
  clinicId,
  patientId,
}: {
  clinicId: string;
  patientId: string;
}) {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const [notes, setNotes] = useState<ClinicalNoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken || !isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/clinical-notes`,
        { getToken, activeClinicId: clinicId },
      );
      if (!response.ok) throw await readApiError(response);
      setNotes((await response.json()) as ClinicalNoteSummary[]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Clinical note history could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken, isOnline, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isOnline) {
    return (
      <ChartSectionOffline
        title="Clinical notes require a secure connection"
        description="Note status and content are never cached for offline use on this device."
      />
    );
  }

  if (loading) return <ChartSectionLoading label="clinical notes" />;

  return (
    <section
      aria-labelledby="clinical-notes-heading"
      className="space-y-4 border-t-2 border-rule-strong pt-4"
    >
      <div>
        <h2 id="clinical-notes-heading" className="type-section-title">
          Clinical notes
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          History, assessment and plan notes from this patient&apos;s visits, newest first.
        </p>
      </div>
      {error ? (
        <ChartSectionError
          title="Unable to load clinical notes"
          description={error}
          onRetry={() => void load()}
        />
      ) : null}
      {error && !notes.length ? null : !notes.length ? (
        <ChartSectionEmpty
          title="No clinical notes recorded"
          description="Notes written at this patient's visits will appear here."
        />
      ) : (
        <ol aria-label="Clinical notes" className="divide-y divide-rule border-y border-rule">
          {notes.map((note) => {
            const facts = [
              `${note.author.displayName}, ${note.authorRole === 'DOCTOR' ? 'doctor' : 'volunteer'}`,
              note.cosignedAt
                ? `Cosigned ${formatOpsDay(note.cosignedAt)}`
                : note.submittedAt
                  ? `Submitted ${formatOpsDay(note.submittedAt)}`
                  : null,
              note.status === 'PENDING_COSIGN' && note.assignedDoctor
                ? `Waiting on ${note.assignedDoctor.displayName}`
                : null,
              note._count.addenda === 1
                ? '1 addendum'
                : note._count.addenda
                  ? `${note._count.addenda} addenda`
                  : null,
            ].filter(Boolean);
            return (
              <li
                key={note.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <h3 className="font-medium">Visit note, {formatOpsDay(note.createdAt)}</h3>
                    <ClinicalNoteStatusBadge status={note.status} />
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{facts.join(' · ')}</p>
                </div>
                <Button asChild variant="outline" className="shrink-0">
                  <Link
                    href={`/clinics/${clinicId}/encounters/${note.encounterId}?tab=clinical-note`}
                  >
                    Open note
                  </Link>
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
