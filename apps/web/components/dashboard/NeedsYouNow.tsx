'use client';

import Link from 'next/link';
import { CheckCircle, ClipboardList, Eye, FileEdit, ListOrdered } from 'lucide-react';
import { AppActionRow, type AppActionRowProps } from '@/components/app-shell/AppActionRow';
import { Button } from '@/components/ui/button';
import { describeWorkItems, type DashboardWorkItem } from '@/lib/dashboard-work-items';
import styles from './volunteer-welcome.module.css';

interface NeedsYouNowProps {
  steps?: boolean;
  volunteer?: {
    patientsRegisteredToday: number;
    encountersCreatedToday: number;
    pendingSubmissions: number;
    pendingSubmissionItems?: DashboardWorkItem[];
  };
  doctor?: {
    awaitingFinalization: number;
    awaitingFinalizationItems?: DashboardWorkItem[];
    pendingClinicalNoteCosigns?: number;
  };
  review?: { awaitingReview: number };
  /**
   * For managers, directors and system administrators: the active clinic's queue counts
   * (`DashboardData.summary`) and, for managers and directors, its pending HAP cosigns.
   */
  clinic?: { pendingReview: number; readyToFinalize: number; pendingClinicalNoteCosigns?: number };
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

type Row = Omit<AppActionRowProps, 'action'> & { href?: string; label?: string };

/**
 * The first thing on every staff dashboard: the work waiting on this person, one ruled row per
 * kind with one action (MASTER.md section 12). Volunteers and doctors see their own queues;
 * managers, directors and administrators see where the clinic's queues are held up. A person's
 * own drafts and sign-offs name the oldest few patients and their station (#307), for someone
 * who can read patient records; clinic-wide rows stay counts.
 */
export function NeedsYouNow({
  volunteer,
  doctor,
  review,
  clinic,
  worklistHref,
  steps = false,
}: NeedsYouNowProps) {
  if (!volunteer && !doctor && !review && !clinic) return null;

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
      detail:
        describeWorkItems(volunteer.pendingSubmissionItems, volunteer.pendingSubmissions) ??
        'Visits you started and have not sent for review yet.',
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
      detail:
        describeWorkItems(doctor.awaitingFinalizationItems, doctor.awaitingFinalization) ??
        'Reviewed visits ready for a doctor to finalize.',
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
  // Clinic-wide, and only where this person's own rows above do not already say it.
  if (clinic && !review && clinic.pendingReview > 0) {
    rows.push({
      title: `${plural(clinic.pendingReview, 'visit', 'visits')} waiting for review in this clinic`,
      detail: 'Submitted visits nobody has reviewed yet.',
      icon: Eye,
      tone: 'info',
      href: '/queues',
      label: 'Open queues',
    });
  }
  if (clinic && !doctor && clinic.readyToFinalize > 0) {
    rows.push({
      title: `${plural(clinic.readyToFinalize, 'visit', 'visits')} waiting for a doctor's sign-off`,
      detail: 'Reviewed visits no doctor has finalized yet.',
      icon: CheckCircle,
      tone: 'info',
      href: '/queues',
      label: 'Open queues',
    });
  }
  if (clinic && !doctor && clinic.pendingClinicalNoteCosigns) {
    rows.push({
      title: `${plural(clinic.pendingClinicalNoteCosigns, 'HAP note', 'HAP notes')} waiting for a doctor's cosign`,
      // No action: cosigning is a doctor's, and the content stays with the clinical team.
      detail: 'A clinic count only; the notes themselves stay with the clinical team.',
      icon: ClipboardList,
      tone: 'info',
    });
  }

  return (
    <section aria-labelledby="needs-you-now" className="border-t-2 border-rule-strong pt-4">
      <div className="flex items-baseline gap-2">
        <h2 id="needs-you-now" className="type-section-title text-foreground">
          Needs you now
        </h2>
        {rows.length ? (
          <span className="type-body tabular-nums text-muted-foreground">
            {rows.length}
            <span className="sr-only"> {rows.length === 1 ? 'item' : 'items'}</span>
          </span>
        ) : null}
      </div>
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
        <ul className={steps ? styles.nextSteps : 'mt-1'}>
          {rows.map(({ href, label, ...row }) => (
            <AppActionRow
              key={row.title}
              {...row}
              action={
                href ? (
                  <Button asChild variant="outline">
                    <Link href={href}>{label}</Link>
                  </Button>
                ) : undefined
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
