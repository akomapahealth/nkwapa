'use client';

import { cn } from '@/lib/utils';

/**
 * A tinted line of feedback inside a page: a save that failed, a view that is degraded.
 *
 * Lived in the clinic-operations components until the patient portal needed the same notice; it
 * is re-exported from there so the existing call sites did not have to move.
 */
export function InlineNotice({
  tone = 'info',
  className,
  children,
  live = true,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  className?: string;
  children: React.ReactNode;
  /**
   * Set false for a notice that is part of the page on first paint rather than a response to
   * something the user just did. Announcing static explanatory copy on load is noise.
   */
  live?: boolean;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-destructive/25 bg-destructive/10 text-destructive-ink'
      : tone === 'success'
        ? 'border-success/25 bg-success/10 text-success-ink'
        : // A degraded configuration is not a failed action. Rendering it as an error
          // makes real errors easier to ignore.
          tone === 'warning'
          ? 'border-warning/25 bg-warning/10 text-warning-ink'
          : 'border-primary/20 bg-primary/10 text-foreground';

  /*
    This is where a failed save reports itself on more than a dozen forms, and it had no role and
    no live region, so a screen-reader user pressed Save and heard nothing at all -- the button
    kept focus and the explanation appeared silently somewhere else on the page.

    `alert` is assertive and interrupts, which is right for a failure and wrong for a
    confirmation; `status` is polite and waits for a pause.
  */
  const liveProps = live
    ? tone === 'error'
      ? ({ role: 'alert' } as const)
      : ({ role: 'status', 'aria-live': 'polite' } as const)
    : {};

  return (
    <div {...liveProps} className={cn('rounded-lg border px-4 py-3 text-sm', toneClass, className)}>
      {children}
    </div>
  );
}
