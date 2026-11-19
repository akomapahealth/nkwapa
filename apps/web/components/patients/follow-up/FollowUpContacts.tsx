'use client';

import Link from 'next/link';
import { RelativeTime } from '@/components/app-shell/RelativeTime';
import {
  CONTACT_MODE_LABELS,
  CONTACT_OUTCOME_LABELS,
  CONTACT_PURPOSE_LABELS,
  fetchPatientContacts,
  formatDueDay,
  NOT_REACHED_LABELS,
} from '@/lib/follow-up-contacts';
import { useAsyncResource } from '@/lib/use-async-resource';

/**
 * The patient's next follow-up contacts and every attempt, newest first (#338). Read-only here;
 * recording happens on the Follow-up page, where `canRecord` links to.
 */
export function FollowUpContacts({
  clinicId,
  patientId,
  canRecord,
}: {
  clinicId: string;
  patientId: string;
  canRecord: boolean;
}) {
  const state = useAsyncResource({
    fetcher: (getToken, signal) => fetchPatientContacts(clinicId, patientId, getToken, signal),
    resourceKey: `${clinicId}:${patientId}:contacts`,
    errorMessage: 'Follow-up contacts could not be loaded.',
    requiresOnline: true,
  });
  const data = state.data;
  if (!data || (data.open.length === 0 && data.attempts.length === 0)) return null;

  return (
    <section aria-labelledby="follow-up-contacts-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="follow-up-contacts-heading" className="type-section-title">
          Follow-up contacts
        </h2>
        {canRecord && data.open.length > 0 ? (
          <Link
            href="/follow-up?tab=week"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline sm:min-h-0"
          >
            Open follow-up
          </Link>
        ) : null}
      </div>
      {data.open.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.open.map((contact) => (
            <li
              key={contact.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
            >
              <span className="font-medium text-foreground">
                {CONTACT_MODE_LABELS[contact.mode]}
              </span>
              <span className="text-sm text-muted-foreground">
                {CONTACT_PURPOSE_LABELS[contact.purpose]}
              </span>
              <span
                className={
                  contact.status === 'MISSED'
                    ? 'ml-auto text-sm font-medium text-destructive-ink'
                    : 'ml-auto text-sm tabular-nums text-foreground'
                }
              >
                {contact.status === 'MISSED' ? 'Missed, was due ' : 'Due '}
                {formatDueDay(contact.dueOn, { year: 'numeric' })}
              </span>
              {contact.owner ? (
                <p className="basis-full text-sm text-muted-foreground">
                  Taken by {contact.owner.displayName}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {data.attempts.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {data.attempts.length} recorded {data.attempts.length === 1 ? 'attempt' : 'attempts'}
          </summary>
          <ol className="mt-2 divide-y divide-border rounded-lg border border-border">
            {data.attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
                <span className="font-medium text-foreground">
                  {CONTACT_OUTCOME_LABELS[attempt.outcome]}
                  {attempt.notReachedReason
                    ? `: ${NOT_REACHED_LABELS[attempt.notReachedReason].toLowerCase()}`
                    : ''}
                </span>
                <span className="text-sm text-muted-foreground">
                  {CONTACT_MODE_LABELS[attempt.mode]} · {attempt.by.displayName}
                </span>
                <span className="ml-auto text-sm text-muted-foreground">
                  <RelativeTime value={attempt.at} />
                </span>
                {attempt.referralDestination ? (
                  <p className="basis-full text-sm text-muted-foreground">
                    Referred to {attempt.referralDestination}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
