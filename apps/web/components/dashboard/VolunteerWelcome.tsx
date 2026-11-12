'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { hasPermission } from '@/lib/ops';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { OPS_DEFAULT_TIMEZONE } from '@/lib/ops';
import { DashboardShiftControls } from './DashboardShiftControls';
import { DashboardIllustration } from './DashboardIllustration';
import styles from './volunteer-welcome.module.css';

/**
 * The greeting band every staff home opens with (W2). A volunteer's carries the illustration and
 * shift controls; the other roles' homes pass `solo`, a sentence of what is waiting and their
 * primary and secondary actions, as in the pilot's role dashboards.
 */
export function VolunteerWelcome({
  titleLevel = 1,
  actions,
  summary = 'Your work today. Continue intake work and move patients to the next step.',
  solo = false,
}: {
  titleLevel?: 1 | 2;
  actions?: ReactNode;
  summary?: ReactNode;
  solo?: boolean;
}) {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);
  // Clinic time, not the browser's (PRODUCT.md: times are shown in Africa/Accra).
  const hour = now
    ? Number(
        new Intl.DateTimeFormat('en-GB', {
          hour: 'numeric',
          hourCycle: 'h23',
          timeZone: OPS_DEFAULT_TIMEZONE,
        }).format(now),
      )
    : undefined;
  const phase =
    hour === undefined
      ? null
      : hour >= 5 && hour < 12
        ? 'morning'
        : hour >= 12 && hour < 17
          ? 'afternoon'
          : hour >= 17 && hour < 21
            ? 'evening'
            : 'night';
  const greeting =
    phase === null
      ? 'Welcome'
      : phase === 'morning'
        ? 'Good morning'
        : phase === 'afternoon'
          ? 'Good afternoon'
          : 'Good evening';
  const Sky =
    phase === 'morning'
      ? Sunrise
      : phase === 'afternoon'
        ? Sun
        : phase === 'evening'
          ? Sunset
          : Moon;
  const name = bootstrap?.displayName?.trim().split(/\s+/)[0];
  const Heading = titleLevel === 1 ? 'h1' : 'h2';
  const canReadShift =
    Boolean(clinicId) &&
    hasPermission(bootstrap?.effectivePermissionsForActiveClinic ?? [], 'OPS.SHIFT.READ');
  const stationWorkflow = isWebFeatureEnabled('stationWorkflow');

  return (
    <div
      className={styles.band}
      data-phase={phase ?? undefined}
      data-solo={solo || undefined}
      data-testid="volunteer-welcome"
    >
      <svg
        className={styles.contours}
        viewBox="0 0 1200 400"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {[0, 1, 2, 3, 4].map((line) => (
          <path
            key={line}
            vectorEffect="non-scaling-stroke"
            transform={`translate(0 ${line * 26})`}
            d="M-40 230 C90 290 180 170 320 225 S530 285 660 225 S890 170 1020 225 S1180 280 1240 220"
          />
        ))}
      </svg>
      <div className={styles.content}>
        <div className="min-w-0">
          <Heading
            className={`${styles.heading} break-words font-body font-semibold tracking-tight`}
          >
            {greeting}
            {name ? (
              <>
                ,{' '}
                <span className={styles.name} title={name}>
                  {name}
                </span>
              </>
            ) : null}
            {phase ? <Sky aria-hidden="true" className={styles.sky} /> : null}
          </Heading>
          {now ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: OPS_DEFAULT_TIMEZONE,
              }).format(now)}
            </p>
          ) : null}
          <p className="mb-4 mt-2 max-w-prose text-sm text-muted-foreground">{summary}</p>
        </div>
        {solo ? null : (
          <div className={styles.illustration}>
            <DashboardIllustration kind="hello" />
          </div>
        )}
        {!solo && stationWorkflow && canReadShift ? (
          // Refresh shares the shift row, level with End shift, rather than sitting alone below it.
          <div className={`${styles.controls} flex items-end gap-2`}>
            <div className="min-w-0 flex-1">
              <DashboardShiftControls key={`${clinicId}:${bootstrap?.userId}`} />
            </div>
            {actions ? <div className="relative flex shrink-0 gap-2">{actions}</div> : null}
          </div>
        ) : actions ? (
          <div className="relative flex flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
      <svg
        className={styles.wave}
        viewBox="0 0 1200 64"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className={styles.back} d="M0 20 Q160 65 350 28 T700 28 T1200 26 V64 H0Z" />
        <path className={styles.front} d="M0 38 Q160 65 350 38 T700 38 T1200 38 V64 H0Z" />
        <path
          className={styles.edge}
          vectorEffect="non-scaling-stroke"
          d="M0 38 Q160 65 350 38 T700 38 T1200 38"
        />
      </svg>
    </div>
  );
}
