'use client';

import type { LucideIcon } from 'lucide-react';
import { createContext, useContext } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import { cn } from '@/lib/utils';

/*
  Inside an AppMetricGroup a metric is a cell of one panel rather than a card of its own.
*/
const InMetricGroup = createContext<false | 'panel' | 'strip'>(false);

/**
 * A number, what it counts, and a line of context.
 *
 * The number carries the emphasis. The label sits above it in quiet ink with a small icon, where
 * it used to share the top row with a 48px tinted icon tile -- on a dashboard of eight of them the
 * tiles were the loudest thing on screen and said nothing the label did not.
 */
export function AppMetricCard({
  title,
  value,
  detail,
  hint,
  icon: Icon,
  className,
}: {
  title: string;
  value: number | string;
  detail?: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const grouped = useContext(InMetricGroup);
  if (grouped === 'strip') {
    // A list's context line: label, then the figure. The detail moves into the help so the rows
    // below, not the tiles, are what the page leads with.
    const help = [hint, detail].filter(Boolean).join(' ');
    return (
      <div className={cn('min-w-0 border-b border-r border-rule px-4 py-3', className)}>
        <p className="type-label flex items-center gap-1 text-muted-foreground">
          <span className="min-w-0 truncate">{title}</span>
          {help ? <InfoHint label={help} size="sm" /> : null}
        </p>
        <p
          className={cn(
            'mt-1 font-semibold tabular-nums text-foreground',
            String(value).length > 10 ? 'text-base' : 'text-2xl leading-tight',
          )}
        >
          {value}
        </p>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'min-w-0 p-4 sm:p-5',
        grouped
          ? // Hairlines on the right and bottom; the group crops the outer ones.
            'border-b border-r border-rule'
          : 'border-t-2 border-rule-strong',
        className,
      )}
    >
      <p className="type-label flex items-start gap-2 text-muted-foreground">
        {Icon ? <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : null}
        {/* Inline, so the help follows the label's last line when a narrow cell wraps it. */}
        <span className="min-w-0">
          {hint ? <TitleWithHint title={title} hint={hint} /> : title}
        </span>
      </p>
      <p
        className={cn(
          'mt-2 text-foreground',
          // A figure gets the full size; a phrase standing in for one ("No reading yet") does not,
          // or the empty state would be the loudest thing on the page.
          String(value).length > 10 ? 'type-section-title' : 'type-metric',
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="type-label mt-1.5 font-normal text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

/**
 * Related metrics in one panel, divided by hairlines, instead of a grid of separate cards.
 *
 * Pass the grid columns in `className` (e.g. `sm:grid-cols-2 xl:grid-cols-4`). An unfilled last
 * row shows as card surface rather than a gap, because each cell draws only its own right and
 * bottom edges and the panel crops the outermost ones.
 */
export function AppMetricGroup({
  children,
  className,
  label,
  variant = 'panel',
}: {
  children: React.ReactNode;
  className?: string;
  /** Names the group for assistive technology when no heading sits right above it. */
  label?: string;
  /**
   * `strip` is for list tabs (MASTER "Lists (W3)"): one quiet row of figures between hairlines,
   * details in the help, so the list starts in the first screen. Pass `className` grid columns
   * as for a panel; cells in one row share hairlines.
   */
  variant?: 'panel' | 'strip';
}) {
  if (variant === 'strip') {
    return (
      <section aria-label={label} className="overflow-hidden border-y border-rule">
        {/* Bled past the section on both sides, so the outer hairlines crop and text aligns. */}
        <div className={cn('-mx-4 -mb-px grid grid-cols-2', className)}>
          <InMetricGroup.Provider value="strip">{children}</InMetricGroup.Provider>
        </div>
      </section>
    );
  }
  return (
    <section aria-label={label} className="overflow-hidden border-t-2 border-rule-strong">
      <div className={cn('-mb-px -mr-px grid grid-cols-1', className)}>
        <InMetricGroup.Provider value="panel">{children}</InMetricGroup.Provider>
      </div>
    </section>
  );
}

/**
 * The label's last word and its help icon never part: a narrow cell wraps the label, and an icon
 * left alone on the next line reads as belonging to the number below it.
 */
function TitleWithHint({ title, hint }: { title: string; hint: string }) {
  const split = title.lastIndexOf(' ');
  const head = split === -1 ? '' : title.slice(0, split + 1);
  const tail = split === -1 ? title : title.slice(split + 1);
  return (
    <>
      {head ? <span className="align-middle">{head}</span> : null}
      <span className="whitespace-nowrap">
        <span className="align-middle">{tail}</span>
        <InfoHint label={hint} size="sm" className="ml-1" />
      </span>
    </>
  );
}
