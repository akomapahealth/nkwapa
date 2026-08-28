'use client';

import { WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import type { AsyncResourceState } from '@/lib/use-async-resource';
import { cn } from '@/lib/utils';

export interface ResourceEmptyCopy {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

/**
 * Renders one read's loading, offline, error, empty and ready states in the agreed order.
 *
 * Issue #22 asks every route for five intentional states. Asking twenty pages to each remember
 * the order, and to each remember that a failed refresh should keep showing the data it already
 * had, is how the product ended up with four loading treatments and two error treatments. The
 * order lives here instead:
 *
 *   1. offline, when the read genuinely cannot work without a connection
 *   2. nothing yet and still loading  -> skeleton
 *   3. nothing yet and failed         -> error with retry
 *   4. loaded but empty               -> empty state, which is not an error
 *   5. loaded                         -> the content, with a stale banner above it if the most
 *                                        recent refresh failed
 *
 * Step 5 is the point of the component. A poll that times out on clinic wifi must not blank a
 * screen someone is reading a measurement off; it says so, above data that is still there.
 */
export function ResourceState<T>({
  state,
  empty,
  isEmpty,
  skeleton,
  offlineDescription = 'This view needs a connection. It will load as soon as the device is back online.',
  errorTitle,
  className,
  children,
}: {
  state: AsyncResourceState<T>;
  /** Copy for "loaded successfully, and there is genuinely nothing here". */
  empty?: ResourceEmptyCopy;
  /** Only called with loaded data. Omit when the read cannot be empty. */
  isEmpty?: (data: T) => boolean;
  skeleton?: React.ReactNode;
  offlineDescription?: string;
  errorTitle?: string;
  className?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (state.isOfflineBlocked) {
    return (
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm',
          className,
        )}
        role="status"
      >
        <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium text-foreground">You are offline</p>
          <p className="mt-1 leading-6 text-muted-foreground">{offlineDescription}</p>
        </div>
      </div>
    );
  }

  if (state.isInitialLoading) {
    return (
      <div className={className} role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading</span>
        {skeleton ?? <SectionSkeleton lines={4} />}
      </div>
    );
  }

  if (state.data === null) {
    return (
      <InlineErrorState
        className={className}
        title={errorTitle}
        description={state.error ?? 'This view could not be loaded.'}
        onRetry={state.retry}
      />
    );
  }

  const showEmpty = empty && isEmpty?.(state.data);

  return (
    <div className={cn('space-y-4', className)} aria-busy={state.isRefreshing || undefined}>
      {/*
        The refresh failed but the previous result is still on screen. Say so, and say how old it
        is not -- claiming a timestamp we do not have would be worse than admitting the gap.
      */}
      {state.isStale ? (
        <InlineErrorState
          title="Showing the last version that loaded"
          description={state.error ?? 'The most recent refresh did not complete.'}
          onRetry={state.retry}
          retryLabel="Refresh"
        />
      ) : null}
      {showEmpty ? (
        <EmptyState
          title={empty.title}
          description={empty.description}
          icon={empty.icon}
          action={empty.action}
        />
      ) : (
        children(state.data)
      )}
    </div>
  );
}
