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
          title="Nkwapa needs to reload"
          description={`Something went wrong before the page could recover on its own. Changes saved on this device are safe.${
            error.digest ? ` Quote reference ${error.digest} if you report it.` : ''
          }`}
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
