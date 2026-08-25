'use client';

import type { LucideIcon } from 'lucide-react';
import { WifiOff } from 'lucide-react';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';

/**
 * The four states every clinical chart section can be in.
 *
 * Each panel had grown its own: seven loading treatments, four error shapes of which two offered
 * no way to retry, five empty states, and four vocabularies for being offline -- one of which was
 * no notice at all, so stale cached data read as live. A clinician moving between tabs was being
 * asked to learn a different visual language for the same four situations.
 *
 * These wrap the primitives that already existed rather than introducing new ones, so a section
 * that adopts them looks like the rest of the app and announces itself the same way.
 */

interface ChartSectionLoadingProps {
  /** Named so a screen reader says what is loading, not merely that something is. */
  label: string;
  lines?: number;
}

export function ChartSectionLoading({ label, lines = 4 }: ChartSectionLoadingProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading {label}</span>
      <SectionSkeleton lines={lines} />
    </div>
  );
}

interface ChartSectionErrorProps {
  title: string;
  description?: string | null;
  /** Always offer a way out. A section that can fail must be able to be retried. */
  onRetry: () => void;
}

export function ChartSectionError({ title, description, onRetry }: ChartSectionErrorProps) {
  return (
    <InlineErrorState
      title={title}
      description={description ?? 'Something went wrong loading this section.'}
      onRetry={onRetry}
    />
  );
}

interface ChartSectionEmptyProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

export function ChartSectionEmpty({ title, description, icon: Icon }: ChartSectionEmptyProps) {
  return (
    <EmptyStateCard
      title={title}
      description={description}
      icon={Icon ? <Icon aria-hidden="true" className="size-5" /> : undefined}
    />
  );
}

interface ChartSectionOfflineProps {
  /** What the clinician cannot do right now, in their words. */
  title?: string;
  description: string;
}

export function ChartSectionOffline({
  title = 'You are offline',
  description,
}: ChartSectionOfflineProps) {
  return (
    <InlineNotice>
      <div className="flex items-start gap-3">
        <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-muted-foreground">{description}</p>
        </div>
      </div>
    </InlineNotice>
  );
}

/** The wording used whenever a chart section cannot be loaded without a connection. */
export const CHART_OFFLINE_DESCRIPTION =
  'Reconnect to load this history. Records already synced to this device stay available on other tabs.';
