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

/** Separate figures; a phone scrolls one row, wider screens wrap with generous gaps. */
export const METRIC_ROW =
  'flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto p-1 [scrollbar-width:thin] compact:flex-wrap';

/** A figure and its meaning, with optional attention tint and existing-filter shortcut. */
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
  const content = (
    <>
      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
      <span className="flex min-w-0 flex-col gap-1">
        <span
          id={valueId}
          className={cn(
            'font-semibold leading-tight tabular-nums',
            zero
              ? 'text-xl'
              : typeof value === 'string' && value.length > 10
                ? 'text-base'
                : 'text-2xl',
          )}
        >
          {value}
          {unit ? <span className="ml-1 text-sm font-normal">{unit}</span> : null}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </span>
    </>
  );
  const bodyClass =
    'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-3 text-left';
  return (
    <div
      className={cn(
        'flex max-w-full shrink-0 snap-start items-center rounded-xl',
        zero
          ? 'bg-transparent text-muted-foreground'
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
            'transition-colors duration-fast hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-[0.97] motion-reduce:transform-none',
          )}
        >
          {content}
        </button>
      ) : (
        <div className={bodyClass}>{content}</div>
      )}
      {help ? (
        <span className="flex min-h-11 w-11 shrink-0 items-center justify-center">
          <InfoHint label={help} size="sm" className="text-current" />
        </span>
      ) : null}
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
          'rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}
