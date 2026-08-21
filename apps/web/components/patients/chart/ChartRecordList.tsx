'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  CHART_OFFLINE_DESCRIPTION,
  ChartSectionEmpty,
  ChartSectionError,
  ChartSectionLoading,
  ChartSectionOffline,
} from './ChartSectionState';
import type { CursorListState } from '@/lib/use-cursor-list';

interface ChartRecordListProps<T> {
  list: CursorListState<T>;
  /** Accessible name for the record list region. */
  label: string;
  emptyTitle: string;
  emptyDescription: string;
  errorTitle: string;
  offlineDescription?: string;
  children: (item: T, index: number) => ReactNode;
}

/**
 * Renders one chronological record list with every state the chart promises:
 * loading, empty, error with retry, offline, and bounded "load more" pagination.
 *
 * Vitals, visits, and any future longitudinal tab share this shell so the states stay
 * identical instead of drifting per tab.
 */
export function ChartRecordList<T extends { id: string }>({
  list,
  label,
  emptyTitle,
  emptyDescription,
  errorTitle,
  offlineDescription = CHART_OFFLINE_DESCRIPTION,
  children,
}: ChartRecordListProps<T>) {
  if (list.isOfflineBlocked) {
    return <ChartSectionOffline description={offlineDescription} />;
  }

  if (list.status === 'error') {
    return <ChartSectionError title={errorTitle} description={list.error} onRetry={list.retry} />;
  }

  if (list.isInitialLoading) {
    return <ChartSectionLoading label={label} />;
  }

  if (list.isEmpty) {
    return <ChartSectionEmpty title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      <ul aria-label={label} className="space-y-3">
        {list.items.map((item, index) => (
          <li key={item.id}>{children(item, index)}</li>
        ))}
      </ul>

      {list.hasMore ? (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={list.loadMore}
            disabled={list.isLoadingMore}
            className="min-h-11 cursor-pointer"
          >
            {list.isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          {list.items.length === 1
            ? 'Showing the only record.'
            : `Showing all ${list.items.length} records.`}
        </p>
      )}
    </div>
  );
}

/**
 * Shared frame for one chronological record: provenance line plus the record body.
 * Stacks on small screens and lays out side by side from `sm` up.
 */
export function ChartRecordCard({
  title,
  meta,
  badges,
  children,
  footer,
}: {
  title: ReactNode;
  meta: ReactNode;
  badges?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-border/80 bg-background/75 p-4 transition-colors duration-150 hover:bg-accent/40">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
        </div>
        {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </article>
  );
}

/** Compact label/value pair used for measurement grids. */
export function ChartMeasurement({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string | null | undefined;
  suffix?: string;
}) {
  const isMissing = value === null || value === undefined || value === '';
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={isMissing ? 'text-sm text-muted-foreground' : 'text-sm font-medium'}>
        {isMissing ? 'Not recorded' : `${value}${suffix ?? ''}`}
      </dd>
    </div>
  );
}
