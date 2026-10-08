import { dismissToast, showToast } from '@/components/ui/toast';

/**
 * Remove something now, commit it a few seconds later, and let the user take it back meanwhile.
 *
 * For removals that are cheap and reversible -- cancelling an invitation that can simply be sent
 * again, cancelling a queued reminder. A confirmation dialog there is friction on every single
 * use to guard against a rare mistake; an Undo in the toast guards against the same mistake and
 * costs nothing when there was none. Costly removals still confirm first (`confirmAction`).
 *
 * The caller hides the item at once (`hide`), and puts it back on Undo or on a failed commit
 * (`restore`). The commit runs when the toast's time is up, or straight away if the page is being
 * left, so a removal the user saw happen is never silently dropped.
 */
export interface UndoableRemoval {
  /** Toast title, e.g. "Invitation to ama@clinic.org cancelled". */
  message: string;
  hide: () => void;
  restore: () => void;
  commit: () => Promise<void>;
  /** Shown if the commit fails; the item is restored either way. */
  failureMessage?: string;
  delayMs?: number;
}

const pending = new Set<() => void>();

function flushAll() {
  for (const flush of [...pending]) flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAll);
}

export const UNDO_WINDOW_MS = 5000;

export function removeWithUndo({
  message,
  hide,
  restore,
  commit,
  failureMessage = 'That could not be completed, so it has been put back.',
  delayMs = UNDO_WINDOW_MS,
}: UndoableRemoval): void {
  let settled = false;

  const run = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    pending.delete(run);
    // Sonner pauses a toast while it is hovered; the commit does not wait, so the Undo must go.
    dismissToast(toastId);
    commit().catch(() => {
      restore();
      showToast({ tone: 'error', title: failureMessage });
    });
  };

  const undo = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    pending.delete(run);
    restore();
    dismissToast(toastId);
  };

  hide();
  const timer = setTimeout(run, delayMs);
  pending.add(run);
  const toastId = showToast({
    tone: 'success',
    title: message,
    durationMs: delayMs,
    action: { label: 'Undo', onClick: undo },
  });
}

/** Commit every removal still waiting, e.g. before navigating away inside the app. */
export function flushPendingRemovals() {
  flushAll();
}
