'use client';

import { useState } from 'react';
import { OctagonAlert, UserCheck } from 'lucide-react';
import { FOLLOW_UP_REASON_LABELS, type FollowUpReason } from '@nkwapa/db/follow-up-stratification';
import { RelativeTime } from '@/components/app-shell/RelativeTime';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import {
  acknowledgedLabel,
  acknowledgeUrgentFlag,
  type UrgentAcknowledgement,
  type UrgentFlag,
} from '@/lib/follow-up';
import { cn } from '@/lib/utils';

/**
 * The urgent banner on the chart (#337): the patient is Urgent, why, and who has taken them.
 * Shown to every role that reads the tier; "I'm on it" only to those who take follow-up work.
 *
 * One quiet entrance (it is rare and must be noticed), then a crossfade when someone takes it.
 * Reduced motion keeps the colour and drops the movement. Never dismissible: it stays while the
 * patient is Urgent, because acknowledging is not resolving.
 */
export function UrgentFlagBanner({
  clinicId,
  patientId,
  flag,
  reasons,
  canTake,
  userId,
}: {
  clinicId: string;
  patientId: string;
  flag: UrgentFlag;
  reasons: readonly FollowUpReason[];
  canTake: boolean;
  userId: string | null;
}) {
  const getToken = useAuth();
  const [ack, setAck] = useState<UrgentAcknowledgement | null>(flag.acknowledgement);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const screening = flag.kind === 'SCREENING_URGENT';
  const danger = reasons.filter((reason) => reason.startsWith('DANGER_'));
  const why = screening
    ? flag.detail || 'Urgent finding recorded.'
    : danger.length
      ? danger.map((reason) => FOLLOW_UP_REASON_LABELS[reason]).join(' · ')
      : 'Danger signs recorded.';

  const take = async () => {
    setTaking(true);
    setError(null);
    try {
      setAck(await acknowledgeUrgentFlag(clinicId, patientId, getToken));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not take this patient.');
    } finally {
      setTaking(false);
    }
  };

  return (
    <section
      aria-labelledby="urgent-flag-title"
      data-testid="urgent-flag-banner"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-4 py-3 sm:flex-row sm:items-center',
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 duration-200 ease-out',
      )}
    >
      <OctagonAlert
        className="hidden h-5 w-5 shrink-0 text-destructive-ink sm:block"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <h2 id="urgent-flag-title" className="type-label font-semibold text-destructive-ink">
          {screening ? 'Urgent at screening: see today' : 'Urgent: refer today'}
        </h2>
        <p className="mt-0.5 text-sm text-foreground [overflow-wrap:anywhere]">
          {why}
          <span className="text-muted-foreground">
            {' · '}
            {screening ? 'Recorded' : 'Flagged'} <RelativeTime value={flag.raisedAt} />
          </span>
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-sm text-destructive-ink">
            {error}
          </p>
        ) : null}
      </div>
      {/* Keyed so the button and the owner crossfade rather than swap. */}
      <div
        key={ack ? 'taken' : 'open'}
        className="motion-safe:animate-in motion-safe:fade-in-0 duration-200 ease-out sm:shrink-0"
      >
        {ack ? (
          <p
            role="status"
            data-testid="urgent-flag-owner"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <UserCheck className="h-4 w-4 text-success-ink" aria-hidden="true" />
            {acknowledgedLabel(ack, userId)}
            <span className="font-normal text-muted-foreground">
              · <RelativeTime value={ack.at} />
            </span>
          </p>
        ) : canTake ? (
          <Button
            variant="destructive"
            onClick={() => void take()}
            loading={taking}
            className="w-full sm:w-auto"
          >
            I&apos;m on it
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody has taken this patient yet.</p>
        )}
      </div>
    </section>
  );
}
