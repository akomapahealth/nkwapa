'use client';

import { Button } from '@/components/ui/button';
import { FullscreenStatus } from '@/components/feedback/AppState';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FullscreenStatus
      title="This page ran into a problem"
      description={`Something went wrong while building this page. Nothing you had already saved is affected.${
        error.digest ? ` Quote reference ${error.digest} if you report it.` : ''
      }`}
      tone="danger"
      primaryAction={<Button onClick={reset}>Try again</Button>}
      secondaryAction={
        <Button variant="outline" onClick={() => window.location.reload()}>
          Refresh page
        </Button>
      }
    />
  );
}
