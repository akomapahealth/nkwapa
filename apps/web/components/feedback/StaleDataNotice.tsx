'use client';

import { CloudOff, History, RefreshCw } from 'lucide-react';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

function formatSavedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Data on screen that is not live, said plainly and with its age.
 *
 * The generic stale banner could only admit that a refresh failed; it had no timestamp to give.
 * A copy saved on the device does, and a patient deciding whether last week's reading is still
 * the latest needs it. The wording separates the two causes because the remedies differ: offline
 * there is nothing to retry, while a server that did not answer may answer the next time.
 */
export function StaleDataNotice({
  savedAt,
  isOnline,
  onRefresh,
  isRefreshing = false,
  offlineDetail,
  className,
}: {
  /** When what is on screen was loaded. Omit when only the session's own copy is known. */
  savedAt?: string | null;
  isOnline: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** What still needs a connection on this screen, said while offline. */
  offlineDetail?: string;
  className?: string;
}) {
  const absolute = savedAt ? formatSavedAt(savedAt) : null;
  const relative = savedAt ? formatRelativeTime(savedAt) : '';
  const Icon = isOnline ? History : CloudOff;

  return (
    <InlineNotice tone="warning" className={cn('flex items-start gap-3', className)}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div
        className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        data-testid="stale-data-notice"
      >
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{isOnline ? 'Showing a saved copy' : 'You are offline'}</p>
          <p className="text-sm leading-6 text-current/80">
            {absolute ? (
              <>
                This is what was saved on this device on{' '}
                <time dateTime={savedAt ?? undefined} className="font-medium tabular-nums">
                  {absolute}
                </time>
                {relative ? ` (${relative})` : ''}.{' '}
              </>
            ) : (
              'This is what loaded before the connection dropped. '
            )}
            {isOnline
              ? 'The latest version could not be reached, so it may be out of date.'
              : 'It may be out of date and will update when you are back online.'}
          </p>
          {!isOnline && offlineDetail ? (
            <p className="text-xs leading-5 text-current/70">{offlineDetail}</p>
          ) : null}
        </div>
        {isOnline && onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start bg-background"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn('h-4 w-4', isRefreshing && 'animate-spin motion-reduce:animate-none')}
            />
            {isRefreshing ? 'Refreshing' : 'Try again'}
          </Button>
        ) : null}
      </div>
    </InlineNotice>
  );
}
