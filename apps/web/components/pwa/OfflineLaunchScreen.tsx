'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { FullscreenStatus } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { canReachKeycloak } from '@/lib/keycloak';

const RECHECK_MS = 10_000;

/**
 * Shown in place of sign-in when the app starts with no connection (#206). Signing in needs
 * Keycloak, so instead of a long wait and a misleading auth error this says what is true: the
 * device is offline and queued changes are safe. Using the app offline after a cold start is #207.
 */
export function OfflineLaunchScreen() {
  const [queued, setQueued] = useState<number | null>(null);

  useEffect(() => {
    // A count only: no token is available yet, and nothing about whose changes they are.
    db.outbox
      .count()
      .then(setQueued)
      .catch(() => setQueued(null));

    const retry = () => window.location.reload();
    window.addEventListener('online', retry);
    // 'online' never fires when the device thought it was online all along, so also check.
    const poll = window.setInterval(() => {
      void canReachKeycloak().then((reachable) => reachable && retry());
    }, RECHECK_MS);
    return () => {
      window.removeEventListener('online', retry);
      window.clearInterval(poll);
    };
  }, []);

  return (
    <FullscreenStatus
      eyebrow="Offline"
      title="You are offline"
      description="Nkwapa needs a connection to sign you in. Changes saved on this device are safe and will send when you are back online. This page retries by itself when the connection returns."
      primaryAction={
        <Button className="rounded-md" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      }
      secondaryAction={
        queued === null ? null : (
          <p
            role="status"
            className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground"
          >
            <WifiOff className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-semibold text-foreground" data-testid="offline-queued-count">
                {queued}
              </span>{' '}
              {queued === 1 ? 'change' : 'changes'} waiting on this device
            </span>
          </p>
        )
      }
    />
  );
}
