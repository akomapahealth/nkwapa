'use client';

import Link from 'next/link';
import { CheckCircle, ClipboardList, Eye, FileEdit, ListOrdered } from 'lucide-react';
import { AppActionRow, type AppActionRowProps } from '@/components/app-shell/AppActionRow';
import { Button } from '@/components/ui/button';

interface NeedsYouNowProps {
  volunteer?: {
    patientsRegisteredToday: number;
    encountersCreatedToday: number;
    pendingSubmissions: number;
  };
  doctor?: { awaitingFinalization: number; pendingClinicalNoteCosigns?: number };
  review?: { awaitingReview: number };
  /** Where this person's next patient is: their station, Today Board or My Assigned. */
  worklistHref: string | null;
}

const WORKLIST_LABELS: Record<string, { title: string; detail: string; action: string }> = {
  '/stations': {
    title: 'Take the next patient at your station',
    detail: "Your station's line and who is next are on the Stations page.",
    action: 'Open Stations',
  },
  '/my/assigned': {
    title: 'See the patients assigned to you',
    detail: 'Your next tasks, in order, are on My Assigned.',
    action: 'Open My Assigned',
  },
  '/today': {
    title: "Check today's arrivals",
    detail: 'Check-ins and assignments for this clinic are on the Today Board.',
    action: 'Open Today Board',
  },
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

type Row = Omit<AppActionRowProps, 'action'> & { href: string; label: string };

/**
 * The first thing on a volunteer's or doctor's dashboard: the work waiting on them, one ruled row
 * per kind with one action (MASTER.md section 12). Built only from `DashboardData` counts; it
 * never names a patient, because the dashboard contract carries none. Renders nothing for roles
 * without a volunteer or doctor section, whose dashboards #269 redesigns.
 */
export function NeedsYouNow({ volunteer, doctor, review, worklistHref }: NeedsYouNowProps) {
  if (!volunteer && !doctor && !review) return null;

  const rows: Row[] = [];
  const worklist = worklistHref ? WORKLIST_LABELS[worklistHref] : undefined;
  if (volunteer && worklist && worklistHref) {
    rows.push({
      title: worklist.title,
      detail: worklist.detail,
      icon: ListOrdered,
      href: worklistHref,
      label: worklist.action,
    });
  }
  if (volunteer && volunteer.pendingSubmissions > 0) {
    rows.push({
      title: `${plural(volunteer.pendingSubmissions, 'draft visit', 'draft visits')} to submit`,
      detail: 'Visits you started and have not sent for review yet.',
      icon: FileEdit,
      tone: 'warning',
      href: '/queues?tab=drafts',
      label: 'Open drafts',
    });
  }
  if (review && review.awaitingReview > 0) {
    rows.push({
      title: `${plural(review.awaitingReview, 'visit', 'visits')} waiting for review`,
      detail: 'Submitted visits that need a clinical review.',
      icon: Eye,
      tone: 'info',
      href: '/queues?tab=review',
      label: 'Review visits',
    });
  }
  if (doctor && doctor.awaitingFinalization > 0) {
    rows.push({
      title: `${plural(doctor.awaitingFinalization, 'visit', 'visits')} waiting for sign-off`,
      detail: 'Reviewed visits ready for a doctor to finalize.',
      icon: CheckCircle,
      tone: 'info',
      href: '/queues?tab=finalize',
      label: 'Sign off visits',
    });
  }
  if (doctor?.pendingClinicalNoteCosigns) {
    rows.push({
      title: `${plural(doctor.pendingClinicalNoteCosigns, 'HAP note', 'HAP notes')} to cosign`,
      detail: 'Volunteer-written notes assigned to you or to any doctor.',
      icon: ClipboardList,
      tone: 'info',
      href: '/queues?tab=cosign',
      label: 'Cosign notes',
    });
  }

  return (
    <section aria-labelledby="needs-you-now" className="border-t-2 border-rule-strong pt-4">
      <h2 id="needs-you-now" className="type-section-title text-foreground">
        Needs you now
      </h2>
      {/* Own work, in the first screen on a phone, before any clinic-wide figure. */}
      {volunteer ? (
        <p className="type-body mt-1 text-muted-foreground">
          Today you added{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {plural(volunteer.patientsRegisteredToday, 'patient', 'patients')}
          </span>{' '}
          and started{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {plural(volunteer.encountersCreatedToday, 'visit', 'visits')}
          </span>
          .
        </p>
      ) : null}
      {rows.length ? (
        <ul className="mt-1">
          {rows.map(({ href, label, ...row }) => (
            <AppActionRow
              key={href}
              {...row}
              action={
                <Button asChild variant="outline" className="min-h-11">
                  <Link href={href}>{label}</Link>
                </Button>
              }
            />
          ))}
        </ul>
      ) : (
        <p className="type-body border-b border-rule py-4 text-muted-foreground">
          Nothing is waiting on you right now.
        </p>
      )}
    </section>
  );
}
