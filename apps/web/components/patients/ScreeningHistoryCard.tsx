'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink, UserRound, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  ChartSectionEmpty,
  ChartSectionError,
  ChartSectionLoading,
  ChartSectionOffline,
} from '@/components/patients/chart/ChartSectionState';
import type { ScreeningHistoryItemBase, ScreeningHistoryState } from '@/lib/use-screening-history';

/** The badges, time, author and source-visit link every screening record shares. */
export function ScreeningRecordFrame({
  clinicId,
  item,
  author,
  current,
  badges,
  children,
}: {
  clinicId: string;
  item: ScreeningHistoryItemBase;
  author: { displayName: string } | null;
  current: boolean;
  badges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="rounded-lg border border-border bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {current ? <Badge>Current encounter</Badge> : null}
            {badges}
            <Badge variant={item.sourceEncounter.status === 'FINALIZED' ? 'default' : 'secondary'}>
              {item.sourceEncounter.status.replaceAll('_', ' ')}
            </Badge>
          </div>
          {children}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              <time dateTime={item.collectedAt}>{new Date(item.collectedAt).toLocaleString()}</time>
            </span>
            <span className="inline-flex items-center gap-2">
              <UserRound className="h-4 w-4" aria-hidden="true" />
              {author?.displayName ?? 'Author unavailable offline'}
            </span>
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href={`/clinics/${clinicId}/encounters/${item.sourceEncounter.id}`}>
            Open source visit <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </li>
  );
}

export interface ScreeningHistoryCopy {
  title: string;
  description: string;
  /** Lower-case noun used in loading and error copy, e.g. "diabetes history". */
  noun: string;
  historyHeading: string;
  previousHeading: string;
  noCurrentRecord: string;
  emptyTitle: string;
  emptyDescription: string;
  offlineDescription: string;
}

/**
 * One layout for every condition's longitudinal history: the five states, then the current
 * encounter's record apart from the ones before it. Diabetes and hypertension used to be one
 * implemented and one missing, so the chart could not show them side by side.
 */
export function ScreeningHistoryCard<TItem extends ScreeningHistoryItemBase>({
  icon: Icon,
  copy,
  history,
  currentEncounterId,
  renderRecord,
}: {
  icon: LucideIcon;
  copy: ScreeningHistoryCopy;
  history: ScreeningHistoryState<TItem>;
  currentEncounterId?: string;
  renderRecord: (item: TItem, current: boolean) => ReactNode;
}) {
  const { items, loading, error, servedFromCache, reload } = history;
  const current = currentEncounterId
    ? items.find((item) => item.sourceEncounter.id === currentEncounterId)
    : undefined;
  const previous = currentEncounterId
    ? items.filter((item) => item.sourceEncounter.id !== currentEncounterId)
    : items;
  const slug = copy.noun.replace(/\s+/g, '-');

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <h2 className="text-lg font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <ChartSectionError
            title={`Unable to load ${copy.noun}`}
            description={error}
            onRetry={reload}
          />
        ) : null}
        {servedFromCache ? (
          <ChartSectionOffline
            title="Showing records saved on this device"
            description={copy.offlineDescription}
          />
        ) : null}
        {loading ? <ChartSectionLoading label={copy.noun} /> : null}
        {!loading && currentEncounterId ? (
          <section aria-labelledby={`current-${slug}`} className="space-y-3">
            <h3 id={`current-${slug}`} className="text-eyebrow text-muted-foreground">
              Current encounter
            </h3>
            {current ? (
              <ul>{renderRecord(current, true)}</ul>
            ) : (
              <p className="text-sm text-muted-foreground">{copy.noCurrentRecord}</p>
            )}
          </section>
        ) : null}
        <section aria-labelledby={`previous-${slug}`} className="space-y-3">
          <h3 id={`previous-${slug}`} className="text-eyebrow text-muted-foreground">
            {currentEncounterId ? copy.previousHeading : copy.historyHeading}
          </h3>
          {!loading && previous.length === 0 ? (
            <ChartSectionEmpty title={copy.emptyTitle} description={copy.emptyDescription} />
          ) : (
            <ol className="space-y-3">{previous.map((item) => renderRecord(item, false))}</ol>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
