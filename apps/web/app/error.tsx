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
      eyebrow="Application error"
      title="This page ran into a problem"
      description={
        error.message ||
        'A page error interrupted the current workflow. You can retry the page without leaving your current clinic context.'
      }
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
