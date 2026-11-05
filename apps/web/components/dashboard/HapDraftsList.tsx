'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FileEdit } from 'lucide-react';
import { AppActionRow } from '@/components/app-shell/AppActionRow';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fetchMyHapDrafts, hapDraftPatientName, type HapDraft } from '@/lib/hap-drafts';
import { formatOpsDateTime } from '@/lib/ops';

/** The author's own HAP drafts by patient, so the dashboard count leads somewhere (#307). */
export function HapDraftsList({ clinicId, timezone }: { clinicId: string; timezone?: string }) {
  const getToken = useAuth();
  const [drafts, setDrafts] = useState<HapDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken) return;
    let cancelled = false;
    fetchMyHapDrafts(clinicId, getToken)
      .then((rows) => !cancelled && setDrafts(rows))
      .catch((e: unknown) => !cancelled && setError(getErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [clinicId, getToken]);

  return <HapDraftRows drafts={drafts} error={error} timezone={timezone} />;
}

export function HapDraftRows({
  drafts,
  error,
  timezone,
}: {
  drafts: HapDraft[] | null;
  error?: string | null;
  timezone?: string;
}) {
  if (error) {
    return (
      <p className="type-body text-muted-foreground">
        Your HAP drafts could not be loaded. {error}
      </p>
    );
  }
  if (!drafts?.length) return null;
  return (
    <section aria-labelledby="hap-drafts-title">
      <h3 id="hap-drafts-title" className="type-label text-foreground">
        Your HAP drafts
      </h3>
      <ul className="mt-1 border-t border-rule">
        {drafts.map((draft) => (
          <AppActionRow
            key={draft.id}
            icon={FileEdit}
            tone="warning"
            title={`${hapDraftPatientName(draft)} (${draft.patient.patientCode})`}
            detail={`Last saved ${formatOpsDateTime(draft.updatedAt, timezone)}`}
            action={
              <Button asChild variant="outline" className="min-h-11">
                <Link href={`/encounters/${draft.encounterId}`}>Open visit</Link>
              </Button>
            }
          />
        ))}
      </ul>
    </section>
  );
}
