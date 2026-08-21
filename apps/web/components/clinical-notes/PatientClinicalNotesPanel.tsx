'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import type { ClinicalNoteSummary } from '@/lib/clinical-notes';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClinicalNoteStatusBadge } from './ClinicalNoteStatusBadge';
import {
  ChartSectionEmpty,
  ChartSectionError,
  ChartSectionLoading,
  ChartSectionOffline,
} from '@/components/patients/chart/ChartSectionState';

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
    <div className="space-y-4">
      {error ? (
        <ChartSectionError
          title="Unable to load clinical notes"
          description={error}
          onRetry={() => void load()}
        />
      ) : null}
      {!notes.length ? (
        <ChartSectionEmpty
          title="No clinical notes recorded"
          description="HAP notes created from this patient's encounters will appear here."
        />
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Card className="rounded-2xl border-border/80 bg-card/90">
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                      <p className="font-medium">
                        Encounter {new Date(note.createdAt).toLocaleDateString()}
                      </p>
                      <ClinicalNoteStatusBadge status={note.status} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {note.author.displayName} · {note.authorRole.toLowerCase()}
                      {note._count.addenda ? ` · ${note._count.addenda} addenda` : ''}
                    </p>
                  </div>
                  <Button asChild variant="outline" className="min-h-11 rounded-2xl">
                    <Link
                      href={`/clinics/${clinicId}/encounters/${note.encounterId}?tab=clinical-note`}
                    >
                      Open note
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
