'use client';

import Link from 'next/link';
import { InlineErrorState } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';

/**
 * Error boundary for every workspace route.
 *
 * There was none, so an uncaught render error fell all the way to `app/error.tsx`, which is a
 * fullscreen panel: the sidebar, the header, the active clinic and the sync indicator all
 * vanished, and the only way out of one broken page was a browser reload. This boundary sits
 * inside the shell, so navigation survives and the user can simply go somewhere else.
 *
 * The message is deliberately generic. `error.message` reaches this component intact for a
 * client-side error, and in a clinical product that string can carry a patient identifier out
 * of a failed render and onto the screen. The digest is what support actually needs to find the
 * matching server log.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <InlineErrorState
        title="This page ran into a problem"
        description={
          error.digest
            ? `Something went wrong while building this view. Nothing you had already saved is affected. Quote reference ${error.digest} if you report it.`
            : 'Something went wrong while building this view. Nothing you had already saved is affected.'
        }
        onRetry={reset}
        retryLabel="Try again"
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
