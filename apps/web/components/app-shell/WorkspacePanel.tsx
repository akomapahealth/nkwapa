'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Minus, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { useWideSheet } from '@/components/app-shell/ListToolbar';
import { cn } from '@/lib/utils';

/** From this width a panel sits beside the chart instead of over it (MASTER §9, O3 workspace). */
const SIDE_PANEL_MIN_WIDTH = 1200;

/*
  One panel open at a time, page-wide. A module store rather than a provider: panels live in
  different chart tabs and components, and none of them should need wrapping to take part.
*/
type Active = { id: string; dirty: () => boolean; title: string; close: () => void };
let active: Active | null = null;

async function claim(next: Active): Promise<boolean> {
  const current = active;
  if (current && current.id !== next.id) {
    if (current.dirty() && !(await confirmDiscard(current.title))) return false;
    current.close();
  }
  active = next;
  return true;
}

/**
 * Ask before something unmounts the open panel, such as a chart tab change (panels live inside
 * their tab). Resolves true straight away when nothing typed would be lost.
 */
export async function confirmPanelLeave(): Promise<boolean> {
  if (!active?.dirty()) return true;
  return confirmDiscard(active.title);
}

function confirmDiscard(title: string) {
  return confirmAction({
    title: 'Discard changes?',
    description: `Your entries in ${title} are not saved.`,
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
  });
}

/**
 * A chart form that keeps the chart in view (OpenMRS O3 workspace pattern). From 1200px it is a
 * non-modal panel on the right: the chart stays scrollable and clickable, `main` makes room for
 * it, and Hide keeps the half-filled form behind a restore button with an unsaved dot. Below
 * 1200px it is exactly what the call site used before: a form dialog, or a sheet.
 *
 * It replaces a `Dialog` + `DialogContent` pair; children keep using DialogHeader, DialogTitle,
 * DialogDescription and DialogFooter, so the accessible name and role do not change.
 * Closing with Escape or the close button asks first when anything was typed.
 */
export function WorkspacePanel({
  open,
  onOpenChange,
  title,
  narrow = 'dialog',
  confirmClose = true,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the restore button and the discard prompt; match the DialogTitle. */
  title: string;
  /** What it is below 1200px: the form dialog, or a sheet (right, bottom on phones). */
  narrow?: 'dialog' | 'sheet';
  /** Ask before closing once something was typed. Off when nothing typed is lost by closing. */
  confirmClose?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const side = useWideSheet(SIDE_PANEL_MIN_WIDTH);
  const wideSheet = useWideSheet(600);
  const [hidden, setHidden] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [top, setTop] = useState(72);
  const restore = useRef<HTMLButtonElement>(null);
  // What the page-wide store reads later, from outside this render.
  const latest = useRef({ onOpenChange, title, guarded: false });
  useEffect(() => {
    latest.current = { onOpenChange, title, guarded: dirty && confirmClose };
  });

  useEffect(() => {
    if (!open) {
      setDirty(false);
      setHidden(false);
      if (active?.id === id) active = null;
      return;
    }
    let cancelled = false;
    void claim({
      id,
      title: latest.current.title,
      dirty: () => latest.current.guarded,
      close: () => latest.current.onOpenChange(false),
    }).then((ok) => {
      if (!ok && !cancelled) latest.current.onOpenChange(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, id]);

  useEffect(
    () => () => {
      if (active?.id === id) active = null;
    },
    [id],
  );

  // The page makes room for the panel instead of sitting under it.
  const docked = side && open && !hidden;
  useEffect(() => {
    if (!docked) return;
    setTop(Math.max(0, document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + 8);
    document.body.dataset.workspaceOpen = 'true';
    return () => {
      delete document.body.dataset.workspaceOpen;
    };
  }, [docked]);

  // Hiding takes focus out of the panel; it lands on the button that brings it back.
  useEffect(() => {
    if (open && hidden) restore.current?.focus();
  }, [open, hidden]);

  const request = (next: boolean) => {
    if (next || !dirty || !confirmClose) return onOpenChange(next);
    void confirmDiscard(title).then((ok) => ok && onOpenChange(false));
  };
  const markDirty = () => setDirty(true);

  if (!side) {
    return narrow === 'sheet' ? (
      <Sheet open={open} onOpenChange={request}>
        <SheetContent
          side={wideSheet ? 'right' : 'bottom'}
          onInput={markDirty}
          onChange={markDirty}
          className={cn(
            'flex flex-col bg-card p-0 pb-[env(safe-area-inset-bottom)]',
            wideSheet ? 'w-full sm:max-w-lg' : 'max-h-[92dvh] rounded-t-2xl',
            className,
          )}
        >
          {children}
        </SheetContent>
      </Sheet>
    ) : (
      <Dialog open={open} onOpenChange={request}>
        <DialogContent
          variant="form"
          className={className}
          onInput={markDirty}
          onChange={markDirty}
        >
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <DialogPrimitive.Root modal={false} open={open} onOpenChange={request}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            data-workspace-panel
            onInput={markDirty}
            onChange={markDirty}
            // The chart beside it stays usable: clicking it never closes the form.
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              const target = event.target as HTMLElement | null;
              const inPanel = target?.closest?.('[data-workspace-panel]');
              const openList =
                target?.getAttribute?.('role') === 'combobox' &&
                target.getAttribute('aria-expanded') === 'true';
              // Escape in the chart, or one that closes a list, leaves the panel alone.
              if (!inPanel || openList) event.preventDefault();
            }}
            style={{ top }}
            className={cn(
              'fixed bottom-2 right-2 z-40 flex w-[30rem] flex-col overflow-hidden rounded-xl border bg-background shadow-lg',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-6',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-6',
              'duration-sheet ease-drawer data-[state=closed]:duration-sheet-exit',
              hidden && '!hidden',
            )}
          >
            <div className="absolute right-3 top-3 z-10 flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Hide ${title}`}
                onClick={() => setHidden(true)}
              >
                <Minus aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Close ${title}`}
                onClick={() => request(false)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <div
              className={cn(
                'min-h-0 flex-1',
                // Sheet children bring their own padding and scroll area; dialog children do not.
                narrow === 'sheet'
                  ? 'flex flex-col pt-5 [&>*:first-child]:pr-24'
                  : 'grid content-start gap-4 overflow-y-auto overscroll-contain p-5 [&>*:first-child]:pr-20',
                className,
                'max-w-none',
              )}
            >
              {children}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      {open && hidden ? (
        <button
          ref={restore}
          type="button"
          aria-label={dirty ? `Show ${title}, not saved` : `Show ${title}`}
          onClick={() => setHidden(false)}
          className="fixed bottom-6 right-24 z-40 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold shadow-lg transition-transform duration-fast ease-out-strong hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dirty ? <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" /> : null}
          {title}
        </button>
      ) : null}
    </>
  );
}
