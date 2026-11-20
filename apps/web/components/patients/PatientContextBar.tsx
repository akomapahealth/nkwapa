'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react';
import styles from './patient-context-bar.module.css';
import { FollowUpTierBadge } from '@/components/patients/follow-up/FollowUpTierBadge';
import type { ChartAllergySummary } from '@/lib/patient-chart';
import type { FollowUpTier } from '@nkwapa/db/follow-up-stratification';
import { cn } from '@/lib/utils';

/** "F · 34 y", from what the record has; null when it has neither. */
export function sexAgeLabel(sex: string | null | undefined, age: number | null): string | null {
  const letter = sex === 'FEMALE' ? 'F' : sex === 'MALE' ? 'M' : null;
  const parts = [letter, age === null ? null : `${age} y`].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function AllergyChip({ allergies }: { allergies: ChartAllergySummary }) {
  if (allergies.state === 'ACTIVE_ALLERGIES') {
    const names = allergies.activeAllergies.map((a) => a.substance || 'Unspecified');
    const shown = names.slice(0, 2).join(', ');
    const more = names.length > 2 ? ` +${names.length - 2}` : '';
    return (
      <span className={cn(styles.chip, styles.danger)}>
        <AlertTriangle aria-hidden="true" />
        <span className="truncate">
          Allergies: {shown}
          {more}
        </span>
      </span>
    );
  }
  if (allergies.state === 'NO_KNOWN_ALLERGIES') {
    return (
      <span className={cn(styles.chip, styles.quiet)}>
        <CheckCircle2 aria-hidden="true" />
        No known allergies
      </span>
    );
  }
  return (
    <span className={cn(styles.chip, styles.caution)}>
      <CircleHelp aria-hidden="true" />
      {allergies.state === 'HISTORICAL_ONLY' ? 'Past allergies only' : 'Allergies not recorded'}
    </span>
  );
}

/**
 * Who the patient is and what could hurt them, pinned under the shell header once the page's own
 * header (`anchor`) scrolls away. Fixed, not sticky: `main` scrolls inside overflow-auto. Hidden
 * whenever it would cover the control that has keyboard focus.
 */
export function PatientContextBar({
  anchor,
  name,
  code,
  sexAge,
  allergies,
  tier,
}: {
  anchor: RefObject<HTMLElement | null>;
  name: string;
  code: string;
  sexAge?: string | null;
  allergies?: ChartAllergySummary | null;
  /** Only passed to people who may see the follow-up tier. */
  tier?: FollowUpTier | null;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState({ visible: false, top: 0, left: 0, width: 0 });

  useEffect(() => {
    const element = anchor.current;
    if (!element) return;
    const shell = document.querySelector('header');
    let frame = 0;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const top = Math.max(0, shell?.getBoundingClientRect().bottom ?? 0);
      const focused = document.activeElement;
      const focusRect =
        focused instanceof HTMLElement &&
        focused.closest('main') &&
        focused !== document.querySelector('main')
          ? focused.getBoundingClientRect()
          : null;
      // Identity must never obscure a control the browser has scrolled into keyboard focus.
      const coversFocus =
        focusRect &&
        focusRect.bottom > top &&
        focusRect.top < top + (bar.current?.offsetHeight ?? 0);
      const next = {
        visible: rect.bottom <= top && !coversFocus,
        top,
        left: rect.left,
        width: rect.width,
      };
      setContext((previous) =>
        Object.keys(next).every(
          (key) => previous[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    if (shell) observer.observe(shell);
    // Capture also observes scrolling inside the workspace, not only document scrolling.
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [anchor]);

  if (context.width <= 0) return null;
  return createPortal(
    // A region while visible; `visibility: hidden` takes it out of the accessibility tree otherwise.
    <div
      ref={bar}
      role="region"
      aria-label="Patient"
      data-visible={context.visible}
      data-patient-context
      className={styles.bar}
      style={{ top: context.top, left: context.left, width: context.width, margin: 0 }}
    >
      <span className={styles.identity}>
        <span className="min-w-0 truncate font-semibold">{name}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground" translate="no">
          {code}
        </span>
        {sexAge ? <span className={styles.wide}>{sexAge}</span> : null}
      </span>
      <div className={styles.flags}>
        {allergies ? <AllergyChip allergies={allergies} /> : null}
        {tier ? (
          <div className={styles.wide}>
            <FollowUpTierBadge tier={tier} stale={false} />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
