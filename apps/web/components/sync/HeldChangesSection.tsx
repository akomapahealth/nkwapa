'use client';

import { useState } from 'react';
import { UserRound } from 'lucide-react';
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
 * Changes on this device that the signed-in account did not queue (#162).
 *
 * Another account's change is shown, attributed to them, and never sent by this account: sending
 * it would put this person's name on an entry they did not make. Its owner signs back in on this
 * device to send it, or anyone can discard this device's copy after confirming.
 *
 * A change from before owners were recorded has no knowable owner. It can be claimed, with a
 * confirmation that says plainly the server will record it as the claimer's, or discarded.
 */
export function HeldChangesSection({
  items,
  currentUserName,
  disabled,
  onDiscard,
  onClaim,
}: {
  items: OutboxQueueItem[];
  currentUserName: string | null;
  disabled: boolean;
  onDiscard: (item: OutboxQueueItem) => void;
  onClaim: (item: OutboxQueueItem) => Promise<void>;
}) {
  const [claiming, setClaiming] = useState<OutboxQueueItem | null>(null);
  const [busy, setBusy] = useState(false);
  if (items.length === 0) return null;

  const confirmClaim = async () => {
    if (!claiming) return;
    setBusy(true);
    try {
      await onClaim(claiming);
      setClaiming(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="sync-group-held" data-testid="sync-held-group">
      <div className="mb-3">
        <h3 id="sync-group-held" className="text-sm font-semibold">
          Saved by another account on this device{' '}
          <span className="font-normal text-muted-foreground">({items.length})</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Only the person who saved a change can send it. They can sign in on this device to send
          it.
        </p>
      </div>
      <ul className="space-y-3">
        {items.map((item) => {
          const owner = item.row.ownerUserId ? (item.row.ownerName ?? 'Another account') : null;
          const heading = item.patientName ? `${item.label} · ${item.patientName}` : item.label;
          return (
            <li key={item.row.id}>
              <article
                className="rounded-lg border border-border bg-muted/30 p-4"
                aria-labelledby={`sync-held-${item.row.id}`}
              >
                <div className="flex items-start gap-3">
                  <UserRound
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 id={`sync-held-${item.row.id}`} className="text-sm font-semibold">
                      {heading}
                    </h4>
                    <p className="text-sm text-muted-foreground" data-testid="sync-held-owner">
                      {owner
                        ? `Saved by ${owner} ${formatRelativeTime(item.row.createdAt)}. Waiting for them to sign in on this device.`
                        : `Saved ${formatRelativeTime(item.row.createdAt)}, before this device recorded who saves each change.`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 sm:pl-8">
                  {!owner ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => setClaiming(item)}
                    >
                      This is mine, send it
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => onDiscard(item)}
                  >
                    Discard
                  </Button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={claiming !== null}
        onOpenChange={(open) => (!open && !busy ? setClaiming(null) : undefined)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send this change as yours?</DialogTitle>
            <DialogDescription>
              This device did not record who saved it. If you send it, the clinic&apos;s audit trail
              will name {currentUserName ?? 'you'} as the person who made it. Only do this if you
              entered it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setClaiming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void confirmClaim()} disabled={busy}>
              {busy ? 'Sending…' : 'Yes, I made it'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
