'use client';

import { Button } from '@/components/ui/button';
import { FullscreenStatus } from '@/components/feedback/AppState';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <FullscreenStatus
          eyebrow="Critical error"
          title="Nkwapa needs a fresh reload"
          description={
            error.message ||
            'A critical rendering error interrupted the app before the current page could recover on its own.'
          }
          tone="danger"
          primaryAction={<Button onClick={reset}>Retry app</Button>}
          secondaryAction={
            <Button variant="outline" onClick={() => window.location.assign('/')}>
              Return home
            </Button>
          }
        />
      </body>
    </html>
  );
}
