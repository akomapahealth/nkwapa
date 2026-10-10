'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Ask before doing something that is costly to undo, and wait for the answer.
 *
 *   if (!(await confirmAction({ title: 'Revoke research consent?', ... }))) return;
 *
 * Replaces `window.confirm`, which cannot be styled, cannot say which button is the dangerous
 * one, reads as the browser rather than the product, and blocks the whole tab. MASTER.md section
 * 9: a destructive action takes a confirmation step that names what will change.
 *
 * One host renders every request (`ConfirmHost`, mounted beside the toaster), so a call site
 * needs no state of its own. A second request while one is open answers the first with "no".
 */
export interface ConfirmOptions {
  title: string;
  /** What will change, in plain words. Required: a confirmation that says nothing is a reflex. */
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button. Default true: this exists for costly actions. */
  destructive?: boolean;
}

type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void };

let current: Pending | null = null;
const listeners = new Set<(pending: Pending | null) => void>();

function publish(next: Pending | null) {
  current = next;
  for (const listener of listeners) listener(next);
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => publish({ ...options, resolve }));
}

export function ConfirmHost() {
  // The last request stays rendered while the dialog animates closed, so its text does not
  // vanish a beat before the box does.
  const [shown, setShown] = useState<Pending | null>(current);
  const [open, setOpen] = useState(current !== null);

  useEffect(() => {
    const listener = (next: Pending | null) => {
      if (next) setShown(next);
      setOpen(next !== null);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const answer = (confirmed: boolean) => {
    current?.resolve(confirmed);
    publish(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : answer(false))}>
      <DialogContent className="max-w-md">
        {shown ? (
          <>
            <DialogHeader>
              <DialogTitle>{shown.title}</DialogTitle>
              <DialogDescription className="pt-1 leading-6">{shown.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              {/* Focus starts on the safe choice, so Enter on a misread dialog does no harm. */}
              <Button variant="outline" onClick={() => answer(false)} autoFocus>
                {shown.cancelLabel ?? 'Keep it'}
              </Button>
              <Button
                variant={shown.destructive === false ? 'default' : 'destructive'}
                onClick={() => answer(true)}
              >
                {shown.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
