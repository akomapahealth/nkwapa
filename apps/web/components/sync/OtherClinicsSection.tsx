'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { OtherClinicQueue } from '@/lib/other-clinic-queue';

const changes = (count: number) => `${count} change${count === 1 ? '' : 's'}`;
const nameOf = (queue: OtherClinicQueue) => queue.clinicName ?? 'A clinic no longer listed';

/**
 * Changes saved on this device for clinics other than the active one (#163).
 *
 * A clinic's changes are only ever sent to that clinic, while it is the active one. For a clinic
 * this account can still open, switching to it sends them. For one it has lost, they can never be
 * sent from this account, so the only action is a confirmed discard of its own changes. Another
 * account's changes are never discarded from here: on a shared device, that person may still have
 * the seat this one lost.
 */
export function OtherClinicsSection({
  queues,
  onSwitch,
  onDiscard,
  disabled,
}: {
  queues: OtherClinicQueue[];
  onSwitch: (clinicId: string) => void;
  onDiscard: (queue: OtherClinicQueue) => Promise<void>;
  disabled: boolean;
}) {
  const [discarding, setDiscarding] = useState<OtherClinicQueue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (queues.length === 0) return null;

  const confirmDiscard = async () => {
    if (!discarding) return;
    setBusy(true);
    setError(null);
    try {
      await onDiscard(discarding);
      setDiscarding(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The changes could not be discarded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="sync-group-other-clinics" data-testid="sync-other-clinics">
      <div className="mb-3">
        <h3 id="sync-group-other-clinics" className="text-sm font-semibold">
          Saved for other clinics
        </h3>
        <p className="text-xs text-muted-foreground">
          Changes are only sent to the clinic they were saved for.
        </p>
      </div>
      <ul className="space-y-3">
        {queues.map((queue) => {
          const headingId = `sync-other-clinic-${queue.clinicId}`;
          return (
            <li key={queue.clinicId}>
              <article
                className="rounded-lg border border-border bg-muted/30 p-4"
                aria-labelledby={headingId}
                data-access={queue.access}
              >
                <div className="flex items-start gap-3">
                  <Building2
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 id={headingId} className="break-words text-sm font-medium">
                      {nameOf(queue)}
                    </h4>
                    {queue.own.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {queue.access === 'available'
                          ? `${changes(queue.own.length)} waiting. Switch to this clinic to send them.`
                          : `You no longer have access to ${queue.clinicName ?? 'this clinic'}. ${
                              queue.own.length === 1 ? 'This change' : 'These changes'
                            } cannot be sent from this account.`}
                      </p>
                    ) : null}
                    {queue.others.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {changes(queue.others.length)} saved by another account. Only that person
                        can send {queue.others.length === 1 ? 'it' : 'them'}, by signing in on this
                        device.
                      </p>
                    ) : null}
                  </div>
                </div>
                {queue.own.length > 0 ? (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {queue.access === 'available' ? (
                      <Button size="sm" onClick={() => onSwitch(queue.clinicId)}>
                        Switch to {queue.clinicName ?? 'this clinic'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={disabled}
                        onClick={() => setDiscarding(queue)}
                      >
                        Discard {changes(queue.own.length)}
                      </Button>
                    )}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={discarding !== null}
        onOpenChange={(open) => {
          if (!busy && !open) {
            setError(null);
            setDiscarding(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Discard changes for {discarding ? nameOf(discarding) : ''}?</DialogTitle>
            <DialogDescription>
              {discarding ? changes(discarding.own.length) : ''} you saved will be removed from this
              device. They never reached the server and cannot be recovered afterwards.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Nothing on the server changes. Changes another account saved here are kept.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDiscarding(null)} disabled={busy}>
              Keep them
            </Button>
            <Button variant="destructive" onClick={() => void confirmDiscard()} disabled={busy}>
              {busy ? 'Discarding…' : 'Discard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
