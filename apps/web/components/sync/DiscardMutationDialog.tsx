'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatRelativeTime } from '@/lib/relative-time';
import type { OutboxQueueItem } from '@/lib/use-outbox-queue';

/**
 * Discarding throws away something a clinician entered, so it gets the destructive treatment and
 * a confirmation that names exactly what goes and what does not.
 */
export function DiscardMutationDialog({
  item,
  onOpenChange,
  onConfirm,
}: {
  item: OutboxQueueItem | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: OutboxQueueItem) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(item);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be discarded.');
    } finally {
      setBusy(false);
    }
  };

  const what = item
    ? item.patientName
      ? `${item.label} for ${item.patientName}`
      : item.label
    : 'This change';

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!busy) {
          setError(null);
          onOpenChange(open);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Discard this offline change?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{what}</span>
            {item ? `, saved ${formatRelativeTime(item.row.createdAt)},` : ''} will be removed from
            this device. It never reached the server, so it cannot be recovered afterwards.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Nothing on the server changes. This device will reload the server&apos;s copy of the
          record on the next sync.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={busy}>
            {busy ? 'Discarding…' : 'Discard change'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
