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
  /** "Needs attention" on a manager's home, where the rows are the clinic's, not theirs. */
  title?: string;
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

type WorkInputs = Omit<NeedsYouNowProps, 'steps' | 'title'>;

/** The rows of waiting work for these inputs; shared by Needs you now and Also on your plate. */
export function workRows({ volunteer, doctor, review, clinic, worklistHref }: WorkInputs): Row[] {
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

  return rows;
}

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
  title = 'Needs you now',
}: NeedsYouNowProps) {
  if (!volunteer && !doctor && !review && !clinic) return null;
  const rows = workRows({ volunteer, doctor, review, clinic, worklistHref });

  return (
    <section aria-labelledby="needs-you-now" className="border-t-2 border-rule-strong pt-4">
      <div className="flex items-baseline gap-2">
        <h2 id="needs-you-now" className="type-section-title text-foreground">
          {title}
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

/**
 * The work a person's other roles hold, under their main role's home (W2 owner decision): one
 * line per kind, a count and one link, never that role's full section.
 */
export function AlsoOnYourPlate({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="also-on-your-plate" className="border-t-2 border-rule-strong pt-4">
      <h2 id="also-on-your-plate" className="type-section-title text-foreground">
        Also on your plate
      </h2>
      <ul className="mt-1">
        {rows.map(({ title, href, label }) => (
          <li
            key={title}
            className="type-body flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-rule py-3"
          >
            <span className="text-foreground">{title}</span>
            {href ? (
              <>
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline sm:min-h-0"
                >
                  {label}
                </Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
