'use client';

import Link from 'next/link';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relative-time';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';
import {
  describeSyncFailure,
  syncRecoveryActionLabel,
  type SyncFailureDescription,
  type SyncFailureTone,
  type SyncRecoveryAction,
} from '@/lib/sync-conflicts';
import type { OutboxQueueItem } from '@/lib/use-outbox-queue';

const TONE: Record<SyncFailureTone, { icon: LucideIcon; card: string; icon_: string }> = {
  danger: {
    icon: AlertOctagon,
    card: 'border-destructive/30 bg-destructive/5',
    icon_: 'text-destructive',
  },
  warning: { icon: AlertTriangle, card: 'border-warning/30 bg-warning/5', icon_: 'text-warning' },
  info: { icon: Clock, card: 'border-border bg-card', icon_: 'text-muted-foreground' },
};

function actionHref(description: SyncFailureDescription, action: SyncRecoveryAction) {
  switch (action) {
    case 'open-patient':
      return description.patientHref;
    case 'open-canonical-patient':
      return description.canonicalPatientHref;
    case 'review-duplicates':
      return description.duplicatesHref;
    case 'open-encounter':
      return description.encounterHref;
    default:
      return undefined;
  }
}

/**
 * Support needs the server's answer and the identifiers to trace it, not the clinical content.
 * The payload is deliberately left out: it can hold names, dates of birth and readings, and a
 * copied support snippet ends up in chat threads and tickets.
 */
function supportSnapshot(item: OutboxQueueItem) {
  const { row } = item;
  return JSON.stringify(
    {
      mutationId: row.id,
      idempotencyKey: row.idempotencyKey,
      clinicId: row.clinicId,
      entityType: row.entityType,
      entityId: row.entityId,
      operation: row.operation,
      state: item.state,
      attempts: row.attempts ?? 0,
      savedAt: row.createdAt,
      lastAttemptAt: row.lastAttemptAt,
      lastFailure: row.lastFailure,
    },
    null,
    2,
  );
}

export function SyncMutationCard({
  item,
  clinicId,
  canReviewDuplicates,
  isOnline,
  busy,
  onRetry,
  onDiscard,
  onNavigate,
}: {
  item: OutboxQueueItem;
  clinicId: string;
  canReviewDuplicates: boolean;
  isOnline: boolean;
  busy: boolean;
  onRetry: (item: OutboxQueueItem) => void;
  onDiscard: (item: OutboxQueueItem) => void;
  onNavigate: () => void;
}) {
  const { row } = item;
  const { state: copyState, copy } = useCopyToClipboard();
  const description = row.lastFailure
    ? describeSyncFailure(row, { clinicId, canReviewDuplicates, patientId: item.patientId })
    : null;
  const tone = TONE[description?.tone ?? 'info'];
  const Icon = tone.icon;
  const heading = item.patientName ? `${item.label} · ${item.patientName}` : item.label;
  const actions: SyncRecoveryAction[] = description?.actions ?? ['discard'];
  const [primary] = actions.filter((action) => action !== 'discard');

  return (
    <article
      className={cn('rounded-lg border p-4 transition-colors', tone.card)}
      aria-labelledby={`sync-item-${row.id}`}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', tone.icon_)} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 id={`sync-item-${row.id}`} className="min-w-0 break-words text-sm font-semibold">
              {heading}
            </h4>
            <p className="shrink-0 text-xs text-muted-foreground">
              Saved {formatRelativeTime(row.createdAt)}
            </p>
          </div>
          {description ? (
            <>
              <p className="text-sm font-medium text-foreground">{description.title}</p>
              <p className="text-sm text-muted-foreground">{description.explanation}</p>
              {description.serverDetail ? (
                <p className="rounded-md bg-background/70 px-3 py-2 text-sm text-foreground">
                  <span className="text-muted-foreground">The server said: </span>
                  {description.serverDetail}
                </p>
              ) : null}
              <p className="text-sm text-foreground">
                <span className="font-medium">Next step: </span>
                {description.nextStep}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Saved on this device. It will be sent on the next sync.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 sm:pl-8">
        {actions.map((action) => {
          const label = syncRecoveryActionLabel(action);
          const variant = action === primary ? 'default' : 'outline';
          if (action === 'discard') {
            return (
              <Button
                key={action}
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || !isOnline}
                title={isOnline ? undefined : 'Reconnect to discard'}
                onClick={() => onDiscard(item)}
              >
                {label}
              </Button>
            );
          }
          if (action === 'retry') {
            return (
              <Button
                key={action}
                size="sm"
                variant={variant}
                disabled={busy || !isOnline}
                onClick={() => onRetry(item)}
              >
                {busy ? 'Retrying…' : label}
              </Button>
            );
          }
          const href = description ? actionHref(description, action) : undefined;
          return href ? (
            <Button key={action} size="sm" variant={variant} asChild>
              <Link href={href} onClick={onNavigate}>
                {label}
              </Link>
            </Button>
          ) : null;
        })}
      </div>
      {!isOnline && actions.some((action) => action === 'retry' || action === 'discard') ? (
        <p className="mt-2 text-xs text-muted-foreground sm:pl-8">
          Reconnect to retry or discard this change.
        </p>
      ) : null}

      {row.lastFailure ? (
        <details className="group mt-3 sm:pl-8">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-150 group-open:rotate-180"
            />
            Technical details
          </summary>
          <div className="mt-2 space-y-3 rounded-md border border-border bg-background p-3">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              {[
                ['Code', description?.code],
                ['Server status', row.lastFailure.status],
                ['Attempts', String(row.attempts ?? 0)],
                ['Last tried', formatRelativeTime(row.lastAttemptAt)],
                ['Record', `${row.entityType} ${row.entityId}`],
                ['Change id', row.id],
              ].map(([term, value]) => (
                <div key={term} className="contents">
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="break-all font-mono">{value || '-'}</dd>
                </div>
              ))}
            </dl>
            {row.lastFailure.conflictDetails ? (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">
                {JSON.stringify(row.lastFailure.conflictDetails, null, 2)}
              </pre>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy(supportSnapshot(item))}
              aria-live="polite"
            >
              {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'failed'
                  ? 'Copy failed'
                  : 'Copy for support'}
            </Button>
          </div>
        </details>
      ) : null}
    </article>
  );
}
