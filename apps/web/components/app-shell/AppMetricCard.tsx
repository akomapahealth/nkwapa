'use client';

import type { LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import { cn } from '@/lib/utils';

export type MetricTone = 'neutral' | 'calm' | 'attention' | 'danger' | 'info' | 'success';
const TONES: Record<MetricTone, string> = {
  neutral: 'bg-surface-2 text-foreground',
  calm: 'bg-mint text-foreground',
  attention: 'bg-gold-surface text-gold-ink',
  danger: 'bg-destructive-surface text-destructive-ink',
  info: 'bg-info-surface text-info-ink',
  success: 'bg-success-surface text-success-ink',
};

/**
 * Separate figures; wider screens wrap with generous gaps. A phone scrolls one row that bleeds to
 * the screen edge (the workspace gutter is 16px there), so a cut-off chip reads as "more this way".
 */
export const METRIC_ROW =
  'flex min-w-0 snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto -mx-4 px-4 py-1 [scrollbar-width:none] compact:mx-0 compact:flex-wrap compact:gap-3 compact:px-1';

/** A bare count or rate reads number-first ("47 Needs review"); a reading reads label-first. */
const isCount = (value: ReactNode) =>
  typeof value === 'number' || (typeof value === 'string' && /^[\d.,]+%?$/.test(value.trim()));

/**
 * One line, one unit: icon, figure, label and help share a 16px optical size, so the figure is
 * emphasised by weight rather than by a numeral that dwarfs its own icon.
 */
export function AppMetricCard({
  title,
  value,
  unit,
  detail,
  hint,
  icon: Icon,
  tone = 'neutral',
  onActivate,
  actionLabel,
  className,
}: {
  title: string;
  value: ReactNode;
  unit?: string;
  detail?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: MetricTone;
  /** A shortcut to a filter the page already offers. Never changes records. */
  onActivate?: () => void;
  actionLabel?: string;
  className?: string;
}) {
  const valueId = useId();
  const zero = value === 0 || (typeof value === 'string' && /^0(?:[.,]0+)?%?$/.test(value.trim()));
  const help = [hint, detail].filter(Boolean).join(' ');
  const figure = (
    <span id={valueId} className="whitespace-nowrap text-base font-semibold tabular-nums">
      {value}
      {unit ? <span className="ml-0.5 text-sm font-normal">{unit}</span> : null}
    </span>
  );
  const label = <span className="min-w-0 text-sm leading-snug">{title}</span>;
  const content = (
    <>
      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 opacity-80" /> : null}
      {isCount(value) ? (
        <>
          {figure}
          {label}
        </>
      ) : (
        <>
          {label}
          {figure}
        </>
      )}
    </>
  );
  const bodyClass =
    'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-3 text-left [@media(pointer:coarse)]:min-h-11';
  return (
    <div
      className={cn(
        'flex max-w-full shrink-0 snap-start items-center rounded-lg',
        help ? 'pr-1.5' : 'pr-3',
        zero
          ? 'text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
          : ['shadow-[var(--elevation-raised)]', TONES[tone]],
        className,
      )}
    >
      {onActivate ? (
        <button
          type="button"
          aria-label={actionLabel ?? `Show ${title.toLowerCase()}`}
          aria-describedby={valueId}
          onClick={onActivate}
          className={cn(
            bodyClass,
            'cursor-pointer pr-2 transition-[background-color,transform] duration-fast ease-out hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-[0.97] motion-reduce:transform-none',
          )}
        >
          {content}
        </button>
      ) : (
        <div className={cn(bodyClass, help && 'pr-1')}>{content}</div>
      )}
      {help ? <InfoHint label={help} className="text-current" /> : null}
    </div>
  );
}

/** Panel and strip consumers share one figure system; details stay reachable in help. */
export function AppMetricGroup({
  children,
  className,
  label,
  variant = 'panel',
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  variant?: 'panel' | 'strip';
}) {
  return (
    <section data-variant={variant} className="min-w-0">
      <div
        role={label ? 'region' : 'group'}
        aria-label={label ?? 'Summary figures'}
        tabIndex={0}
        className={cn(
          METRIC_ROW,
          'rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}
