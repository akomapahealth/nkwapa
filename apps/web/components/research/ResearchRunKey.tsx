'use client';

import { Check, ClipboardCopy } from 'lucide-react';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';

/**
 * A run key with a copy button. The key is what a researcher quotes in a paper or a ticket,
 * and it is safe to share, so copying it is the common action rather than reading it.
 */
export function ResearchRunKey({ runKey }: { runKey: string }) {
  const { state, copy } = useCopyToClipboard();
  return (
    <button
      type="button"
      onClick={() => void copy(runKey)}
      className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border border-border/80 bg-muted/40 px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Copy run key ${runKey}`}
    >
      <span className="truncate">{runKey}</span>
      {state === 'copied' ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-success-ink" />
      ) : (
        <ClipboardCopy aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Run key copied' : state === 'failed' ? 'Could not copy' : ''}
      </span>
    </button>
  );
}
